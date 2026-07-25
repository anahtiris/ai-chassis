import * as React from "react";
import Image from "next/image";
import { RichText } from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { cn } from "@/lib/utils";
import type { MediaBlock as MediaBlockProps } from "@/payload-types";

export const MediaBlock: React.FC<MediaBlockProps & { className?: string }> = ({
  media,
  className,
}) => {
  if (!media || typeof media !== "object") return null;

  const { alt, caption, url, width, height } = media;

  return (
    <div className={cn("mx-auto my-16 max-w-3xl px-6", className)}>
      {url && (
        <Image
          src={url}
          alt={alt ?? ""}
          width={width ?? 1600}
          height={height ?? 900}
          className="w-full rounded-md border"
        />
      )}
      {caption && (
        <div className="text-muted-foreground mt-4 text-sm">
          <RichText data={caption as SerializedEditorState} />
        </div>
      )}
    </div>
  );
};
