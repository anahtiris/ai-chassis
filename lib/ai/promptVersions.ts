import { prisma } from "@/lib/db/client";
import type { AiPromptConfig, AiPromptConfigVersion } from "@prisma/client";

export interface CreateVersionInput {
  key: string;
  // Config-level metadata. On create, `name` defaults to `key`. On an
  // existing config these update the metadata in the same save (passing
  // undefined leaves a field untouched).
  name?: string;
  description?: string | null;
  prompt_text: string;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  change_note: string | null;
  // User id or a reserved actor token ("system"). Recorded on the new version
  // (created_by) and on the config head (created_by on first save, updated_by
  // on every save).
  actor: string;
}

export interface CreateVersionResult {
  config: AiPromptConfig;
  version: AiPromptConfigVersion;
  previousVersion: AiPromptConfigVersion | null;
}

// Creates the AiPromptConfig row if `key` is new. Always inserts a new
// AiPromptConfigVersion (never mutates an existing one) and repoints
// active_version_id at it. Config metadata (name/description) and updated_by
// are updated on the same save; version content stays immutable.
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
      (await tx.aiPromptConfig.create({
        data: {
          key: input.key,
          name: input.name ?? input.key,
          description: input.description ?? null,
          created_by: input.actor,
          updated_by: input.actor,
        },
      }));

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
        created_by: input.actor,
      },
    });

    // Repoint the active pointer + bump audit. For an existing config, also
    // fold in any metadata edits carried on this save.
    const updatedConfig = await tx.aiPromptConfig.update({
      where: { id: config.id },
      data: {
        active_version_id: version.id,
        updated_by: input.actor,
        ...(existing && input.name !== undefined ? { name: input.name } : {}),
        ...(existing && input.description !== undefined
          ? { description: input.description }
          : {}),
      },
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
  actor: string;
}

export interface ActivateVersionResult {
  config: AiPromptConfig;
  activated: AiPromptConfigVersion;
  previousVersion: AiPromptConfigVersion | null;
}

// Rollback / switch-active. Does not create a new version row or bump the
// counter — only repoints the pointer at an existing snapshot (and records who
// switched it), so "v3" keeps meaning the same content forever. The single
// active_version_id pointer is what structurally enforces "at most one active
// version per config": activating always moves the pointer, never adds a
// second active row.
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
      data: { active_version_id: target.id, updated_by: input.actor },
    });

    return {
      config: updatedConfig,
      activated: target,
      previousVersion: config.active_version,
    };
  });
}

export interface ArchivePromptConfigInput {
  key: string;
  actor: string;
}

// Soft delete the config head (not any version — version content is
// immutable). Sets archived_at/archived_by; getActivePrompt then treats the
// config as absent so the concierge falls back to the AI_PROVIDER default.
// Returns the archived config, or null if it doesn't exist OR was already
// archived (both are no-ops the caller can ignore).
export async function archivePromptConfig(
  input: ArchivePromptConfigInput,
): Promise<AiPromptConfig | null> {
  const config = await prisma.aiPromptConfig.findUnique({
    where: { key: input.key },
  });
  if (!config || config.archived_at) return null;

  return prisma.aiPromptConfig.update({
    where: { id: config.id },
    data: {
      archived_at: new Date(),
      archived_by: input.actor,
      updated_by: input.actor,
    },
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
    // Archived versions are hidden from operational interfaces (Option C).
    // Numbering still counts them (createPromptVersion's findFirst is
    // unfiltered), so version numbers are never reused after an archive.
    where: { config_id: config.id, archived_at: null },
    orderBy: { version: "desc" },
  });

  return { config, versions };
}

export interface ArchiveVersionInput {
  key: string;
  versionId: string;
  actor: string;
}

// Per-version soft delete (Option C). Hides one version from the history UI
// without deleting the row (conversations referencing it stay reproducible).
// Throws if the version doesn't belong to the config, is already archived, or
// is the active version — the active one must be rolled back first, so the
// active pointer can never point at an archived row.
export async function archivePromptVersion(
  input: ArchiveVersionInput,
): Promise<AiPromptConfigVersion> {
  return prisma.$transaction(async (tx) => {
    const config = await tx.aiPromptConfig.findUnique({
      where: { key: input.key },
    });
    if (!config) {
      throw new Error(`No AiPromptConfig for key "${input.key}"`);
    }

    const version = await tx.aiPromptConfigVersion.findUnique({
      where: { id: input.versionId },
    });
    if (!version || version.config_id !== config.id) {
      throw new Error(
        `Version "${input.versionId}" does not belong to "${input.key}"`,
      );
    }
    if (config.active_version_id === version.id) {
      throw new Error("Cannot archive the active version — roll back first");
    }
    if (version.archived_at) {
      throw new Error("Version is already archived");
    }

    const archived = await tx.aiPromptConfigVersion.update({
      where: { id: version.id },
      data: { archived_at: new Date(), archived_by: input.actor },
    });

    await tx.aiPromptConfig.update({
      where: { id: config.id },
      data: { updated_by: input.actor },
    });

    return archived;
  });
}
