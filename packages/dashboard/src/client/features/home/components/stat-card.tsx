import type { LucideIcon } from 'lucide-react'
import { cn } from '../../../lib/utils'

type StatCardProps = {
  title: string
  value: number | string
  icon: LucideIcon
  trend?: 'up' | 'down'
}

export function StatCard({ title, value, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">{title}</span>
        <Icon className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          {value}
        </span>
        {trend && (
          <span
            className={cn(
              'text-xs font-medium',
              trend === 'up'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400',
            )}
          >
            {trend === 'up' ? '\u2191' : '\u2193'}
          </span>
        )}
      </div>
    </div>
  )
}
