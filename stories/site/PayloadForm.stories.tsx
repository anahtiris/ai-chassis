import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { Form as FormType } from "@payloadcms/plugin-form-builder/types";
import { PayloadForm } from "@/components/site/Form/PayloadForm";

const contactForm = {
  id: 1,
  title: "Contact",
  submitButtonLabel: "Send message",
  confirmationType: "message",
  confirmationMessage: {
    root: {
      type: "root",
      direction: "ltr",
      format: "",
      indent: 0,
      version: 1,
      children: [
        {
          type: "paragraph",
          direction: "ltr",
          format: "",
          indent: 0,
          version: 1,
          children: [
            {
              type: "text",
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              text: "Thanks — we'll be in touch shortly.",
              version: 1,
            },
          ],
        },
      ],
    },
  },
  fields: [
    { blockType: "text", name: "name", label: "Name", required: true },
    { blockType: "email", name: "email", label: "Email", required: true },
    {
      blockType: "textarea",
      name: "message",
      label: "Message",
      required: true,
    },
  ],
} as unknown as FormType;

const meta = {
  title: "site/PayloadForm",
  component: PayloadForm,
  tags: ["autodocs"],
} satisfies Meta<typeof PayloadForm>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Contact: Story = {
  args: { form: contactForm },
};
