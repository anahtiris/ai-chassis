import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/client";
import { hasPermission } from "@/lib/auth/permissions";
import {
  activatePromptVersion,
  archivePromptConfig,
  archivePromptVersion,
  listPromptVersions,
} from "@/lib/ai/promptVersions";
import { invalidateActivePrompt } from "@/lib/ai/promptRegistry";
import { diffPromptVersions } from "@/lib/ai/promptDiff";
import type { AiPromptConfigVersion } from "@prisma/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmSubmitButton } from "@/components/admin/ConfirmSubmitButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Gated by AI_MANAGEMENT, same as app/(app)/admin/(shell)/ai/prompts/page.tsx.
// Version selection uses GET query params rather than a client component/modal
// (no modal component exists in components/ui/* yet). The one client component
// here is ConfirmSubmitButton, guarding the archive action against a stray
// click — a native confirm() is enough, no modal needed.
export default async function AiPromptHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ from?: string; to?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  const allowed = await hasPermission(session.user.id, "AI_MANAGEMENT");
  if (!allowed) redirect("/admin");

  const { key } = await params;
  const { from, to, error } = await searchParams;

  const data = await listPromptVersions(key);
  if (!data) notFound();

  const { config, versions } = data;

  async function activateVersion(formData: FormData) {
    "use server";
    const actingSession = await auth();
    if (!actingSession?.user) throw new Error("Not authorized");
    const ok = await hasPermission(actingSession.user.id, "AI_MANAGEMENT");
    if (!ok) throw new Error("Not authorized");

    const formKey = formData.get("key");
    const versionId = formData.get("versionId");
    if (typeof formKey !== "string" || typeof versionId !== "string") return;

    const actor = actingSession.user.email ?? actingSession.user.id;

    let activated: AiPromptConfigVersion;
    let previousVersion: AiPromptConfigVersion | null;
    try {
      const result = await activatePromptVersion({
        key: formKey,
        versionId,
        actor,
      });
      activated = result.activated;
      previousVersion = result.previousVersion;
    } catch {
      redirect(
        `/admin/ai/prompts/${encodeURIComponent(formKey)}?error=activate-failed`,
      );
    }

    invalidateActivePrompt(formKey);

    await prisma.auditLog.create({
      data: {
        entity_type: "AiPromptConfig",
        entity_id: activated.config_id,
        action: "activate_version",
        actor,
        before: previousVersion
          ? { version: previousVersion.version }
          : undefined,
        after: { version: activated.version },
      },
    });

    revalidatePath("/admin/ai/prompts");
    revalidatePath(`/admin/ai/prompts/${encodeURIComponent(formKey)}`);
  }

  // Per-version soft delete (Option C): hide one non-active version from the
  // history table. Never touches the active pointer or version content — the
  // helper rejects archiving the active version. Recover via the DB.
  async function archiveVersion(formData: FormData) {
    "use server";
    const actingSession = await auth();
    if (!actingSession?.user) throw new Error("Not authorized");
    const ok = await hasPermission(actingSession.user.id, "AI_MANAGEMENT");
    if (!ok) throw new Error("Not authorized");

    const formKey = formData.get("key");
    const versionId = formData.get("versionId");
    if (typeof formKey !== "string" || typeof versionId !== "string") return;

    const actor = actingSession.user.email ?? actingSession.user.id;

    let archived: AiPromptConfigVersion;
    try {
      archived = await archivePromptVersion({ key: formKey, versionId, actor });
    } catch {
      redirect(
        `/admin/ai/prompts/${encodeURIComponent(formKey)}?error=archive-version-failed`,
      );
    }

    await prisma.auditLog.create({
      data: {
        entity_type: "AiPromptConfigVersion",
        entity_id: archived.id,
        action: "archive_version",
        actor,
        after: {
          version: archived.version,
          archived_at: archived.archived_at?.toISOString() ?? null,
          archived_by: archived.archived_by,
        },
      },
    });

    revalidatePath(`/admin/ai/prompts/${encodeURIComponent(formKey)}`);
  }

  // Soft delete the whole config: hides it from the prompts list and makes the
  // concierge fall back to the AI_PROVIDER default (promptRegistry skips
  // archived rows). Version history stays intact; recover by clearing
  // archived_at in the DB. No hard delete — immutable versions + audit trail
  // are the point. Redirects back to the list since this page's subject is now
  // archived.
  async function archivePrompt(formData: FormData) {
    "use server";
    const actingSession = await auth();
    if (!actingSession?.user) throw new Error("Not authorized");
    const ok = await hasPermission(actingSession.user.id, "AI_MANAGEMENT");
    if (!ok) throw new Error("Not authorized");

    const formKey = formData.get("key");
    if (typeof formKey !== "string" || !formKey.trim()) return;
    const trimmedKey = formKey.trim();

    const actor = actingSession.user.email ?? actingSession.user.id;
    const archived = await archivePromptConfig({ key: trimmedKey, actor });
    if (!archived) return;

    invalidateActivePrompt(trimmedKey);

    await prisma.auditLog.create({
      data: {
        entity_type: "AiPromptConfig",
        entity_id: archived.id,
        action: "archive",
        actor,
        before: { key: trimmedKey, archived_at: null },
        after: {
          key: trimmedKey,
          archived_at: archived.archived_at?.toISOString() ?? null,
          archived_by: archived.archived_by,
        },
      },
    });

    revalidatePath("/admin/ai/prompts");
    redirect("/admin/ai/prompts");
  }

  // Default to comparing the two most recent versions.
  const toVersion = to
    ? versions.find((v) => String(v.version) === to)
    : (config.active_version ?? versions[0]);
  const fromVersion = from
    ? versions.find((v) => String(v.version) === from)
    : (versions.find((v) => v.id !== toVersion?.id) ?? toVersion);

  const diff =
    fromVersion && toVersion
      ? diffPromptVersions(fromVersion, toVersion)
      : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/admin/ai/prompts"
        className="text-muted-foreground text-sm underline underline-offset-2"
      >
        ← Back to prompts
      </Link>

      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          {config.name}
          <Badge variant="outline">{config.prompt_type}</Badge>
        </h1>
        <p className="text-muted-foreground font-mono text-xs">{config.key}</p>
        {config.description && (
          <p className="text-muted-foreground text-sm">{config.description}</p>
        )}
        <p className="text-muted-foreground text-xs">
          Created by {config.created_by} · updated by {config.updated_by} ·{" "}
          {config.updated_at.toLocaleString()}
          {config.archived_at &&
            ` · archived by ${config.archived_by ?? "—"} ${config.archived_at.toLocaleString()}`}
        </p>
      </div>

      {error === "archive-version-failed" ? (
        <p className="text-destructive text-sm">
          Could not archive that version — it may be the active version (roll
          back first) or already archived.
        </p>
      ) : (
        error && (
          <p className="text-destructive text-sm">
            Could not activate that version — it may no longer exist.
          </p>
        )
      )}

      {versions.length < 2 && (
        <p className="text-muted-foreground text-sm">
          Only one version exists yet — save another edit on the prompts page to
          see a diff here.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Compare versions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <form method="get" className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="from-version" className="text-sm font-medium">
                From
              </label>
              <select
                key={fromVersion?.id ?? "none"}
                id="from-version"
                name="from"
                defaultValue={fromVersion ? String(fromVersion.version) : ""}
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.version}>
                    v{v.version} — {v.change_note ?? "no note"} ({v.created_by})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="to-version" className="text-sm font-medium">
                To
              </label>
              <select
                key={toVersion?.id ?? "none"}
                id="to-version"
                name="to"
                defaultValue={toVersion ? String(toVersion.version) : ""}
                className="border-input bg-background h-9 rounded-md border px-2 text-sm"
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.version}>
                    v{v.version} — {v.change_note ?? "no note"} ({v.created_by})
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm">
              Compare
            </Button>
          </form>

          {diff && (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-3">
                {diff.scalar_diffs.map((fieldDiff) => (
                  <div
                    key={fieldDiff.field}
                    className="flex flex-col gap-1 rounded-md border p-2 text-xs"
                  >
                    <span className="text-muted-foreground font-medium">
                      {fieldDiff.field}
                    </span>
                    {fieldDiff.changed ? (
                      <span>
                        <span className="text-error line-through">
                          {fieldDiff.before ?? "default"}
                        </span>{" "}
                        <span className="text-success">
                          {fieldDiff.after ?? "default"}
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">unchanged</span>
                    )}
                  </div>
                ))}
              </div>

              <pre className="overflow-x-auto rounded-md border p-3 font-mono text-xs whitespace-pre-wrap">
                {diff.prompt_text_diff.map((chunk, chunkIndex) =>
                  chunk.value
                    .split("\n")
                    .filter(
                      (line, i, arr) => !(i === arr.length - 1 && line === ""),
                    )
                    .map((line, lineIndex) => (
                      <div
                        key={`${chunkIndex}-${lineIndex}`}
                        className={
                          chunk.added
                            ? "bg-success/10 text-success"
                            : chunk.removed
                              ? "bg-error/10 text-error"
                              : undefined
                        }
                      >
                        {chunk.added ? "+ " : chunk.removed ? "- " : "  "}
                        {line}
                      </div>
                    )),
                )}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-sm">
            Version history
            <form action={archivePrompt}>
              <input type="hidden" name="key" value={config.key} />
              <ConfirmSubmitButton
                size="sm"
                variant="destructive"
                confirmMessage={`Archive "${config.key}"? It disappears from the prompts list and the concierge falls back to the AI_PROVIDER default. History is kept; recover from the database.`}
              >
                Archive prompt
              </ConfirmSubmitButton>
            </form>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Change note</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {versions.map((v) => {
                const isActive = v.id === config.active_version_id;
                return (
                  <TableRow key={v.id}>
                    <TableCell>
                      v{v.version}{" "}
                      {isActive && <Badge variant="secondary">active</Badge>}
                    </TableCell>
                    <TableCell>{v.change_note ?? "—"}</TableCell>
                    <TableCell>{v.created_by}</TableCell>
                    <TableCell>{v.created_at.toLocaleString()}</TableCell>
                    <TableCell>
                      {!isActive && (
                        <div className="flex items-center gap-2">
                          <form action={activateVersion}>
                            <input
                              type="hidden"
                              name="key"
                              value={config.key}
                            />
                            <input
                              type="hidden"
                              name="versionId"
                              value={v.id}
                            />
                            <Button type="submit" size="sm" variant="outline">
                              Activate
                            </Button>
                          </form>
                          {/* Active version has no Archive — it must be rolled
                              back first (the helper enforces this too). */}
                          <form action={archiveVersion}>
                            <input
                              type="hidden"
                              name="key"
                              value={config.key}
                            />
                            <input
                              type="hidden"
                              name="versionId"
                              value={v.id}
                            />
                            <ConfirmSubmitButton
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              confirmMessage={`Archive v${v.version}? It disappears from this history. Version content is kept for reproducibility; recover from the database.`}
                            >
                              Archive
                            </ConfirmSubmitButton>
                          </form>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
