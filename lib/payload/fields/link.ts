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

// Reusable "link" group field — internal doc reference (pages/posts) or a
// custom URL, plus label/appearance/newTab. Ported from payload-poc's
// fields/link.ts. The "reference" relationship is polymorphic
// (relationTo: ["pages", "posts"]), which Payload's Postgres adapter backs
// with a shared `pages_rels`/`_pages_v_rels` join table — see
// migrations/20260725_150000_add_pages_rels.ts for why that table was
// hand-written (same non-interactive `payload migrate:create` wall as
// every other migration in this repo) and how its shape was verified.
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
            name: "type",
            type: "radio",
            admin: { layout: "horizontal", width: "50%" },
            defaultValue: "reference",
            options: [
              { label: "Internal link", value: "reference" },
              { label: "Custom URL", value: "custom" },
            ],
          },
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
      name: "reference",
      type: "relationship",
      admin: {
        condition: (_, siblingData) => siblingData?.type === "reference",
      },
      label: "Document to link to",
      relationTo: ["pages", "posts"],
      required: true,
    },
    {
      name: "url",
      type: "text",
      admin: { condition: (_, siblingData) => siblingData?.type === "custom" },
      label: "Custom URL",
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
