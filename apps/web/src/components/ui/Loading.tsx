interface LoadingProps {
  message?: string
}

export function Loading({ message = 'Carregando...' }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16" role="status" aria-live="polite">
      <div className="h-1 w-16 overflow-hidden bg-border">
        <div className="h-full w-8 animate-[slide_1s_ease-in-out_infinite] bg-black" />
      </div>
      <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">{message}</p>
      <style>{`@keyframes slide { 0% { transform: translateX(-100%) } 100% { transform: translateX(200%) } }`}</style>
    </div>
  )
}
