import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useEffect, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { ConfirmDialog } from '@/components/confirm-dialog'
import {
  StaticDataTable,
  DataTableView,
  DataTablePagination,
  useDataTable,
} from '@/components/data-table'
import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { PasswordInput } from '@/components/password-input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'
import { handleServerError } from '@/lib/handle-server-error'
import {
  getServerErrorSources,
  requireServerSuccess,
} from '@/lib/server-error-message'

import {
  getOpenLuxCatalog,
  previewOpenLuxSales,
  publishOpenLuxSales,
} from '../api'
import type { OpenLuxSalesPreview, OpenLuxSalesRequest } from '../types'
import { SyncPriceCell } from './upstream-price-cells'

const saleSchema = z.object({
  ratio_unit: z.number().finite().positive(),
  multiplier: z.number().finite().min(1).max(1000),
  groups: z.array(z.string()).min(1).max(100),
  keys: z.record(z.string(), z.string().max(8192)),
  group_ratios: z.record(z.string(), z.number().finite().nonnegative()),
  topup_ratios: z.record(z.string(), z.number().finite().nonnegative()),
  confirmed: z.boolean().refine(Boolean),
})

export function OpenLuxSalesDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const queryClient = useQueryClient()
  const form = useForm<z.infer<typeof saleSchema>>({
    resolver: zodResolver(saleSchema),
    mode: 'onChange',
    defaultValues: {
      ratio_unit: 2,
      multiplier: 1.2,
      groups: [],
      keys: {},
      group_ratios: {},
      topup_ratios: {},
      confirmed: false,
    },
  })
  const [
    unit,
    multiplier,
    selected,
    keys,
    confirmed,
    groupRatios,
    topupRatios,
  ] = useWatch({
    control: form.control,
    name: [
      'ratio_unit',
      'multiplier',
      'groups',
      'keys',
      'confirmed',
      'group_ratios',
      'topup_ratios',
    ],
  })
  const [search, setSearch] = useState('')
  const [bulkFactor, setBulkFactor] = useState('1')
  const [preview, setPreview] = useState<OpenLuxSalesPreview | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const catalog = useQuery({
    queryKey: ['openlux-catalog'],
    queryFn: async () => requireServerSuccess(await getOpenLuxCatalog()).data,
    enabled: props.open,
    staleTime: 0,
    retry: false,
  })
  const handleSourceError = (error: unknown) => {
    setPreview(null)
    setConfirmOpen(false)
    handleServerError(error)
    if (
      getServerErrorSources(error).some(
        (source) =>
          source.message_key ===
            'OpenLux prices changed; reload the source before previewing' ||
          source.message ===
            'OpenLux prices changed; reload the source before previewing'
      )
    ) {
      void catalog.refetch()
    }
  }
  const load = useMutation({
    gcTime: 0,
    mutationFn: async (request: OpenLuxSalesRequest) =>
      requireServerSuccess(await previewOpenLuxSales(request)).data,
    onMutate: () => setPreview(null),
    onSuccess: setPreview,
    onError: handleSourceError,
  })
  const publish = useMutation({
    gcTime: 0,
    mutationFn: async (request: OpenLuxSalesRequest) =>
      requireServerSuccess(await publishOpenLuxSales(request)).data,
    onSuccess: () => {
      toast.success(t('OpenLux sales published'))
      void queryClient.invalidateQueries()
      close()
    },
    onError: handleSourceError,
  })
  const busy = load.isPending || publish.isPending
  const groups = useMemo(
    () =>
      Object.entries(catalog.data?.groups ?? {})
        .map(([group, label]) => ({
          group,
          label,
          count: (catalog.data?.catalog?.data ?? []).filter(
            (model) =>
              model.enable_groups?.includes(group) &&
              catalog.data?.import_support?.[model.model_name] === ''
          ).length,
        }))
        .sort((a, b) => a.group.localeCompare(b.group)),
    [catalog.data]
  )
  const bulkValue = Number(bulkFactor)
  const canApplyBulk =
    !busy &&
    !catalog.isFetching &&
    Boolean(selected?.length) &&
    bulkFactor.trim() !== '' &&
    Number.isFinite(bulkValue) &&
    bulkValue >= 0 &&
    selected?.every((group) => {
      const ratio = catalog.data?.ratios[group]
      return (
        ratio !== undefined && ratio >= 0 && Number.isFinite(ratio * bulkValue)
      )
    })
  const filtered = groups.filter((row) =>
    `${row.group} ${row.label}`.toLowerCase().includes(search.toLowerCase())
  )
  const valid =
    saleSchema.safeParse({
      ratio_unit: unit,
      multiplier,
      groups: selected,
      keys,
      confirmed,
      group_ratios: groupRatios,
      topup_ratios: topupRatios,
    }).success &&
    selected?.every(
      (group) =>
        keys?.[group]?.trim() || catalog.data?.sales?.[group]?.channel_id
    )
  useEffect(() => {
    setPreview(null)
    setConfirmOpen(false)
  }, [
    unit,
    multiplier,
    selected,
    keys,
    confirmed,
    groupRatios,
    topupRatios,
    catalog.data,
  ])
  const close = () => {
    form.reset()
    setSearch('')
    setBulkFactor('1')
    setPreview(null)
    setConfirmOpen(false)
    load.reset()
    publish.reset()
    props.onOpenChange(false)
  }
  const request: OpenLuxSalesRequest = {
    version: catalog.data?.version ?? '',
    ratio_unit: Number(unit),
    groups: (selected ?? []).map((group) => ({
      group,
      multiplier: Number(multiplier),
      api_key: keys?.[group] ?? '',
      group_ratio:
        groupRatios?.[group] ??
        catalog.data?.local_group_ratios?.[group] ??
        catalog.data?.ratios[group],
      topup_ratio:
        topupRatios?.[group] ?? catalog.data?.topup_group_ratios?.[group] ?? 1,
    })),
    key_group_confirmed: Boolean(confirmed),
    preview_version: preview?.preview_version,
  }
  const prices = useMemo(
    () =>
      preview?.plan.groups.flatMap((group) =>
        Object.entries(group.models).map(([model, price]) => ({
          group: group.group,
          model,
          ...price,
          selling: group.selling_prices?.[model] ?? price.expression,
        }))
      ) ?? [],
    [preview]
  )
  const priceColumns = useMemo<ColumnDef<(typeof prices)[number]>[]>(
    () => [
      { accessorKey: 'group', header: t('Group') },
      { accessorKey: 'model', header: t('Model') },
      {
        id: 'cost',
        header: t('Upstream cost'),
        cell: ({ row }) => (
          <SyncPriceCell
            values={{
              billing_mode: 'tiered_expr',
              billing_expr: row.original.cost,
            }}
          />
        ),
      },
      {
        id: 'sale',
        header: t('Selling price'),
        cell: ({ row }) => (
          <SyncPriceCell
            values={{
              billing_mode: 'tiered_expr',
              billing_expr: row.original.selling,
            }}
          />
        ),
      },
    ],
    [t]
  )
  const { table: priceTable } = useDataTable({
    data: prices,
    columns: priceColumns,
    initialPagination: { pageIndex: 0, pageSize: 10 },
    getRowId: (row) => `${row.group}:${row.model}`,
    withFacetedRowModel: false,
    enableSorting: false,
  })
  const excluded =
    preview?.plan.groups.flatMap((group) =>
      Object.entries(group.excluded).map(([model, reason]) => ({
        group: group.group,
        model,
        reason,
      }))
    ) ?? []
  return (
    <Dialog
      open={props.open}
      onOpenChange={(open) => {
        if (!open && !busy) close()
      }}
      title={t('OpenLux resale')}
      description={t(
        'Select upstream groups, enter fixed-group keys, set a markup, and publish local groups, channels, models, and prices together.'
      )}
      contentClassName='sm:max-w-6xl'
      contentHeight='min(72vh, 850px)'
      showCloseButton={!busy}
      footer={
        <>
          <Button variant='outline' disabled={busy} onClick={close}>
            {t('Cancel')}
          </Button>
          <Button
            variant='outline'
            disabled={busy || catalog.isFetching}
            onClick={() => {
              setPreview(null)
              setConfirmOpen(false)
              void catalog.refetch()
            }}
          >
            {t('Refresh source data')}
          </Button>
          <Button
            variant='outline'
            disabled={!valid || busy || catalog.isFetching}
            onClick={() => load.mutate(request)}
          >
            {t('Preview prices')}
          </Button>
          <Button
            disabled={!preview || busy || catalog.isFetching}
            onClick={() => setConfirmOpen(true)}
          >
            {t('Publish sales')}
          </Button>
        </>
      }
    >
      <div className='space-y-4'>
        {catalog.isPending && <LoadingState />}
        {catalog.isError && (
          <ErrorState
            description={catalog.error.message}
            action={
              <Button onClick={() => void catalog.refetch()}>
                {t('Retry')}
              </Button>
            }
          />
        )}
        <p className='text-muted-foreground text-sm'>
          {t(
            'Selling price = model base price × markup × local group multiplier. Missing local multipliers default to upstream rates. Top-up multipliers apply to account groups; existing values are preserved and new values default to 1.'
          )}
        </p>
        {!catalog.data?.account_rates && (
          <p className='text-muted-foreground text-sm'>
            {t(
              'Using public rates. Verify your account pricing before publishing.'
            )}
          </p>
        )}
        <div className='grid gap-3 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='openlux-sales-unit'>
              {t('USD per 1M tokens at ratio 1')}
            </Label>
            <Input
              id='openlux-sales-unit'
              type='number'
              disabled={busy}
              {...form.register('ratio_unit', { valueAsNumber: true })}
            />
          </div>
          <div className='space-y-2'>
            <Label htmlFor='openlux-sales-markup'>
              {t('Selling price multiplier')}
            </Label>
            <Input
              id='openlux-sales-markup'
              type='number'
              min={1}
              max={1000}
              step='any'
              disabled={busy}
              {...form.register('multiplier', { valueAsNumber: true })}
            />
          </div>
        </div>
        <FieldGroup className='rounded-lg border p-3'>
          <Field>
            <FieldLabel htmlFor='openlux-bulk-factor'>
              {t('OpenLux original multiplier × factor')}
            </FieldLabel>
            <div className='flex flex-wrap items-center gap-2'>
              <Input
                id='openlux-bulk-factor'
                aria-label={t('OpenLux multiplier factor')}
                type='number'
                min={0}
                step='any'
                className='w-36'
                disabled={busy}
                value={bulkFactor}
                onChange={(event) => setBulkFactor(event.target.value)}
              />
              <Button
                variant='outline'
                disabled={!canApplyBulk}
                onClick={() => {
                  const next = { ...groupRatios }
                  for (const group of selected ?? []) {
                    const source = catalog.data?.ratios[group]
                    if (source === undefined) return
                    next[group] = source * bulkValue
                  }
                  form.setValue('group_ratios', next, { shouldValidate: true })
                  form.setValue('confirmed', false)
                  setPreview(null)
                  setConfirmOpen(false)
                }}
              >
                {t('Apply to selected groups')}
              </Button>
            </div>
            <FieldDescription>
              {t(
                'Preserves upstream price differences. Applies only to selected groups; the selling price multiplier still applies.'
              )}
            </FieldDescription>
          </Field>
        </FieldGroup>
        <Input
          aria-label={t('Search upstream groups')}
          placeholder={t('Search upstream groups')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <StaticDataTable
          tableProps={{ 'aria-label': t('Groups to sell') }}
          className='max-h-80 overflow-auto'
          columns={[
            {
              id: 'selected',
              header: t('Select'),
              cell: (row: (typeof groups)[number]) => (
                <Checkbox
                  aria-label={t('Sell {{group}}', { group: row.group })}
                  disabled={busy || row.count === 0}
                  checked={selected?.includes(row.group) ?? false}
                  onCheckedChange={(checked) => {
                    form.setValue(
                      'groups',
                      checked
                        ? [...(selected ?? []), row.group]
                        : (selected ?? []).filter(
                            (group) => group !== row.group
                          ),
                      { shouldValidate: true }
                    )
                    if (!checked) {
                      const next = { ...keys }
                      delete next[row.group]
                      form.setValue('keys', next)
                      const nextGroups = { ...groupRatios }
                      const nextTopups = { ...topupRatios }
                      delete nextGroups[row.group]
                      delete nextTopups[row.group]
                      form.setValue('group_ratios', nextGroups)
                      form.setValue('topup_ratios', nextTopups)
                    }
                    form.setValue('confirmed', false)
                  }}
                />
              ),
            },
            { id: 'group', header: t('Group'), cell: (row) => row.group },
            {
              id: 'models',
              header: t('Supported models'),
              cell: (row) => formatNumber(row.count, locale),
            },
            {
              id: 'source-ratio',
              header: t('OpenLux group multiplier'),
              cell: (row) =>
                new Intl.NumberFormat(locale, {
                  maximumFractionDigits: 12,
                }).format(catalog.data?.ratios[row.group] ?? 0),
            },
            ...(['group', 'topup'] as const).map((kind) => ({
              id: `${kind}-ratio`,
              header:
                kind === 'group'
                  ? t('Local group multiplier')
                  : t('Top-up multiplier'),
              cell: (row: (typeof groups)[number]) => {
                const values = kind === 'group' ? groupRatios : topupRatios
                const saved =
                  kind === 'group'
                    ? (catalog.data?.local_group_ratios?.[row.group] ??
                      catalog.data?.ratios[row.group])
                    : (catalog.data?.topup_group_ratios?.[row.group] ?? 1)
                const value = values?.[row.group] ?? saved
                return (
                  <Input
                    aria-label={
                      kind === 'group'
                        ? t('Local group multiplier for {{group}}', {
                            group: row.group,
                          })
                        : t('Top-up multiplier for {{group}}', {
                            group: row.group,
                          })
                    }
                    type='number'
                    min={0}
                    step='any'
                    className='min-w-28'
                    disabled={busy || !selected?.includes(row.group)}
                    value={Number.isNaN(value) ? '' : (value ?? '')}
                    aria-invalid={
                      value !== undefined &&
                      (!Number.isFinite(value) || value < 0)
                    }
                    onChange={(event) => {
                      form.setValue(
                        kind === 'group' ? 'group_ratios' : 'topup_ratios',
                        {
                          ...values,
                          [row.group]:
                            event.target.value === ''
                              ? Number.NaN
                              : Number(event.target.value),
                        },
                        { shouldValidate: true }
                      )
                      form.setValue('confirmed', false)
                    }}
                  />
                )
              },
            })),
            {
              id: 'key',
              header: t('Upstream API key'),
              cell: (row) =>
                selected?.includes(row.group) ? (
                  <PasswordInput
                    aria-label={t('API key for {{group}}', {
                      group: row.group,
                    })}
                    autoComplete='off'
                    disabled={busy}
                    value={keys?.[row.group] ?? ''}
                    placeholder={
                      catalog.data?.sales?.[row.group]
                        ? t('Leave blank to keep the existing key')
                        : t('Upstream API key')
                    }
                    onChange={(event) => {
                      form.setValue(
                        'keys',
                        { ...keys, [row.group]: event.target.value },
                        { shouldValidate: true }
                      )
                      form.setValue('confirmed', false)
                    }}
                  />
                ) : (
                  '—'
                ),
            },
          ]}
          data={filtered}
          getRowKey={(row) => row.group}
          emptyContent={t('No results found')}
        />
        <Label className='flex items-start gap-2'>
          <Checkbox
            disabled={busy}
            checked={confirmed ?? false}
            onCheckedChange={(checked) =>
              form.setValue('confirmed', Boolean(checked), {
                shouldValidate: true,
              })
            }
          />
          {t(
            'Every supplied API key is fixed to its selected upstream group, and I have verified the price unit and account rates.'
          )}
        </Label>
        {preview && (
          <>
            <h3 className='font-medium'>{t('Sales preview')}</h3>
            <DataTableView
              table={priceTable}
              containerProps={{
                role: 'region',
                'aria-label': t('Sales preview'),
              }}
              tableContainerClassName='max-h-96 overflow-auto'
            />
            <DataTablePagination table={priceTable} compact />
            {excluded.length > 0 && (
              <StaticDataTable
                tableProps={{ 'aria-label': t('Excluded OpenLux models') }}
                columns={[
                  {
                    id: 'group',
                    header: t('Group'),
                    cell: (row: (typeof excluded)[number]) => row.group,
                  },
                  { id: 'model', header: t('Model'), cell: (row) => row.model },
                  {
                    id: 'reason',
                    header: t('Reason'),
                    cell: (row) => t(row.reason),
                  },
                ]}
                data={excluded}
                className='max-h-48 overflow-auto'
              />
            )}
          </>
        )}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={(open) => !busy && setConfirmOpen(open)}
          title={t('Publish sales')}
          desc={t(
            'Create or update the selected same-name groups and channels, import model metadata, and publish selling prices?'
          )}
          confirmText={t('Publish sales')}
          isLoading={publish.isPending}
          handleConfirm={() => publish.mutate(request)}
        />
      </div>
    </Dialog>
  )
}
