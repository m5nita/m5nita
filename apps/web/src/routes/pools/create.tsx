import { POOL } from '@m5nita/shared'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
import { InviteTicket } from '../../components/pool/InviteTicket'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { apiFetch } from '../../lib/api'
import { calculateDiscountedFee, calculatePlatformFee, formatCurrency } from '../../lib/utils'

type Step = 'config' | 'invite'

interface CouponState {
  valid: boolean
  discountPercent: number
  loading: boolean
  error: string
}

function CreatePoolPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('config')
  const [name, setName] = useState('')
  const [entryFee, setEntryFee] = useState(5000)
  const [customFee, setCustomFee] = useState('')
  const [couponCode, setCouponCode] = useState('')
  const [coupon, setCoupon] = useState<CouponState>({
    valid: false,
    discountPercent: 0,
    loading: false,
    error: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdPool, setCreatedPool] = useState<{ name: string; inviteCode: string } | null>(null)

  const currentFee = customFee ? Number(customFee) * 100 : entryFee
  const platformFee = calculatePlatformFee(currentFee)
  const discountedFee = coupon.valid
    ? calculateDiscountedFee(currentFee, coupon.discountPercent)
    : platformFee
  const isValidFee = currentFee >= POOL.MIN_ENTRY_FEE && currentFee <= POOL.MAX_ENTRY_FEE

  const validateCoupon = useCallback(
    async (code: string) => {
      if (!code.trim()) {
        setCoupon({ valid: false, discountPercent: 0, loading: false, error: '' })
        return
      }

      setCoupon((prev) => ({ ...prev, loading: true, error: '' }))

      try {
        const res = await apiFetch('/api/pools/validate-coupon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ couponCode: code, entryFee: currentFee }),
        })
        const data = await res.json()

        if (data.valid) {
          setCoupon({
            valid: true,
            discountPercent: data.discountPercent,
            loading: false,
            error: '',
          })
        } else {
          const reasons: Record<string, string> = {
            not_found: 'Cupom nao encontrado',
            expired: 'Cupom expirado',
            exhausted: 'Cupom esgotado',
            inactive: 'Cupom inativo',
          }
          setCoupon({
            valid: false,
            discountPercent: 0,
            loading: false,
            error: reasons[data.reason] || 'Cupom invalido',
          })
        }
      } catch {
        setCoupon({
          valid: false,
          discountPercent: 0,
          loading: false,
          error: 'Erro ao validar cupom',
        })
      }
    },
    [currentFee],
  )

  async function handleCreate() {
    if (name.trim().length < 3) {
      setError('Nome deve ter pelo menos 3 caracteres')
      return
    }
    if (!isValidFee) {
      setError('Valor deve ser entre R$ 10 e R$ 1.000')
      return
    }
    setLoading(true)
    setError('')
    try {
      const body: Record<string, unknown> = { name: name.trim(), entryFee: currentFee }
      if (couponCode.trim() && coupon.valid) {
        body.couponCode = couponCode.trim()
      }

      const res = await apiFetch('/api/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.message || 'Erro ao criar bolao')
        return
      }
      const data = await res.json()
      setCreatedPool({ name: data.pool.name, inviteCode: data.pool.inviteCode })

      if (data.payment.checkoutUrl) {
        window.location.href = data.payment.checkoutUrl
      } else {
        setStep('invite')
      }
    } catch {
      setError('Erro de conexao.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'invite' && createdPool) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
            Sucesso
          </p>
          <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">
            Bolao Criado
          </h1>
          <div className="mt-3 h-1 w-12 bg-green" />
        </div>
        <InviteTicket poolName={createdPool.name} inviteCode={createdPool.inviteCode} />
        <Button variant="secondary" onClick={() => navigate({ to: '/' })} className="w-full">
          Ir para Home
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-8 min-h-full">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
          Novo
        </p>
        <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">
          Criar Bolao
        </h1>
        <div className="mt-3 h-1 w-12 bg-red" />
      </div>

      <Input
        label="Nome do bolao"
        placeholder="Ex: Bolao da Galera"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={50}
      />

      <div className="flex flex-col gap-2">
        <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
          Valor da Entrada
        </p>
        <div className="grid grid-cols-4 gap-2">
          {POOL.QUICK_SELECT_VALUES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setEntryFee(value)
                setCustomFee('')
              }}
              className={`font-display text-xs font-bold uppercase tracking-wider py-2.5 transition-colors cursor-pointer ${
                !customFee && entryFee === value
                  ? 'bg-black text-white'
                  : 'border-2 border-border text-gray-dark hover:border-black hover:text-black'
              }`}
            >
              {formatCurrency(value)}
            </button>
          ))}
        </div>
        <Input
          label="Ou valor personalizado (R$)"
          type="number"
          placeholder="0"
          value={customFee}
          onChange={(e) => setCustomFee(e.target.value)}
          min={10}
          max={1000}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Input
          label="Cupom de desconto"
          placeholder="Ex: COPA2026"
          value={couponCode}
          onChange={(e) => {
            setCouponCode(e.target.value)
            if (!e.target.value.trim()) {
              setCoupon({ valid: false, discountPercent: 0, loading: false, error: '' })
            }
          }}
          onBlur={() => validateCoupon(couponCode)}
          maxLength={20}
          error={coupon.error}
        />
        {coupon.valid && (
          <p className="text-xs font-medium text-green">
            Cupom aplicado: {coupon.discountPercent}% de desconto na taxa
          </p>
        )}
        {coupon.loading && <p className="text-xs text-gray-muted">Validando cupom...</p>}
      </div>

      <div className="mt-auto flex flex-col gap-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-dark">Entrada</span>
          <span className="font-medium text-black">{formatCurrency(currentFee)}</span>
        </div>
        {coupon.valid ? (
          <>
            <div className="flex justify-between">
              <span className="text-gray-muted line-through">Taxa (5%)</span>
              <span className="text-gray-muted line-through">{formatCurrency(platformFee)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-green font-medium">
                Taxa com desconto ({(5 * (1 - coupon.discountPercent / 100)).toFixed(1)}%)
              </span>
              <span className="text-green font-medium">{formatCurrency(discountedFee)}</span>
            </div>
          </>
        ) : (
          <div className="flex justify-between">
            <span className="text-gray-muted">Taxa (5%)</span>
            <span className="text-gray-muted">{formatCurrency(platformFee)}</span>
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs font-medium text-red" role="alert">
          {error}
        </p>
      )}

      <Button
        onClick={handleCreate}
        loading={loading}
        disabled={!isValidFee}
        className="w-full"
        size="lg"
      >
        Criar e Pagar {formatCurrency(currentFee)}
      </Button>
    </div>
  )
}

export const Route = createFileRoute('/pools/create')({ component: CreatePoolPage })
