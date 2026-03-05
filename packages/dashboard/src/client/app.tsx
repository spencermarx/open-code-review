import { RouterProvider } from 'react-router-dom'
import { ThemeProvider } from './providers/theme-provider'
import { SocketProvider } from './providers/socket-provider'
import { QueryProvider } from './providers/query-provider'
import { CommandStateProvider } from './providers/command-state-provider'
import { router } from './router'

export function App() {
  return (
    <ThemeProvider>
      <QueryProvider>
        <SocketProvider>
          <CommandStateProvider>
            <RouterProvider router={router} />
          </CommandStateProvider>
        </SocketProvider>
      </QueryProvider>
    </ThemeProvider>
  )
}
