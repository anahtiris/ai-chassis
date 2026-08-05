// Minimal Lexical richText node builders — enough to construct valid
// paragraph/heading content programmatically (seeding, AI-generated
// drafts) without hand-writing Lexical's JSON shape each time. Shared
// between scripts/seed-content.ts and lib/ai/contentGenerate.ts.
export type LexNode = { type: string; version: number; [k: string]: unknown };

export function text(value: string): LexNode {
  return {
    type: "text",
    detail: 0,
    format: 0,
    mode: "normal",
    style: "",
    text: value,
    version: 1,
  };
}

export function paragraph(value: string): LexNode {
  return {
    type: "paragraph",
    children: [text(value)],
    direction: "ltr",
    format: "",
    indent: 0,
    textFormat: 0,
    version: 1,
  };
}

export function heading(
  value: string,
  tag: "h1" | "h2" | "h3" = "h2",
): LexNode {
  return {
    type: "heading",
    tag,
    children: [text(value)],
    direction: "ltr",
    format: "",
    indent: 0,
    version: 1,
  };
}

// Generic return type — callers cast to the specific richText field type
// they're populating (Post["content"], a block's columns[].richText, etc.),
// since that type varies by collection/field.
export function richText(...children: LexNode[]): { root: LexNode } {
  return {
    root: {
      type: "root",
      children,
      direction: "ltr",
      format: "",
      indent: 0,
      version: 1,
    },
  };
}
