import * as React from "react";
import type { Page } from "@/payload-types";
import { ContentBlock } from "./content/Component";
import { MediaBlock } from "./media/Component";
import { FormBlock } from "./form/Component";

const blockComponents = {
  content: ContentBlock,
  mediaBlock: MediaBlock,
  formBlock: FormBlock,
};

// Switches a Page's `layout` blocks array to the matching site renderer.
// Ported from payload-poc's blocks/RenderBlocks.tsx, trimmed to the three
// generic blocks this toolkit ships (content/mediaBlock/formBlock) — see
// docs/decisions.md "Collections: generic infrastructure only, no
// page-builder blocks" for why the business-specific ones aren't here.
export const RenderBlocks: React.FC<{
  blocks: Page["layout"];
}> = ({ blocks }) => {
  if (!blocks || blocks.length === 0) return null;

  return (
    <>
      {blocks.map((block, index) => {
        const { blockType } = block;
        const Block =
          blockComponents[blockType as keyof typeof blockComponents];
        if (!Block) return null;
        // @ts-expect-error block union types — each Block component's props
        // match its own blockType variant, not the full Page['layout'] union.
        return <Block key={index} {...block} />;
      })}
    </>
  );
};
