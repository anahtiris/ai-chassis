import type { Field, GroupField } from "payload";
import deepMerge from "./deepMerge";

export type LinkAppearances = "default" | "outline";

export const appearanceOptions: Record<
  LinkAppearances,
  { label: string; value: string }
> = {
  default: { label: "Default", value: "default" },
  outline: { label: "Outline", value: "outline" },
};

type LinkType = (options?: {
  appearances?: LinkAppearances[] | false;
  disableLabel?: boolean;
  overrides?: Partial<GroupField>;
}) => Field;

// Reusable "link" group field — custom URL plus label/appearance/newTab.
// Ported from payload-poc's fields/link.ts, minus the "internal link"
// (relationship to pages/posts) variant: that needs a polymorphic
// relationship table (a new `pages_rels` join table) that doesn't exist
// anywhere in this codebase yet, and hand-writing one blind (no working
// `payload migrate:create` here to verify against — see docs/decisions.md
// "Collections: generic infrastructure only, no page-builder blocks"
// follow-up) was judged too risky for what this field needs right now.
// components/site/CMSLink.tsx is the matching renderer.
export const link: LinkType = ({
  appearances,
  disableLabel = false,
  overrides = {},
} = {}) => {
  const linkResult: GroupField = {
    name: "link",
    type: "group",
    admin: { hideGutter: true },
    fields: [
      {
        type: "row",
        fields: [
          {
            name: "newTab",
            type: "checkbox",
            admin: { style: { alignSelf: "flex-end" }, width: "50%" },
            label: "Open in new tab",
          },
        ],
      },
    ],
  };

  const linkTypes: Field[] = [
    {
      name: "url",
      type: "text",
      label: "URL",
      required: true,
    },
  ];

  if (!disableLabel) {
    linkResult.fields.push({
      type: "row",
      fields: [
        ...linkTypes,
        {
          name: "label",
          type: "text",
          admin: { width: "50%" },
          label: "Label",
          required: true,
        },
      ],
    });
  } else {
    linkResult.fields = [...linkResult.fields, ...linkTypes];
  }

  if (appearances !== false) {
    let appearanceOptionsToUse = [
      appearanceOptions.default,
      appearanceOptions.outline,
    ];
    if (appearances) {
      appearanceOptionsToUse = appearances.map(
        (appearance) => appearanceOptions[appearance],
      );
    }

    linkResult.fields.push({
      name: "appearance",
      type: "select",
      admin: { description: "Choose how the link should be rendered." },
      defaultValue: "default",
      options: appearanceOptionsToUse,
    });
  }

  return deepMerge(linkResult, overrides);
};
