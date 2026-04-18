# Contract: Theme API

**Feature**: 015-dark-light-theme
**Module**: `apps/web/src/lib/theme/`

This is the internal TypeScript contract exposed to the rest of `apps/web`. No HTTP endpoints, no RPC — all consumers are React components or other frontend modules.

---

## Types

```ts
export type ThemePreference = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'
```

`ThemePreference` is what the user picked. `EffectiveTheme` is what is actually rendered right now.

---

## Pure function: `resolveTheme`

```ts
export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): EffectiveTheme
```

| Input | Behavior |
|---|---|
| `preference = 'light'`, any system | returns `'light'` |
| `preference = 'dark'`, any system | returns `'dark'` |
| `preference = 'system'`, system dark | returns `'dark'` |
| `preference = 'system'`, system light | returns `'light'` |

Zero side effects. Must be independently unit-tested with all four cases above.

---

## Storage adapter: `themeStorage`

```ts
export const themeStorage: {
  read(): ThemePreference        // returns 'system' if missing/invalid/unavailable
  write(pref: ThemePreference): void  // best-effort; swallows quota/security errors
}
```

Behavior:

- `read()` never throws. On any failure it returns `'system'`.
- `write()` never throws. If `localStorage` is unavailable (SecurityError, QuotaExceededError, undefined), the write is dropped silently; an in-memory variable in the same module holds the value for the current session so the hook still reflects the latest choice until reload.
- The storage key is `m5nita.theme`. This MUST match the key used by the inline pre-hydration script in `index.html` — any change to the key MUST be made in both places in the same PR.

---

## React context: `ThemeProvider`

```tsx
export function ThemeProvider({ children }: { children: React.ReactNode }): JSX.Element
```

Responsibilities on mount:

1. Read `themeStorage.read()` → initial `preference`.
2. Read `matchMedia('(prefers-color-scheme: dark)').matches` → initial `systemPrefersDark`.
3. Compute `effective = resolveTheme(preference, systemPrefersDark)`.
4. Apply `document.documentElement.setAttribute('data-theme', effective)` and `style.colorScheme = effective`.
5. Update the `<meta name="theme-color">` tag.
6. Subscribe to `matchMedia.change` and update `systemPrefersDark`.
7. Unsubscribe on unmount.

On `setPreference(next)`:

1. Write `themeStorage.write(next)`.
2. Recompute effective theme.
3. Apply DOM side effects (attribute, colorScheme, meta).
4. Update context so subscribers re-render.

---

## Hook: `useTheme`

```ts
export function useTheme(): {
  preference: ThemePreference
  effective: EffectiveTheme
  setPreference: (next: ThemePreference) => void
}
```

- `preference` — the stored user choice, including `'system'`.
- `effective` — the currently rendered theme (`'light' | 'dark'`); useful for passing to third-party widgets like Turnstile.
- `setPreference` — sets and persists the user's choice.

Usage contract:

- Components MUST be rendered inside `<ThemeProvider>` before calling `useTheme`. Calling the hook outside the provider throws a descriptive error in development and returns `{ preference: 'system', effective: 'light', setPreference: () => {} }` in production (defensive default).
- The hook is safe to call in effects and event handlers.
- `setPreference` is stable across re-renders (wrapped in `useCallback`).

---

## Component: `ThemeSwitcher`

```tsx
export function ThemeSwitcher(props?: {
  className?: string
  size?: 'sm' | 'md'
}): JSX.Element
```

Rendered as a segmented control with three options: Light, Dark, System. The currently selected segment is visually distinct and has `aria-pressed="true"`. The component reads from and writes via `useTheme`.

Accessibility requirements:

- Each segment is a `<button>` with an accessible label (`aria-label="Tema claro"`, etc.) and an SVG icon (sun / moon / laptop) marked `aria-hidden="true"`.
- The full group has `role="group"` and `aria-label="Seletor de tema"`.
- Keyboard: native Tab navigation between segments. No custom arrow-key handler required (three buttons; Tab is sufficient).
- Focus ring is visible in both themes (uses `focus-visible:ring-2`).

---

## Integration point: Turnstile widget

`apps/web/src/lib/turnstile.ts` or the `<Turnstile>` call site in `apps/web/src/routes/login.tsx` MUST pass the current `effective` theme so the widget renders in sync. When `preference === 'system'` it is acceptable to pass `'auto'` directly to Turnstile (Turnstile will itself follow `prefers-color-scheme`); otherwise pass the resolved `effective` value.
