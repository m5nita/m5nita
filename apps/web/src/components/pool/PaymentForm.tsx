import { useState, useEffect } from 'react'
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { Button } from '../ui/Button'

interface PaymentFormProps {
  amount: number
  onSuccess: () => void
  onError: (message: string) => void
}

export function PaymentForm({ amount, onSuccess, onError }: PaymentFormProps) {
  const stripe = useStripe()
  const elements = useElements()
  const [loading, setLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState(30 * 60) // 30 min for Pix

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          onError('Tempo de pagamento expirado. Tente novamente.')
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [onError])

  const minutes = Math.floor(timeLeft / 60)
  const seconds = timeLeft % 60

  async function handleSubmit() {
    if (!stripe || !elements) return

    setLoading(true)
    try {
      const { error } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: window.location.origin + '/pools/payment-success',
        },
        redirect: 'if_required',
      })

      if (error) {
        onError(error.message ?? 'Erro no pagamento')
      } else {
        onSuccess()
      }
    } catch {
      onError('Erro ao processar pagamento')
    } finally {
      setLoading(false)
    }
  }

  const formattedAmount = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(amount / 100)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg bg-navy/5 px-4 py-2 text-sm">
        <span className="text-gray-dark">Tempo restante</span>
        <span className="font-heading font-bold text-navy">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
      </div>

      <PaymentElement />

      <Button
        onClick={handleSubmit}
        loading={loading}
        disabled={!stripe || !elements || timeLeft === 0}
        className="w-full"
        size="lg"
      >
        Pagar {formattedAmount}
      </Button>
    </div>
  )
}
