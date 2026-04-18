# Data Model: Dark Mode with Theme Toggle

**Feature**: 015-dark-light-theme
**Date**: 2026-04-18

This feature stores no server-side data and adds no database tables or columns. The only persistent state is a single browser-local key.

---

## Persisted state

### `localStorage['m5nita.theme']`

| Property | Value |
|---|---|
| Key | `m5nita.theme` |
| Type | `string` |
| Allowed values | `'light'` \| `'dark'` \| `'system'` |
| Missing-key semantic | Treated as `'system'` |
| Invalid-value semantic | Treated as `'system'`; the invalid value is best-effort removed |
| Written on | User selection via `ThemeSwitcher` |
| Read on | App bootstrap (inline script in `index.html`) and hook initialization |

State transitions:

```text
initial (no key) ──► system
system ──► light | dark | system      (user picks in switcher)
light  ──► light | dark | system
dark   ──► light | dark | system
```

The stored preference is independent from the *effective* theme. The effective theme is a derived value, computed each time the preference or the OS preference changes.

---

## Derived state (in-memory)

### `ThemePreference`

```ts
type ThemePreference = 'light' | 'dark' | 'system'
```

The user's stored choice — one of three discrete states. Matches the spec's three-state control (clarification Q1).

### `EffectiveTheme`

```ts
type EffectiveTheme = 'light' | 'dark'
```

The theme currently rendered. Always concrete — `'system'` is resolved before this type is produced.

### Resolution

```ts
resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): EffectiveTheme
```

- `preference === 'light'` → `'light'`
- `preference === 'dark'` → `'dark'`
- `preference === 'system'` → `systemPrefersDark ? 'dark' : 'light'`

Pure function, no side effects. 100% unit-testable.

---

## DOM side effects

The `ThemeProvider` writes two attributes on `<html>` whenever the effective theme changes:

| Attribute | Values | Purpose |
|---|---|---|
| `data-theme` | `"light"` \| `"dark"` | Selector for CSS variable overrides and Tailwind `dark:` variant |
| `style.colorScheme` | `"light"` \| `"dark"` | Browser-native scrollbars, form controls, autofill |

It also updates the `<meta name="theme-color">` tag so iOS/Chrome chrome tracks the active theme (R7 in `research.md`).

---

## No server-side schema changes

This feature does **not** modify:

- Any table in PostgreSQL
- The `user` table (no `themePreference` column)
- Any API response shape
- Any validation schema (Zod)
- Any Drizzle schema definition

Per the spec's "per-device" assumption, the preference lives with the browser.
