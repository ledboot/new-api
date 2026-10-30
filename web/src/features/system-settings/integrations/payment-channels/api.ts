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
import { api } from '@/lib/api'
import { requireServerSuccess } from '@/lib/server-error-message'

import type { ChannelListItem, PaymentChannel } from './types'

export async function listPaymentChannels(): Promise<ChannelListItem[]> {
  const response = await api.get('/api/option/payment_channels')
  return requireServerSuccess(response.data).data
}

export async function savePaymentChannel(
  channel: PaymentChannel
): Promise<PaymentChannel> {
  const response = await api.post('/api/option/payment_channels', channel)
  return requireServerSuccess(response.data).data
}

export async function deletePaymentChannel(id: number): Promise<void> {
  const response = await api.delete(`/api/option/payment_channels/${id}`)
  requireServerSuccess(response.data)
}
