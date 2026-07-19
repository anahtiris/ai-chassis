import type { Meta, StoryObj } from '@storybook/nextjs-vite'
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'

const meta = {
  title: 'ui/Table',
  component: Table,
  tags: ['autodocs'],
} satisfies Meta<typeof Table>

export default meta
type Story = StoryObj<typeof meta>

const rows = [
  { when: '2026-07-19T09:12:00Z', form: 'contact', name: 'Ada Lovelace', email: 'ada@example.com' },
  { when: '2026-07-18T22:41:00Z', form: 'newsletter', name: '—', email: 'grace@example.com' },
  { when: '2026-07-18T14:03:00Z', form: 'contact', name: 'Alan Turing', email: 'alan@example.com' },
]

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>Recent form submissions.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Form</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.email + row.when}>
            <TableCell className="text-muted-foreground">{row.when}</TableCell>
            <TableCell>
              <Badge variant="outline">{row.form}</Badge>
            </TableCell>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.email}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
}

export const Empty: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>When</TableHead>
          <TableHead>Form</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={4} className="text-muted-foreground py-6 text-center">
            No form submissions yet.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
}
