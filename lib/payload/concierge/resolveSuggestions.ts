// A concierge suggestion, matching generative-ui-kit's `Suggestion` type:
// `label` is the chip text; `sampleMessage` is what gets sent to the concierge
// on click. Stored `sampleMessage` is optional (blank = send the label), but
// the resolved output below always fills it in so consumers get a complete
// { label, sampleMessage } pair.
export interface SuggestionItem {
  label: string;
  sampleMessage?: string | null;
}

export interface PageSuggestionItem extends SuggestionItem {
  enabled?: boolean | null;
}

export interface PageConciergeOverride {
  enabled?: boolean | null;
  suggestions?: PageSuggestionItem[] | null;
}

export interface ResolvedSuggestion {
  label: string;
  sampleMessage: string;
}

function normalize(item: SuggestionItem): ResolvedSuggestion {
  const sample = item.sampleMessage?.trim();
  return { label: item.label, sampleMessage: sample ? sample : item.label };
}

/**
 * A page's `suggestions` array is a full, independent copy seeded from the
 * global defaults (see defaultPageSuggestions.ts), so once it has entries it
 * replaces the global list entirely rather than appending to it. Entries with
 * `enabled: false` are excluded. Falls back to the global list for pages saved
 * before this array existed. Each result is a complete { label, sampleMessage }
 * (sampleMessage defaults to label when blank), ready to hand to the chat
 * widget's `suggestions` prop.
 */
export function resolveConciergeSuggestions(
  globalSuggestions: SuggestionItem[] | null | undefined,
  pageOverride: PageConciergeOverride | null | undefined,
): ResolvedSuggestion[] {
  const page = pageOverride?.suggestions;

  if (page && page.length > 0) {
    return page.filter((s) => s.enabled !== false).map(normalize);
  }

  return (globalSuggestions ?? []).map(normalize);
}

/**
 * Page-level `enabled: false` always wins as an explicit opt-out.
 * Otherwise falls back to the global's `enabled` (defaults to true if unset).
 */
export function isConciergeEnabled(
  globalEnabled: boolean | null | undefined,
  pageOverride: PageConciergeOverride | null | undefined,
): boolean {
  if (pageOverride?.enabled === false) return false;
  return globalEnabled !== false;
}
