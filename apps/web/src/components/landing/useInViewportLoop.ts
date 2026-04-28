import { useEffect, useRef, useState } from 'react'

export function useInViewportLoop<T extends HTMLElement>(threshold = 0.3) {
  const ref = useRef<T | null>(null)
  const [isRunning, setIsRunning] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsRunning(entry?.isIntersecting ?? false),
      { threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, isRunning }
}
