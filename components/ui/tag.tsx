'use client'

import * as React from 'react'

import { cn } from '@/lib/utils'

export interface TagProps extends React.HTMLAttributes<HTMLSpanElement> {
  active?: boolean
  onRemove?: () => void
}

const Tag = React.forwardRef<HTMLSpanElement, TagProps>(
  ({ className, active = false, onRemove, children, ...props }, ref) => {
    return (
      <span
        ref={ref}
        data-slot="tag"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 font-mono text-xs leading-none transition-colors',
          active
            ? 'border-primary/50 bg-primary/10 text-foreground'
            : 'border-border bg-muted/50 text-muted-foreground',
          className,
        )}
        {...props}
      >
        {children}
        {onRemove && (
          <button
            type="button"
            aria-label="Remove"
            onClick={onRemove}
            className="inline-flex size-3.5 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-current opacity-70 transition-opacity hover:opacity-100"
          >
            ✕
          </button>
        )}
      </span>
    )
  },
)
Tag.displayName = 'Tag'

export { Tag }
