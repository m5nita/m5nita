import { useEffect, useRef } from 'react'

export function useTextWidth<T extends HTMLElement>(text: string) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    const apply = () => {
      const measurer = document.createElement('span')
      const cs = getComputedStyle(node)
      measurer.textContent = text
      Object.assign(measurer.style, {
        position: 'absolute',
        visibility: 'hidden',
        whiteSpace: 'nowrap',
        fontFamily: cs.fontFamily,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        fontStyle: cs.fontStyle,
        letterSpacing: cs.letterSpacing,
        lineHeight: '1',
        padding: '0',
        border: '0',
      })
      document.body.appendChild(measurer)
      const w = Math.ceil(measurer.getBoundingClientRect().width)
      measurer.remove()
      node.style.setProperty('--typed-width', `${w}px`)
    }

    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(apply)
    } else {
      apply()
    }
  }, [text])

  return ref
}
