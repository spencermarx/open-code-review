import { useLocation } from 'react-router-dom'
import { Sun, Moon, Monitor } from 'lucide-react'
import { useTheme } from '../../providers/theme-provider'
import { cn } from '../../lib/utils'

const THEME_ICONS = {
  system: Monitor,
  light: Sun,
  dark: Moon,
} as const

function buildBreadcrumbs(pathname: string): { label: string; path: string }[] {
  if (pathname === '/') return [{ label: 'Home', path: '/' }]

  const parts = pathname.split('/').filter(Boolean)
  const crumbs = [{ label: 'Home', path: '/' }]

  let accumulated = ''
  for (const part of parts) {
    accumulated += `/${part}`
    const label = part.charAt(0).toUpperCase() + part.slice(1).replace(/-/g, ' ')
    crumbs.push({ label, path: accumulated })
  }

  return crumbs
}

export function Header() {
  const { mode, cycle } = useTheme()
  const location = useLocation()
  const breadcrumbs = buildBreadcrumbs(location.pathname)

  const ThemeIcon = THEME_ICONS[mode]

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-200 px-6 dark:border-zinc-800">
      <nav className="flex items-center gap-1 text-sm" aria-label="Breadcrumb">
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path} className="flex items-center gap-1">
            {i > 0 && (
              <span className="text-zinc-400 dark:text-zinc-600">/</span>
            )}
            <span
              className={cn(
                i === breadcrumbs.length - 1
                  ? 'font-medium text-zinc-900 dark:text-zinc-100'
                  : 'text-zinc-500 dark:text-zinc-400',
              )}
            >
              {crumb.label}
            </span>
          </span>
        ))}
      </nav>

      <button
        onClick={cycle}
        className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
        aria-label={`Theme: ${mode}. Click to cycle.`}
        title={`Theme: ${mode}`}
      >
        <ThemeIcon className="h-4 w-4" />
      </button>
    </header>
  )
}
