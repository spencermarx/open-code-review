import { createBrowserRouter } from 'react-router-dom'
import { RootLayout } from './components/layout/root-layout'
import { ErrorBoundary, RouteErrorFallback } from './components/error-boundary'
import { HomePage } from './features/home/home-page'
import { SessionsPage } from './features/sessions/sessions-page'
import { SessionDetailPage } from './features/sessions/session-detail-page'
import { CommandsPage } from './features/commands/commands-page'
import { MapRunPage } from './features/map/map-run-page'
import { RoundPage } from './features/reviews/round-page'
import { ReviewerDetailPage } from './features/reviews/reviewer-detail-page'
import { ReviewsPage } from './features/reviews/reviews-page'

function NotFoundPage() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-semibold text-zinc-900 dark:text-zinc-100">404</h1>
        <p className="mt-2 text-zinc-500 dark:text-zinc-400">Page not found.</p>
      </div>
    </div>
  )
}

function withErrorBoundary(element: React.ReactNode) {
  return <ErrorBoundary>{element}</ErrorBoundary>
}

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorFallback />,
    children: [
      { index: true, element: withErrorBoundary(<HomePage />) },
      { path: 'sessions', element: withErrorBoundary(<SessionsPage />), errorElement: <RouteErrorFallback /> },
      { path: 'sessions/:id', element: withErrorBoundary(<SessionDetailPage />), errorElement: <RouteErrorFallback /> },
      { path: 'sessions/:id/reviews/:round', element: withErrorBoundary(<RoundPage />), errorElement: <RouteErrorFallback /> },
      {
        path: 'sessions/:id/reviews/:round/reviewers/:reviewerId',
        element: withErrorBoundary(<ReviewerDetailPage />),
        errorElement: <RouteErrorFallback />,
      },
      { path: 'sessions/:id/maps/:run', element: withErrorBoundary(<MapRunPage />), errorElement: <RouteErrorFallback /> },
      { path: 'reviews', element: withErrorBoundary(<ReviewsPage />), errorElement: <RouteErrorFallback /> },
      { path: 'commands', element: withErrorBoundary(<CommandsPage />), errorElement: <RouteErrorFallback /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
