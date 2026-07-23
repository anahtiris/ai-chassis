import { describe, expect, it } from "vitest";
import { diffPromptVersions, type DiffableVersion } from "./promptDiff";

const base: DiffableVersion = {
  prompt_text: "Line one.\nLine two.\n",
  model: "gpt-4o-mini",
  temperature: 0.3,
  max_tokens: 300,
};

describe("diffPromptVersions", () => {
  it("reports no changes when both versions are identical", () => {
    const result = diffPromptVersions(base, { ...base });

    expect(
      result.prompt_text_diff.every((chunk) => !chunk.added && !chunk.removed),
    ).toBe(true);
    expect(result.scalar_diffs.every((diff) => !diff.changed)).toBe(true);
  });

  it("produces added/removed chunks for a changed prompt_text", () => {
    const to: DiffableVersion = {
      ...base,
      prompt_text: "Line one.\nLine three.\n",
    };

    const result = diffPromptVersions(base, to);

    expect(result.prompt_text_diff.some((chunk) => chunk.removed)).toBe(true);
    expect(result.prompt_text_diff.some((chunk) => chunk.added)).toBe(true);
  });

  it("flags only the scalar fields that actually changed", () => {
    const to: DiffableVersion = {
      ...base,
      model: "gpt-4o",
    };

    const result = diffPromptVersions(base, to);

    const modelDiff = result.scalar_diffs.find((d) => d.field === "model");
    const temperatureDiff = result.scalar_diffs.find(
      (d) => d.field === "temperature",
    );
    const maxTokensDiff = result.scalar_diffs.find(
      (d) => d.field === "max_tokens",
    );

    expect(modelDiff).toEqual({
      field: "model",
      before: "gpt-4o-mini",
      after: "gpt-4o",
      changed: true,
    });
    expect(temperatureDiff?.changed).toBe(false);
    expect(maxTokensDiff?.changed).toBe(false);
  });
});
