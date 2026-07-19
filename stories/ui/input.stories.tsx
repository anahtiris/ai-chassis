import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const meta = {
  title: 'ui/Input',
  component: Input,
  tags: ['autodocs'],
  argTypes: {
    type: {
      control: 'select',
      options: ['text', 'email', 'password', 'number'],
    },
  },
  args: {
    placeholder: 'Type here...',
  },
} satisfies Meta<typeof Input>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Email: Story = {
  args: { type: 'email', placeholder: 'you@example.com' },
}

export const Disabled: Story = {
  args: { disabled: true, value: 'Cannot edit this' },
}

export const WithLabel: Story = {
  render: () => (
    <div className="flex w-72 flex-col gap-1.5">
      <Label htmlFor="story-permission">Permission</Label>
      <Input id="story-permission" placeholder="e.g. CONTENT_MANAGEMENT" />
    </div>
  ),
}
