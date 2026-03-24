import type { PixKeyType } from '@m5nita/shared'
import { validatePixKey } from '@m5nita/shared'
import { useState } from 'react'
import { Input } from '../ui/Input'

const PIX_KEY_OPTIONS: { value: PixKeyType; label: string; placeholder: string }[] = [
  { value: 'cpf', label: 'CPF', placeholder: '00000000000' },
  { value: 'email', label: 'E-mail', placeholder: 'email@exemplo.com' },
  { value: 'phone', label: 'Telefone', placeholder: '+5511999999999' },
  {
    value: 'random',
    label: 'Chave aleatória',
    placeholder: '00000000-0000-0000-0000-000000000000',
  },
]

interface PixKeyInputProps {
  pixKeyType: PixKeyType
  pixKey: string
  onTypeChange: (type: PixKeyType) => void
  onKeyChange: (key: string) => void
  error?: string
}

export function PixKeyInput({
  pixKeyType,
  pixKey,
  onTypeChange,
  onKeyChange,
  error,
}: PixKeyInputProps) {
  const [touched, setTouched] = useState(false)
  const selected = PIX_KEY_OPTIONS.find((o) => o.value === pixKeyType)

  const validationError =
    touched && pixKey.length > 0 ? validatePixKey(pixKeyType, pixKey).error : undefined

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="pix-key-type"
          className="font-display text-xs font-semibold uppercase tracking-wider text-gray-dark"
        >
          Tipo de Chave PIX
        </label>
        <select
          id="pix-key-type"
          value={pixKeyType}
          onChange={(e) => {
            onTypeChange(e.target.value as PixKeyType)
            setTouched(false)
          }}
          className="border-b-2 border-border bg-transparent px-0 py-2.5 text-black transition-colors duration-150 focus:border-black focus:outline-none"
        >
          {PIX_KEY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <Input
        label="Chave PIX"
        placeholder={selected?.placeholder}
        value={pixKey}
        onChange={(e) => onKeyChange(e.target.value)}
        onBlur={() => setTouched(true)}
        error={validationError || error}
      />
    </div>
  )
}
