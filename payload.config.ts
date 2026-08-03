import type { Plugin, SharpDependency } from "payload";
import sharp from "sharp";
import { postgresAdapter } from "@payloadcms/db-postgres";
import {
  FixedToolbarFeature,
  HeadingFeature,
  lexicalEditor,
} from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import { seoPlugin } from "@payloadcms/plugin-seo";
import type { GenerateURL } from "@payloadcms/plugin-seo/types";
import { redirectsPlugin } from "@payloadcms/plugin-redirects";
import { nestedDocsPlugin } from "@payloadcms/plugin-nested-docs";
import { formBuilderPlugin } from "@payloadcms/plugin-form-builder";
import { searchPlugin } from "@payloadcms/plugin-search";
import { s3Storage } from "@payloadcms/storage-s3";
import payloadcmsVectorize from "payloadcms-vectorize";
import { createPostgresVectorIntegration } from "@payloadcms-vectorize/pg";
import type { ToKnowledgePoolFn } from "payloadcms-vectorize";
import { embedDocs, embedQuery, EMBEDDING_DIMS } from "@/lib/ai/embeddings";
import { Pages } from "@/lib/payload/collections/pages";
import { Posts } from "@/lib/payload/collections/posts";
import { Categories } from "@/lib/payload/collections/categories";
import { Media } from "@/lib/payload/collections/media";
import { Users } from "@/lib/payload/collections/users";
import { AiConcierge } from "@/lib/payload/concierge/global";
import { createRevalidateHooks } from "@/lib/payload/hooks/revalidateCollection";
import { bridgeFormSubmissionToPrisma } from "@/lib/payload/hooks/bridgeFormSubmission";
import { searchFields } from "@/lib/payload/search/fieldOverrides";
import { beforeSyncWithSearch } from "@/lib/payload/search/beforeSync";
import { lexicalToPlainText } from "@/lib/payload/lexicalToPlainText";
import { generateSeoTitle, generateSeoDescription } from "@/lib/ai/seoGenerate";
import type { Page, Post } from "@/payload-types";

// CMS-managed content only — see docs/decisions.md "Admin portal scope" and
// "CMS and admin share one Postgres instance". Everything
// domain-agnostic-but-not-content (audit log, form results, users,
// analytics) lives in Prisma's `app` schema instead — see prisma/schema.prisma.
//
// Deliberately NOT setting a custom `schemaName` here — @payloadcms/db-postgres
// marks that option experimental, with open upstream bugs where tables still
// land in `public` regardless of what's configured (see docs/decisions.md
// "Known issues"). Payload uses its stable default (`public`) instead; the
// one deliberate separation is Prisma's `app` schema, which has no such
// caveat.

const ragEnabled = process.env.RAG_ENABLED === "true";

// Media stays on local disk (see lib/payload/collections/media.ts) unless
// STORAGE_BUCKET is set, in which case s3Storage takes over and disables
// local storage on the collection automatically. forcePathStyle + an
// optional STORAGE_ENDPOINT keep this working against any S3-compatible
// target (MinIO, R2, DigitalOcean Spaces), not just AWS.
const storageEnabled = Boolean(process.env.STORAGE_BUCKET);

// Backs the "Generate" buttons on Pages/Posts' SEO tab fields
// (MetaTitleField/MetaDescriptionField/PreviewField's `hasGenerateFn: true`,
// in lib/payload/collections/{pages,posts}.ts) — those buttons call
// whatever this plugin registers, so it has to actually be registered for
// them to do anything. generateTitle/generateDescription (lib/ai/seoGenerate.ts)
// call the same pluggable getModel() the concierge uses. generateURL stays
// static — no LLM involved, no fixed site name or URL structure baked in
// beyond NEXT_PUBLIC_SERVER_URL, unlike the original project's version
// (`Payload Website Template`, a hardcoded `/industries/<slug>` shape).
const generateURL: GenerateURL<Post | Page> = ({ doc }) => {
  const base = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:4000";
  return doc?.slug ? `${base}/${doc.slug}` : base;
};

// Reuses the same tag-based revalidation factory Pages/Posts/AiConcierge
// already use (lib/payload/hooks/revalidateCollection.ts), rather than the
// original project's revalidateRedirects.ts (a near-identical one-off
// calling revalidateTag('redirects', 'max') directly) — one generic
// mechanism instead of a parallel copy.
const { afterChange: revalidateRedirectsAfterChange } =
  createRevalidateHooks("redirects");

// Feeds the starter `pages` collection into the "content" knowledge pool —
// see lib/knowledge/provider.ts's RagProvider, which queries this pool by
// name. Add more collections here per project as content types grow; the
// pool name just needs to stay different from every collection slug (the
// plugin's own requirement — see its README "Troubleshooting").
const pagesToKnowledgePool: ToKnowledgePoolFn = async (doc) => {
  const entries: Array<{ chunk: string; slug?: string }> = [];
  const slug = typeof doc.slug === "string" ? doc.slug : undefined;

  if (typeof doc.title === "string" && doc.title.trim()) {
    entries.push({ chunk: doc.title, slug });
  }

  // Only `content` blocks carry prose worth feeding to the concierge —
  // mediaBlock/formBlock have no text of their own here.
  const layout = Array.isArray(doc.layout) ? doc.layout : [];
  for (const block of layout) {
    if (
      !block ||
      typeof block !== "object" ||
      (block as { blockType?: unknown }).blockType !== "content"
    ) {
      continue;
    }
    const columns = Array.isArray((block as { columns?: unknown }).columns)
      ? ((block as { columns: unknown[] }).columns as Array<{
          richText?: { root?: unknown };
        }>)
      : [];
    for (const column of columns) {
      const bodyText = lexicalToPlainText(column.richText?.root).trim();
      if (bodyText) entries.push({ chunk: bodyText, slug });
    }
  }

  return entries;
};

// Only actually constructed when RAG_ENABLED=true — see docs/decisions.md
// "RAG implementation: payloadcms-vectorize + pgvector". Direct content
// injection (the default knowledge provider) needs none of this: no
// pgvector extension, no extra Payload migration, no embedding API calls.
// Flipping RAG_ENABLED on later requires installing Postgres's `vector`
// extension and running a fresh `pnpm payload migrate` — see README
// "RAG (opt-in)".
const vectorIntegration = ragEnabled
  ? createPostgresVectorIntegration({
      content: { dims: EMBEDDING_DIMS, ivfflatLists: 100 },
    })
  : null;

export default buildConfig({
  // Required for Media's imageSizes to actually resize on upload — without
  // it Payload logs a warning and stores originals only, no thumbnails.
  // Cast: sharp's own overloaded call signature isn't structurally
  // assignable to Payload's single-signature SharpDependency type — a
  // types-only mismatch between the two packages, not a real incompatibility
  // (sharp is Payload's own documented/recommended dependency for this).
  sharp: sharp as unknown as SharpDependency,
  // Mounted at /admin/cms, not the default /admin — proxy.ts already guards
  // /admin/* for the separate custom admin portal (AI prompts, audit log,
  // leads, analytics, users), so Payload's own panel needs a distinct path
  // to avoid colliding with it. Same precedent the original project used.
  routes: {
    admin: "/admin/cms",
  },
  admin: {
    user: Users.slug,
    // Payload's own theme system (html[data-theme], --theme-elevation-*
    // etc. in @payloadcms/ui) is entirely separate from this toolkit's
    // shadcn/Tailwind tokens in app/globals.css — the brand colors don't
    // reach Payload's native chrome (separate palette), only the custom
    // components under components/payload/*. Left at 'all' so /admin/cms
    // follows the light/dark choice made in /admin/settings: that choice is
    // mirrored into Payload's own `payload-theme` cookie
    // (components/settings/AppearanceControls.tsx), which Payload reads
    // server-side (getRequestTheme). 'all' also means "follow OS" when no
    // choice is set, matching the toolkit's own "System" default.
    theme: "all",
    components: {
      // Bridges the font-size chosen in /admin/settings into Payload's own
      // <html> (a separate document tree). Theme needs no bridge — the
      // mirrored `payload-theme` cookie above handles it natively.
      providers: ["@/components/payload/AppearanceSync#AppearanceSync"],
      // See components/payload/BackToHubButton.tsx — Payload's own logout
      // isn't meaningful when auth is delegated to Auth.js (see
      // lib/payload/authStrategy.ts), so this replaces it with a link back
      // to the /admin hub, where the real sign-out lives.
      logout: {
        Button: "@/components/payload/BackToHubButton#BackToHubButton",
      },
      // See components/payload/RedirectToLogin.tsx — Payload's own login
      // view expects local-strategy fields that don't exist (disabled on
      // `users`, see collections/users.ts). Normally unreachable (proxy.ts
      // already gates /admin/cms behind a valid Auth.js session), but if it
      // ever is, redirect to the real login page instead of showing a
      // broken form.
      beforeLogin: ["@/components/payload/RedirectToLogin"],
    },
  },
  editor: lexicalEditor(),
  collections: [Pages, Posts, Categories, Media, Users],
  globals: [AiConcierge],
  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    // Disable dev-mode pushDevSchema. Default is true when
    // NODE_ENV !== production, which makes @payloadcms/db-postgres introspect
    // the WHOLE database on every Payload init (no schemaName is set — see
    // note above) and drop into an interactive "create or rename?" prompt on
    // any drift. On a non-TTY server (background dev server, next dev without
    // an attached terminal) that prompt never gets answered, so every request
    // that initializes Payload blocks for minutes. Schema is managed via
    // Payload migrations instead: `pnpm payload:migrate:create` +
    // `pnpm payload:migrate`. See docs/decisions.md "Known issues".
    push: false,
    ...(vectorIntegration
      ? {
          extensions: ["vector"],
          afterSchemaInit: [vectorIntegration.afterSchemaInitHook],
        }
      : {}),
  }),
  plugins: [
    // Generic mechanism, not content: which collections a redirect's `to`
    // field can point at (pages/posts, this toolkit's own two content
    // collections), revalidated by tag on change like everything else here.
    redirectsPlugin({
      collections: ["pages", "posts"],
      overrides: {
        hooks: {
          afterChange: [revalidateRedirectsAfterChange],
        },
      },
    }),
    // Adds parent/breadcrumbs to Categories — generic taxonomy nesting, no
    // fixed URL shape assumed beyond joining ancestor slugs with `/`.
    nestedDocsPlugin({
      collections: ["categories"],
      generateURL: (docs) =>
        docs.reduce((url, doc) => `${url}/${doc.slug}`, ""),
    }),
    seoPlugin({
      generateTitle: generateSeoTitle,
      generateDescription: generateSeoDescription,
      generateURL,
    }),
    // Form-builder's own `forms`/`form-submissions` collections, generic
    // out of the box (payment fields disabled — no payment integration in
    // this toolkit) plus a richer confirmation-message editor. The one
    // piece that needed real thought: form-builder ships its own
    // `form-submissions` collection, separate from this toolkit's existing
    // Prisma `FormSubmission` model (already backing /admin/form-results).
    // Left unbridged, that's two disconnected submission stores. See
    // lib/payload/hooks/bridgeFormSubmission.ts and docs/decisions.md
    // "formBuilderPlugin: one submission store, not two" — every
    // form-builder submission gets mirrored into the same Prisma table,
    // generically (no form-specific routing), so /admin/form-results stays
    // the single place to see submissions regardless of which system
    // captured them.
    formBuilderPlugin({
      fields: { payment: false },
      formOverrides: {
        fields: ({ defaultFields }) =>
          defaultFields.map((field) => {
            if ("name" in field && field.name === "confirmationMessage") {
              return {
                ...field,
                editor: lexicalEditor({
                  features: ({ rootFeatures }) => [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({
                      enabledHeadingSizes: ["h1", "h2", "h3", "h4"],
                    }),
                  ],
                }),
              };
            }
            return field;
          }),
      },
      formSubmissionOverrides: {
        hooks: {
          afterChange: [bridgeFormSubmissionToPrisma],
        },
      },
    }),
    // Generic search-index mirror over Posts — field overrides and
    // beforeSync only reference slug/meta/categories shapes this toolkit's
    // own collections already have (lib/payload/search/).
    searchPlugin({
      collections: ["posts"],
      beforeSync: beforeSyncWithSearch,
      searchOverrides: {
        fields: ({ defaultFields }) => [...defaultFields, ...searchFields],
      },
    }),
    ...(storageEnabled
      ? [
          s3Storage({
            collections: { media: true },
            bucket: process.env.STORAGE_BUCKET!,
            config: {
              credentials: {
                accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
                secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
              },
              region: process.env.STORAGE_REGION,
              endpoint: process.env.STORAGE_ENDPOINT || undefined,
              forcePathStyle: true,
            },
          }),
        ]
      : []),
    ...(vectorIntegration
      ? [
          payloadcmsVectorize({
            dbAdapter: vectorIntegration.adapter,
            realtimeQueueName: "vectorize-realtime",
            knowledgePools: {
              content: {
                collections: {
                  pages: { toKnowledgePool: pagesToKnowledgePool },
                },
                extensionFields: [{ name: "slug", type: "text" }],
                embeddingConfig: {
                  version: "v1",
                  queryFn: embedQuery,
                  realTimeIngestionFn: embedDocs,
                },
              },
            },
          }) as Plugin,
        ]
      : []),
  ],
  jobs: {
    // The realtime queue only actually gets processed if some live request
    // path calls getPayload({ cron: true }) — see lib/payload/client.ts.
    // This toolkit doesn't have a concierge endpoint calling
    // getKnowledgeProvider() yet, so verify jobs are actually draining
    // (check the payload-jobs collection in /admin/cms) before assuming
    // saved content gets embedded automatically.
    autoRun: ragEnabled
      ? [{ cron: "*/5 * * * * *", limit: 10, queue: "vectorize-realtime" }]
      : [],
  },
  secret: process.env.PAYLOAD_SECRET ?? "",
  typescript: {
    outputFile: "payload-types.ts",
  },
});
