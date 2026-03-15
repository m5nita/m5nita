import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: 'sm' | 'md' | 'lg'
}

const paddings = {
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
}

export function Card({ children, padding = 'md', className = '', ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl bg-white shadow-sm border border-navy/5 ${paddings[padding]} ${className}`}
      {...props}
    >
      {children}
    </div>
  )
}
