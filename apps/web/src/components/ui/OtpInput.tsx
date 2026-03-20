import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef } from 'react'

interface OtpInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  onComplete?: (value: string) => void
  error?: string
  disabled?: boolean
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  error,
  disabled,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const hiddenRef = useRef<HTMLInputElement | null>(null)
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length)

  useEffect(() => {
    if (value.replace(/\s/g, '').length === length && onComplete) {
      onComplete(value)
    }
  }, [value, length, onComplete])

  function handleInput(index: number, char: string) {
    if (!/^\d$/.test(char)) return
    const newValue = digits.map((d, i) => (i === index ? char : d)).join('')
    onChange(newValue)
    if (index < length - 1) inputRefs.current[index + 1]?.focus()
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const newValue = digits.map((d, i) => (i === index ? '' : d)).join('')
      onChange(newValue)
      if (index > 0 && !digits[index]) inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus()
    if (e.key === 'ArrowRight' && index < length - 1) inputRefs.current[index + 1]?.focus()
  }

  function handlePaste(e: ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    onChange(pasted)
    inputRefs.current[Math.min(pasted.length, length - 1)]?.focus()
  }

  function handleHiddenInput(val: string) {
    const cleaned = val.replace(/\D/g, '').slice(0, length)
    if (cleaned) {
      onChange(cleaned)
      inputRefs.current[Math.min(cleaned.length, length - 1)]?.focus()
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
        Codigo de verificacao
      </label>
      <div className="relative flex gap-2 w-full" role="group" aria-label="Codigo OTP">
        <input
          ref={hiddenRef}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          className="absolute inset-0 opacity-0"
          tabIndex={-1}
          onChange={(e) => handleHiddenInput(e.target.value)}
        />
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              inputRefs.current[index] = el
            }}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(e) => handleInput(index, e.target.value.slice(-1))}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            aria-label={`Digito ${index + 1}`}
            aria-invalid={!!error}
            className={`h-14 w-0 flex-1 min-w-0 border-b-2 bg-transparent text-center font-display text-2xl font-black transition-colors duration-150 focus:border-black focus:outline-none disabled:text-gray-muted ${
              error ? 'border-red' : digit ? 'border-black' : 'border-border'
            }`}
          />
        ))}
      </div>
      {error && (
        <p className="text-xs font-medium text-red" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
