import { beforeEach, describe, expect, it, vi } from "vitest";

const tx = {
  aiPromptConfig: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  aiPromptConfigVersion: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@/lib/db/client", () => ({
  prisma: {
    $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback(tx)),
    aiPromptConfig: { findUnique: vi.fn() },
    aiPromptConfigVersion: { findMany: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import {
  activatePromptVersion,
  archivePromptVersion,
  createPromptVersion,
  listPromptVersions,
} from "./promptVersions";

function resetTx() {
  tx.aiPromptConfig.findUnique.mockReset();
  tx.aiPromptConfig.create.mockReset();
  tx.aiPromptConfig.update.mockReset();
  tx.aiPromptConfigVersion.findFirst.mockReset();
  tx.aiPromptConfigVersion.findUnique.mockReset();
  tx.aiPromptConfigVersion.create.mockReset();
  tx.aiPromptConfigVersion.update.mockReset();
}

describe("createPromptVersion", () => {
  beforeEach(() => {
    resetTx();
  });

  it("creates a new config and v1 when the key does not exist yet", async () => {
    tx.aiPromptConfig.findUnique.mockResolvedValue(null);
    tx.aiPromptConfig.create.mockResolvedValue({ id: "c1", key: "new-key" });
    tx.aiPromptConfigVersion.findFirst.mockResolvedValue(null);
    tx.aiPromptConfigVersion.create.mockResolvedValue({
      id: "v1",
      config_id: "c1",
      version: 1,
    });
    tx.aiPromptConfig.update.mockResolvedValue({
      id: "c1",
      key: "new-key",
      active_version_id: "v1",
    });

    const result = await createPromptVersion({
      key: "new-key",
      prompt_text: "Hello",
      model: null,
      temperature: null,
      max_tokens: null,
      change_note: null,
      actor: "admin@example.com",
    });

    // New config: name defaults to key, created_by/updated_by set to the actor.
    expect(tx.aiPromptConfig.create).toHaveBeenCalledWith({
      data: {
        key: "new-key",
        name: "new-key",
        description: null,
        created_by: "admin@example.com",
        updated_by: "admin@example.com",
      },
    });
    expect(tx.aiPromptConfigVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ config_id: "c1", version: 1 }),
    });
    expect(tx.aiPromptConfig.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { active_version_id: "v1", updated_by: "admin@example.com" },
    });
    expect(result.previousVersion).toBeNull();
  });

  it("numbers the next version as latest+1 regardless of which version is active", async () => {
    tx.aiPromptConfig.findUnique.mockResolvedValue({
      id: "c1",
      key: "existing-key",
      active_version_id: "v1",
      active_version: { id: "v1", config_id: "c1", version: 1 },
    });
    tx.aiPromptConfigVersion.findFirst.mockResolvedValue({
      id: "v3",
      config_id: "c1",
      version: 3,
    });
    tx.aiPromptConfigVersion.create.mockResolvedValue({
      id: "v4",
      config_id: "c1",
      version: 4,
    });
    tx.aiPromptConfig.update.mockResolvedValue({
      id: "c1",
      key: "existing-key",
      active_version_id: "v4",
    });

    const result = await createPromptVersion({
      key: "existing-key",
      prompt_text: "Updated",
      model: null,
      temperature: null,
      max_tokens: null,
      change_note: "tweak",
      actor: "admin@example.com",
    });

    expect(tx.aiPromptConfigVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ version: 4 }),
    });
    expect(result.previousVersion).toEqual({
      id: "v1",
      config_id: "c1",
      version: 1,
    });
  });

  it("enforces one active version: a new version repoints the single active pointer away from the previous active", async () => {
    tx.aiPromptConfig.findUnique.mockResolvedValue({
      id: "c1",
      key: "existing-key",
      active_version_id: "v1",
      active_version: { id: "v1", config_id: "c1", version: 1 },
    });
    tx.aiPromptConfigVersion.findFirst.mockResolvedValue({
      id: "v1",
      config_id: "c1",
      version: 1,
    });
    tx.aiPromptConfigVersion.create.mockResolvedValue({
      id: "v2",
      config_id: "c1",
      version: 2,
    });
    tx.aiPromptConfig.update.mockResolvedValue({
      id: "c1",
      key: "existing-key",
      active_version_id: "v2",
    });

    const result = await createPromptVersion({
      key: "existing-key",
      prompt_text: "Newer",
      model: null,
      temperature: null,
      max_tokens: null,
      change_note: null,
      actor: "admin@example.com",
    });

    // The single active_version_id column is the structural guarantee: there
    // is exactly one active version at any time. Activating a new one moves
    // the pointer to v2 and surfaces v1 as the (now inactive) previous.
    const updateArg = tx.aiPromptConfig.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "c1" });
    expect(updateArg.data.active_version_id).toBe("v2");
    expect(result.previousVersion).toEqual({
      id: "v1",
      config_id: "c1",
      version: 1,
    });
  });
});

describe("activatePromptVersion", () => {
  beforeEach(() => {
    resetTx();
  });

  it("repoints active_version_id without creating a new version row", async () => {
    tx.aiPromptConfig.findUnique.mockResolvedValue({
      id: "c1",
      key: "existing-key",
      active_version_id: "v2",
      active_version: { id: "v2", config_id: "c1", version: 2 },
    });
    tx.aiPromptConfigVersion.findUnique.mockResolvedValue({
      id: "v1",
      config_id: "c1",
      version: 1,
    });
    tx.aiPromptConfig.update.mockResolvedValue({
      id: "c1",
      key: "existing-key",
      active_version_id: "v1",
    });

    const result = await activatePromptVersion({
      key: "existing-key",
      versionId: "v1",
      actor: "admin@example.com",
    });

    expect(tx.aiPromptConfigVersion.create).not.toHaveBeenCalled();
    expect(tx.aiPromptConfig.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { active_version_id: "v1", updated_by: "admin@example.com" },
    });
    expect(result.activated).toEqual({ id: "v1", config_id: "c1", version: 1 });
    expect(result.previousVersion).toEqual({
      id: "v2",
      config_id: "c1",
      version: 2,
    });
  });

  it("rejects a versionId that belongs to a different config", async () => {
    tx.aiPromptConfig.findUnique.mockResolvedValue({
      id: "c1",
      key: "existing-key",
      active_version_id: "v2",
      active_version: { id: "v2", config_id: "c1", version: 2 },
    });
    tx.aiPromptConfigVersion.findUnique.mockResolvedValue({
      id: "v9",
      config_id: "c-other",
      version: 1,
    });

    await expect(
      activatePromptVersion({
        key: "existing-key",
        versionId: "v9",
        actor: "admin@example.com",
      }),
    ).rejects.toThrow("does not belong to");
    expect(tx.aiPromptConfig.update).not.toHaveBeenCalled();
  });

  it("rejects when the config does not exist", async () => {
    tx.aiPromptConfig.findUnique.mockResolvedValue(null);

    await expect(
      activatePromptVersion({
        key: "missing-key",
        versionId: "v1",
        actor: "admin@example.com",
      }),
    ).rejects.toThrow("No AiPromptConfig");
  });
});

describe("listPromptVersions", () => {
  beforeEach(() => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockReset();
    vi.mocked(prisma.aiPromptConfigVersion.findMany).mockReset();
  });

  it("returns null when the key does not exist", async () => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockResolvedValue(null);

    const result = await listPromptVersions("missing-key");

    expect(result).toBeNull();
    expect(prisma.aiPromptConfigVersion.findMany).not.toHaveBeenCalled();
  });

  it("returns the config and its versions ordered newest-first", async () => {
    vi.mocked(prisma.aiPromptConfig.findUnique).mockResolvedValue({
      id: "c1",
      key: "existing-key",
      active_version_id: "v2",
      active_version: { id: "v2", config_id: "c1", version: 2 },
    } as never);
    vi.mocked(prisma.aiPromptConfigVersion.findMany).mockResolvedValue([
      { id: "v2", config_id: "c1", version: 2 },
      { id: "v1", config_id: "c1", version: 1 },
    ] as never);

    const result = await listPromptVersions("existing-key");

    expect(prisma.aiPromptConfigVersion.findMany).toHaveBeenCalledWith({
      where: { config_id: "c1", archived_at: null },
      orderBy: { version: "desc" },
    });
    expect(result?.versions).toHaveLength(2);
  });
});

describe("archivePromptVersion", () => {
  beforeEach(() => {
    resetTx();
  });

  it("archives a non-active version and bumps the config's updated_by", async () => {
    tx.aiPromptConfig.findUnique.mockResolvedValue({
      id: "c1",
      key: "existing-key",
      active_version_id: "v2",
    });
    tx.aiPromptConfigVersion.findUnique.mockResolvedValue({
      id: "v1",
      config_id: "c1",
      version: 1,
      archived_at: null,
    });
    tx.aiPromptConfigVersion.update.mockResolvedValue({
      id: "v1",
      config_id: "c1",
      version: 1,
      archived_at: new Date(),
      archived_by: "admin@example.com",
    });

    const result = await archivePromptVersion({
      key: "existing-key",
      versionId: "v1",
      actor: "admin@example.com",
    });

    const updateArg = tx.aiPromptConfigVersion.update.mock.calls[0][0];
    expect(updateArg.where).toEqual({ id: "v1" });
    expect(updateArg.data.archived_at).toBeInstanceOf(Date);
    expect(updateArg.data.archived_by).toBe("admin@example.com");
    expect(tx.aiPromptConfig.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { updated_by: "admin@example.com" },
    });
    expect(result.id).toBe("v1");
  });

  it("refuses to archive the active version", async () => {
    tx.aiPromptConfig.findUnique.mockResolvedValue({
      id: "c1",
      key: "existing-key",
      active_version_id: "v2",
    });
    tx.aiPromptConfigVersion.findUnique.mockResolvedValue({
      id: "v2",
      config_id: "c1",
      version: 2,
      archived_at: null,
    });

    await expect(
      archivePromptVersion({
        key: "existing-key",
        versionId: "v2",
        actor: "admin@example.com",
      }),
    ).rejects.toThrow("active version");
    expect(tx.aiPromptConfigVersion.update).not.toHaveBeenCalled();
  });

  it("rejects a version that belongs to a different config", async () => {
    tx.aiPromptConfig.findUnique.mockResolvedValue({
      id: "c1",
      key: "existing-key",
      active_version_id: "v2",
    });
    tx.aiPromptConfigVersion.findUnique.mockResolvedValue({
      id: "v9",
      config_id: "c-other",
      version: 1,
      archived_at: null,
    });

    await expect(
      archivePromptVersion({
        key: "existing-key",
        versionId: "v9",
        actor: "admin@example.com",
      }),
    ).rejects.toThrow("does not belong to");
    expect(tx.aiPromptConfigVersion.update).not.toHaveBeenCalled();
  });
});
