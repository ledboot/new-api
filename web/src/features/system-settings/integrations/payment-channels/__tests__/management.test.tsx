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
import userEvent from '@testing-library/user-event'
import { vi, test, expect } from 'vitest'

import { api } from '@/lib/api'

import { PaymentChannels } from '../index'
import { createChannelMethod, createPaymentChannel } from '../types'

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

test('adding a 502 channel submits Alipay and WeChat methods together in one request', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: [] } })
  vi.mocked(api.post).mockResolvedValue({
    data: { success: true, data: { id: 1 } },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={client}>
      <PaymentChannels enabled />
    </QueryClientProvider>
  )
  await user.click(
    await screen.findByRole('button', { name: 'Add payment channel' })
  )
  await user.type(screen.getByLabelText('Channel name'), '502 gateway')
  await user.type(screen.getByLabelText('Merchant ID'), '1001')
  await user.type(screen.getByLabelText('API key'), 'merchant-secret')
  await user.type(screen.getByLabelText('Method name 1'), 'Alipay')
  await user.click(screen.getByRole('button', { name: 'Add payment method' }))
  await user.type(screen.getByLabelText('Method name 2'), 'WeChat')
  await user.click(screen.getByRole('combobox', { name: 'Payment type 2' }))
  await user.click(await screen.findByRole('option', { name: 'WeChat Pay' }))
  expect(
    screen.getByRole('combobox', { name: 'Payment type 2' })
  ).toHaveValue('WeChat Pay')
  await user.click(screen.getByRole('button', { name: 'Save payment channel' }))
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1))
  expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({
    name: '502 gateway',
    provider: '502',
    methods: [{ type: 'alipay' }, { type: 'wxpay' }],
  })
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  view.unmount()
  client.clear()
})

test('editing a BEpusdt channel retains BSC and TRC methods without requiring its existing secret', async () => {
  const channel = {
    ...createPaymentChannel(),
    id: 4,
    provider: 'bepusdt' as const,
    currency: 'USD' as const,
    name: 'USDT gateway',
    config: {
      gateway_url: 'https://pay.example',
      merchant_id: '',
      api_key: '',
      webhook_secret: '',
      test_mode: false,
    },
    methods: [
      {
        ...createChannelMethod('bepusdt'),
        id: 'bsc',
        name: 'USDT BSC',
        type: 'usdt.bep20',
      },
      {
        ...createChannelMethod('bepusdt'),
        id: 'trc',
        name: 'USDT TRC',
        type: 'usdt.trc20',
      },
    ],
  }
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: [
        {
          channel,
          api_key_configured: true,
          webhook_secret_configured: false,
          notify_url: 'https://api.example/notify',
        },
      ],
    },
  })
  vi.mocked(api.post).mockResolvedValue({
    data: { success: true, data: channel },
  })
  const client = new QueryClient()
  const user = userEvent.setup()
  const view = render(
    <QueryClientProvider client={client}>
      <PaymentChannels enabled />
    </QueryClientProvider>
  )
  await user.click(
    await screen.findByRole('button', { name: 'Edit USDT gateway' })
  )
  expect(screen.getByLabelText('Payment type 1')).toHaveValue('usdt.bep20')
  expect(screen.getByLabelText('Payment type 2')).toHaveValue('usdt.trc20')
  expect(screen.getByLabelText('API key')).not.toBeRequired()
  await user.click(screen.getByRole('button', { name: 'Save payment channel' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  )
  view.unmount()
  client.clear()
})
