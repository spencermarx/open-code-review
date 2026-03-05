import { useCallback, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Map, MessageSquare } from 'lucide-react'
import { ProgressBar } from '../../components/ui/progress-bar'
import { SectionCard } from './components/section-card'
import { ClearProgressDialog } from './components/clear-progress-dialog'
import { RawMapView } from './components/raw-map-view'
import { DependencyGraph } from './components/dependency-graph'
import { useMapRun, useToggleFileReview, useClearMapProgress } from './hooks/use-map-run'
import { ChatPanel } from '../chat/components/chat-panel'

export function MapRunPage() {
  const { id: sessionId, run } = useParams<{ id: string; run: string }>()
  const runNumber = parseInt(run ?? '0', 10)

  const { data: mapRun, isLoading } = useMapRun(sessionId ?? '', runNumber)
  const toggleFile = useToggleFileReview(sessionId ?? '', runNumber)
  const clearProgress = useClearMapProgress(sessionId ?? '', runNumber)
  const [chatOpen, setChatOpen] = useState(false)

  const handleSectionClick = useCallback((sectionId: number) => {
    const el = document.getElementById(`section-${sectionId}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  if (isLoading) {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading map run...</p>
  }

  if (!mapRun) {
    return (
      <div>
        <Link
          to={`/sessions/${sessionId}`}
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to session
        </Link>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Map run not found.</p>
      </div>
    )
  }

  const totalFiles = mapRun.sections.reduce((sum, s) => sum + s.file_count, 0)
  const reviewedFiles = mapRun.sections.reduce((sum, s) => sum + s.reviewed_count, 0)

  return (
    <div className="space-y-6">
      <Link
        to={`/sessions/${sessionId}`}
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to session
      </Link>

      {/* Header */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Map className="h-5 w-5 text-zinc-400" />
              <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                Map Run {mapRun.run_number}
              </h1>
            </div>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {reviewedFiles} / {totalFiles} files reviewed
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setChatOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Ask the Team
            </button>
            <RawMapView sessionId={sessionId ?? ''} />
            <ClearProgressDialog
              onConfirm={() => clearProgress.mutate(mapRun.id)}
              isPending={clearProgress.isPending}
            />
          </div>
        </div>

        <div className="mt-4">
          <ProgressBar value={reviewedFiles} max={totalFiles} showLabel />
        </div>
      </div>

      {/* Dependency Graph — hidden if no flow-analysis data */}
      <DependencyGraph
        sessionId={sessionId ?? ''}
        runNumber={runNumber}
        sections={mapRun.sections}
        onSectionClick={handleSectionClick}
      />

      {/* Section Cards */}
      {mapRun.sections.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            No sections found in this map run.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {mapRun.sections.map((section) => (
            <div key={section.id} id={`section-${section.id}`}>
              <SectionCard
                section={section}
                onToggleFile={(fileId, isReviewed) =>
                  toggleFile.mutate({ fileId, isReviewed })
                }
              />
            </div>
          ))}
        </div>
      )}

      {chatOpen && (
        <ChatPanel
          sessionId={sessionId ?? ''}
          targetType="map_run"
          targetId={mapRun.run_number}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  )
}
