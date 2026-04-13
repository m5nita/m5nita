import { MercadoPagoConfig } from 'mercadopago'

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN

if (!accessToken || accessToken === 'TEST-xxx') {
  console.warn(
    '[MercadoPago] No valid MERCADOPAGO_ACCESS_TOKEN configured. Payment features will use mock mode.',
  )
}

export const mercadoPagoClient =
  accessToken && accessToken !== 'TEST-xxx' ? new MercadoPagoConfig({ accessToken }) : null

export function isMercadoPagoConfigured(): boolean {
  return mercadoPagoClient !== null
}
