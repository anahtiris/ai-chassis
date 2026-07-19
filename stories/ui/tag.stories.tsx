import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Tag } from '@/components/ui/tag'

const meta = {
  title: 'ui/Tag',
  component: Tag,
  tags: ['autodocs'],
  args: {
    children: 'AUDIT_LOG_ACCESS',
  },
} satisfies Meta<typeof Tag>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Active: Story = {
  args: { active: true },
}

export const Removable: Story = {
  args: { onRemove: () => alert('removed') },
}

export const Group: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Tag active>AUDIT_LOG_ACCESS</Tag>
      <Tag>FORM_RESULTS_ACCESS</Tag>
      <Tag onRemove={() => {}}>AI_MANAGEMENT</Tag>
    </div>
  ),
}
