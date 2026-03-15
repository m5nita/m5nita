import { forwardRef, type InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, id, className = '', ...props }, ref) => {
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-navy">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`rounded-lg border border-navy/20 bg-white px-4 py-2.5 text-navy placeholder:text-gray transition-colors focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:bg-navy/5 disabled:text-navy/50 ${error ? 'border-red' : ''} ${className}`}
          {...props}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-red" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'
