import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type ThemeMode = 'system' | 'light' | 'dark'
type ResolvedTheme = 'light' | 'dark'

type ThemeContextValue = {
  mode: ThemeMode
  resolved: ResolvedTheme
  cycle: () => void
  /** Alias: current mode */
  theme: ThemeMode
  /** Alias: cycle to next theme */
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'ocr-dashboard-theme'
const CYCLE_ORDER: ThemeMode[] = ['system', 'light', 'dark']

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveTheme(mode: ThemeMode): ResolvedTheme {
  return mode === 'system' ? getSystemTheme() : mode
}

function getStoredMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  } catch {
    // localStorage unavailable
  }
  return 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(getStoredMode)
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(getSystemTheme)

  // Listen for OS theme changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Apply theme class to <html> and swap favicon
  const resolved = mode === 'system' ? systemTheme : mode
  useEffect(() => {
    const root = document.documentElement
    root.classList.remove('light', 'dark')
    root.classList.add(resolved)

    // Use dark favicon on light backgrounds, light favicon on dark backgrounds
    const faviconHref = resolved === 'dark' ? '/favicon-light.ico' : '/favicon-dark.ico'
    const existing = document.querySelector<HTMLLinkElement>('link#favicon')
    if (existing) {
      existing.href = faviconHref
    }
  }, [resolved])

  // Persist mode
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, mode)
    } catch {
      // localStorage unavailable
    }
  }, [mode])

  const cycle = useCallback(() => {
    setMode((current) => {
      const idx = CYCLE_ORDER.indexOf(current)
      return CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]!
    })
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, cycle, theme: mode, toggleTheme: cycle }),
    [mode, resolved, cycle],
  )

  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
