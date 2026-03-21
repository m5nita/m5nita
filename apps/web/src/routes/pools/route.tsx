import { createFileRoute, Outlet } from '@tanstack/react-router'
import { requireAuthGuard } from '../../lib/authGuard'

export const Route = createFileRoute('/pools')({
  beforeLoad: () => requireAuthGuard(),
  component: Outlet,
})
