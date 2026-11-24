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
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SidebarProvider } from '@/components/ui/sidebar'
import { DirectionProvider } from '@/context/direction-provider'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import { ThemeCustomizationProvider } from '@/context/theme-customization-provider'
import { ThemeProvider } from '@/context/theme-provider'
import { api } from '@/lib/api'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useAuthStore } from '@/stores/auth-store'
import { useSystemConfigStore } from '@/stores/system-config-store'

import { AppHeader } from '../components/app-header'
import { PublicHeader } from '../components/public-header'

const clients: QueryClient[] = []
const initialSystemConfig = useSystemConfigStore.getState()

function createHeaderClient() {
  const status = {
    system_name: 'Fixture API',
    logo: '/fixture-logo.png',
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  client.setQueryData(STATUS_QUERY_KEY, status)
  client.setQueryData(['notice'], { success: true, data: '' })
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: status },
  })
  return client
}

afterEach(() => {
  cleanup()
  for (const client of clients) client.clear()
  clients.length = 0
  useAuthStore.getState().auth.reset()
  useSystemConfigStore.setState(initialSystemConfig)
  document.body.style.overflow = ''
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('mobile header navigation and controls', () => {
  it('exposes top navigation and theme settings triggers in AppHeader without desktop-only hiding', async () => {
    useSystemConfigStore.getState().setLoading(false)
    useAuthStore
      .getState()
      .auth.setUser({ id: 1, username: 'admin', role: 100 })
    const client = createHeaderClient()

    const router = createRouter({
      routeTree: createRootRoute({
        component: () => (
          <ThemeProvider>
            <ThemeCustomizationProvider>
              <DirectionProvider>
                <LayoutProvider>
                  <SearchProvider>
                    <SidebarProvider>
                      <AppHeader />
                    </SidebarProvider>
                  </SearchProvider>
                </LayoutProvider>
              </DirectionProvider>
            </ThemeCustomizationProvider>
          </ThemeProvider>
        ),
      }),
      history: createMemoryHistory({ initialEntries: ['/dashboard'] }),
    })
    await router.load()

    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    )

    const themeSettingsBtn = await screen.findByRole('button', {
      name: 'Open theme settings',
    })
    expect(themeSettingsBtn).not.toHaveClass('max-md:hidden')
    expect(
      screen.getByRole('button', { name: 'Toggle navigation menu' })
    ).toBeInTheDocument()
  })

  it('toggles aria-expanded on PublicHeader mobile menu button and exposes language switcher', async () => {
    const user = userEvent.setup()
    useSystemConfigStore.getState().setLoading(false)
    const client = createHeaderClient()

    const router = createRouter({
      routeTree: createRootRoute({
        component: () => (
          <ThemeProvider>
            <PublicHeader />
          </ThemeProvider>
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

    const menuButton = await screen.findByRole('button', {
      name: 'Toggle navigation menu',
    })
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
    expect(
      screen.getAllByRole('button', { name: 'Change language' }).length
    ).toBeGreaterThan(0)

    await user.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')

    await user.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'false')
  })
})
