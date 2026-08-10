// Decides whether an external-IdP sign-in may become a session, and which
// User row it maps to. Split out of auth.ts's signIn callback so the policy
// is a pure function over already-fetched facts — the interesting rules here
// are security rules, and they should be testable without a database (see
// identity.test.ts).
//
// Why this exists at all: before multiple OAuth providers were supported,
// auth.ts matched a sign-in to a User by email alone. That is safe with
// exactly one provider and unsafe with two — whichever configured IdP is
// easiest to get an account at can assert any address, including an owner's,
// and take over that account. The fix is to key sessions off the provider's
// own immutable subject id (persisted as UserIdentity, see
// prisma/schema.prisma) and to treat email as a one-time linking hint,
// accepted only from providers whose email claims are trustworthy.

// The provider's assertion about who just signed in.
export interface OAuthIdentity {
  // Auth.js provider id, e.g. "microsoft-entra-id" or "oidc".
  provider: string;
  // OIDC `sub` — the provider's stable, immutable id for this account.
  providerAccountId: string;
  email: string | null;
  // null when the provider says nothing either way, which is different from
  // an explicit false. Entra ID, for instance, emits no `email_verified`.
  emailVerified: boolean | null;
}

// What auth.ts already knows from the database by the time it decides.
export interface SignInFacts {
  // User already linked to (provider, providerAccountId), if any.
  linkedUserId: string | null;
  linkedUserArchived: boolean;
  // User whose email matches the assertion, if any. Only consulted when
  // there's no linked identity yet.
  emailUserId: string | null;
  emailUserArchived: boolean;
  // True when the User table is completely empty — the bootstrap case (see
  // docs/decisions.md "Bootstrap: first user is owner").
  isFirstUser: boolean;
}

export type SignInDecision =
  // Known identity, nothing to write.
  | { action: "allow"; userId: string }
  // First sign-in from this IdP account for an existing User: create the
  // UserIdentity row, then allow.
  | { action: "link"; userId: string }
  // Empty database: create the owner User and its UserIdentity, then allow.
  | { action: "bootstrap" }
  | { action: "deny"; reason: string };

// Providers whose email claim may be used to link an IdP account to an
// existing User. Everything else must present an explicitly verified email.
//
// Entra ID is trusted by default because it emits no `email_verified` claim
// at all, yet a tenant-scoped app registration is entirely operator-
// controlled — requiring a claim it never sends would just break the
// provider this toolkit already shipped. A generic `oidc` provider is NOT
// trusted by default: the operator configured *some* issuer, and whether its
// users can set arbitrary email addresses is unknowable from here.
const DEFAULT_TRUSTED_EMAIL_PROVIDERS = ["microsoft-entra-id"];

export function trustedEmailProviders(): string[] {
  const configured = process.env.AUTH_TRUSTED_EMAIL_PROVIDERS;
  if (configured === undefined) return DEFAULT_TRUSTED_EMAIL_PROVIDERS;
  return configured
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

// An email may be used to claim an existing account only when the provider
// verified it, or when the operator declared that provider's emails
// trustworthy. An explicit `emailVerified: false` is always fatal — a
// provider that bothers to say "not verified" is telling us not to.
export function isEmailClaimTrusted(identity: OAuthIdentity): boolean {
  if (identity.emailVerified === false) return false;
  if (identity.emailVerified === true) return true;
  return trustedEmailProviders().includes(identity.provider);
}

export function resolveSignIn(
  identity: OAuthIdentity,
  facts: SignInFacts,
): SignInDecision {
  // A linked identity is proof on its own — no email involved, so an IdP-side
  // email change doesn't lock the user out and doesn't let anyone else in.
  if (facts.linkedUserId) {
    return facts.linkedUserArchived
      ? { action: "deny", reason: "linked user is archived" }
      : { action: "allow", userId: facts.linkedUserId };
  }

  if (!identity.providerAccountId) {
    return { action: "deny", reason: "provider returned no account id" };
  }

  // Past here every path relies on the email claim, so it has to be one we
  // accept — including the bootstrap path, which mints an owner.
  if (!identity.email) {
    return { action: "deny", reason: "provider returned no email" };
  }
  if (!isEmailClaimTrusted(identity)) {
    return {
      action: "deny",
      reason: `email claim from "${identity.provider}" is not trusted for account linking`,
    };
  }

  if (facts.emailUserId) {
    return facts.emailUserArchived
      ? { action: "deny", reason: "matched user is archived" }
      : { action: "link", userId: facts.emailUserId };
  }

  if (facts.isFirstUser) return { action: "bootstrap" };

  // Deliberately not auto-provisioning: completing OAuth against a
  // configured tenant is not by itself grounds for an account here. A User
  // row has to exist already (seeded, or created in /admin/users).
  return { action: "deny", reason: "no user provisioned for this email" };
}

// OIDC's `email_verified` is a boolean claim, but real providers ship it as
// the string "true"/"false" often enough to be worth handling.
export function readEmailVerified(profile: unknown): boolean | null {
  if (!profile || typeof profile !== "object") return null;
  const claim = (profile as { email_verified?: unknown }).email_verified;
  if (typeof claim === "boolean") return claim;
  if (claim === "true") return true;
  if (claim === "false") return false;
  return null;
}
