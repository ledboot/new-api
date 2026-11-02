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
import { useQuery } from '@tanstack/react-query'

import { getChannelPaymentQuote } from '../api'
import type { PaymentMethod } from '../types'

// useChannelQuote asks the server for the exact amount a channel method charges,
// so the wallet shows the rate and fee breakdown instead of guessing at them.
export function useChannelQuote(
  method: PaymentMethod | undefined,
  amount: number
) {
  const enabled = Boolean(method?.type?.startsWith('channel:')) && amount > 0
  return useQuery({
    queryKey: ['channel-quote', method?.type, amount],
    queryFn: () =>
      getChannelPaymentQuote({ amount, payment_method: method?.type ?? '' }),
    enabled,
    staleTime: 30_000,
    retry: false,
  })
}
