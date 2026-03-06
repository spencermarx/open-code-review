import { ArrowUpDown } from 'lucide-react'
import { cn } from '../../lib/utils'

type SortableHeaderProps<T extends string> = {
  label: string
  field: T
  activeField: T
  direction: 'asc' | 'desc'
  onSort: (field: T) => void
}

export function SortableHeader<T extends string>({
  label,
  field,
  activeField,
  direction,
  onSort,
}: SortableHeaderProps<T>) {
  return (
    <th className="border-b border-zinc-200 px-4 py-2 text-left dark:border-zinc-800">
      <button
        onClick={() => onSort(field)}
        className={cn(
          'flex items-center gap-1 text-sm font-medium transition-colors',
          activeField === field
            ? 'text-zinc-900 dark:text-zinc-100'
            : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100',
        )}
      >
        {label}
        <ArrowUpDown
          className={cn(
            'h-3 w-3',
            activeField === field ? 'opacity-100' : 'opacity-40',
            activeField === field && direction === 'desc' && 'rotate-180',
          )}
        />
      </button>
    </th>
  )
}
