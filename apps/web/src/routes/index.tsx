import { createFileRoute, Link } from '@tanstack/react-router'
import { useSession } from '../lib/auth'
import { Button } from '../components/ui/Button'
import { Card } from '../components/ui/Card'
import { Loading } from '../components/ui/Loading'

function HomePage() {
  const { data: session, isPending } = useSession()

  if (isPending) return <Loading />

  if (!session) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <h1 className="font-heading text-3xl font-bold">Manita</h1>
        <p className="text-gray-dark">Bolao da Copa do Mundo 2026</p>
        <Link to="/login">
          <Button size="lg">Entrar</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">
          Ola, {session.user.name || 'Jogador'}!
        </h1>
        <p className="text-sm text-gray-dark">Pronto para a Copa 2026?</p>
      </div>

      <div className="flex gap-3">
        <Link to="/pools/create" className="flex-1">
          <Button className="w-full" size="lg">
            Criar bolao
          </Button>
        </Link>
        <Button variant="secondary" className="flex-1" size="lg" disabled>
          Entrar em bolao
        </Button>
      </div>

      <section>
        <h2 className="mb-3 font-heading text-lg font-bold">Meus boloes</h2>
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-gray-dark">Voce ainda nao participa de nenhum bolao.</p>
          <p className="text-sm text-gray">Crie um bolao ou entre pelo link de convite de um amigo.</p>
        </Card>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg font-bold">Proximos jogos</h2>
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-gray-dark">Nenhum jogo disponivel ainda.</p>
          <p className="text-sm text-gray">Os jogos da Copa 2026 serao carregados em breve.</p>
        </Card>
      </section>
    </div>
  )
}

export const Route = createFileRoute('/')({
  component: HomePage,
})
