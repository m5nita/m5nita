import { defineConfig } from 'drizzle-kit'

// Load apps/api/.env so every drizzle-kit command (generate/migrate/push/studio)
// targets the same DATABASE_URL as `pnpm dev`/`db:seed`. Node's loadEnvFile does
// NOT override variables already set in the real environment, so CI/prod (where
// DATABASE_URL is exported) keep precedence. No-op if the .env file is absent.
try {
  process.loadEnvFile()
} catch {
  // .env not present (e.g. CI with env vars already set) — ignore.
}

export default defineConfig({
  schema: './src/db/schema/*',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
})
