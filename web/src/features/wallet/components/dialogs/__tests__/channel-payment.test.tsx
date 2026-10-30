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
import { expect, test, vi } from 'vitest'

import { api } from '@/lib/api'

import { ChannelPaymentDialog } from '../channel-payment-dialog'

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

test('a native crypto QR shows the network and exact amount while waiting for verified payment', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { status: 'pending' } },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const paid = vi.fn()
  const view = render(
    <QueryClientProvider client={client}>
      <ChannelPaymentDialog
        checkout={{
          kind: 'qr',
          order_id: 'PC-one',
          amount: '10.00',
          currency: 'USD',
          qr_code: '0xwallet',
          network: 'usdt.bep20',
          crypto_amount: '10.123',
        }}
        onClose={vi.fn()}
        onPaid={paid}
      />
    </QueryClientProvider>
  )
  expect(screen.getByText('Network: usdt.bep20')).toBeVisible()
  expect(screen.getByText('Exact transfer amount: 10.123')).toBeVisible()
  expect(screen.getByTitle('Payment QR code')).toBeInTheDocument()
  await waitFor(() => expect(api.get).toHaveBeenCalled())
  expect(paid).not.toHaveBeenCalled()
  view.unmount()
  client.clear()
})

test('an expired crypto quote hides the payment QR to prevent transfers using a stale quote', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { status: 'pending' } },
  })
  const client = new QueryClient()
  const view = render(
    <QueryClientProvider client={client}>
      <ChannelPaymentDialog
        checkout={{
          kind: 'qr',
          order_id: 'PC-expired',
          amount: '10.00',
          currency: 'USD',
          qr_code: '0xwallet',
          expires_at: 1,
        }}
        onClose={vi.fn()}
        onPaid={vi.fn()}
      />
    </QueryClientProvider>
  )
  expect(screen.queryByTitle('Payment QR code')).not.toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: 'Copy payment code' })
  ).not.toBeInTheDocument()
  expect(
    screen.getByText(
      'This payment code has expired. Check the payment status or create a new order.'
    )
  ).toBeVisible()
  view.unmount()
  client.clear()
})

test('wallet refresh is triggered only when the server reports the order paid', async () => {
  vi.mocked(api.get).mockResolvedValue({
    data: { success: true, data: { status: 'success' } },
  })
  const client = new QueryClient()
  const paid = vi.fn()
  const view = render(
    <QueryClientProvider client={client}>
      <ChannelPaymentDialog
        checkout={{
          kind: 'qr',
          order_id: 'PC-paid',
          amount: '10.00',
          currency: 'CNY',
          qr_code: 'weixin://pay',
        }}
        onClose={vi.fn()}
        onPaid={paid}
      />
    </QueryClientProvider>
  )
  await waitFor(() => expect(paid).toHaveBeenCalledTimes(1))
  view.unmount()
  client.clear()
})
