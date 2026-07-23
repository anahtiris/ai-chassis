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
      created_by: "admin@example.com",
    });

    expect(tx.aiPromptConfig.create).toHaveBeenCalledWith({
      data: { key: "new-key" },
    });
    expect(tx.aiPromptConfigVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ config_id: "c1", version: 1 }),
    });
    expect(tx.aiPromptConfig.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { active_version_id: "v1" },
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
      created_by: "admin@example.com",
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
    });

    expect(tx.aiPromptConfigVersion.create).not.toHaveBeenCalled();
    expect(tx.aiPromptConfig.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { active_version_id: "v1" },
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
      activatePromptVersion({ key: "existing-key", versionId: "v9" }),
    ).rejects.toThrow("does not belong to");
    expect(tx.aiPromptConfig.update).not.toHaveBeenCalled();
  });

  it("rejects when the config does not exist", async () => {
    tx.aiPromptConfig.findUnique.mockResolvedValue(null);

    await expect(
      activatePromptVersion({ key: "missing-key", versionId: "v1" }),
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
      where: { config_id: "c1" },
      orderBy: { version: "desc" },
    });
    expect(result?.versions).toHaveLength(2);
  });
});
