// Seeds a fork with a few sample CMS documents so /admin/cms isn't empty on
// first run: three Pages (a landing/home page, About, Contact) and one blog
// Post. Idempotent — skips any document whose slug already exists, so it's
// safe to re-run. Run with Payload's own script runner (loads env + the
// @payload-config alias + the config's DB adapter):
//
//   pnpm seed:content
//
// Content is deliberately generic placeholder copy — a fork replaces it.
import { getPayload } from "payload";
import config from "@payload-config";
import type { Page } from "../payload-types";

// --- minimal lexical richText builders ---------------------------------
type LexNode = { type: string; version: number; [k: string]: unknown };

function text(value: string): LexNode {
  return {
    type: "text",
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    text: value,
    version: 1,
  };
}

function paragraph(value: string): LexNode {
  return {
    type: "paragraph",
    children: [text(value)],
    direction: "ltr",
    format: "",
    indent: 0,
    textFormat: 0,
    version: 1,
  };
}

function heading(value: string, tag: "h1" | "h2" | "h3" = "h2"): LexNode {
  return {
    type: "heading",
    tag,
    children: [text(value)],
    direction: "ltr",
    format: "",
    indent: 0,
    version: 1,
  };
}

function richText(...children: LexNode[]): NonNullable<Page["content"]> {
  return {
    root: {
      type: "root",
      children,
      direction: "ltr",
      format: "",
      indent: 0,
      version: 1,
    },
  } as unknown as NonNullable<Page["content"]>;
}

async function main() {
  const payload = await getPayload({ config });

  const pages = [
    {
      title: "Welcome to Acme",
      slug: "home",
      aiConcierge: {
        enabled: true,
        suggestions: [
          { label: "What do you offer?" },
          {
            label: "Pricing",
            sampleMessage: "How much does the pro plan cost?",
          },
          { label: "Get started", sampleMessage: "How do I sign up?" },
        ],
      },
      content: richText(
        heading("Welcome to Acme", "h1"),
        paragraph(
          "Acme is a starter landing page rendered from the Payload CMS. Everything on this page is editable content, not hard-coded markup.",
        ),
        heading("Why Acme"),
        paragraph(
          "Fast to fork, easy to customize, and grounded by an AI concierge that answers from your own content.",
        ),
        heading("Get started"),
        paragraph(
          "Edit this page in /admin/cms, or ask the concierge a question.",
        ),
      ),
    },
    {
      title: "About",
      slug: "about",
      content: richText(
        heading("About Acme", "h1"),
        paragraph(
          "We build tools that get out of your way. This About page is sample content seeded into the CMS — replace it with your own story.",
        ),
        heading("Our mission"),
        paragraph(
          "Help teams ship content-driven products without reinventing the plumbing each time.",
        ),
      ),
    },
    {
      title: "Contact",
      slug: "contact",
      content: richText(
        heading("Contact us", "h1"),
        paragraph(
          "Questions? Reach the team below — or ask the concierge in the corner.",
        ),
        paragraph("Email: hello@example.com"),
        paragraph("Phone: +1 (555) 010-1234"),
      ),
    },
  ];

  const post = {
    title: "Hello, world: launching the Acme blog",
    slug: "hello-world",
    content: richText(
      heading("Hello, world", "h1"),
      paragraph(
        "This is the first post on the Acme blog — sample content seeded into the CMS so the Posts collection has something to show.",
      ),
      heading("What to expect"),
      paragraph(
        "Product updates, engineering notes, and the occasional deep dive. Stay tuned.",
      ),
    ),
  };

  async function exists(collection: "pages" | "posts", slug: string) {
    const found = await payload.find({
      collection,
      where: { slug: { equals: slug } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    return found.totalDocs > 0;
  }

  for (const page of pages) {
    if (await exists("pages", page.slug)) {
      payload.logger.info(`Page "${page.slug}" already exists — skipping`);
      continue;
    }
    const created = await payload.create({
      collection: "pages",
      data: { ...page, _status: "published" },
      context: { disableRevalidate: true },
      overrideAccess: true,
    });
    payload.logger.info(`Created page "${created.slug}" (${created.id})`);
  }

  if (await exists("posts", post.slug)) {
    payload.logger.info(`Post "${post.slug}" already exists — skipping`);
  } else {
    const created = await payload.create({
      collection: "posts",
      data: { ...post, _status: "published" },
      context: { disableRevalidate: true },
      overrideAccess: true,
    });
    payload.logger.info(`Created post "${created.slug}" (${created.id})`);
  }

  payload.logger.info("Content seed complete.");
}

// Top-level await, not a floating `main().then(...)`: Payload's `run` command
// finishes as soon as the module's top-level evaluation settles, so a detached
// promise would let the process exit before the seed work runs.
try {
  await main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
