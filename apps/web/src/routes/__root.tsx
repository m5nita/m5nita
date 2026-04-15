import { createRootRoute, Link, Outlet, useLocation, useRouter } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { authClient, useSession } from '../lib/auth'

function RootLayout() {
  const router = useRouter()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const { data: session, isPending: sessionPending } = useSession()
  const isHome = location.pathname === '/'
  const isLogin = location.pathname === '/login'
  const orphanCleanupRef = useRef(false)

  useEffect(() => {
    if (sessionPending) return
    if (isLogin) return
    if (!session || session.user) return
    if (orphanCleanupRef.current) return
    orphanCleanupRef.current = true
    authClient.signOut().finally(() => {
      window.location.assign('/login')
    })
  }, [session, sessionPending, isLogin])

  return (
    <div className="min-h-screen overflow-x-hidden bg-cream font-body text-black">
      <header className="sticky top-0 z-50 border-b border-border bg-cream/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[430px] items-center justify-between px-5 py-3 lg:max-w-7xl">
          <div className="flex items-center gap-3">
            {!isHome && !isLogin && (
              <button
                type="button"
                onClick={() => router.history.back()}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 cursor-pointer lg:hidden"
                aria-label="Voltar"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
            )}
            <Link
              to="/"
              className="font-display text-lg font-bold uppercase tracking-wider cursor-pointer"
            >
              m5nita
            </Link>
          </div>

          {session?.user && (
            <>
              <nav className="hidden lg:flex items-center gap-1" aria-label="Navegação principal">
                {[
                  { to: '/' as const, label: 'Home' },
                  { to: '/matches' as const, label: 'Jogos' },
                  { to: '/how-it-works' as const, label: 'Como funciona?' },
                  { to: '/settings' as const, label: 'Configurações' },
                ].map(({ to, label }) => (
                  <Link
                    key={to}
                    to={to}
                    className="px-3 py-1.5 font-display text-[11px] font-bold uppercase tracking-wider text-gray-dark transition-colors hover:text-black cursor-pointer [&.active]:text-black [&.active]:bg-black/5"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
              <button
                type="button"
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-black/5 cursor-pointer lg:hidden"
                aria-label="Menu"
                aria-expanded={menuOpen}
              >
                {menuOpen ? (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <line x1="4" x2="20" y1="12" y2="12" />
                    <line x1="4" x2="20" y1="6" y2="6" />
                    <line x1="4" x2="20" y1="18" y2="18" />
                  </svg>
                )}
              </button>
            </>
          )}
        </div>
      </header>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMenuOpen(false)
            }}
            role="presentation"
          />
          <nav className="fixed inset-x-0 top-[53px] z-40 border-b border-border bg-cream shadow-lg">
            <div className="mx-auto max-w-[430px] p-5 lg:max-w-7xl">
              <ul className="flex flex-col gap-1">
                {[
                  { to: '/' as const, label: 'Home' },
                  { to: '/matches' as const, label: 'Jogos' },
                  { to: '/how-it-works' as const, label: 'Como funciona?' },
                  { to: '/settings' as const, label: 'Configurações' },
                ].map(({ to, label }) => (
                  <li key={to}>
                    <Link
                      to={to}
                      className="block rounded-lg px-4 py-3 font-display text-sm font-semibold uppercase tracking-wide transition-colors hover:bg-black/5 cursor-pointer"
                      onClick={() => setMenuOpen(false)}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </nav>
        </>
      )}

      <main className="mx-auto max-w-[430px] px-5 pb-8 pt-6 lg:max-w-6xl lg:px-8 lg:pt-10 lg:pb-16">
        <Outlet />
      </main>
    </div>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
