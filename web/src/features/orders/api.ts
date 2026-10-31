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

import type { CompleteOrderRequest, OrderListResponse } from './types'

export interface ApiEnvelope<T = unknown> {
  success?: boolean
  message?: string
  data?: T
}

function buildQuery(page: number, pageSize: number, keyword?: string): string {
  const params = new URLSearchParams({
    p: page.toString(),
    page_size: pageSize.toString(),
  })
  if (keyword) {
    params.append('keyword', keyword)
  }
  return params.toString()
}

/**
 * Orders for the signed-in user. Administrative grants are excluded by the
 * backend: this list only shows orders the user actually paid for.
 */
export async function getUserOrders(
  page: number,
  pageSize: number,
  keyword?: string
): Promise<ApiEnvelope<OrderListResponse>> {
  const res = await api.get(`/api/user/topup/self?${buildQuery(page, pageSize, keyword)}`)
  return res.data
}

/**
 * Every user's orders, including administrative grants (admin only).
 */
export async function getAllOrders(
  page: number,
  pageSize: number,
  keyword?: string
): Promise<ApiEnvelope<OrderListResponse>> {
  const res = await api.get(`/api/user/topup?${buildQuery(page, pageSize, keyword)}`)
  return res.data
}

/**
 * Manually complete a pending order (admin only).
 */
export async function completeOrder(
  request: CompleteOrderRequest
): Promise<ApiEnvelope> {
  const res = await api.post('/api/user/topup/complete', request)
  return res.data
}
