export interface QuestionItem {
  question: string
}

export interface PageQuestionItem extends QuestionItem {
  enabled?: boolean | null
}

export interface PageConciergeOverride {
  enabled?: boolean | null
  questions?: PageQuestionItem[] | null
}

/**
 * A page's `questions` array is a full, independent copy seeded from the
 * global defaults (see defaultPageQuestions.ts), so once it has entries it
 * replaces the global list entirely rather than appending to it. Entries
 * with `enabled: false` are excluded. Falls back to the global list for
 * pages saved before this array existed.
 */
export function resolveConciergeQuestions(
  globalQuestions: QuestionItem[] | null | undefined,
  pageOverride: PageConciergeOverride | null | undefined,
): string[] {
  const page = pageOverride?.questions

  if (page && page.length > 0) {
    return page.filter((q) => q.enabled !== false).map((q) => q.question)
  }

  return (globalQuestions ?? []).map((q) => q.question)
}

/**
 * Page-level `enabled: false` always wins as an explicit opt-out.
 * Otherwise falls back to the global's `enabled` (defaults to true if unset).
 */
export function isConciergeEnabled(
  globalEnabled: boolean | null | undefined,
  pageOverride: PageConciergeOverride | null | undefined,
): boolean {
  if (pageOverride?.enabled === false) return false
  return globalEnabled !== false
}
