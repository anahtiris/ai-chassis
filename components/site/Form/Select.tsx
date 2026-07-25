import type { SelectField } from "@payloadcms/plugin-form-builder/types";
import type { Control, FieldErrorsImpl } from "react-hook-form";
import { Controller } from "react-hook-form";
import * as React from "react";
import { Dropdown } from "@/components/ui/dropdown";
import { Label } from "@/components/ui/label";
import { Error } from "./Error";
import { Width } from "./Width";

export const Select: React.FC<
  SelectField & {
    control: Control;
    errors: Partial<FieldErrorsImpl>;
  }
> = ({
  name,
  control,
  errors,
  label,
  options,
  required,
  width,
  defaultValue,
}) => {
  return (
    <Width width={width}>
      <Label htmlFor={name}>
        {label}
        {required && (
          <span className="required">
            {" "}
            * <span className="sr-only">(required)</span>
          </span>
        )}
      </Label>
      <Controller
        control={control}
        defaultValue={defaultValue}
        name={name}
        rules={{ required }}
        render={({ field: { onChange, value } }) => (
          <Dropdown
            options={options}
            value={(value as string) || null}
            onChange={(val) => onChange(val ?? "")}
            placeholder={label ?? "Select..."}
            aria-label={label}
          />
        )}
      />
      {errors[name] && <Error name={name} />}
    </Width>
  );
};
