import { forwardRef, type ChangeEvent, type InputHTMLAttributes } from 'react'

interface PhoneInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string
  onChange: (value: string) => void
  error?: string
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 9)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

function toE164(formatted: string): string {
  const digits = formatted.replace(/\D/g, '')
  if (digits.length >= 10) return `+55${digits}`
  return digits
}

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value, onChange, error, ...props }, ref) => {
    const displayValue = formatPhone(value.replace(/^\+55/, ''))

    function handleChange(e: ChangeEvent<HTMLInputElement>) {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
      onChange(digits.length >= 10 ? toE164(digits) : digits)
    }

    return (
      <div className="flex flex-col gap-1">
        <label htmlFor="phone" className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
          Telefone
        </label>
        <div className="flex items-center gap-3">
          <span className="border-b-2 border-border py-2.5 font-display text-sm font-bold text-gray-muted">
            +55
          </span>
          <input
            ref={ref}
            id="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(11) 99999-9999"
            value={displayValue}
            onChange={handleChange}
            aria-invalid={!!error}
            aria-describedby={error ? 'phone-error' : undefined}
            className={`flex-1 border-b-2 bg-transparent py-2.5 text-black placeholder:text-gray-muted transition-colors duration-150 focus:border-black focus:outline-none ${error ? 'border-red' : 'border-border'}`}
            {...props}
          />
        </div>
        {error && (
          <p id="phone-error" className="text-xs font-medium text-red" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)

PhoneInput.displayName = 'PhoneInput'
