import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'

export type ModelSelectOption = {
  /** The selected value passed to onChange. Empty string is the synthetic "(default)" option. */
  id: string
  /** Primary label (typically a friendly name, e.g. "Claude Opus 4.7"). */
  label: string
  /** Secondary label rendered in muted mono — typically the raw model id. */
  detail?: string
}

type ModelSelectProps = {
  value: string
  options: ModelSelectOption[]
  onChange: (next: string) => void
  /**
   * When true, render a free-text input instead of the dropdown.
   * Used when the active AI CLI didn't return a model list — the user
   * types whatever model id their CLI accepts.
   */
  freeText?: boolean
  freeTextPlaceholder?: string
  disabled?: boolean
  className?: string
  /**
   * Optional aria-label for the trigger button. Use when the visible label
   * isn't sufficient context for screen readers.
   */
  ariaLabel?: string
  /** Open the listbox on mount. Used by transient pickers like AddReviewerCard. */
  defaultOpen?: boolean
  /** Notified whenever the listbox opens or closes — lets parents drive cancel-on-close flows. */
  onOpenChange?: (open: boolean) => void
}

/**
 * Custom model picker that matches the dashboard's design system —
 * replaces the native `<select>` for the team-config + reviewer-dialog
 * surfaces. Two-row option rendering so we can show friendly name + raw
 * model id together.
 *
 * No portal, no popper, no third-party dependency — the dropdown is
 * absolutely positioned within a relative wrapper. The component owns
 * its own click-outside, ESC, and arrow-key navigation.
 */
export function ModelSelect({
  value,
  options,
  onChange,
  freeText = false,
  freeTextPlaceholder = 'Type model id…',
  disabled = false,
  className,
  ariaLabel,
  defaultOpen = false,
  onOpenChange,
}: ModelSelectProps) {
  if (freeText) {
    return (
      <input
        type="text"
        value={value}
        placeholder={freeTextPlaceholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
        className={cn(
          'w-full rounded-md border bg-white px-2.5 py-1.5 font-mono text-xs',
          'border-zinc-200 text-zinc-700 placeholder:text-zinc-400',
          'focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/50',
          'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:placeholder:text-zinc-500',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      />
    )
  }

  const [open, setOpenState] = useState(defaultOpen)
  const setOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    setOpenState((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      if (value !== prev) onOpenChange?.(value)
      return value
    })
  }
  // Index of the keyboard-highlighted item (for arrow-key navigation).
  // -1 = none highlighted; on open we sync to the selected option's index.
  const [highlight, setHighlight] = useState(-1)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listboxId = useId()

  const selected = options.find((o) => o.id === value) ?? options[0] ?? null
  const selectedIndex = selected ? options.findIndex((o) => o.id === selected.id) : -1

  // Click-outside close
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // ESC close
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  // Sync highlight to the currently selected option whenever the menu opens
  useEffect(() => {
    if (open) setHighlight(selectedIndex >= 0 ? selectedIndex : 0)
  }, [open, selectedIndex])

  function handleTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(true)
    }
  }

  function handleListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlight((h) => Math.min(options.length - 1, (h < 0 ? -1 : h) + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlight((h) => Math.max(0, (h < 0 ? options.length : h) - 1))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setHighlight(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setHighlight(options.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (highlight >= 0 && highlight < options.length) {
        const opt = options[highlight]
        if (opt) {
          onChange(opt.id)
          setOpen(false)
          triggerRef.current?.focus()
        }
      }
    } else if (e.key === 'Tab') {
      // Let Tab close and move focus naturally
      setOpen(false)
    }
  }

  const triggerLabel = selected?.label ?? freeTextPlaceholder
  const triggerDetail = selected?.detail

  return (
    <div ref={wrapperRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleTriggerKeyDown}
        className={cn(
          'flex w-full items-center gap-2 rounded-md border bg-white px-2.5 py-1.5 text-left',
          'border-zinc-200 hover:border-zinc-300',
          'focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400/50',
          'dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className="min-w-0 flex-1 truncate text-xs text-zinc-700 dark:text-zinc-300">
          {triggerLabel}
        </span>
        {triggerDetail && (
          <span className="hidden shrink-0 truncate font-mono text-[10px] text-zinc-400 dark:text-zinc-500 sm:block">
            {triggerDetail}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform dark:text-zinc-500',
            open && 'rotate-180',
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          onKeyDown={handleListKeyDown}
          aria-activedescendant={
            highlight >= 0 ? `${listboxId}-opt-${highlight}` : undefined
          }
          ref={(el) => {
            // Auto-focus the listbox when it mounts so arrow keys work
            // immediately without an extra click.
            el?.focus()
          }}
          className={cn(
            'absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-md border bg-white py-1 shadow-lg outline-none',
            'border-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/30',
          )}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
              No models available.
            </div>
          ) : (
            options.map((opt, idx) => {
              const isSelected = opt.id === value
              const isHighlighted = idx === highlight
              return (
                <button
                  key={opt.id || `__default-${idx}`}
                  id={`${listboxId}-opt-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.id)
                    setOpen(false)
                    triggerRef.current?.focus()
                  }}
                  onMouseEnter={() => setHighlight(idx)}
                  className={cn(
                    'flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors',
                    isHighlighted
                      ? 'bg-zinc-100 dark:bg-zinc-800'
                      : 'bg-transparent',
                    isSelected && 'bg-indigo-50/60 dark:bg-indigo-950/40',
                  )}
                >
                  <Check
                    className={cn(
                      'mt-0.5 h-3.5 w-3.5 shrink-0',
                      isSelected
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-transparent',
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                      {opt.label}
                    </span>
                    {opt.detail && (
                      <span className="block truncate font-mono text-[10px] text-zinc-500 dark:text-zinc-500">
                        {opt.detail}
                      </span>
                    )}
                  </span>
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
