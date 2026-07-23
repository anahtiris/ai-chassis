import { prisma } from "@/lib/db/client";
import type { AiPromptConfig, AiPromptConfigVersion } from "@prisma/client";

export interface CreateVersionInput {
  key: string;
  prompt_text: string;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  change_note: string | null;
  created_by: string;
}

export interface CreateVersionResult {
  config: AiPromptConfig;
  version: AiPromptConfigVersion;
  previousVersion: AiPromptConfigVersion | null;
}

// Creates the AiPromptConfig row if `key` is new. Always inserts a new
// AiPromptConfigVersion (never mutates an existing one) and repoints
// active_version_id at it.
export async function createPromptVersion(
  input: CreateVersionInput,
): Promise<CreateVersionResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.aiPromptConfig.findUnique({
      where: { key: input.key },
      include: { active_version: true },
    });
    const config =
      existing ??
      (await tx.aiPromptConfig.create({ data: { key: input.key } }));

    const latest = await tx.aiPromptConfigVersion.findFirst({
      where: { config_id: config.id },
      orderBy: { version: "desc" },
    });

    const version = await tx.aiPromptConfigVersion.create({
      data: {
        config_id: config.id,
        version: (latest?.version ?? 0) + 1,
        prompt_text: input.prompt_text,
        model: input.model,
        temperature: input.temperature,
        max_tokens: input.max_tokens,
        change_note: input.change_note,
        created_by: input.created_by,
      },
    });

    const updatedConfig = await tx.aiPromptConfig.update({
      where: { id: config.id },
      data: { active_version_id: version.id },
    });

    return {
      config: updatedConfig,
      version,
      previousVersion: existing?.active_version ?? null,
    };
  });
}

export interface ActivateVersionInput {
  key: string;
  versionId: string;
}

export interface ActivateVersionResult {
  config: AiPromptConfig;
  activated: AiPromptConfigVersion;
  previousVersion: AiPromptConfigVersion | null;
}

// Rollback / switch-active. Does not create a new version row or bump the
// counter — only repoints the pointer at an existing snapshot, so "v3"
// keeps meaning the same content forever.
export async function activatePromptVersion(
  input: ActivateVersionInput,
): Promise<ActivateVersionResult> {
  return prisma.$transaction(async (tx) => {
    const config = await tx.aiPromptConfig.findUnique({
      where: { key: input.key },
      include: { active_version: true },
    });
    if (!config) {
      throw new Error(`No AiPromptConfig for key "${input.key}"`);
    }

    const target = await tx.aiPromptConfigVersion.findUnique({
      where: { id: input.versionId },
    });
    if (!target || target.config_id !== config.id) {
      throw new Error(
        `Version "${input.versionId}" does not belong to "${input.key}"`,
      );
    }

    const updatedConfig = await tx.aiPromptConfig.update({
      where: { id: config.id },
      data: { active_version_id: target.id },
    });

    return {
      config: updatedConfig,
      activated: target,
      previousVersion: config.active_version,
    };
  });
}

// Uncached — feeds the admin history/diff page, not the request-time
// registry (see lib/ai/promptRegistry.ts for that).
export async function listPromptVersions(key: string): Promise<{
  config: AiPromptConfig & { active_version: AiPromptConfigVersion | null };
  versions: AiPromptConfigVersion[];
} | null> {
  const config = await prisma.aiPromptConfig.findUnique({
    where: { key },
    include: { active_version: true },
  });
  if (!config) return null;

  const versions = await prisma.aiPromptConfigVersion.findMany({
    where: { config_id: config.id },
    orderBy: { version: "desc" },
  });

  return { config, versions };
}
