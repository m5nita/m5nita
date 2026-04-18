import { AxeBuilder } from '@axe-core/playwright'
import { expect, type Page, test } from '@playwright/test'

const ROUTES = ['/', '/matches', '/how-it-works', '/login', '/settings', '/pools/create']

async function selectTheme(page: Page, theme: 'light' | 'dark') {
  const label = theme === 'dark' ? 'Tema escuro' : 'Tema claro'
  await page.getByRole('button', { name: label }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
}

test.describe('Accessibility across themes (FR-009, SC-005)', () => {
  for (const route of ROUTES) {
    for (const theme of ['light', 'dark'] as const) {
      test(`${route} passes axe-core in ${theme} theme`, async ({ page }) => {
        await page.goto(route)
        await selectTheme(page, theme)
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
        const serious = results.violations.filter(
          (v) => v.impact === 'serious' || v.impact === 'critical',
        )
        expect(serious, JSON.stringify(serious, null, 2)).toEqual([])
      })
    }
  }
})
