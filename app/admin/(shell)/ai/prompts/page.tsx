import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db/client";
import { hasPermission } from "@/lib/auth/permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Empty input -> null (fall back to the AI_PROVIDER-driven default in
// lib/ai/provider.ts). Non-empty but out-of-range/non-numeric -> undefined,
// signaling the caller to reject the whole submit.
//
// Module-level, not nested in the page component — a Server Action closure
// (savePrompt below) can't capture plain function values from its enclosing
// scope; Next.js's "use server" serializer rejects them ("functions cannot
// be passed to Client Components") since the form itself renders client-side.
function parseOptionalFloat(
  raw: FormDataEntryValue | null,
  min: number,
  max: number,
) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  if (Number.isNaN(value) || value < min || value > max) return undefined;
  return value;
}

function parseOptionalInt(raw: FormDataEntryValue | null, min: number) {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) return undefined;
  return value;
}

// Gated by AI_MANAGEMENT — shared with
// app/admin/(shell)/ai/conversations/page.tsx, mirroring the original
// project's grouping of prompt editing and conversation review under one
// permission. First mutation-capable page beyond /admin/users; still writes
// an AuditLog entry per the same pattern.
export default async function AiPromptsPage() {
  const session = await auth();
  if (!session?.user) redirect("/admin/login");

  const allowed = await hasPermission(session.user.id, "AI_MANAGEMENT");
  if (!allowed) redirect("/admin");

  const prompts = await prisma.aiPromptConfig.findMany({
    orderBy: { key: "asc" },
  });

  async function savePrompt(formData: FormData) {
    "use server";
    const actingSession = await auth();
    if (!actingSession?.user) throw new Error("Not authorized");
    const ok = await hasPermission(actingSession.user.id, "AI_MANAGEMENT");
    if (!ok) throw new Error("Not authorized");

    const key = formData.get("key");
    const promptText = formData.get("prompt_text");
    if (typeof key !== "string" || typeof promptText !== "string") return;
    const trimmedKey = key.trim();
    if (!trimmedKey || !promptText.trim()) return;

    const modelRaw = formData.get("model");
    const model =
      typeof modelRaw === "string" && modelRaw.trim() !== ""
        ? modelRaw.trim()
        : null;
    const temperature = parseOptionalFloat(formData.get("temperature"), 0, 2);
    const maxTokens = parseOptionalInt(formData.get("max_tokens"), 1);
    if (temperature === undefined || maxTokens === undefined) return;

    const existing = await prisma.aiPromptConfig.findUnique({
      where: { key: trimmedKey },
    });

    const saved = await prisma.aiPromptConfig.upsert({
      where: { key: trimmedKey },
      update: {
        prompt_text: promptText,
        model,
        temperature,
        max_tokens: maxTokens,
        version: { increment: 1 },
      },
      create: {
        key: trimmedKey,
        prompt_text: promptText,
        model,
        temperature,
        max_tokens: maxTokens,
      },
    });

    await prisma.auditLog.create({
      data: {
        entity_type: "AiPromptConfig",
        entity_id: saved.id,
        action: existing ? "update" : "create",
        actor: actingSession.user.email ?? actingSession.user.id,
        before: existing
          ? {
              prompt_text: existing.prompt_text,
              model: existing.model,
              temperature: existing.temperature,
              max_tokens: existing.max_tokens,
              version: existing.version,
            }
          : undefined,
        after: {
          prompt_text: saved.prompt_text,
          model: saved.model,
          temperature: saved.temperature,
          max_tokens: saved.max_tokens,
          version: saved.version,
        },
      },
    });

    revalidatePath("/admin/ai/prompts");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <p className="text-muted-foreground text-sm">
        <code className="bg-muted rounded px-1 py-0.5 text-xs">version</code> is
        a running counter that increments on every save, not a full snapshot
        history — add a separate version-history model per project if
        that&apos;s needed; this toolkit keeps the base model minimal.
      </p>

      {prompts.map((prompt) => (
        <Card key={prompt.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-mono">{prompt.key}</span>
              <Badge variant="secondary">v{prompt.version}</Badge>
              <Badge variant="outline">{prompt.model ?? "default model"}</Badge>
              <Badge variant="outline">
                {prompt.temperature ?? "default"} temp
              </Badge>
              <Badge variant="outline">
                {prompt.max_tokens ?? "default"} max tokens
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form action={savePrompt} className="flex flex-col gap-3">
              <input type="hidden" name="key" value={prompt.key} />
              <Textarea
                name="prompt_text"
                defaultValue={prompt.prompt_text}
                rows={6}
                className="font-mono"
              />
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`model-${prompt.id}`}>Model</Label>
                  <Input
                    id={`model-${prompt.id}`}
                    name="model"
                    defaultValue={prompt.model ?? ""}
                    placeholder="AI_PROVIDER default"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`temperature-${prompt.id}`}>
                    Temperature
                  </Label>
                  <Input
                    id={`temperature-${prompt.id}`}
                    name="temperature"
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    defaultValue={prompt.temperature ?? ""}
                    placeholder="0–2, default"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`max-tokens-${prompt.id}`}>Max tokens</Label>
                  <Input
                    id={`max-tokens-${prompt.id}`}
                    name="max_tokens"
                    type="number"
                    step="1"
                    min="1"
                    defaultValue={prompt.max_tokens ?? ""}
                    placeholder="default"
                  />
                </div>
              </div>
              <Button type="submit" size="sm" className="self-start">
                Save (bumps to v{prompt.version + 1})
              </Button>
            </form>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">New prompt</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={savePrompt} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-prompt-key">Key</Label>
              <Input
                id="new-prompt-key"
                name="key"
                placeholder="e.g. concierge-system-prompt"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-prompt-text">Prompt text</Label>
              <Textarea
                id="new-prompt-text"
                name="prompt_text"
                placeholder="Prompt text"
                rows={6}
                required
                className="font-mono"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-prompt-model">Model</Label>
                <Input
                  id="new-prompt-model"
                  name="model"
                  placeholder="AI_PROVIDER default"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-prompt-temperature">Temperature</Label>
                <Input
                  id="new-prompt-temperature"
                  name="temperature"
                  type="number"
                  step="0.1"
                  min="0"
                  max="2"
                  placeholder="0–2, default"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-prompt-max-tokens">Max tokens</Label>
                <Input
                  id="new-prompt-max-tokens"
                  name="max_tokens"
                  type="number"
                  step="1"
                  min="1"
                  placeholder="default"
                />
              </div>
            </div>
            <Button type="submit" size="sm" className="self-start">
              Create
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
