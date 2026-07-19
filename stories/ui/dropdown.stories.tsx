import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Dropdown, type DropdownOption } from '@/components/ui/dropdown'

const meta = {
  title: 'ui/Dropdown',
  component: Dropdown,
  tags: ['autodocs'],
} satisfies Meta<typeof Dropdown>

export default meta
type Story = StoryObj<typeof meta>

const permissionOptions: DropdownOption[] = [
  { label: 'Audit Log Access', value: 'AUDIT_LOG_ACCESS' },
  { label: 'Form Results Access', value: 'FORM_RESULTS_ACCESS' },
  { label: 'AI Management', value: 'AI_MANAGEMENT' },
  { label: 'Analytics Access', value: 'ANALYTICS_ACCESS' },
  { label: 'Content Management', value: 'CONTENT_MANAGEMENT' },
  { label: 'User Management (disabled)', value: 'USER_MANAGEMENT', disabled: true },
]

// Each story below supplies minimal-but-correctly-typed `args` to satisfy
// StoryObj's Args requirement (Dropdown's props are a discriminated union,
// so a bare `render`-only story doesn't typecheck) — the `render` function
// manages its own local state and ignores them.

export const Single: Story = {
  args: { options: permissionOptions, value: null, onChange: () => {} },
  render: () => {
    const [value, setValue] = useState<string | null>(null)
    return (
      <div className="w-72">
        <Dropdown
          options={permissionOptions}
          value={value}
          onChange={setValue}
          placeholder="Select a permission..."
        />
      </div>
    )
  },
}

export const Multiple: Story = {
  args: { multiple: true, options: permissionOptions, value: [], onChange: () => {} },
  render: () => {
    const [value, setValue] = useState<string[]>(['AUDIT_LOG_ACCESS'])
    return (
      <div className="w-80">
        <Dropdown
          multiple
          options={permissionOptions}
          value={value}
          onChange={setValue}
          placeholder="Select permissions..."
        />
      </div>
    )
  },
}

export const NotSearchable: Story = {
  args: { options: permissionOptions, value: null, onChange: () => {} },
  render: () => {
    const [value, setValue] = useState<string | null>('AI_MANAGEMENT')
    return (
      <div className="w-72">
        <Dropdown
          searchable={false}
          options={permissionOptions}
          value={value}
          onChange={setValue}
        />
      </div>
    )
  },
}

export const Disabled: Story = {
  args: { options: permissionOptions, value: null, onChange: () => {} },
  render: () => (
    <div className="w-72">
      <Dropdown
        disabled
        options={permissionOptions}
        value={null}
        onChange={() => {}}
        placeholder="Unavailable"
      />
    </div>
  ),
}
