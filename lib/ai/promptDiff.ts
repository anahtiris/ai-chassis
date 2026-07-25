import { diffLines, type Change } from "diff";

export interface DiffableVersion {
  prompt_text: string;
  model: string | null;
  temperature: number | null;
  max_tokens: number | null;
  // Optional: existed before allow_fallback did, so callers that don't have
  // it (older test fixtures, etc.) still typecheck — treated as false.
  allow_fallback?: boolean;
}

export interface ScalarFieldDiff {
  field: "model" | "temperature" | "max_tokens" | "allow_fallback";
  // allow_fallback is stringified ("true"/"false") rather than left as a
  // raw boolean — JSX doesn't render boolean children, and this type is
  // rendered directly (see [key]/page.tsx's scalar_diffs.map).
  before: string | number | null;
  after: string | number | null;
  changed: boolean;
}

export interface PromptVersionDiff {
  prompt_text_diff: Change[];
  scalar_diffs: ScalarFieldDiff[];
}

const SCALAR_FIELDS = ["model", "temperature", "max_tokens"] as const;

// prompt_text gets a real line diff since it's prose; the generation
// settings are scalars, so a before/after callout communicates a change
// better than a line-level diff would.
export function diffPromptVersions(
  from: DiffableVersion,
  to: DiffableVersion,
): PromptVersionDiff {
  const fromFallback = from.allow_fallback ?? false;
  const toFallback = to.allow_fallback ?? false;

  return {
    prompt_text_diff: diffLines(from.prompt_text, to.prompt_text),
    scalar_diffs: [
      ...SCALAR_FIELDS.map((field) => ({
        field,
        before: from[field],
        after: to[field],
        changed: from[field] !== to[field],
      })),
      {
        field: "allow_fallback" as const,
        before: String(fromFallback),
        after: String(toFallback),
        changed: fromFallback !== toFallback,
      },
    ],
  };
}
