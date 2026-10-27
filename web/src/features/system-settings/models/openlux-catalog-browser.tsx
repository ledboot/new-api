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
import { lazy, Suspense, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Label } from '@/components/ui/label'
import { formatPricingAmount } from '@/features/model-pricing/currency'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber, formatTimestamp } from '@/lib/format'

import type { OpenLuxCatalog } from '../types'
import {
  getOpenLuxGroupPrices,
  openLuxPriceProduct,
  type OpenLuxGroupPriceRow,
} from './openlux-catalog-prices'

const CodeBlock = lazy(() =>
  import('@/components/ai-elements/code-block').then((module) => ({
    default: module.CodeBlock,
  }))
)

function OpenLuxPriceCell(props: { price: number | null; multiplier: number }) {
  const { t } = useTranslation()
  const sale = openLuxPriceProduct(props.price, props.multiplier)
  if (props.price === null) return <span>{t('Unavailable')}</span>
  return (
    <div className='space-y-1 whitespace-nowrap tabular-nums'>
      <div title={t('Upstream cost')}>{formatPricingAmount(props.price)}</div>
      <div className='text-muted-foreground text-xs' title={t('Selling price')}>
        {sale === null ? t('Unavailable') : formatPricingAmount(sale)}
      </div>
    </div>
  )
}

export function OpenLuxCatalogBrowser(props: {
  catalog: OpenLuxCatalog
  unit: number
  multiplier: number
}) {
  const { t, i18n } = useTranslation()
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  const [modelName, setModelName] = useState('')
  const [showGroups, setShowGroups] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const models = useMemo(
    () => props.catalog.catalog?.data ?? [],
    [props.catalog.catalog]
  )
  const model =
    models.find((item) => item.model_name === modelName) ?? models[0]
  const options = useMemo(
    () =>
      models.map((item) => ({
        value: item.model_name,
        label: item.model_name,
      })),
    [models]
  )
  const vendor = props.catalog.catalog?.vendors?.find(
    (item) => item.id === model?.vendor_id
  )
  const rows = useMemo(
    () =>
      model ? getOpenLuxGroupPrices(model, props.catalog, props.unit) : [],
    [model, props.catalog, props.unit]
  )
  const groups = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of models) {
      for (const group of new Set(item.enable_groups ?? [])) {
        counts.set(group, (counts.get(group) ?? 0) + 1)
      }
    }
    const names = new Set([
      ...Object.keys(props.catalog.catalog?.usable_group ?? {}),
      ...Object.keys(props.catalog.groups),
    ])
    return [...names].sort().map((group) => ({
      group,
      label:
        props.catalog.groups[group] ??
        props.catalog.catalog?.usable_group?.[group] ??
        group,
      ratio: Object.hasOwn(props.catalog.ratios, group)
        ? props.catalog.ratios[group]
        : null,
      available: Object.hasOwn(props.catalog.groups, group),
      count: counts.get(group) ?? 0,
    }))
  }, [models, props.catalog])
  const columns: StaticDataTableColumn<OpenLuxGroupPriceRow>[] = [
    {
      id: 'group',
      header: t('Group'),
      cell: (row) => (
        <div className='min-w-40'>
          <p>{row.label}</p>
          <p className='text-muted-foreground text-xs'>{row.group}</p>
          {!row.available && <p>{t('Unavailable')}</p>}
        </div>
      ),
    },
    {
      id: 'ratio',
      header: t('Group ratio'),
      cell: (row) => (row.ratio === null ? '—' : String(row.ratio)),
    },
    {
      id: 'uptime',
      header: t('Service availability'),
      cell: (row) =>
        row.uptime === null
          ? t('Not fetched')
          : `${formatNumber(row.uptime * 100, locale)}%`,
    },
    {
      id: 'input-range',
      header: t('Input token range'),
      cell: (row) =>
        `${row.inputStart === 0 ? '[' : '('}${formatNumber(row.inputStart, locale)}, ${row.inputEnd === null ? t('Unlimited') : formatNumber(row.inputEnd, locale)}]`,
    },
    {
      id: 'output-range',
      header: t('Output token limit'),
      cell: (row) =>
        row.outputEnd === null
          ? t('Unlimited')
          : formatNumber(row.outputEnd, locale),
    },
    ...(
      [
        ['input', 'Input price'],
        ['inputThinking', 'Thinking input price'],
        ['output', 'Output price'],
        ['outputThinking', 'Thinking output price'],
        ['cacheWrite', '5m cache write price'],
        ['cacheWrite1h', '1h cache write price'],
        ['cacheRead', 'Cache read price'],
        ...(model?.image_ratio != null
          ? [['imageInput', 'Image input price'] as const]
          : []),
        ...(model?.image_cache_ratio != null
          ? [['imageCache', 'Image cache price'] as const]
          : []),
      ] as const
    ).map(([field, label]) => ({
      id: field,
      header: t(label),
      cell: (row: OpenLuxGroupPriceRow) => (
        <OpenLuxPriceCell price={row[field]} multiplier={props.multiplier} />
      ),
    })),
  ]
  if (model?.quota_type === 1) {
    columns.splice(1)
    columns.push({
      id: 'per-image',
      header: t('Price per image'),
      cell: (row) => (
        <OpenLuxPriceCell price={row.perImage} multiplier={props.multiplier} />
      ),
    })
  }
  if (!model) return <EmptyState title={t('No results found')} />
  const raw = {
    model,
    vendor,
    supported_endpoint: props.catalog.catalog?.supported_endpoint,
    group_model_ratio: props.catalog.catalog?.group_model_ratio,
  }
  const unsupported = props.catalog.import_support?.[model.model_name]
  return (
    <section
      className='space-y-4 rounded-lg border p-3'
      aria-label={t('OpenLux source catalog')}
    >
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div>
          <h3 className='font-medium'>{t('OpenLux source catalog')}</h3>
          <p className='text-muted-foreground text-xs'>
            {t('{{models}} models · {{groups}} groups', {
              models: formatNumber(models.length, locale),
              groups: formatNumber(groups.length, locale),
            })}{' '}
            · {formatTimestamp(props.catalog.fetched_at)}
          </p>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Button
            variant='outline'
            size='sm'
            aria-expanded={showGroups}
            onClick={() => setShowGroups(!showGroups)}
          >
            {t('All upstream groups')}
          </Button>
          <CopyButton
            variant='outline'
            size='sm'
            value={JSON.stringify(props.catalog, null, 2)}
            aria-label={t('Copy full catalog')}
          >
            {t('Copy full catalog')}
          </CopyButton>
        </div>
      </div>
      {showGroups && (
        <StaticDataTable
          tableProps={{ 'aria-label': t('All upstream groups') }}
          columns={[
            {
              id: 'name',
              header: t('Group'),
              cell: (row: (typeof groups)[number]) => row.label,
            },
            { id: 'key', header: t('Key'), cell: (row) => row.group },
            {
              id: 'ratio',
              header: t('Group ratio'),
              cell: (row) => (row.ratio === null ? '—' : String(row.ratio)),
            },
            {
              id: 'models',
              header: t('Models'),
              cell: (row) => formatNumber(row.count, locale),
            },
            {
              id: 'available',
              header: t('Status'),
              cell: (row) =>
                row.available ? t('Available') : t('Unavailable'),
            },
            {
              id: 'id',
              header: t('ID'),
              cell: (row) => props.catalog.group_ids?.[row.group] ?? '—',
            },
          ]}
          data={groups}
          getRowKey={(row) => row.group}
          className='max-h-64 overflow-auto'
        />
      )}
      <div className='space-y-2'>
        <Label htmlFor='openlux-catalog-model'>{t('OpenLux model')}</Label>
        <Combobox
          id='openlux-catalog-model'
          aria-label={t('OpenLux model')}
          options={options}
          value={model.model_name}
          onValueChange={(value) => {
            setModelName(value ?? '')
            setShowRaw(false)
          }}
        />
      </div>
      <div className='space-y-1 text-sm'>
        {vendor && <p>{vendor.name}</p>}
        {model.description && (
          <p className='text-muted-foreground break-words'>
            {model.description}
          </p>
        )}
        {model.tags && <p>{model.tags}</p>}
        <p>
          {t('Supported protocols')}:{' '}
          {(model.supported_endpoint_types ?? []).join(', ') || '—'}
        </p>
        <p>
          {t('Billing type')}:{' '}
          {model.quota_type === 0
            ? t('Token-based')
            : t('Upstream-specific billing')}
        </p>
        {unsupported && <p className='text-warning'>{t(unsupported)}</p>}
      </div>
      <p className='text-muted-foreground text-xs'>
        {model.quota_type === 1
          ? t(
              'USD per image. Each cell shows upstream cost, then selling price.'
            )
          : t(
              'USD per million tokens. Each cell shows upstream cost, then selling price before local group multipliers.'
            )}
      </p>
      {!props.catalog.account_rates && (
        <p className='text-muted-foreground text-xs'>
          {t(
            'Account credentials are required to fetch service availability and account-specific rates.'
          )}
        </p>
      )}
      <StaticDataTable
        columns={columns}
        data={rows}
        getRowKey={(row, index) => `${row.group}-${index}`}
        tableProps={{ 'aria-label': t('OpenLux group prices') }}
        className='max-h-80 overflow-auto'
        emptyContent={t('No results found')}
      />
      <StaticDataTable
        tableProps={{ 'aria-label': t('Source pricing parameters') }}
        columns={[
          {
            id: 'key',
            header: t('Source pricing parameters'),
            cell: (row: [string, unknown]) => row[0],
          },
          {
            id: 'value',
            header: t('Value'),
            cell: (row) => (
              <code className='whitespace-pre-wrap break-all'>
                {JSON.stringify(row[1])}
              </code>
            ),
          },
        ]}
        data={Object.entries(model).filter(([key]) =>
          /price|ratio|quota_type/.test(key)
        )}
        getRowKey={(row) => row[0]}
        className='max-h-64 overflow-auto'
      />
      <p className='text-muted-foreground text-xs'>
        {t(
          'Source cache prices are model-level references. Review the generated tiered billing prices before publishing.'
        )}
      </p>
      <p className='text-muted-foreground text-xs'>
        {t(
          'Unsupported billing types remain visible in source data and cannot be imported as text prices.'
        )}
      </p>
      <div className='flex flex-wrap gap-2'>
        <Button
          variant='outline'
          size='sm'
          aria-expanded={showRaw}
          onClick={() => setShowRaw(!showRaw)}
        >
          {t('Show source data')}
        </Button>
        <CopyButton
          variant='outline'
          size='sm'
          value={JSON.stringify(raw, null, 2)}
          aria-label={t('Copy model source')}
        >
          {t('Copy model source')}
        </CopyButton>
      </div>
      {showRaw && (
        <Suspense fallback={<LoadingState />}>
          <CodeBlock
            code={JSON.stringify(raw, null, 2)}
            language='json'
            title={model.model_name}
          />
        </Suspense>
      )}
    </section>
  )
}
