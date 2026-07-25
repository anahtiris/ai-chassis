import { draftMode } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

// Enables Next.js Draft Mode and redirects to the actual page, so
// admin.livePreview/preview (see lib/payload/collections/pages.ts and
// posts.ts) can render an unpublished draft. Gated on an active Auth.js
// session, not Payload's own auth — Payload's local password auth is
// disabled here (SSO-bridged to Auth.js, see lib/payload/authStrategy.ts),
// so payload.auth() would never succeed. Any signed-in admin can preview,
// matching every other "no dedicated permission" admin area.
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path");
  const secret = searchParams.get("secret");

  if (!process.env.PREVIEW_SECRET || secret !== process.env.PREVIEW_SECRET) {
    return NextResponse.json(
      { error: "Invalid preview secret" },
      { status: 403 },
    );
  }

  if (!path || !path.startsWith("/")) {
    return NextResponse.json(
      { error: "This endpoint can only be used for relative previews" },
      { status: 400 },
    );
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  const draft = await draftMode();
  draft.enable();

  redirect(path);
}
