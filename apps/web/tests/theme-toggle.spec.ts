import { expect, test } from '@playwright/test'

test.describe('Theme toggle (US1)', () => {
  test('public header — toggle flips data-theme without reload', async ({ page }) => {
    await page.goto('/login')
    const html = page.locator('html')

    await page.getByRole('button', { name: 'Tema escuro' }).click()
    await expect(html).toHaveAttribute('data-theme', 'dark')

    await page.getByRole('button', { name: 'Tema claro' }).click()
    await expect(html).toHaveAttribute('data-theme', 'light')
  })

  test('signed-in menu — toggle works from mobile drawer', async ({ page }) => {
    // Sign-in flow is app-specific; skeleton only. Fill in fixture sign-in helper.
    await page.goto('/')
    // await signIn(page, { fixture: 'user-a' })
    await page.getByRole('button', { name: 'Menu' }).click()
    await page.getByRole('button', { name: 'Tema escuro' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
})
