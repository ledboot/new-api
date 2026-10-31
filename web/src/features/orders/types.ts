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
// ============================================================================
// Order (top-up) type definitions
// ============================================================================

export type OrderStatus = 'success' | 'pending' | 'failed' | 'expired'

/** Marks a balance increase an administrator made from the console. */
export const PAYMENT_METHOD_ADMIN_GRANT = 'admin_grant'

export interface OrderRecord {
  /** Wallet amount in USD (only some providers persist a snapshot). */
  wallet_amount?: string
  payment_currency?: string
  payment_name?: string
  id: number
  user_id: number
  /** Credited quota for administrative grants, otherwise the top-up amount. */
  amount: number
  /** Money actually paid. Zero for administrative grants. */
  money: number
  trade_no: string
  payment_method: string
  payment_provider?: string
  create_time: number
  complete_time?: number
  status: OrderStatus
}

export interface OrderListResponse {
  items: OrderRecord[]
  total: number
}

export interface CompleteOrderRequest {
  trade_no: string
}

/** Whether the record is a console-side grant rather than a real payment. */
export function isAdminGrant(record: OrderRecord): boolean {
  return record.payment_method === PAYMENT_METHOD_ADMIN_GRANT
}
