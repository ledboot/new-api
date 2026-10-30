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

export type OfficialPriceItem = {
  model_name: string
  quota_type: number
  input_price: number
  output_price: number
  request_price: number
  cache_read_price: number
  cache_write_price: number
  cache_write_1h_price: number
  source: 'default' | 'sync' | 'manual' | ''
  updated_time: number
}

export type OfficialPriceSyncState = {
  last_run_time: number
  updated: number
  matched: number
  skipped: number
  error: string
  source_url: string
  source_format: string
}

export type OfficialPriceOverview = {
  items: OfficialPriceItem[]
  state: OfficialPriceSyncState
  settings: {
    enabled: boolean
    interval_hours: number
    source_url: string
  }
}

export async function getOfficialPrices(): Promise<OfficialPriceOverview> {
  const res = await api.get<{ success: boolean; data: OfficialPriceOverview }>(
    '/api/option/official_prices'
  )
  return requireServerSuccess(res.data).data
}

export async function saveOfficialPrice(payload: {
  model_name: string
  input_price: number
  output_price: number
  request_price: number
  cache_read_price: number
  cache_write_price: number
  cache_write_1h_price: number
}) {
  const res = await api.put('/api/option/official_prices', payload)
  requireServerSuccess(res.data)
}

export async function resetOfficialPrice(modelName: string) {
  const res = await api.delete('/api/option/official_prices', {
    params: { model: modelName },
  })
  requireServerSuccess(res.data)
}

export async function syncOfficialPrices(): Promise<OfficialPriceSyncState> {
  const res = await api.post<{ success: boolean; data: OfficialPriceSyncState }>(
    '/api/option/official_prices/sync'
  )
  return requireServerSuccess(res.data).data
}
