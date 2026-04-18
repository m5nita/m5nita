import { expect, test } from '@playwright/test'

test.describe('Follow system (US3)', () => {
  test.use({ colorScheme: 'dark' })

  test('new user with dark OS starts in dark', async ({ page }) => {
    await page.goto('/login')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('OS preference change propagates live when preference is system', async ({ page }) => {
    await page.goto('/login')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('explicit choice overrides OS preference', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: 'Tema claro' }).click()
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
})
