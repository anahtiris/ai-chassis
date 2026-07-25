import Link from "next/link";
import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
type ButtonSize = VariantProps<typeof buttonVariants>["size"];

// Matches lib/payload/fields/link.ts — URL only, no "internal doc reference"
// variant (that needs a polymorphic relationship table this codebase
// doesn't have yet; see that file's comment).
export type CMSLinkType = {
  appearance?: string | null;
  children?: React.ReactNode;
  className?: string;
  label?: string | null;
  newTab?: boolean | null;
  size?: ButtonSize | null;
  url?: string | null;
};

// Maps the link field's "appearance" values to this repo's actual Button
// variants (shadcn's default/outline naming, not payload-poc's primary/secondary).
const appearanceToVariant: Record<string, ButtonVariant> = {
  default: "default",
  outline: "outline",
};

export const CMSLink: React.FC<CMSLinkType> = (props) => {
  const {
    appearance = "inline",
    children,
    className,
    label,
    newTab,
    size,
    url,
  } = props;

  if (!url) return null;

  const newTabProps = newTab
    ? { rel: "noopener noreferrer", target: "_blank" }
    : {};

  if (appearance === "inline") {
    return (
      <Link className={cn(className)} href={url} {...newTabProps}>
        {label}
        {children}
      </Link>
    );
  }

  const variant: ButtonVariant = appearance
    ? (appearanceToVariant[appearance] ?? (appearance as ButtonVariant))
    : undefined;

  return (
    <Button
      asChild
      className={className}
      size={size ?? undefined}
      variant={variant}
    >
      <Link href={url} {...newTabProps}>
        {label}
        {children}
      </Link>
    </Button>
  );
};
