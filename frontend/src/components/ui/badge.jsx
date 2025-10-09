import * as React from 'react'
import { cn } from '../../lib/utils.js'

const variants = {
  default: 'bg-primary text-primary-foreground',
  secondary: 'bg-secondary text-secondary-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  outline: 'border',
  success: 'bg-success text-white',
  warning: 'bg-warning text-white'
}

export function Badge({ className, variant = 'default', ...props }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold', variants[variant], className)} {...props} />
  )
}


