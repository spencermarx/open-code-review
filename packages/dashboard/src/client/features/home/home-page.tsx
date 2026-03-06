import { useQuery } from '@tanstack/react-query'
import {
  GitBranch,
  Activity,
  FileSearch,
  Map,
  File,
  AlertTriangle,
} from 'lucide-react'
import { StatCard } from './components/stat-card'
import { RecentSessions } from './components/recent-sessions'
import { fetchApi } from '../../lib/utils'
import type { DashboardStats, SessionSummary } from '../../lib/api-types'

export function HomePage() {
  const statsQuery = useQuery<DashboardStats>({
    queryKey: ['stats'],
    queryFn: () => fetchApi<DashboardStats>('/api/stats'),
  })

  const sessionsQuery = useQuery<SessionSummary[]>({
    queryKey: ['sessions', 'recent'],
    queryFn: () => fetchApi<SessionSummary[]>('/api/sessions?limit=10'),
  })

  const stats = statsQuery.data

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Overview of your code review activity.
        </p>
      </div>

      {statsQuery.isError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
          Failed to load stats.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Total Sessions"
          value={stats?.totalSessions ?? 0}
          icon={GitBranch}
        />
        <StatCard
          title="Active Sessions"
          value={stats?.activeSessions ?? 0}
          icon={Activity}
        />
        <StatCard
          title="Completed Reviews"
          value={stats?.completedReviews ?? 0}
          icon={FileSearch}
        />
        <StatCard
          title="Completed Maps"
          value={stats?.completedMaps ?? 0}
          icon={Map}
        />
        <StatCard
          title="Files Tracked"
          value={stats?.filesTracked ?? 0}
          icon={File}
        />
        <StatCard
          title="Unresolved Blockers"
          value={stats?.unresolvedBlockers ?? 0}
          icon={AlertTriangle}
        />
      </div>

      <div>
        <h2 className="mb-4 text-lg font-medium text-zinc-900 dark:text-zinc-100">
          Recent Sessions
        </h2>
        <div className="rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {sessionsQuery.isLoading ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading...</p>
          ) : sessionsQuery.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">Failed to load sessions.</p>
          ) : (
            <RecentSessions sessions={sessionsQuery.data ?? []} />
          )}
        </div>
      </div>
    </div>
  )
}
