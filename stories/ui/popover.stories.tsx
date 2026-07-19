import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'

const meta = {
  title: 'ui/Popover',
  component: Popover,
  tags: ['autodocs'],
} satisfies Meta<typeof Popover>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">Open popover</Button>
      </PopoverTrigger>
      <PopoverContent>
        <p className="text-sm font-medium">Grant a permission</p>
        <p className="text-muted-foreground mt-1 text-sm">
          Permission strings are free text — this toolkit doesn&apos;t hardcode a fixed
          set.
        </p>
      </PopoverContent>
    </Popover>
  ),
}
