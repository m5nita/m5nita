import { createRootRoute, Link, Outlet, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

function RootLayout() {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const isHome = router.state.location.pathname === '/'

  return (
    <div className="min-h-screen bg-cream font-body text-navy">
      <header className="sticky top-0 z-50 flex items-center justify-between bg-navy px-4 py-3 text-cream">
        <div className="flex items-center gap-3">
          {!isHome && (
            <button
              type="button"
              onClick={() => router.history.back()}
              className="text-cream/80 hover:text-cream"
              aria-label="Voltar"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
            </button>
          )}
          <Link to="/" className="font-heading text-xl font-bold tracking-tight">
            Manita
          </Link>
        </div>

        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          className="text-cream/80 hover:text-cream"
          aria-label="Menu"
          aria-expanded={menuOpen}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="4" x2="20" y1="12" y2="12" />
            <line x1="4" x2="20" y1="6" y2="6" />
            <line x1="4" x2="20" y1="18" y2="18" />
          </svg>
        </button>
      </header>

      {menuOpen && (
        <nav className="fixed inset-x-0 top-[52px] z-40 border-b border-navy/10 bg-cream shadow-lg">
          <ul className="flex flex-col p-4">
            <li>
              <Link
                to="/"
                className="block rounded-lg px-4 py-3 font-medium hover:bg-navy/5"
                onClick={() => setMenuOpen(false)}
              >
                Home
              </Link>
            </li>
            <li>
              <Link
                to="/matches"
                className="block rounded-lg px-4 py-3 font-medium hover:bg-navy/5"
                onClick={() => setMenuOpen(false)}
              >
                Jogos
              </Link>
            </li>
            <li>
              <Link
                to="/settings"
                className="block rounded-lg px-4 py-3 font-medium hover:bg-navy/5"
                onClick={() => setMenuOpen(false)}
              >
                Configuracoes
              </Link>
            </li>
          </ul>
        </nav>
      )}

      <main className="mx-auto max-w-[390px] px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
