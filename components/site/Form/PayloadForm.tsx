"use client";

import type { Form as FormType } from "@payloadcms/plugin-form-builder/types";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useCallback, useState } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { RichText } from "@payloadcms/richtext-lexical/react";
import { Button } from "@/components/ui/button";
import { postSubmission } from "@/lib/forms/submitForm";
import { fields } from "./fields";

export type PayloadFormProps = { form: FormType };

export const PayloadForm: React.FC<PayloadFormProps> = ({ form }) => {
  const {
    id: formID,
    confirmationMessage,
    confirmationType,
    submitButtonLabel,
    redirect,
  } = form;

  const formMethods = useForm<Record<string, unknown>>();
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = formMethods;

  const [isLoading, setIsLoading] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>();
  const [error, setError] = useState<
    { message: string; status?: string } | undefined
  >();
  const router = useRouter();

  const onSubmit = useCallback(
    (data: Record<string, unknown>) => {
      void (async () => {
        setError(undefined);
        setIsLoading(true);
        const result = await postSubmission(formID, data);
        setIsLoading(false);
        if (!result.ok) {
          setError({ message: result.message, status: String(result.status) });
          return;
        }
        setHasSubmitted(true);
        if (confirmationType === "redirect" && redirect?.url) {
          router.push(redirect.url);
        }
      })();
    },
    [formID, confirmationType, redirect, router],
  );

  return (
    <div className="mt-10 border-t pt-8">
      <FormProvider {...formMethods}>
        {!isLoading &&
          hasSubmitted &&
          confirmationType === "message" &&
          confirmationMessage && (
            <RichText data={confirmationMessage as SerializedEditorState} />
          )}
        {isLoading && !hasSubmitted && <p>Loading, please wait...</p>}
        {error && (
          <div className="mb-4 text-sm text-red-500">
            {`${error.status || "500"}: ${error.message || ""}`}
          </div>
        )}
        {!hasSubmitted && (
          <form id={String(formID)} onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-4 last:mb-0">
              {form.fields?.map((field, index) => {
                const Field = fields?.[
                  field.blockType as keyof typeof fields
                ] as React.FC<any> | undefined;
                if (!Field) return null;
                return (
                  <div className="mb-6 last:mb-0" key={index}>
                    <Field
                      form={form}
                      {...field}
                      {...formMethods}
                      control={control}
                      errors={errors}
                      register={register}
                    />
                  </div>
                );
              })}
            </div>
            <Button type="submit">{submitButtonLabel}</Button>
          </form>
        )}
      </FormProvider>
    </div>
  );
};
