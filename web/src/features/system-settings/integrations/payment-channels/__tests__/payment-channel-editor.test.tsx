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
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'

import { PaymentChannelEditor } from '../payment-channel-editor'
import type { ChannelListItem, PaymentChannel } from '../types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

function channel(props: Partial<PaymentChannel> = {}): PaymentChannel {
  return {
    id: 1,
    name: 'Merchant',
    provider: '502',
    currency: 'CNY',
    icon: '',
    enabled: true,
    sort_order: 10,
    version: 1,
    config: {
      gateway_url: 'https://pay.502k.cn/xpay/epay',
      merchant_id: '1001',
      api_key: '',
      webhook_secret: '',
      test_mode: false,
    },
    methods: [
      {
        id: 'method-one',
        name: 'Alipay',
        type: 'alipay',
        interaction: 'redirect',
        unit_price: '1',
        min_topup: 1,
        max_topup: 0,
        product_id: '',
        credit_amount: '',
        fee_percent: '0',
        fee_fixed: '0',
        enabled: true,
      },
    ],
    ...props,
  }
}

function item(value: PaymentChannel): ChannelListItem {
  return {
    channel: value,
    api_key_configured: true,
    webhook_secret_configured: false,
    notify_url: '',
  }
}

test('502 and Stripe payment types are selectable lists instead of free text', async () => {
  const user = userEvent.setup()
  const view = render(
    <PaymentChannelEditor
      item={item(channel())}
      saving={false}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />
  )
  await user.click(screen.getByRole('combobox', { name: 'Payment type 1' }))
  expect(await screen.findByRole('option', { name: 'Alipay' })).toBeVisible()
  expect(screen.getByRole('option', { name: 'WeChat Pay' })).toBeVisible()
  view.unmount()

  const stripe = render(
    <PaymentChannelEditor
      item={item(
        channel({
          provider: 'stripe',
          currency: 'USD',
          methods: [
            {
              id: 'method-two',
              name: 'Card',
              type: 'card',
              interaction: 'redirect',
              unit_price: '1',
              min_topup: 1,
              max_topup: 0,
              product_id: '',
              credit_amount: '',
              fee_percent: '0',
              fee_fixed: '0',
              enabled: true,
            },
          ],
        })
      )}
      saving={false}
      onClose={vi.fn()}
      onSave={vi.fn()}
    />
  )
  await user.click(screen.getByRole('combobox', { name: 'Payment type 1' }))
  expect(await screen.findByRole('option', { name: 'Card' })).toBeVisible()
  expect(screen.queryByRole('option', { name: 'wxpay' })).toBeNull()
  stripe.unmount()
})

test('a saved method keeps the configured percentage and fixed fee', () => {
  const onSave = vi.fn()
  const view = render(
    <PaymentChannelEditor
      item={item(channel())}
      saving={false}
      onClose={vi.fn()}
      onSave={onSave}
    />
  )
  fireEvent.change(
    screen.getByLabelText('Fee percentage (%) 1', { exact: false }),
    { target: { value: '2.5' } }
  )
  fireEvent.change(screen.getByLabelText('Fixed fee (CNY) 1'), {
    target: { value: '0.3' },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Save payment channel' }))
  expect(onSave).toHaveBeenCalledTimes(1)
  expect(onSave.mock.calls[0][0].methods[0].fee_percent).toBe('2.5')
  expect(onSave.mock.calls[0][0].methods[0].fee_fixed).toBe('0.3')
  view.unmount()
})

test('channels saved before fees existed still open with zero fees', () => {
  const legacy = channel()
  const method = { ...legacy.methods[0] } as Record<string, unknown>
  delete method.fee_percent
  delete method.fee_fixed
  legacy.methods = [method as unknown as PaymentChannel['methods'][0]]
  const onSave = vi.fn()
  const view = render(
    <PaymentChannelEditor
      item={item(legacy)}
      saving={false}
      onClose={vi.fn()}
      onSave={onSave}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: 'Save payment channel' }))
  expect(onSave.mock.calls[0][0].methods[0].fee_percent).toBe('0')
  expect(onSave.mock.calls[0][0].methods[0].fee_fixed).toBe('0')
  view.unmount()
})
