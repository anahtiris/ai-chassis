import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

const meta = {
  title: 'ui/Textarea',
  component: Textarea,
  tags: ['autodocs'],
  args: {
    placeholder: 'Prompt text',
    rows: 6,
  },
} satisfies Meta<typeof Textarea>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const WithValue: Story = {
  args: {
    defaultValue: 'You are the concierge for a wellness referral platform...',
    className: 'font-mono',
  },
}

export const WithLabel: Story = {
  render: () => (
    <div className="flex w-96 flex-col gap-1.5">
      <Label htmlFor="story-prompt">Prompt text</Label>
      <Textarea id="story-prompt" rows={6} className="font-mono" placeholder="Prompt text" />
    </div>
  ),
}

export const Disabled: Story = {
  args: { disabled: true, defaultValue: 'Read-only content' },
}
