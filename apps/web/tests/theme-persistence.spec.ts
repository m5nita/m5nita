import { expect, test } from '@playwright/test'

const STORAGE_KEY = 'm5nita.theme'

test.describe('Theme persistence (US2)', () => {
  test('choice survives reload and no FOUC', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Tema escuro' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    const stored = await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)
    expect(stored).toBe('dark')

    // Throttle network to catch pre-hydration FOUC
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 400,
      downloadThroughput: (500 * 1024) / 8,
      uploadThroughput: (500 * 1024) / 8,
    })

    await page.reload()
    // data-theme must be correct before first paint — the inline script sets it synchronously.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})
