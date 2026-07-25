import * as React from "react";
import { RichText } from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { cn } from "@/lib/utils";
import { CMSLink } from "@/components/site/CMSLink";
import type { ContentBlock as ContentBlockProps } from "@/payload-types";

// Full literal class strings so Tailwind's source scanner can see them —
// building them with interpolation (`lg:col-span-${n}`) means the classes
// never appear literally in source and are never generated.
const colSpanClasses: Record<string, string> = {
  full: "lg:col-span-12",
  half: "lg:col-span-6",
  oneThird: "lg:col-span-4",
  twoThirds: "lg:col-span-8",
};

export const ContentBlock: React.FC<ContentBlockProps> = ({ columns }) => {
  return (
    <div className="mx-auto my-16 max-w-3xl px-6">
      <div className="grid grid-cols-4 gap-x-16 gap-y-8 lg:grid-cols-12">
        {columns?.map((col, index) => {
          const { enableLink, link, richText, size } = col;

          return (
            <div
              key={index}
              className={cn("col-span-4", size && colSpanClasses[size], {
                "md:col-span-2": size !== "full",
              })}
            >
              {richText && (
                <RichText data={richText as SerializedEditorState} />
              )}
              {enableLink && link && <CMSLink {...link} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};
