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
export type ChannelMethod = {
  id: string
  name: string
  type: string
  interaction: 'qr' | 'redirect'
  unit_price: string
  min_topup: number
  max_topup: number
  product_id: string
  credit_amount: string
  fee_percent: string
  fee_fixed: string
  enabled: boolean
}

export type PaymentChannel = {
  id: number
  name: string
  provider: '502' | 'epay' | 'bepusdt' | 'stripe' | 'creem'
  currency: 'CNY' | 'USD' | 'EUR'
  icon: string
  enabled: boolean
  sort_order: number
  version: number
  config: {
    gateway_url: string
    merchant_id: string
    api_key: string
    webhook_secret: string
    test_mode: boolean
  }
  methods: ChannelMethod[]
}

export type ChannelListItem = {
  channel: PaymentChannel
  api_key_configured: boolean
  webhook_secret_configured: boolean
  notify_url: string
}

export function createChannelMethod(
  provider: PaymentChannel['provider']
): ChannelMethod {
  const type = {
    '502': 'alipay',
    epay: 'alipay',
    bepusdt: 'usdt.trc20',
    stripe: 'card',
    creem: 'creem',
  }[provider]
  return {
    id: crypto.randomUUID(),
    name: '',
    type,
    interaction: 'redirect',
    unit_price: '1',
    min_topup: 1,
    max_topup: 0,
    product_id: '',
    credit_amount: '',
    fee_percent: '0',
    fee_fixed: '0',
    enabled: true,
  }
}

export function createPaymentChannel(): PaymentChannel {
  return {
    id: 0,
    name: '',
    provider: '502',
    currency: 'CNY',
    icon: '',
    enabled: true,
    sort_order: 10,
    version: 0,
    config: {
      gateway_url: 'https://pay.502k.cn/xpay/epay',
      merchant_id: '',
      api_key: '',
      webhook_secret: '',
      test_mode: false,
    },
    methods: [createChannelMethod('502')],
  }
}
