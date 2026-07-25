import type { Block } from "payload";

// Generic layout block: one Media doc, rendered full-width with its caption.
// Ported from payload-poc's blocks/MediaBlock.
export const MediaBlock: Block = {
  slug: "mediaBlock",
  interfaceName: "MediaBlock",
  fields: [
    {
      name: "media",
      type: "upload",
      relationTo: "media",
      required: true,
    },
  ],
};
