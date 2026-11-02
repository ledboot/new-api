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
import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'

import type { ChannelPaymentQuote } from '../../../api'
import type { PaymentMethod } from '../../../types'
import { PaymentConfirmDialog } from '../payment-confirm-dialog'

const channelMethod: PaymentMethod = {
  name: 'Alipay',
  type: 'channel:3:alipay',
  currency: 'CNY',
}

const cnyQuote: ChannelPaymentQuote = {
  payment_method: 'channel:3:alipay',
  amount: 5,
  currency: 'CNY',
  fx_rate: '6.670000',
  subtotal: '33.35',
  fee_percent: 1.5,
  fee_fixed: '0.00',
  fee_amount: '0.50',
  total: '33.85',
  quota: 2500000,
}

function renderDialog(props: {
  paymentMethod: PaymentMethod
  channelQuote: ChannelPaymentQuote | null
  calculating?: boolean
}) {
  return render(
    <PaymentConfirmDialog
      open
      onOpenChange={vi.fn()}
      onConfirm={vi.fn()}
      topupAmount={5}
      paymentAmount={33.85}
      paymentMethod={props.paymentMethod}
      calculating={props.calculating ?? false}
      processing={false}
      channelQuote={props.channelQuote}
    />
  )
}

test('a CNY channel payment shows the exchange rate, subtotal and fee that make up the total', () => {
  renderDialog({ paymentMethod: channelMethod, channelQuote: cnyQuote })

  expect(screen.getByText('Exchange rate')).toBeVisible()
  expect(screen.getByText('1 USD = 6.67 CNY')).toBeVisible()
  expect(screen.getByText('Subtotal')).toBeVisible()
  expect(screen.getByText('33.35 CNY')).toBeVisible()
  expect(screen.getByText('Payment fee (1.5%)')).toBeVisible()
  expect(screen.getByText('0.50 CNY')).toBeVisible()
})

test('a USD channel payment does not show the CNY rate and fee breakdown', () => {
  renderDialog({
    paymentMethod: { ...channelMethod, currency: 'USD' },
    channelQuote: { ...cnyQuote, currency: 'USD' },
  })

  expect(screen.queryByText('Exchange rate')).not.toBeInTheDocument()
  expect(screen.queryByText('Payment fee (1.5%)')).not.toBeInTheDocument()
})

test('a quote for a different payment method is not shown as this payment breakdown', () => {
  renderDialog({
    paymentMethod: { ...channelMethod, type: 'channel:3:wxpay' },
    channelQuote: cnyQuote,
  })

  expect(screen.queryByText('Exchange rate')).not.toBeInTheDocument()
})
