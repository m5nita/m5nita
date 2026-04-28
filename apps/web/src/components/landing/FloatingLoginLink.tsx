import { Link } from '@tanstack/react-router'

export function FloatingLoginLink() {
  return (
    <Link
      to="/login"
      className="fixed top-4 right-4 z-40 font-display text-xs font-bold uppercase tracking-widest text-black hover:text-red transition-colors lg:top-6 lg:right-8"
    >
      Entrar
    </Link>
  )
}
