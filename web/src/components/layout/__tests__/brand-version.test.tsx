/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { AppHeader } from '../components/app-header'
import { PublicHeader } from '../components/public-header'
import { SystemBrand } from '../components/system-brand'

const clients: QueryClient[] = []
const initialSystemConfig = useSystemConfigStore.getState()

afterEach(() => {
  cleanup()
  for (const client of clients) client.clear()
  clients.length = 0
  useAuthStore.getState().auth.reset()
  useSystemConfigStore.setState(initialSystemConfig)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

it.each(['public', 'app', 'sidebar'] as const)(
  'keeps the %s brand visible without showing the application version',
  async (surface) => {
    useSystemConfigStore.getState().setLoading(false)
    const status = {
      version: 'v1.2.3',
      system_name: 'Fixture API',
      logo: '/fixture-logo.png',
    }
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    clients.push(client)
    client.setQueryData(STATUS_QUERY_KEY, status)
    client.setQueryData(['notice'], { success: true, data: '' })
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'admin', role: 100 })
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { success: true, data: status },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('[]', {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
    const router = createRouter({
      routeTree: createRootRoute({
        component: () => (
          <SidebarProvider>
            {surface === 'public' && (
              <PublicHeader
                logo={<img src='/fixture-logo.png' alt='Fixture brand' />}
                siteName='Fixture API'
                rightContent={<span />}
                showNavigation={false}
                showAuthButtons={false}
                showNotifications={false}
                showThemeSwitch={false}
                showLanguageSwitcher={false}
              />
            )}
            {surface === 'app' && <AppHeader rightContent={<span />} />}
            {surface === 'sidebar' && <SystemBrand />}
          </SidebarProvider>
        ),
      }),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })
    await router.load()
    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )
    expect(await screen.findByRole('img')).toBeVisible()
    expect(screen.queryByText('v1.2.3')).not.toBeInTheDocument()
  }
)
