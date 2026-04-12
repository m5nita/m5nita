import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Button } from '../../components/ui/Button'

function PaymentSuccessPage() {
  const navigate = useNavigate()

  return (
    <div className="flex min-h-[60vh] flex-col justify-center lg:items-center">
      <div className="lg:w-full lg:max-w-[480px] lg:border lg:border-border lg:p-10">
        <div className="mb-8">
          <p className="font-display text-xs font-semibold uppercase tracking-widest text-green">
            Sucesso
          </p>
          <h1 className="mt-1 font-display text-5xl font-black leading-[0.85] text-black">
            Pagamento Confirmado
          </h1>
          <div className="mt-3 h-1 w-12 bg-green" />
          <p className="mt-4 text-sm text-gray-dark">
            Seu pagamento foi processado. Você já faz parte do bolão!
          </p>
        </div>
        <Button onClick={() => navigate({ to: '/' })} size="lg" className="w-full">
          Ir para Home
        </Button>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/pools/payment-success')({ component: PaymentSuccessPage })
