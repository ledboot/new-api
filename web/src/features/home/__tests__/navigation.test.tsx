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
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Hero } from '@/features/home/components/sections/hero'
import { STATUS_QUERY_KEY } from '@/lib/status-query'
import { useSystemConfigStore } from '@/stores/system-config-store'

const queryClients: QueryClient[] = []

async function renderHero(isAuthenticated: boolean, docsLink?: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClients.push(queryClient)
  queryClient.setQueryData(STATUS_QUERY_KEY, { docs_link: docsLink })
  const rootRoute = createRootRoute({
    component: () => <Hero isAuthenticated={isAuthenticated} />,
  })
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await router.load()
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  )
}

beforeEach(() => {
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

afterEach(() => {
  queryClients.splice(0).forEach((client) => client.clear())
  window.localStorage.clear()
  useSystemConfigStore.setState(useSystemConfigStore.getInitialState(), true)
})

describe('Tokara home navigation', () => {
  it('keeps registration, pricing and supported application links for guests', async () => {
    await renderHero(false)

    expect(
      await screen.findByRole('button', { name: 'Get Started' })
    ).toHaveAttribute('href', '/sign-up')
    expect(
      screen.getByRole('button', { name: 'View Pricing' })
    ).toHaveAttribute('href', '/pricing')
    expect(screen.getByRole('link', { name: 'Cherry Studio' })).toHaveAttribute(
      'href',
      'https://cherry-ai.com'
    )
    expect(screen.getByRole('link', { name: 'CC Switch' })).toHaveAttribute(
      'href',
      'https://ccswitch.io'
    )
    expect(screen.getByText('Tokara')).toBeVisible()
  })

  it('uses the full site width while preserving mobile page gutters', async () => {
    await renderHero(false)
    const heading = await screen.findByRole('heading', { level: 1 })
    expect(heading.closest('.site-container')).not.toBeNull()
    expect(heading.closest('section')).toHaveClass('px-5')
  })

  it('keeps the dashboard entry for signed-in users', async () => {
    await renderHero(true)

    expect(
      await screen.findByRole('button', { name: 'Go to Dashboard' })
    ).toHaveAttribute('href', '/dashboard')
    expect(
      screen.queryByRole('button', { name: 'Get Started' })
    ).not.toBeInTheDocument()
  })

  it.each([
    {
      docsLink: undefined,
      expected: 'https://docs.newapi.pro',
      target: '_blank',
    },
    {
      docsLink: 'https://docs.example.com/guide',
      expected: 'https://docs.example.com/guide',
      target: '_blank',
    },
    { docsLink: '/about', expected: '/about', target: null },
  ])(
    'preserves the configured documentation destination $expected',
    async ({ docsLink, expected, target }) => {
      await renderHero(false, docsLink)

      const link = await screen.findByRole('button', { name: 'Docs' })
      expect(link).toHaveAttribute('href', expected)
      expect(link.getAttribute('target')).toBe(target)
    }
  )

  it('keeps a long custom site name within its diagram node', async () => {
    const name = 'My custom gateway with a very long display name'
    useSystemConfigStore
      .getState()
      .setConfig({ systemName: name, logo: '/custom.svg' })
    await renderHero(false)

    const label = await screen.findByText(name)
    expect(label).toHaveClass('truncate', 'max-w-32')
    expect(label.previousElementSibling).toHaveAttribute('src', '/custom.svg')
  })
})
