import * as React from "react";
import { RichText } from "@payloadcms/richtext-lexical/react";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import type { Form as FormType } from "@payloadcms/plugin-form-builder/types";
import { PayloadForm } from "@/components/site/Form/PayloadForm";
import type { FormBlock as FormBlockProps } from "@/payload-types";

export const FormBlock: React.FC<FormBlockProps> = ({
  form,
  enableIntro,
  introContent,
}) => {
  if (!form || typeof form !== "object") return null;

  return (
    <div className="mx-auto my-16 max-w-3xl px-6">
      {enableIntro && introContent && (
        <div className="mb-8">
          <RichText data={introContent as SerializedEditorState} />
        </div>
      )}
      <PayloadForm form={form as unknown as FormType} />
    </div>
  );
};
