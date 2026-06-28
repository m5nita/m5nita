import { apiFetch } from './api'

const VAPID_PUBLIC_KEY: string | undefined = import.meta.env.VITE_VAPID_PUBLIC_KEY

export type PushStatus = 'unsupported' | 'disabled' | 'enabled' | 'denied'

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    Boolean(VAPID_PUBLIC_KEY)
  )
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

export function isInstalledPwa(): boolean {
  if (typeof window === 'undefined') return false
  const displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches === true
  const iosStandalone = (window.navigator as { standalone?: boolean }).standalone === true
  return displayStandalone || iosStandalone
}

// iOS only exposes Push to an installed PWA (16.4+); a Safari tab cannot subscribe.
export function isIosTabWithoutPush(): boolean {
  return isIos() && !isInstalledPwa() && !isPushSupported()
}

// Decode a base64url VAPID key to the Uint8Array applicationServerKey expects.
// Returns an ArrayBuffer-backed array (not SharedArrayBuffer) so it satisfies
// BufferSource under TS's strict typed-array generics.
export function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) {
    output[i] = raw.charCodeAt(i)
  }
  return output
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  const existing = await navigator.serviceWorker.getRegistration()
  return existing ?? (await navigator.serviceWorker.ready)
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  return sub ? 'enabled' : 'disabled'
}

export async function subscribe(): Promise<PushStatus> {
  if (!isPushSupported() || !VAPID_PUBLIC_KEY) return 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'disabled'

  const reg = await getRegistration()
  if (!reg) return 'unsupported'
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  })
  const json = sub.toJSON()
  await apiFetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
  })
  return 'enabled'
}

export async function unsubscribe(): Promise<PushStatus> {
  const reg = await getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await apiFetch('/api/push/subscribe', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    })
    await sub.unsubscribe()
  }
  return 'disabled'
}
