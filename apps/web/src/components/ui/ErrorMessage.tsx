interface ErrorMessageProps {
  title?: string
  message: string
  onRetry?: () => void
}

export function ErrorMessage({ title = 'Erro', message, onRetry }: ErrorMessageProps) {
  return (
    <div className="border-l-4 border-red bg-red/5 p-5" role="alert">
      <h3 className="font-display text-sm font-bold uppercase tracking-wider text-red">{title}</h3>
      <p className="mt-1 text-sm text-gray-dark">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 font-display text-xs font-bold uppercase tracking-wider text-black underline underline-offset-4 hover:text-red transition-colors cursor-pointer"
        >
          Tentar novamente
        </button>
      )}
    </div>
  )
}
