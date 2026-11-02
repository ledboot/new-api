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

export type FxQuote = {
  source: string
  rate: number
  published_at: number
  error?: string
}

export type FxSnapshot = {
  rate: number
  raw_rate: number
  currency: string
  source: string
  markup_percent: number
  updated_at: number
  stale: boolean
  pending_rate?: number
  last_error?: string
  quotes: FxQuote[] | null
}

export type FxConfig = {
  enabled: boolean
  quote_currency: string
  markup_percent: number
  refresh_minutes: number
  max_deviation_percent: number
  max_move_percent: number
  manual_rate: number
  fallback_rate: number
  source_ecb_enabled: boolean
  source_ecb_url: string
  source_erapi_enabled: boolean
  source_erapi_url: string
  source_fawazahmed_enabled: boolean
  source_fawazahmed_url: string
  source_exchangeratefun_enabled: boolean
  source_exchangeratefun_url: string
}

export type FxStatus = { snapshot: FxSnapshot; config: FxConfig }

export async function getFxStatus(): Promise<FxStatus> {
  const res = await api.get<{ success: boolean; data: FxStatus }>(
    '/api/option/fx/status'
  )
  return res.data.data
}

export async function refreshFxRate(): Promise<FxSnapshot> {
  const res = await api.post<{
    success: boolean
    data: { snapshot: FxSnapshot }
  }>('/api/option/fx/refresh')
  return res.data.data.snapshot
}

export async function saveFxOption(
  key: string,
  value: string | number | boolean
) {
  const res = await api.put('/api/option/', { key, value })
  return res.data
}
