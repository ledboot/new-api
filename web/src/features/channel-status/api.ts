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

type ChannelStatusRaw = {
  name: string
  status: string
  uptime: number
  has_samples: boolean
  slots: string
  oldest_slot: number
}

export type ChannelStatusSlot = { id: number; state: string }

export async function listChannelStatus() {
  const response = await api.get<{
    success: boolean
    message?: string
    data: ChannelStatusRaw[]
  }>('/api/channel_status')
  return (response.data.data ?? []).map((item) => ({
    ...item,
    slots: [...item.slots].map((state, id) => ({ id, state })),
  }))
}

export type ChannelStatusView = Awaited<
  ReturnType<typeof listChannelStatus>
>[number]
