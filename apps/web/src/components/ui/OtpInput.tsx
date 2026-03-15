import { useRef, type KeyboardEvent, type ClipboardEvent } from 'react'

interface OtpInputProps {
  length?: number
  value: string
  onChange: (value: string) => void
  error?: string
  disabled?: boolean
}

export function OtpInput({ length = 6, value, onChange, error, disabled }: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length)

  function handleInput(index: number, char: string) {
    if (!/^\d$/.test(char)) return

    const newValue = digits.map((d, i) => (i === index ? char : d)).join('')
    onChange(newValue)

    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const newValue = digits.map((d, i) => (i === index ? '' : d)).join('')
      onChange(newValue)
      if (index > 0 && !digits[index]) {
        inputRefs.current[index - 1]?.focus()
      }
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowRight' && index < length - 1) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  function handlePaste(e: ClipboardEvent) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    onChange(pasted)
    const focusIndex = Math.min(pasted.length, length - 1)
    inputRefs.current[focusIndex]?.focus()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-navy">Codigo de verificacao</label>
      <div className="flex gap-2" role="group" aria-label="Codigo OTP de 6 digitos">
        {digits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => { inputRefs.current[index] = el }}
            type="text"
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            value={digit}
            disabled={disabled}
            onChange={(e) => handleInput(index, e.target.value.slice(-1))}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={handlePaste}
            aria-label={`Digito ${index + 1}`}
            aria-invalid={!!error}
            className={`h-12 w-10 rounded-lg border text-center font-heading text-xl font-bold transition-colors focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:bg-navy/5 disabled:text-navy/50 ${
              error ? 'border-red' : digit ? 'border-navy' : 'border-navy/20'
            }`}
          />
        ))}
      </div>
      {error && (
        <p className="text-sm text-red" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
