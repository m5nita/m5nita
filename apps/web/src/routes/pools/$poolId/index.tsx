import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/pools/$poolId/')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/pools/$poolId/predictions',
      params: { poolId: params.poolId },
    })
  },
})
