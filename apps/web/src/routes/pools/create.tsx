import type { CompetitionListItem } from '@m5nita/shared'
import { computePlatformFee, POOL } from '@m5nita/shared'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { InviteTicket } from '../../components/pool/InviteTicket'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { type PoolScopeMode, PoolScopeToggle } from '../../features/pools/PoolScopeToggle'
import { UpcomingMatchPicker } from '../../features/pools/UpcomingMatchPicker'
import { apiFetch } from '../../lib/api'
import { formatCurrency } from '../../lib/utils'

type Step = 'config' | 'invite'

interface CouponState {
  valid: boolean
  discountPercent: number
  loading: boolean
  error: string
}

type MatchdayBounds = { nextMatchday: number; max: number }

function PoolScopeSection({
  competitionId,
  scopeMode,
  setScopeMode,
  matchId,
  setMatchId,
  matchdays,
  matchdayFrom,
  setMatchdayFrom,
  matchdayTo,
  setMatchdayTo,
}: {
  competitionId: string
  scopeMode: PoolScopeMode
  setScopeMode: (next: PoolScopeMode) => void
  matchId: string
  setMatchId: (id: string) => void
  matchdays: MatchdayBounds | null
  matchdayFrom: string
  setMatchdayFrom: (value: string) => void
  matchdayTo: string
  setMatchdayTo: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <PoolScopeToggle
        value={scopeMode}
        onChange={(next) => {
          setScopeMode(next)
          if (next === 'range') setMatchId('')
          if (next === 'single') {
            setMatchdayFrom('')
            setMatchdayTo('')
          }
        }}
      />

      {scopeMode === 'single' && (
        <UpcomingMatchPicker competitionId={competitionId} value={matchId} onChange={setMatchId} />
      )}

      {!matchdays && scopeMode === 'range' && (
        <p className="text-xs text-gray-muted">Este bolão cobrirá todos os jogos da competição.</p>
      )}

      {matchdays && scopeMode === 'range' && (
        <div className="flex flex-col gap-2">
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-dark">
            Rodadas
          </p>
          <p className="text-xs text-gray-muted">
            Rodadas {matchdays.nextMatchday} a {matchdays.max} disponíveis. Deixe em branco para
            incluir todo o campeonato.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="De"
              type="number"
              inputMode="numeric"
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              value={matchdayFrom}
              onChange={(e) => {
                const newFrom = e.target.value
                setMatchdayFrom(newFrom)
                if (!matchdayTo || (newFrom && Number(matchdayTo) < Number(newFrom))) {
                  setMatchdayTo(newFrom)
                }
              }}
              onBlur={(e) => {
                if (!e.target.value) return
                const clamped = Math.min(
                  Math.max(Number(e.target.value), matchdays.nextMatchday),
                  matchdays.max,
                )
                const clampedStr = String(clamped)
                if (clampedStr !== e.target.value) {
                  setMatchdayFrom(clampedStr)
                }
                if (matchdayTo) {
                  const toNum = Number(matchdayTo)
                  if (toNum < clamped || toNum > matchdays.max) {
                    setMatchdayTo(String(Math.min(Math.max(toNum, clamped), matchdays.max)))
                  }
                }
              }}
              min={matchdays.nextMatchday}
              max={matchdays.max}
            />
            <Input
              label="Até"
              type="number"
              inputMode="numeric"
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              value={matchdayTo}
              onChange={(e) => setMatchdayTo(e.target.value)}
              onBlur={(e) => {
                if (!e.target.value) return
                const minValue = Number(matchdayFrom || matchdays.nextMatchday)
                const clamped = Math.min(Math.max(Number(e.target.value), minValue), matchdays.max)
                if (String(clamped) !== e.target.value) {
                  setMatchdayTo(String(clamped))
                }
              }}
              min={matchdayFrom || matchdays.nextMatchday}
              max={matchdays.max}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function FeeSummary({
  coupon,
  currentFee,
  platformFee,
  discountedFee,
}: {
  coupon: CouponState
  currentFee: number
  platformFee: number
  discountedFee: number
}) {
  return (
    <div className="mt-auto flex flex-col gap-2 text-sm">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
          Você paga agora
        </span>
        <span className="font-display text-xl font-black text-black">
          {formatCurrency(currentFee)}
        </span>
      </div>
      {coupon.valid ? (
        <>
          <div className="flex justify-between text-xs">
            <span className="text-gray-muted line-through">Taxa da plataforma (5%)</span>
            <span className="text-gray-muted line-through">{formatCurrency(platformFee)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-green font-medium">
              Taxa com desconto ({(5 * (1 - coupon.discountPercent / 100)).toFixed(1)}%)
            </span>
            <span className="text-green font-medium">{formatCurrency(discountedFee)}</span>
          </div>
        </>
      ) : (
        <div className="flex justify-between text-xs">
          <span className="text-gray-muted">Taxa da plataforma (5%)</span>
          <span className="text-gray-muted">{formatCurrency(platformFee)}</span>
        </div>
      )}
      <p className="text-[11px] leading-snug text-gray-muted">
        A taxa é descontada do prêmio — você paga só a entrada.
      </p>
    </div>
  )
}

function CreatePoolPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<Step>('config')
  const [name, setName] = useState('')
  const [entryFee, setEntryFee] = useState(5000)
  const [customFee, setCustomFee] = useState('')
  const [competitions, setCompetitions] = useState<CompetitionListItem[]>([])
  const [competitionId, setCompetitionId] = useState('')
  const [matchdayFrom, setMatchdayFrom] = useState('')
  const [matchdayTo, setMatchdayTo] = useState('')
  const [scopeMode, setScopeMode] = useState<PoolScopeMode>('range')
  const [matchId, setMatchId] = useState('')
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

  const selectedCompetition = competitions.find((c) => c.id === competitionId)
  const isLeague = selectedCompetition?.type === 'league'
  const matchdays = isLeague ? (selectedCompetition?.matchdays ?? null) : null

  useEffect(() => {
    apiFetch('/api/competitions')
      .then((res) => res.json())
      .then((data) => {
        setCompetitions(data.competitions || [])
        if (data.competitions?.length === 1) {
          setCompetitionId(data.competitions[0].id)
        }
      })
      .catch(() => {})
  }, [])

  const currentFee = customFee ? Number(customFee) * 100 : entryFee
  const platformFee = computePlatformFee(currentFee)
  const discountedFee = coupon.valid
    ? computePlatformFee(currentFee, coupon.discountPercent)
    : platformFee
  const isValidFee = currentFee >= POOL.MIN_ENTRY_FEE && currentFee <= POOL.MAX_ENTRY_FEE

  const validateCoupon = useCallback(
    async (code: string): Promise<CouponState> => {
      if (!code.trim()) {
        const next = { valid: false, discountPercent: 0, loading: false, error: '' }
        setCoupon(next)
        return next
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
          const next = {
            valid: true,
            discountPercent: data.discountPercent,
            loading: false,
            error: '',
          }
          setCoupon(next)
          return next
        }
        const reasons: Record<string, string> = {
          not_found: 'Cupom não encontrado',
          expired: 'Cupom expirado',
          exhausted: 'Cupom esgotado',
          inactive: 'Cupom inativo',
        }
        const next = {
          valid: false,
          discountPercent: 0,
          loading: false,
          error: reasons[data.reason] || 'Cupom inválido',
        }
        setCoupon(next)
        return next
      } catch {
        const next = {
          valid: false,
          discountPercent: 0,
          loading: false,
          error: 'Erro ao validar cupom',
        }
        setCoupon(next)
        return next
      }
    },
    [currentFee],
  )

  function validateForm(): string | null {
    if (name.trim().length < 3) return 'Nome deve ter pelo menos 3 caracteres'
    if (!isValidFee) return 'Valor deve ser entre R$ 1 e R$ 1.000'
    if (!competitionId) return 'Selecione uma competição'
    return null
  }

  // Builds the create-pool request body from the current scope/coupon selection.
  // Returns null when a single-match pool is missing its match (caller surfaces
  // the "selecione o jogo" error).
  function buildCreateBody(
    trimmedCoupon: string,
    couponValid: boolean,
  ): Record<string, unknown> | null {
    const body: Record<string, unknown> = {
      name: name.trim(),
      entryFee: currentFee,
      competitionId,
    }
    if (scopeMode === 'single') {
      if (!matchId) return null
      body.matchId = matchId
    } else if (isLeague && matchdayFrom && matchdayTo) {
      body.matchdayFrom = Number(matchdayFrom)
      body.matchdayTo = Number(matchdayTo)
    }
    if (trimmedCoupon && couponValid) {
      body.couponCode = trimmedCoupon
    }
    return body
  }

  async function submitCreate(body: Record<string, unknown>): Promise<void> {
    const res = await apiFetch('/api/pools', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const data = await res.json()
      setError(data.message || 'Erro ao criar bolão')
      return
    }
    const data = await res.json()
    setCreatedPool({ name: data.pool.name, inviteCode: data.pool.inviteCode })

    if (data.payment.checkoutUrl) {
      window.location.href = data.payment.checkoutUrl
    } else {
      setStep('invite')
    }
  }

  async function handleCreate() {
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }
    setLoading(true)
    setError('')
    try {
      const trimmedCoupon = couponCode.trim()
      let couponValid = coupon.valid
      if (trimmedCoupon && !coupon.valid) {
        const result = await validateCoupon(trimmedCoupon)
        if (!result.valid) {
          setLoading(false)
          return
        }
        couponValid = true
      }

      const body = buildCreateBody(trimmedCoupon, couponValid)
      if (!body) {
        setError('Selecione o jogo do bolão.')
        setLoading(false)
        return
      }

      await submitCreate(body)
    } catch {
      setError('Erro de conexão.')
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
            Bolão Criado
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
    <div className="flex flex-col gap-8 min-h-full lg:items-center">
      <div className="lg:w-full lg:max-w-[520px] lg:border lg:border-border lg:p-10 flex flex-col gap-8">
        <div>
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-gray-muted">
            Novo
          </p>
          <h1 className="mt-1 font-display text-4xl font-black leading-[0.9] text-black">
            Criar Bolão
          </h1>
          <div className="mt-3 h-1 w-12 bg-red" />
        </div>

        <Input
          label="Nome do bolão"
          placeholder="Ex: Bolão da Galera"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
        />

        <div className="flex flex-col gap-1">
          <label
            htmlFor="competition-select"
            className="font-display text-xs font-semibold uppercase tracking-wider text-gray-dark"
          >
            Competição
          </label>
          <select
            id="competition-select"
            value={competitionId}
            onChange={(e) => {
              setCompetitionId(e.target.value)
              setMatchdayFrom('')
              setMatchdayTo('')
            }}
            className="border-b-2 border-border bg-transparent px-0 py-2.5 text-black transition-colors duration-150 focus:border-black focus:outline-none appearance-none"
          >
            <option value="" className="text-gray-muted">
              Selecione uma competição
            </option>
            {competitions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.seasonDisplay ?? c.season})
              </option>
            ))}
          </select>
        </div>

        {competitionId && (
          <PoolScopeSection
            competitionId={competitionId}
            scopeMode={scopeMode}
            setScopeMode={setScopeMode}
            matchId={matchId}
            setMatchId={setMatchId}
            matchdays={matchdays}
            matchdayFrom={matchdayFrom}
            setMatchdayFrom={setMatchdayFrom}
            matchdayTo={matchdayTo}
            setMatchdayTo={setMatchdayTo}
          />
        )}

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
            label="Ou valor personalizado (R$ 1 a R$ 1.000)"
            type="number"
            placeholder="0"
            value={customFee}
            onChange={(e) => setCustomFee(e.target.value)}
            min={1}
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
              setCoupon({ valid: false, discountPercent: 0, loading: false, error: '' })
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

        <FeeSummary
          coupon={coupon}
          currentFee={currentFee}
          platformFee={platformFee}
          discountedFee={discountedFee}
        />

        {error && (
          <p className="text-xs font-medium text-red" role="alert">
            {error}
          </p>
        )}

        <Button
          onClick={handleCreate}
          loading={loading}
          disabled={!isValidFee || (scopeMode === 'single' && !matchId)}
          className="w-full"
          size="lg"
        >
          Criar e Pagar {formatCurrency(currentFee)}
        </Button>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/pools/create')({ component: CreatePoolPage })
