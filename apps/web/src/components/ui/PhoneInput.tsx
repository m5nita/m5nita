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

    const inputId = 'phone-input'

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-navy">
          Telefone
        </label>
        <div className="flex items-center gap-2">
          <span className="flex h-[46px] items-center rounded-lg border border-navy/20 bg-navy/5 px-3 text-sm text-gray-dark">
            +55
          </span>
          <input
            ref={ref}
            id={inputId}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="(11) 99999-9999"
            value={displayValue}
            onChange={handleChange}
            aria-invalid={!!error}
            aria-describedby={error ? 'phone-error' : undefined}
            className={`flex-1 rounded-lg border border-navy/20 bg-white px-4 py-2.5 text-navy placeholder:text-gray transition-colors focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 ${error ? 'border-red' : ''}`}
            {...props}
          />
        </div>
        {error && (
          <p id="phone-error" className="text-sm text-red" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  },
)

PhoneInput.displayName = 'PhoneInput'
