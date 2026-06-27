import { apiFetch } from './api'

/** Fetches the member-gated ranking PNG and shares the file natively, falling
 *  back to a download + copied message where file-sharing is unavailable.
 *  `apiFetch` prepends VITE_API_URL and sends credentials. */
export async function shareRankingImage(poolId: string, poolName: string): Promise<void> {
  const res = await apiFetch(`/api/pools/${poolId}/ranking/image.png`)
  if (!res.ok) throw new Error('Não foi possível gerar a imagem do ranking')
  const blob = await res.blob()
  const file = new File([blob], 'ranking-m5nita.png', { type: 'image/png' })
  const text = `Ranking do bolão "${poolName}" · m5nita.com`

  const nav = navigator as Navigator & { canShare?: (d?: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: 'Ranking m5nita', text })
    } catch {
      // user dismissed the sheet — not an error.
    }
    return
  }

  // Fallback: download the image and copy a share message.
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ranking-m5nita.png'
  a.click()
  URL.revokeObjectURL(url)
  try {
    await navigator.clipboard?.writeText(text)
  } catch {
    // clipboard blocked — the image still downloaded.
  }
}
