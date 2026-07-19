import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'

const meta = {
  title: 'ui/Label',
  component: Label,
  tags: ['autodocs'],
  args: {
    children: 'Label',
  },
} satisfies Meta<typeof Label>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const PairedWithInput: Story = {
  render: () => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="story-label-email">Email</Label>
      <Input id="story-label-email" type="email" placeholder="you@example.com" />
    </div>
  ),
}

export const PairedWithCheckbox: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Checkbox id="story-label-terms" />
      <Label htmlFor="story-label-terms">Accept terms</Label>
    </div>
  ),
}
