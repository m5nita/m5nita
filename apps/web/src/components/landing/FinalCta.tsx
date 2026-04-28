import { Link } from '@tanstack/react-router'
import { Button } from '../ui/Button'

export function FinalCta() {
  return (
    <section className="flex flex-col items-center gap-6 py-20 text-center lg:py-28">
      <h2 className="font-display text-5xl font-black leading-[0.85] uppercase text-black lg:text-7xl">
        Em 30 segundos,
        <br />
        você tá no jogo.
      </h2>
      <div className="h-1 w-12 bg-red" />
      <Link to="/login" className="mt-2 w-full max-w-xs">
        <Button size="lg" className="w-full">
          Criar minha conta
        </Button>
      </Link>
      <p className="max-w-xs text-xs leading-relaxed text-gray-muted">
        Grátis pra começar. Você só paga quando entra em um bolão.
      </p>
    </section>
  )
}
