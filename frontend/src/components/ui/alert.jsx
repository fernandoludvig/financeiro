import * as React from 'react'
import { cn } from '../../lib/utils.js'

const variants = {
  default: 'bg-background text-foreground',
  destructive: 'border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive'
}

export function Alert({ className, variant = 'default', ...props }) {
  return (
    <div role="alert" className={cn('relative w-full rounded-lg border p-4', variants[variant], className)} {...props} />
  )
}

export function AlertTitle({ className, ...props }) {
  return <h5 className={cn('mb-1 font-medium leading-none tracking-tight', className)} {...props} />
}

export function AlertDescription({ className, ...props }) {
  return <div className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
}


