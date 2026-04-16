import { MercadoPagoConfig } from 'mercadopago'

const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN

export const mercadoPagoClient =
  accessToken && accessToken !== 'TEST-xxx' ? new MercadoPagoConfig({ accessToken }) : null
