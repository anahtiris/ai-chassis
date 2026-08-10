import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db/client";
import { readEmailVerified, resolveSignIn } from "@/lib/auth/identity";

// Entra ID keeps its dedicated built-in provider rather than being folded
// into the generic OIDC entry below, because @auth/core's version does three
// things a plain `type: "oidc"` entry does not: it rewrites the literal
// `{tenantid}` placeholder Entra returns in its discovery document (strict
// issuer validation fails otherwise), it requests the extra `User.Read`
// scope, and it inlines the Graph profile photo. Folding it in would also
// change its callback URL, invalidating every existing app registration's
// redirect URI. Only rendered on the login page when it's configured.
const entraEnabled = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID);

// One generic OIDC entry covers every other OIDC-compliant IdP — Keycloak,
// Authentik, Okta, Auth0, Zitadel, Google Workspace — configured per fork by
// env var, with no code change. Same default-off pattern as RAG, storage and
// web search: unset AUTH_OIDC_ISSUER and the provider simply isn't
// registered. `issuer` is enough for Auth.js to discover the endpoints from
// /.well-known/openid-configuration.
const oidcEnabled = Boolean(process.env.AUTH_OIDC_ISSUER);

// Rendered by app/(app)/admin/login/page.tsx, which loops over this rather
// than hardcoding one button per provider — adding an IdP is then an env
// change, not a login-page edit.
export const oauthProviders: Array<{ id: string; label: string }> = [
  ...(entraEnabled
    ? [{ id: "microsoft-entra-id", label: "Sign in with Microsoft" }]
    : []),
  ...(oidcEnabled
    ? [
        {
          id: "oidc",
          label: process.env.AUTH_OIDC_NAME ?? "Single sign-on",
        },
      ]
    : []),
];

// Single source of truth for session verification — imported by proxy.ts,
// route handlers, and server components alike. See docs/decisions.md
// "Auth/permission checking implemented once": this covers session
// *verification* only ("who is this, is the session valid"). What a
// verified identity is *allowed to do* (authorization) is checked
// separately, per area, via lib/auth/permissions.ts's hasPermission() — not
// here.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // Default provider. Every fork of this toolkit can log into its own
    // admin portal out of the box, with zero external identity-provider
    // setup — no Entra tenant, no OAuth app registration required just to
    // get in the door. Checks the `password_hash` column on `User` (see
    // prisma/schema.prisma); seed the first admin with `pnpm seed:admin`
    // (see README "Getting started").
    Credentials({
      name: "Username and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials) => {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string")
          return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password_hash || user.archived_at) return null;

        const valid = await compare(password, user.password_hash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    // Optional, additional provider — not required to run this toolkit.
    // Carried over from the project this toolkit's patterns were generalized
    // from, and kept as the dedicated built-in for the reasons in the
    // entraEnabled comment above.
    ...(entraEnabled
      ? [
          MicrosoftEntraID({
            clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
            clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
            issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
          }),
        ]
      : []),
    // Any other OIDC-compliant IdP, configured entirely by env var. Add a
    // second one per fork by copying this block with a different `id` — the
    // id becomes part of the callback URL (/api/auth/callback/<id>) and the
    // value stored in UserIdentity.provider, so it must stay stable once
    // anyone has signed in with it.
    ...(oidcEnabled
      ? [
          {
            id: "oidc",
            name: process.env.AUTH_OIDC_NAME ?? "Single sign-on",
            type: "oidc",
            issuer: process.env.AUTH_OIDC_ISSUER,
            clientId: process.env.AUTH_OIDC_ID,
            clientSecret: process.env.AUTH_OIDC_SECRET,
          } satisfies Provider,
        ]
      : []),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/admin/login",
  },
  callbacks: {
    // Runs after any provider succeeds, before a session is created — the
    // one place every provider passes through, regardless of whether it
    // touched Prisma already (Credentials does, via authorize() above; the
    // OAuth providers don't, being stateless with no adapter configured).
    //
    // For OAuth the mapping from "the IdP says this is <sub>" to "this is
    // User <id>" lives in lib/auth/identity.ts's resolveSignIn(), a pure
    // function; this callback only fetches the facts it needs and performs
    // the writes it asks for. Bootstrap (empty database -> first sign-in
    // becomes the owner, see docs/decisions.md "Bootstrap: first user is
    // owner") is one of its outcomes rather than a separate branch here.
    async signIn({ user, account, profile }) {
      if (!account) return false;

      // authorize() above already proved the row exists, has a password
      // hash, and isn't archived. Nothing to add.
      if (account.provider === "credentials") return true;

      const identity = {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        email: user?.email ?? null,
        emailVerified: readEmailVerified(profile),
      };

      const linked = await prisma.userIdentity.findUnique({
        where: {
          provider_provider_account_id: {
            provider: identity.provider,
            provider_account_id: identity.providerAccountId,
          },
        },
        include: { user: true },
      });

      // Only consulted when there's no linked identity, so a normal repeat
      // sign-in costs one query rather than three.
      const emailUser =
        !linked && identity.email
          ? await prisma.user.findUnique({ where: { email: identity.email } })
          : null;
      const isFirstUser =
        !linked && !emailUser ? (await prisma.user.count()) === 0 : false;

      const decision = resolveSignIn(identity, {
        linkedUserId: linked?.user_id ?? null,
        linkedUserArchived: Boolean(linked?.user.archived_at),
        emailUserId: emailUser?.id ?? null,
        emailUserArchived: Boolean(emailUser?.archived_at),
        isFirstUser,
      });

      switch (decision.action) {
        case "allow":
          return true;
        case "link":
          // First sign-in from this IdP account for an already-provisioned
          // user, including every Entra user who predates this table — from
          // here on they're matched by `sub`, not by email.
          await prisma.userIdentity.create({
            data: {
              user_id: decision.userId,
              provider: identity.provider,
              provider_account_id: identity.providerAccountId,
            },
          });
          return true;
        case "bootstrap":
          await prisma.user.create({
            data: {
              email: identity.email!,
              name: user?.name ?? undefined,
              is_owner: true,
              identities: {
                create: {
                  provider: identity.provider,
                  provider_account_id: identity.providerAccountId,
                },
              },
            },
          });
          return true;
        case "deny":
          console.warn(
            `[auth] rejected "${identity.provider}" sign-in: ${decision.reason}`,
          );
          return false;
      }
    },
    // Credentials' authorize() and an OAuth profile don't reliably carry our
    // own database id — resolve it once, on initial sign-in, and cache it on
    // the token so later requests don't hit the database just to read the
    // session.
    //
    // Resolves via UserIdentity first for OAuth (signIn above guarantees the
    // row exists by now), falling back to email. Order matters: an account
    // whose email changed at the IdP still resolves through its stable
    // `sub`, where an email lookup would find nothing and leave the session
    // without an id.
    async jwt({ token, user, account }) {
      if (!user) return token;

      const linked =
        account && account.provider !== "credentials"
          ? await prisma.userIdentity.findUnique({
              where: {
                provider_provider_account_id: {
                  provider: account.provider,
                  provider_account_id: account.providerAccountId,
                },
              },
              include: { user: true },
            })
          : null;

      const dbUser =
        linked?.user ??
        (user.email
          ? await prisma.user.findUnique({ where: { email: user.email } })
          : null);

      if (dbUser) {
        token.sub = dbUser.id;
        token.isOwner = dbUser.is_owner;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
        session.user.isOwner = Boolean(token.isOwner);
      }
      return session;
    },
  },
});
