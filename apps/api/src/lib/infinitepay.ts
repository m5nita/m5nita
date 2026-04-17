const handle = process.env.INFINITEPAY_HANDLE

export const infinitePayConfig: { handle: string } | null =
  handle && handle.length > 0 ? { handle } : null
