import type { DefaultValue } from "payload";

/**
 * Seeds a new page/post's `aiConcierge.suggestions` array with the global's
 * current default suggestions, all shown. Payload only runs this when the
 * field is `undefined`, so it only applies to brand-new documents — once
 * saved, the copy is independent of the global list and other pages.
 */
export const defaultPageConciergeSuggestions: DefaultValue = async ({
  req,
}) => {
  const global = await req.payload.findGlobal({ slug: "aiConcierge" });
  return (global?.suggestions ?? []).map((s) => ({
    label: s.label,
    sampleMessage: s.sampleMessage ?? null,
    enabled: true,
  }));
};
