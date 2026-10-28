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
import type { ColumnDef } from '@tanstack/react-table'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  DataTableView,
  DataTablePagination,
  useDataTable,
} from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { formatPricingAmount } from '@/features/model-pricing/currency'
import {
  formatOpenLuxTierRange,
  parseTiersFromExpr,
} from '@/features/pricing/lib/billing-expr'
import { getDynamicPriceEntries } from '@/features/pricing/lib/dynamic-price'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getPublishedOpenLuxPrices } from '../api'
import { formatPricingNumber } from './pricing-format'

type PriceLine = {
  id: string
  range: string
  item: string
  unit: string
  cost?: number
  base?: number
  final?: number
}

type PriceRow = {
  id: string
  group: string
  model: string
  ratio: number
  markup: number
  sortPrice: number
  upstreamRatio?: number
  lines: PriceLine[]
}

function PriceLines(props: {
  lines: PriceLine[]
  field: 'range' | 'item' | 'unit' | 'cost' | 'base' | 'final'
}) {
  return (
    <div className='grid gap-1'>
      {props.lines.map((line) => {
        const value = line[props.field]
        let text = value ?? '—'
        if (typeof value === 'number') {
          const amount =
            props.field === 'final' ? Number(value.toFixed(4)) : value
          text = formatPricingAmount(amount)
        }
        return (
          <div key={line.id} className='h-6 whitespace-nowrap leading-6'>
            {text}
          </div>
        )
      })}
    </div>
  )
}

export function OpenLuxPublishedPrices() {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [group, setGroup] = useState('')
  const query = useQuery({
    queryKey: ['openlux-published-prices'],
    queryFn: async () =>
      requireServerSuccess(await getPublishedOpenLuxPrices()).data,
    staleTime: 0,
  })
  const options = useMemo(
    () => [
      { value: '', label: t('All groups') },
      ...Object.keys(query.data?.sales ?? {})
        .sort()
        .map((value) => ({ value, label: value })),
    ],
    [query.data, t]
  )
  const rows = useMemo(() => {
    const result: PriceRow[] = []
    for (const [name, sale] of Object.entries(query.data?.sales ?? {})) {
      if (group && group !== name) continue
      const ratio = query.data?.group_ratios[name] ?? 1
      for (const [model, price] of Object.entries(sale.models)) {
        if (!`${model} ${name}`.toLowerCase().includes(search.toLowerCase())) {
          continue
        }
        const tiers = parseTiersFromExpr(price.expression)
        const costs = parseTiersFromExpr(price.cost)
        const effective = parseTiersFromExpr(
          query.data?.effective_prices?.[name]?.[model] ?? ''
        )
        const lines: PriceLine[] = []
        const row: PriceRow = {
          id: JSON.stringify([name, model]),
          group: name,
          model,
          ratio,
          markup: sale.multiplier,
          sortPrice: Infinity,
          lines,
        }
        if (!tiers.length) {
          lines.push({
            id: 'raw',
            range: t('Special billing expression'),
            item: t('Special billing expression'),
            unit: '',
          })
        }
        tiers.forEach((tier, index) => {
          const entries = getDynamicPriceEntries(tier, { tokenUnit: 'M' })
          const source = getDynamicPriceEntries(costs[index] ?? null, {
            tokenUnit: 'M',
          })
          const input = entries.find(
            (entry) => entry.key === 'p' || entry.key === 'fixed'
          )
          const effectiveEntries = getDynamicPriceEntries(
            effective[index] ?? null,
            { tokenUnit: 'M' }
          )
          const effectiveInput = effectiveEntries.find(
            (entry) => entry.key === input?.key
          )
          if (effectiveInput) {
            row.sortPrice = Math.min(row.sortPrice, effectiveInput.value)
          }
          const range =
            formatOpenLuxTierRange(
              tier,
              tiers,
              t('No range limit'),
              price.input_token_limit
            ) ??
            tier.conditionText ??
            t('No range limit')
          entries.forEach((entry, entryIndex) => {
            let unit = t('Per 1M tokens')
            if (entry.unit === 'image') unit = t('Per image')
            if (entry.unit === 'request') unit = t('Per request')
            const final = effectiveEntries.find(
              (item) => item.key === entry.key
            )?.value
            lines.push({
              id: `${index}:${entry.key}`,
              range: entryIndex === 0 ? range : '',
              item: t(entry.shortLabel),
              unit,
              cost: source.find((item) => item.key === entry.key)?.value,
              base: entry.value,
              final:
                final !== undefined && Number.isFinite(final) && final >= 0
                  ? final
                  : undefined,
            })
          })
        })
        if (sale.normalized_prices) {
          // Cost includes the source group ratio; normalized model prices include markup.
          const candidates = lines.flatMap((line) => {
            if (
              line.base === undefined ||
              line.base <= 0 ||
              line.cost === undefined
            ) {
              return []
            }
            return [(line.cost / line.base) * sale.multiplier]
          })
          const first = candidates[0]
          if (
            first !== undefined &&
            Number.isFinite(first) &&
            first >= 0 &&
            candidates.every(
              (value) => Math.abs(value - first) <= 1e-9 * Math.max(1, first)
            )
          ) {
            row.upstreamRatio = first
          }
        }
        result.push(row)
      }
    }
    return result.sort(
      (a, b) =>
        a.sortPrice - b.sortPrice ||
        a.model.localeCompare(b.model) ||
        a.group.localeCompare(b.group)
    )
  }, [query.data, group, search, t])
  const columns = useMemo<ColumnDef<PriceRow>[]>(
    () => [
      { accessorKey: 'group', header: t('Group') },
      { accessorKey: 'model', header: t('Model') },
      {
        id: 'range',
        header: t('Input token count'),
        cell: ({ row }) => (
          <PriceLines lines={row.original.lines} field='range' />
        ),
      },
      {
        id: 'item',
        header: t('Billing item'),
        cell: ({ row }) => (
          <PriceLines lines={row.original.lines} field='item' />
        ),
      },
      {
        id: 'unit',
        header: t('Unit'),
        cell: ({ row }) => (
          <PriceLines lines={row.original.lines} field='unit' />
        ),
      },
      {
        id: 'cost',
        header: t('Upstream cost'),
        cell: ({ row }) => (
          <PriceLines lines={row.original.lines} field='cost' />
        ),
      },
      {
        id: 'final',
        header: t('Effective billing unit price'),
        cell: ({ row }) => (
          <div className='font-semibold'>
            <PriceLines lines={row.original.lines} field='final' />
          </div>
        ),
      },
      {
        id: 'base',
        header: t('Saved model unit price before group multiplier'),
        cell: ({ row }) => (
          <PriceLines lines={row.original.lines} field='base' />
        ),
      },
      {
        id: 'markup',
        header: t('Selling price multiplier'),
        cell: ({ row }) => formatPricingNumber(row.original.markup),
      },
      {
        id: 'upstreamRatio',
        header: t('Upstream group ratio'),
        cell: ({ row }) =>
          row.original.upstreamRatio === undefined
            ? '—'
            : formatPricingNumber(row.original.upstreamRatio),
      },
      {
        id: 'ratio',
        header: t('Group ratio'),
        cell: ({ row }) =>
          formatPricingNumber(Number(row.original.ratio.toFixed(4))),
      },
    ],
    [t]
  )
  const { table } = useDataTable({
    data: rows,
    columns,
    getRowId: (row) => row.id,
    initialPagination: { pageIndex: 0, pageSize: 20 },
    withFacetedRowModel: false,
    enableSorting: false,
  })
  if (query.isPending) return <LoadingState />
  if (query.isError) {
    return (
      <ErrorState
        description={query.error.message}
        onRetry={() => void query.refetch()}
      />
    )
  }
  return (
    <section className='flex min-h-0 flex-1 flex-col gap-3'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Read locally published prices without contacting OpenLux. Saved model prices already include the selling multiplier; effective prices apply the current group multiplier once. User-specific multipliers and request surcharges are separate.'
        )}{' '}
        {t(
          'OpenLux selling unit prices and group multipliers round up to 4 decimal places.'
        )}
      </p>
      <div className='flex flex-wrap items-center gap-2'>
        <Input
          className='w-64'
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t('Search models')}
          placeholder={t('Search models')}
        />
        <Combobox
          className='w-56'
          options={options}
          value={group}
          onValueChange={(value) => setGroup(value ?? '')}
          aria-label={t('Filter by group')}
        />
        <Button
          variant='outline'
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          {t('Refresh')}
        </Button>
      </div>
      {!Object.keys(query.data?.sales ?? {}).length ? (
        <EmptyState title={t('No published OpenLux prices')} />
      ) : (
        <>
          <DataTableView
            table={table}
            containerProps={{
              role: 'region',
              'aria-label': t('Published OpenLux prices'),
            }}
            splitHeader
            containerClassName='min-h-0 flex-1 rounded-md'
            tableHeaderClassName='[&_tr]:border-b-0'
            getColumnClassName={(_columnId, kind) =>
              kind === 'cell' ? 'align-top' : undefined
            }
          />
          <div className='shrink-0'>
            <DataTablePagination table={table} />
          </div>
        </>
      )}
    </section>
  )
}
