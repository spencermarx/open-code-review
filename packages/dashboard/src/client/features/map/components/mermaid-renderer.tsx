import { useEffect, useRef, useState, useId } from 'react'
import mermaid from 'mermaid'
import { useTheme } from '../../../providers/theme-provider'

interface MermaidRendererProps {
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

  useEffect(() => {
    if (!definition || !containerRef.current) return

    let cancelled = false

    async function render() {
      setError(null)

      try {
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

        if (cancelled) return

        const elementId = `mermaid${uniqueId}`
        const { svg } = await mermaid.render(elementId, definition)

        if (cancelled || !containerRef.current) return

        containerRef.current.innerHTML = svg

        // Attach click handlers to nodes
        if (onNodeClick) {
          const nodes = containerRef.current.querySelectorAll('.node')
          nodes.forEach((node) => {
            const nodeElement = node as HTMLElement
            nodeElement.style.cursor = 'pointer'
            nodeElement.addEventListener('click', () => {
              const nodeId = nodeElement.id?.replace(/^flowchart-/, '').replace(/-\d+$/, '') ?? ''
              if (nodeId) onNodeClick(nodeId)
            })
          })
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram')
        }
      }
    }

    render()
    return () => { cancelled = true }
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
