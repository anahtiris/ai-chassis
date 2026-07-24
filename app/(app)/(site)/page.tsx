import { PageView } from "@/components/site/PageView";

// Site root: renders the CMS page whose slug is "/". Editing that page in
// /admin/cms changes the landing page. The landing page lives only at the
// root — the [slug] catch-all handles every other page (/about, /contact).
export default function HomePage() {
  return <PageView slug="/" />;
}
