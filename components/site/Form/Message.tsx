import * as React from "react";
import { RichText } from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { Width } from "./Width";

export const Message: React.FC<{ message: SerializedEditorState }> = ({
  message,
}) => {
  return (
    <Width className="my-6" width="100">
      {message && <RichText data={message} />}
    </Width>
  );
};
