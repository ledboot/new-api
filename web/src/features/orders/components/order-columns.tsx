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
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatNumber } from '@/lib/format'

import { formatTimestamp, getPaymentMethodName, getStatusConfig } from '../lib/order-status'
import { isAdminGrant, type OrderRecord } from '../types'

export function useOrderColumns(
  isAdminView: boolean,
  actions?: { completing: boolean; onComplete: (tradeNo: string) => void }
): ColumnDef<OrderRecord>[] {
  const { t } = useTranslation()

  return useMemo(() => {
    const columns: ColumnDef<OrderRecord>[] = [
      {
        accessorKey: 'create_time',
        header: t('Time'),
        size: 170,
        cell: ({ row }) => (
          <span className='font-mono text-[13px] tabular-nums'>
            {formatTimestamp(row.original.create_time)}
          </span>
        ),
        meta: { label: t('Time'), mobileTitle: true },
      },
      {
        accessorKey: 'trade_no',
        header: t('Order Number'),
        size: 240,
        cell: ({ row }) => (
          <div className='flex min-w-0 items-center gap-1'>
            <code className='truncate font-mono text-[13px]'>
              {row.original.trade_no}
            </code>
            <CopyButton value={row.original.trade_no} />
          </div>
        ),
        meta: { label: t('Order Number') },
      },
    ]

    if (isAdminView) {
      columns.push({
        accessorKey: 'user_id',
        header: t('User ID'),
        size: 90,
        cell: ({ row }) => (
          <span className='tabular-nums'>{row.original.user_id}</span>
        ),
        meta: { label: t('User ID') },
      })
    }

    columns.push(
      {
        id: 'payment_method',
        header: t('Payment Method'),
        size: 140,
        accessorFn: (record) =>
          record.payment_name ||
          getPaymentMethodName(record.payment_method, t),
        meta: { label: t('Payment Method') },
      },
      {
        id: 'amount',
        header: t('Amount'),
        size: 130,
        // Administrative grants credit quota directly and take no payment, so
        // they show the granted quota instead of a USD amount.
        accessorFn: (record) =>
          isAdminGrant(record)
            ? formatNumber(record.amount)
            : formatNumber(Number(record.wallet_amount ?? record.amount)),
        meta: { label: t('Amount') },
      },
      {
        id: 'paid',
        header: t('Payment'),
        size: 120,
        accessorFn: (record) => (isAdminGrant(record) ? '-' : record.money),
        cell: ({ row }) => {
          const record = row.original
          if (isAdminGrant(record)) {
            return <span className='text-muted-foreground'>-</span>
          }
          let currency = ''
          if (record.payment_currency) {
            currency = ` ${record.payment_currency}`
          } else if (record.payment_provider === 'bepusdt') {
            currency = ' USD'
          }
          return (
            <span className='tabular-nums'>
              {formatNumber(record.money)}
              {currency}
            </span>
          )
        },
        meta: { label: t('Payment') },
      },
      {
        accessorKey: 'status',
        header: t('Status'),
        size: 110,
        cell: ({ row }) => {
          const config = getStatusConfig(row.original.status)
          return (
            <StatusBadge
              label={t(config.label)}
              variant={config.variant}
              showDot
              copyable={false}
            />
          )
        },
        meta: { label: t('Status') },
      },
    )

    if (isAdminView && actions) {
      columns.push({
        id: 'actions',
        header: '',
        size: 130,
        cell: ({ row }) => {
          const record = row.original
          if (record.status !== 'pending' || isAdminGrant(record)) {
            return null
          }
          return (
            <Button
              size='sm'
              variant='outline'
              disabled={actions.completing}
              onClick={() => actions.onComplete(record.trade_no)}
            >
              {t('Complete Order')}
            </Button>
          )
        },
        meta: { label: t('Actions') },
      })
    }

    return columns
  }, [actions, isAdminView, t])
}
