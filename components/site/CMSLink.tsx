import Link from "next/link";
import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Page, Post } from "@/payload-types";

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];
type ButtonSize = VariantProps<typeof buttonVariants>["size"];

// Matches lib/payload/fields/link.ts.
export type CMSLinkType = {
  appearance?: string | null;
  children?: React.ReactNode;
  className?: string;
  label?: string | null;
  newTab?: boolean | null;
  reference?: {
    relationTo: "pages" | "posts";
    value: Page | Post | string | number;
  } | null;
  size?: ButtonSize | null;
  type?: "custom" | "reference" | null;
  url?: string | null;
};

// Maps the link field's "appearance" values to this repo's actual Button
// variants (shadcn's default/outline naming, not payload-poc's primary/secondary).
const appearanceToVariant: Record<string, ButtonVariant> = {
  default: "default",
  outline: "outline",
};

// Internal doc references resolve to this site's actual routes: pages at
// "/<slug>" (root page's slug is "/" itself, see PageView), posts at
// "/blog/<slug>" (see app/(app)/(site)/blog/[slug]).
function hrefForReference(
  relationTo: "pages" | "posts",
  value: Page | Post | string | number,
): string | undefined {
  if (typeof value !== "object" || !value.slug) return undefined;
  if (relationTo === "posts") return `/blog/${value.slug}`;
  return value.slug === "/" ? "/" : `/${value.slug}`;
}

export const CMSLink: React.FC<CMSLinkType> = (props) => {
  const {
    type,
    appearance = "inline",
    children,
    className,
    label,
    newTab,
    reference,
    size,
    url,
  } = props;

  const href =
    type === "reference" && reference
      ? hrefForReference(reference.relationTo, reference.value)
      : (url ?? undefined);

  if (!href) return null;

  const newTabProps = newTab
    ? { rel: "noopener noreferrer", target: "_blank" }
    : {};

  if (appearance === "inline") {
    return (
      <Link className={cn(className)} href={href} {...newTabProps}>
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
      <Link href={href} {...newTabProps}>
        {label}
        {children}
      </Link>
    </Button>
  );
};
