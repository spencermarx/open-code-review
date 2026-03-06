import { useEffect, useRef, useState, useId } from 'react'
import mermaid from 'mermaid'
import { useTheme } from '../../../providers/theme-provider'

type MermaidRendererProps = {
  definition: string
  onNodeClick?: (nodeId: string) => void
}

/**
 * Renders a Mermaid definition string as SVG.
 * This component must be lazy-loaded via React.lazy() since mermaid is ~2MB.
 */
export default function MermaidRenderer({ definition, onNodeClick }: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const { resolved: theme } = useTheme()
  const uniqueId = useId().replace(/:/g, '_')

  // Re-initialize mermaid only when the theme changes (not on every definition change)
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: theme === 'dark' ? 'dark' : 'default',
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
        curve: 'basis',
      },
    })
  }, [theme])

  useEffect(() => {
    if (!definition || !containerRef.current) return

    let cancelled = false

    // Event delegation handler for node clicks — added once to the container
    // so it is automatically cleaned up without tracking per-node listeners.
    function handleContainerClick(e: MouseEvent) {
      if (!onNodeClick) return
      const target = (e.target as HTMLElement).closest('.node') as HTMLElement | null
      if (!target) return
      const nodeId = target.id?.replace(/^flowchart-/, '').replace(/-\d+$/, '') ?? ''
      if (nodeId) onNodeClick(nodeId)
    }

    async function render() {
      setError(null)

      try {
        if (cancelled) return

        const elementId = `mermaid${uniqueId}`
        const { svg } = await mermaid.render(elementId, definition)

        if (cancelled || !containerRef.current) return

        containerRef.current.innerHTML = svg

        // Style clickable nodes for UX
        if (onNodeClick) {
          const nodes = containerRef.current.querySelectorAll('.node')
          nodes.forEach((node) => {
            ;(node as HTMLElement).style.cursor = 'pointer'
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram')
        }
      }
    }

    const container = containerRef.current
    if (onNodeClick) {
      container.addEventListener('click', handleContainerClick)
    }

    render()
    return () => {
      cancelled = true
      container.removeEventListener('click', handleContainerClick)
    }
  }, [definition, theme, uniqueId, onNodeClick])

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">
        Failed to render dependency graph: {error}
      </div>
    )
  }

  return <div ref={containerRef} className="overflow-x-auto [&_svg]:max-w-full" />
}
