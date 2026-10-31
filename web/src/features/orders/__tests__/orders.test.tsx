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
import { render, screen, waitFor } from '@testing-library/react'
import { createInstance } from 'i18next'
import { I18nextProvider, initReactI18next } from 'react-i18next'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import en from '@/i18n/locales/en.json'
import zh from '@/i18n/locales/zh.json'
import { api } from '@/lib/api'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

import { Orders } from '..'

const i18n = createInstance()
const clients: QueryClient[] = []

function setUser(id: number, role: number, username: string) {
  useAuthStore.setState((state) => ({
    auth: {
      ...state.auth,
      user: { id, username, role },
      accessToken: 'test-token',
      accessExpiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
  }))
}

function renderOrders() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  clients.push(client)
  return render(
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <Orders />
      </I18nextProvider>
    </QueryClientProvider>
  )
}

function mockOrders(items: unknown[], total = items.length) {
  return vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { items, total } },
    status: 200,
  })
}

beforeEach(async () => {
  await i18n.use(initReactI18next).init({
    lng: 'en',
    fallbackLng: false,
    nsSeparator: false,
    resources: { en, zh },
    interpolation: { escapeValue: false },
  })
  setUser(5, ROLE.USER, 'buyer')
})

afterEach(() => {
  vi.restoreAllMocks()
  clients.splice(0).forEach((client) => client.clear())
})

it('lists the signed-in user orders from the self endpoint', async () => {
  const get = mockOrders([
    {
      id: 1,
      user_id: 5,
      amount: 20,
      money: 20,
      trade_no: 'USR5NOabc',
      payment_method: 'stripe',
      payment_provider: 'stripe',
      create_time: 1_700_000_000,
      status: 'success',
    },
  ])

  renderOrders()

  await screen.findByText('USR5NOabc')
  expect(screen.getByText('Stripe')).toBeVisible()
  expect(get.mock.calls[0][0]).toContain('/api/user/topup/self')
})

it('shows an administrative grant as a quota amount with no payment', async () => {
  mockOrders([
    {
      id: 2,
      user_id: 6,
      amount: 500000,
      money: 0,
      trade_no: 'ADM6G1abcdefgh',
      payment_method: 'admin_grant',
      payment_provider: 'admin_grant',
      create_time: 1_700_000_100,
      status: 'success',
    },
  ])
  setUser(1, ROLE.ADMIN, 'admin')

  renderOrders()

  await screen.findByText('ADM6G1abcdefgh')
  expect(screen.getByText('Admin Grant')).toBeVisible()
  // The credited quota is shown, not the zero payment.
  expect(screen.getByText('500,000')).toBeVisible()
})

it('asks for the next page with server-side pagination', async () => {
  const get = mockOrders(
    Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      user_id: 5,
      amount: 10,
      money: 10,
      trade_no: `order-${index}`,
      payment_method: 'stripe',
      create_time: 1_700_000_000,
      status: 'success',
    })),
    42
  )

  renderOrders()
  await screen.findByText('order-0')
  expect(get.mock.calls[0][0]).toContain('p=1')

  const nextButton = await screen.findByRole('button', { name: /next/i })
  nextButton.click()

  await waitFor(() => {
    const lastUrl = get.mock.calls.at(-1)?.[0] as string
    expect(lastUrl).toContain('p=2')
  })
})
