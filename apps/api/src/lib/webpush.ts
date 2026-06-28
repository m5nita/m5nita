import webpush from 'web-push'

// VAPID config is optional: when unset the API still boots and the subscribe
// routes keep working, but sends are skipped (mirrors the payment-gateway mock
// pattern). The private key never leaves the server.
const publicKey = process.env.VAPID_PUBLIC_KEY
const privateKey = process.env.VAPID_PRIVATE_KEY
const subject = process.env.VAPID_SUBJECT ?? 'mailto:contato@m5nita.com'

export const isPushConfigured = Boolean(publicKey && privateKey)

if (publicKey && privateKey) {
  webpush.setVapidDetails(subject, publicKey, privateKey)
} else {
  console.warn('[WebPush] VAPID keys not configured; web push delivery is disabled.')
}

export { webpush }
