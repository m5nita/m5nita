import { useEffect, useState } from 'react'
import { BallLoader } from './BallLoader'

interface LoadingProps {
  message?: string
}

export function Loading({ message = 'Carregando...' }: LoadingProps) {
  // Hold off briefly: fast loads are already covered by the global top progress
  // bar, so we only show the (delightful but heavier) ball loader when a load is
  // actually slow — avoids a jarring flash on quick navigations.
  const [show, setShow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 200)
    return () => clearTimeout(t)
  }, [])

  if (!show) return null

  return (
    <output className="flex flex-col items-center justify-center gap-5 py-16" aria-live="polite">
      <BallLoader size={52} />
      <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
        {message}
      </p>
    </output>
  )
}
