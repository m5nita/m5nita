# Playwright Specs — Dark Mode (Feature 015)

Playwright is not yet wired into this repo. The specs below (`theme-toggle.spec.ts`, `theme-persistence.spec.ts`, `theme-follow-system.spec.ts`, `theme-accessibility.spec.ts`) are authored to the Playwright API and will run as-is once Playwright + `@axe-core/playwright` are installed and `apps/web/playwright.config.ts` is added. See feature 015's quickstart and tasks.md (T011 / T020 / T029 / T037) for expected coverage.

Installation (follow-up):

```bash
pnpm --filter web add -D @playwright/test @axe-core/playwright
pnpm --filter web exec playwright install --with-deps
```
