import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

const meta = {
  title: 'ui/Checkbox',
  component: Checkbox,
  tags: ['autodocs'],
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => {
    const [checked, setChecked] = useState(false)
    return <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
  },
}

export const WithLabel: Story = {
  render: () => {
    const [checked, setChecked] = useState(true)
    return (
      <div className="flex items-center gap-2">
        <Checkbox
          id="story-checkbox-label"
          checked={checked}
          onCheckedChange={(v) => setChecked(v === true)}
        />
        <Label htmlFor="story-checkbox-label">Multi-select this option</Label>
      </div>
    )
  },
}

export const Disabled: Story = {
  args: { disabled: true },
}
