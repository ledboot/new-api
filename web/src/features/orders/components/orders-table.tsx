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
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { DataTablePage, useDataTable } from '@/components/data-table'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { isApiSuccess } from '@/lib/api'
import { handleServerError } from '@/lib/handle-server-error'
import { useDebounce } from '@/hooks/use-debounce'
import { useAuthStore } from '@/stores/auth-store'
import { ROLE } from '@/lib/roles'

import { completeOrder, getAllOrders, getUserOrders } from '../api'
import type { OrderRecord } from '../types'
import { useOrderColumns } from './order-columns'

const EMPTY_ORDERS: OrderRecord[] = []

export function OrdersTable() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const userId = useAuthStore((state) => state.auth.user?.id)
  const role = useAuthStore((state) => state.auth.user?.role)
  const isAdminView = typeof role === 'number' && role >= ROLE.ADMIN

  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const debouncedKeyword = useDebounce(keyword)
  const [completing, setCompleting] = useState(false)

  const query = useQuery({
    queryKey: ['orders', userId, isAdminView, page, pageSize, debouncedKeyword],
    queryFn: async () =>
      isAdminView
        ? await getAllOrders(page, pageSize, debouncedKeyword)
        : await getUserOrders(page, pageSize, debouncedKeyword),
    placeholderData: keepPreviousData,
    retry: false,
  })

  // Reset to the first page whenever the search term settles.
  useEffect(() => {
    setPage(1)
  }, [debouncedKeyword])

  const records = query.data?.data?.items ?? EMPTY_ORDERS
  const total = query.data?.data?.total ?? 0

  const handleComplete = useCallback(
    async (tradeNo: string) => {
      setCompleting(true)
      try {
        const response = await completeOrder({ trade_no: tradeNo })
        if (isApiSuccess(response)) {
          toast.success(t('Order completed successfully'))
          await queryClient.invalidateQueries({ queryKey: ['orders'] })
        } else {
          handleServerError(response, t('Failed to complete order'))
        }
      } catch (error) {
        handleServerError(error, t('Failed to complete order'))
      } finally {
        setCompleting(false)
      }
    },
    [queryClient, t]
  )

  const columns = useOrderColumns(
    isAdminView,
    isAdminView
      ? { completing, onComplete: (tradeNo) => void handleComplete(tradeNo) }
      : undefined
  )
  const { table } = useDataTable({
    columns,
    data: query.isError ? EMPTY_ORDERS : records,
    getRowId: (record) => String(record.id),
    totalCount: query.isError ? 0 : total,
    pagination: { pageIndex: page - 1, pageSize },
    onPaginationChange: (updater) => {
      if (query.isFetching) return
      const current = { pageIndex: page - 1, pageSize }
      const next = typeof updater === 'function' ? updater(current) : updater
      if (next.pageSize !== current.pageSize) {
        setPageSize(next.pageSize)
        setPage(1)
        return
      }
      setPage(next.pageIndex + 1)
    },
    enableRowSelection: false,
    enableSorting: false,
    manualFiltering: true,
    manualPagination: true,
  })

  return (
    <div className='flex h-full min-h-0 flex-col'>
      <DataTablePage
        table={table}
        columns={columns}
        isLoading={query.isPending}
        isFetching={query.isFetching}
        emptyTitle={query.isError ? t('Failed to load orders') : t('No orders')}
        emptyDescription={
          query.isError
            ? t('Retry later')
            : t('Your top-up orders will appear here')
        }
        paginationInFooter
        className='h-auto min-h-0 flex-1'
        applyHeaderSize
        getColumnClassName={() => 'py-2'}
        toolbar={
          <div className='shrink-0 space-y-2'>
            <div className='flex flex-wrap items-center gap-2'>
              <div className='relative min-w-0 flex-1'>
                <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
                <Input
                  placeholder={t('Search by order number...')}
                  value={keyword}
                  onChange={(event) => setKeyword(event.target.value)}
                  className='h-9 pl-10'
                />
              </div>
            </div>
            {query.isError && (
              <Alert variant='destructive'>
                <AlertDescription className='flex items-center justify-between gap-2'>
                  <span>{t('Failed to load orders')}</span>
                  <Button
                    size='sm'
                    variant='outline'
                    onClick={() => void query.refetch()}
                  >
                    {t('Retry')}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </div>
        }
      />
    </div>
  )
}
