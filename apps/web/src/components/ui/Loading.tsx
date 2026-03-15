interface LoadingProps {
  message?: string
  size?: 'sm' | 'md' | 'lg'
}

const spinnerSizes = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
  lg: 'h-12 w-12',
}

export function Loading({ message = 'Carregando...', size = 'md' }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8" role="status" aria-live="polite">
      <svg
        className={`animate-spin text-navy/40 ${spinnerSizes[size]}`}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
        <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75" />
      </svg>
      <p className="text-sm text-gray">{message}</p>
    </div>
  )
}
