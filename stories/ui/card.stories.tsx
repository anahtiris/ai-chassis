import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const meta = {
  title: 'ui/Card',
  component: Card,
  tags: ['autodocs'],
} satisfies Meta<typeof Card>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Audit Log</CardTitle>
        <CardDescription>Append-only record of every admin mutation.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">100 most recent entries.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">Open</Button>
      </CardFooter>
    </Card>
  ),
}

export const WithAction: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>concierge-system-prompt</CardTitle>
        <CardAction>
          <Badge variant="secondary">v3</Badge>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          Last edited by owner@example.com.
        </p>
      </CardContent>
    </Card>
  ),
}

/** Header-only card, as used by the /admin hub page's link grid. */
export const HubCard: Story = {
  render: () => (
    <Card className="w-64 hover:border-primary/50 transition-colors">
      <CardHeader>
        <CardTitle>Analytics</CardTitle>
        <CardDescription>Nightly usage and conversion snapshots.</CardDescription>
      </CardHeader>
    </Card>
  ),
}
