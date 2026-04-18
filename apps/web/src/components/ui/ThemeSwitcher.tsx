import type { ReactElement } from 'react'
import type { ThemePreference } from '../../lib/theme'
import { useTheme } from '../../lib/theme'

function SunIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function LaptopIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="12" rx="1.5" />
      <path d="M2 20h20" />
    </svg>
  )
}

type SwitcherSize = 'sm' | 'md' | 'lg'

interface SegmentProps {
  value: ThemePreference
  label: string
  icon: ReactElement
  selected: boolean
  onSelect: (value: ThemePreference) => void
  size: SwitcherSize
  fullWidth: boolean
  systemHint?: 'light' | 'dark'
}

function Segment({
  value,
  label,
  icon,
  selected,
  onSelect,
  size,
  fullWidth,
  systemHint,
}: SegmentProps) {
  const sizing = size === 'sm' ? 'min-h-8 px-3' : size === 'lg' ? 'min-h-12 px-5' : 'min-h-11 px-4'
  const stretch = fullWidth ? 'flex-1' : ''
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      aria-label={label}
      aria-pressed={selected}
      className={`relative flex items-center justify-center gap-1 ${sizing} ${stretch} font-display text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:z-10 ${
        selected ? 'bg-black text-white' : 'text-gray-dark hover:text-black hover:bg-black/5'
      }`}
    >
      {icon}
      {value === 'system' && selected && systemHint ? (
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current opacity-80"
          data-system-hint={systemHint}
        />
      ) : null}
    </button>
  )
}

export interface ThemeSwitcherProps {
  className?: string
  size?: SwitcherSize
  fullWidth?: boolean
}

export function ThemeSwitcher({
  className = '',
  size = 'md',
  fullWidth = false,
}: ThemeSwitcherProps) {
  const { preference, effective, setPreference } = useTheme()
  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 14 : 18
  const container = fullWidth ? 'flex w-full items-stretch' : 'inline-flex items-center'

  return (
    <fieldset
      aria-label="Seletor de tema"
      className={`${container} border border-border bg-surface overflow-hidden p-0 m-0 ${className}`}
    >
      <Segment
        value="light"
        label="Tema claro"
        icon={<SunIcon size={iconSize} />}
        selected={preference === 'light'}
        onSelect={setPreference}
        size={size}
        fullWidth={fullWidth}
      />
      <Segment
        value="system"
        label="Seguir sistema"
        icon={<LaptopIcon size={iconSize} />}
        selected={preference === 'system'}
        onSelect={setPreference}
        size={size}
        fullWidth={fullWidth}
        systemHint={effective}
      />
      <Segment
        value="dark"
        label="Tema escuro"
        icon={<MoonIcon size={iconSize} />}
        selected={preference === 'dark'}
        onSelect={setPreference}
        size={size}
        fullWidth={fullWidth}
      />
    </fieldset>
  )
}
