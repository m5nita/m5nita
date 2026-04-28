import { Link } from '@tanstack/react-router'
import { Button } from '../ui/Button'

export function Hero() {
  return (
    <section className="flex flex-col items-start gap-6 py-16 lg:items-center lg:py-24 lg:text-center">
      <p className="font-display text-xs font-bold uppercase tracking-widest text-gray-muted">
        Bolão entre amigos
      </p>
      <h1 className="font-display text-6xl font-black leading-[1.05] text-black lg:text-8xl">
        Monte seu
        <br />
        bolão.
      </h1>
      <div className="h-1 w-12 bg-red" />
      <p className="max-w-md text-sm leading-relaxed text-gray-dark lg:text-base">
        Palpite, suba no ranking, leve o prêmio.
      </p>
      <Link to="/login" className="mt-2">
        <Button size="lg">Começar agora</Button>
      </Link>
      <span
        aria-hidden="true"
        className="mt-12 hidden font-display text-xs font-bold uppercase tracking-widest text-gray-muted lg:block animate-bounce"
      >
        ↓
      </span>
    </section>
  )
}
