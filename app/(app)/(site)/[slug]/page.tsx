import { PageView } from "@/components/site/PageView";

// Renders a published CMS Page at /<slug> (e.g. /about, /contact). The landing
// page (slug "/") lives at the site root only — see (site)/page.tsx.
export default async function ContentPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PageView slug={slug} />;
}
