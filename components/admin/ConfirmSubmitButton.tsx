"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

// Submit button that asks for confirmation before letting its enclosing
// <form> submit. The only client component in the AI admin section — used for
// irreversible-ish server actions (e.g. archiving a prompt) that warrant a
// guard against an accidental click. Cancelling preventDefault()s the submit.
type Props = ComponentProps<typeof Button> & { confirmMessage: string };

export function ConfirmSubmitButton({
  confirmMessage,
  onClick,
  children,
  ...props
}: Props) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    >
      {children}
    </Button>
  );
}
