import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outlined' | 'elevated'
}

const paddings = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6',
}

const cardVariants = {
  default: 'bg-surface border border-border',
  outlined: 'bg-transparent border-2 border-black',
  elevated: 'bg-surface shadow-[4px_4px_0_0_#111111] border-2 border-black',
}

export function Card({ children, padding = 'md', variant = 'default', className = '', ...props }: CardProps) {
  return (
    <div className={`${cardVariants[variant]} ${paddings[padding]} ${className}`} {...props}>
      {children}
    </div>
  )
}
