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
import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import {
  ArrowLeft,
  CalendarClock,
  FileText,
  HeartPulse,
  Layers,
  Maximize2,
  Sparkles,
  Timer,
} from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import {
  StaticDataTable,
  type StaticDataTableColumn,
} from '@/components/data-table'
import { sideDrawerContentClassName } from '@/components/drawer-layout'
import { GroupBadge } from '@/components/group-badge'
import { PublicLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getPerfMetrics } from '@/features/performance-metrics/api'
import {
  formatLatency,
  formatThroughput,
  formatUptimePct,
  getSuccessRateTextClass,
} from '@/features/performance-metrics/lib/format'
import type { PerformanceSummary } from '@/features/performance-metrics/types'
import { PluginIcon } from '@/features/task-plugins/components/plugin-icon'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import { getLobeIcon } from '@/lib/lobe-icon'
import { requireServerSuccess } from '@/lib/server-error-message'
import { cn } from '@/lib/utils'

import { DEFAULT_TOKEN_UNIT } from '../constants'
import { usePricingData } from '../hooks/use-pricing-data'
import {
  formatOpenLuxTierRange,
  type ParsedTaskTier,
  type ParsedTier,
} from '../lib/billing-expr'
import { formatBillingCondition } from '../lib/billing-expression/condition-display'
import {
  formatTaskUsageUnitPrice,
  getDynamicPriceEntries,
  getDynamicPriceUnitLabelKey,
  getDynamicPricingSummary,
  getDynamicPricingTiers,
  getTaskUsageQuantityUnitLabelKey,
  isDynamicPricingModel,
  isUnconfiguredTaskUsageModel,
  type DynamicPriceEntry,
} from '../lib/dynamic-price'
import { parseTags } from '../lib/filters'
import {
  getAvailableGroups,
  getConfiguredGroupRatio,
  replaceModelInPath,
  isTokenBasedModel,
} from '../lib/model-helpers'
import { withPluginPricing } from '../lib/plugin-pricing'
import {
  calculateTokenPrice,
  formatDeltaPercent,
  formatFixedPrice,
  formatGroupPrice,
  getOfficialPriceSummary,
  getPriceComparison,
  isOfficialDiscount,
} from '../lib/price'
import {
  evaluateTaskUsageExamples,
  getTaskEnumFields,
  getTaskNumberFields,
} from '../lib/task-expr'
import { getTaskPricingDisplayTiers } from '../lib/task-matrix-display'
import {
  hasSimpleTaskPricing,
  taskPriceLabel,
  taskUsageUnitLabel,
  taskTierConditions,
  pricingDisplayFallbackKey,
} from '../lib/task-price-display'
import type {
  ModelCapability,
  PriceType,
  PricingModel,
  TokenUnit,
} from '../types'
import { ModelBillingModeBadge } from './model-billing-mode-badge'

// ----------------------------------------------------------------------------
// Local UI helpers
// ----------------------------------------------------------------------------

function SectionTitle(props: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <h2
      className={cn(
        'text-muted-foreground mb-3 text-xs font-semibold tracking-wider uppercase',
        props.className
      )}
    >
      {props.children}
    </h2>
  )
}

function OfficialReferencePrice(props: {
  model: PricingModel
  tokenUnit: TokenUnit
}) {
  const { t } = useTranslation()
  const official = getOfficialPriceSummary(props.model)
  if (!official) return null
  const divisor = props.tokenUnit === 'K' ? 1000 : 1
  const money = (usd: number) =>
    formatBillingCurrencyFromUSD(usd / divisor, {
      digitsLarge: 4,
      digitsSmall: 4,
      abbreviate: false,
    })
  const unitLabel = props.tokenUnit === 'K' ? '1K' : '1M'
  let detail = `${money(official.input)} / ${t('request')}`
  if (official.unit === 'token') {
    const parts = [
      `${t('Input')} ${money(official.input)} / ${unitLabel}`,
      official.output
        ? `${t('Output')} ${money(official.output)} / ${unitLabel}`
        : '',
      official.cacheRead
        ? `${t('Cache read')} ${money(official.cacheRead)} / ${unitLabel}`
        : '',
      official.cacheWrite
        ? `${t('Cache write (5m)')} ${money(official.cacheWrite)} / ${unitLabel}`
        : '',
      official.cacheWrite1h
        ? `${t('Cache write (1h)')} ${money(official.cacheWrite1h)} / ${unitLabel}`
        : '',
    ].filter(Boolean)
    detail = parts.join(' · ')
  }
  return (
    <p className='bg-muted/40 text-muted-foreground mb-2 rounded-lg px-3 py-2 text-xs leading-5'>
      {t('Official reference price')}: {detail}
    </p>
  )
}

function SavingsCell(props: { delta?: number }) {
  const { t } = useTranslation()
  if (!isOfficialDiscount(props.delta)) {
    return <span className='text-muted-foreground/40'>—</span>
  }
  return (
    <span
      className='text-success font-medium'
      title={t(
        'Compared with the official list price, based on the input price.'
      )}
    >
      -{formatDeltaPercent(props.delta)}%
    </span>
  )
}

function GroupPricingHeading(props: {
  tokenUnit: TokenUnit
  usageUnits?: boolean
}) {
  const { t } = useTranslation()
  const note = props.usageUnits
    ? t('Prices shown per usage unit')
    : t('Prices shown per {{unit}} tokens', {
        unit: props.tokenUnit === 'K' ? '1K' : '1M',
      })
  return (
    <div className='mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1'>
      <SectionTitle className='mb-0'>{t('Pricing by Group')}</SectionTitle>
      <span className='text-muted-foreground text-xs'>({note})</span>
    </div>
  )
}

function DynamicPriceEntryLabel(props: { entry: DynamicPriceEntry }) {
  const { t, i18n } = useTranslation()
  if (props.entry.labelKind === 'schema') {
    return (
      <span className='break-words whitespace-normal'>
        {taskPriceLabel(
          props.entry.description,
          props.entry.shortLabel,
          i18n.language
        )}
      </span>
    )
  }
  return t(props.entry.shortLabel)
}

function UnconfiguredTaskPricingNotice(props: { model: PricingModel }) {
  const { t, i18n } = useTranslation()
  const numberFields = getTaskNumberFields(props.model.billing_usage_schema)
  const enumFields = getTaskEnumFields(props.model.billing_usage_schema)

  return (
    <div className='bg-muted/20 flex flex-col gap-3 rounded-lg border p-3'>
      <p className='text-muted-foreground text-sm'>
        {t(
          'This model is billed by usage, but the administrator has not configured its pricing yet.'
        )}
      </p>
      {numberFields.length + enumFields.length > 0 ? (
        <dl className='grid gap-2 sm:grid-cols-2'>
          {numberFields.map(([field, definition]) => (
            <div
              key={field}
              className='flex items-baseline justify-between gap-3'
            >
              <dt className='text-sm'>
                {taskPriceLabel(definition.description, field, i18n.language)}
              </dt>
              <dd className='text-muted-foreground text-xs'>
                {taskUsageUnitLabel(
                  definition,
                  i18n.language,
                  t(getTaskUsageQuantityUnitLabelKey(definition.unit))
                )}
              </dd>
            </div>
          ))}
          {enumFields.map(([field, definition]) => (
            <div
              key={field}
              className='flex items-baseline justify-between gap-3'
            >
              <dt className='text-sm'>
                <code>{field}</code>
              </dt>
              <dd className='text-muted-foreground text-right text-xs'>
                {(definition.enum ?? []).join(', ')}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  )
}

const CAPABILITY_LABEL_KEYS: Record<ModelCapability, string> = {
  function_calling: 'Function calling',
  streaming: 'Streaming',
  vision: 'Vision',
  json_mode: 'JSON mode',
  structured_output: 'Structured output',
  reasoning: 'Reasoning',
  tools: 'Tools',
  system_prompt: 'System prompt',
  web_search: 'Web search',
  code_interpreter: 'Code interpreter',
  caching: 'Prompt caching',
  embeddings: 'Embeddings',
}

const MODALITY_LABEL_KEYS: Record<string, string> = {
  text: 'Text',
  image: 'Image',
  audio: 'Audio',
  video: 'Video',
  file: 'File',
}

const TOKEN_FORMAT = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
})
const MODEL_DETAILS_SKELETON_KEYS = ['first', 'second', 'third', 'fourth']

function formatCatalogTokenCount(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return ''
  if (tokens >= 1_000_000) {
    return `${TOKEN_FORMAT.format(tokens / 1_000_000)}M`
  }
  if (tokens >= 1_000) {
    return `${TOKEN_FORMAT.format(tokens / 1_000)}K`
  }
  return TOKEN_FORMAT.format(tokens)
}

function formatCatalogYearMonth(value?: string): string {
  if (!value) return ''
  const [yearStr, monthStr] = value.split('-')
  const year = Number(yearStr)
  const month = Number(monthStr)
  if (!Number.isFinite(year) || !Number.isFinite(month)) return value
  const date = new Date(Date.UTC(year, month - 1, 1))
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short' })
}

function normalizeCatalogItems(items?: readonly string[]): string[] {
  if (!items) return []
  return items.filter((item) => item.trim().length > 0)
}

function OverviewMetric(props: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
  valueClassName?: string
}) {
  const Icon = props.icon

  return (
    <div className='flex min-w-0 items-center gap-2 px-3 py-2'>
      <Icon className='text-muted-foreground/70 size-3.5 shrink-0' />
      <div className='min-w-0 flex-1'>
        <div className='text-muted-foreground truncate text-[10px] font-medium tracking-wider uppercase'>
          {props.label}
        </div>
        <div
          className={cn(
            'text-foreground truncate font-mono text-sm font-semibold tabular-nums',
            props.valueClassName
          )}
        >
          {props.value}
        </div>
      </div>
    </div>
  )
}

function OverviewSummaryGrid(props: { summary: PerformanceSummary }) {
  const { t } = useTranslation()
  const summary = props.summary
  const successRate = summary?.success_rate ?? Number.NaN
  const avgTps = summary?.avg_tps ?? 0
  const avgLatency = summary?.avg_latency_ms ?? 0

  return (
    <div className='bg-muted/20 grid overflow-hidden rounded-lg border sm:grid-cols-3 sm:divide-x'>
      <OverviewMetric
        icon={Timer}
        label='TPS'
        value={formatThroughput(avgTps)}
      />
      <OverviewMetric
        icon={Timer}
        label={t('Average latency')}
        value={formatLatency(avgLatency)}
      />
      <OverviewMetric
        icon={HeartPulse}
        label={t('Success rate')}
        value={formatUptimePct(successRate)}
        valueClassName={getSuccessRateTextClass(successRate)}
      />
    </div>
  )
}

function CatalogPillList(props: { items: string[] }) {
  return (
    <div className='flex min-w-0 flex-wrap gap-1.5'>
      {props.items.map((item) => (
        <span
          key={item}
          className='bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs font-medium'
        >
          {item}
        </span>
      ))}
    </div>
  )
}

function CatalogTextValue(props: { children: React.ReactNode }) {
  return (
    <span className='text-foreground min-w-0 truncate text-sm font-semibold'>
      {props.children}
    </span>
  )
}

function CatalogInfoCell(props: { label: string; children: React.ReactNode }) {
  return (
    <div className='bg-card flex min-w-0 flex-col gap-1 px-3 py-2.5'>
      <span className='text-muted-foreground text-[10px] font-medium tracking-wider uppercase'>
        {props.label}
      </span>
      {props.children}
    </div>
  )
}

function ModalityLabels(props: { items: string[] }) {
  const { t } = useTranslation()
  if (props.items.length === 0) return null

  return (
    <span className='inline-flex items-center gap-1 align-middle'>
      {props.items.map((item) => (
        <span key={item} className='font-medium'>
          {t(MODALITY_LABEL_KEYS[item] ?? item)}
        </span>
      ))}
    </span>
  )
}

function ModelBackendQuickStats(props: { model: PricingModel }) {
  const { t } = useTranslation()
  const model = props.model
  const inputModalities = normalizeCatalogItems(model.input_modalities)
  const outputModalities = normalizeCatalogItems(model.output_modalities)
  const contextLength = model.context_length ?? 0
  const maxOutput = model.max_output_tokens ?? 0
  const knowledgeCutoff = formatCatalogYearMonth(model.knowledge_cutoff)
  const releaseDate = formatCatalogYearMonth(model.release_date)

  const stats: {
    key: string
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: React.ReactNode
    hint?: string
  }[] = []

  if (contextLength > 0) {
    stats.push({
      key: 'context',
      icon: Layers,
      label: t('Context'),
      value: formatCatalogTokenCount(contextLength),
      hint: t('Maximum input window'),
    })
  }

  if (maxOutput > 0) {
    stats.push({
      key: 'max-output',
      icon: Maximize2,
      label: t('Max output'),
      value: formatCatalogTokenCount(maxOutput),
      hint: t('Maximum tokens per response'),
    })
  }

  if (inputModalities.length > 0 || outputModalities.length > 0) {
    stats.push({
      key: 'modalities',
      icon: FileText,
      label: t('Modalities'),
      value: (
        <span className='inline-flex items-center gap-1'>
          <ModalityLabels items={inputModalities} />
          {inputModalities.length > 0 && outputModalities.length > 0 && (
            <span className='text-muted-foreground/40'>→</span>
          )}
          <ModalityLabels items={outputModalities} />
        </span>
      ),
    })
  }

  if (knowledgeCutoff) {
    stats.push({
      key: 'knowledge',
      icon: Sparkles,
      label: t('Knowledge cutoff'),
      value: knowledgeCutoff,
    })
  }

  if (releaseDate) {
    stats.push({
      key: 'release',
      icon: CalendarClock,
      label: t('Released'),
      value: releaseDate,
    })
  }

  if (stats.length === 0) return null

  return (
    <div className='bg-muted/20 grid grid-cols-2 gap-px overflow-hidden rounded-lg border @md/details:grid-cols-3 @2xl/details:grid-cols-5'>
      {stats.map((stat) => {
        const Icon = stat.icon
        return (
          <div
            key={stat.key}
            className='bg-background flex min-w-0 flex-col gap-0.5 px-3 py-2.5'
          >
            <span className='text-muted-foreground inline-flex min-w-0 items-center gap-1 text-[10px] font-medium tracking-wider uppercase'>
              <Icon className='size-3 shrink-0' />
              <span className='truncate'>{stat.label}</span>
            </span>
            <span className='text-foreground truncate text-sm font-semibold tabular-nums'>
              {stat.value}
            </span>
            {stat.hint && (
              <span className='text-muted-foreground/60 truncate text-[10px]'>
                {stat.hint}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ModelBackendSignalsSection(props: { model: PricingModel }) {
  const { t } = useTranslation()
  const capabilities = normalizeCatalogItems(props.model.capabilities)
  const inputModalities = normalizeCatalogItems(props.model.input_modalities)
  const outputModalities = normalizeCatalogItems(props.model.output_modalities)

  if (
    capabilities.length === 0 &&
    inputModalities.length === 0 &&
    outputModalities.length === 0
  ) {
    return null
  }

  return (
    <section>
      <SectionTitle>
        {t('Capabilities')} / {t('Supported modalities')}
      </SectionTitle>
      <div className='grid gap-3 rounded-xl border p-3 @2xl/details:grid-cols-[minmax(0,1.5fr)_minmax(260px,1fr)]'>
        {capabilities.length > 0 ? (
          <CatalogPillList
            items={capabilities.map((capability) =>
              t(
                CAPABILITY_LABEL_KEYS[capability as ModelCapability] ??
                  capability
              )
            )}
          />
        ) : (
          <div />
        )}
        {(inputModalities.length > 0 || outputModalities.length > 0) && (
          <div className='grid gap-2 sm:grid-cols-2'>
            {inputModalities.length > 0 && (
              <div className='flex items-center justify-between gap-3 rounded-lg border px-3 py-2'>
                <span className='text-muted-foreground text-xs font-medium'>
                  {t('Input')}
                </span>
                <CatalogTextValue>
                  <ModalityLabels items={inputModalities} />
                </CatalogTextValue>
              </div>
            )}
            {outputModalities.length > 0 && (
              <div className='flex items-center justify-between gap-3 rounded-lg border px-3 py-2'>
                <span className='text-muted-foreground text-xs font-medium'>
                  {t('Output')}
                </span>
                <CatalogTextValue>
                  <ModalityLabels items={outputModalities} />
                </CatalogTextValue>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function ModelBackendProviderSection(props: { model: PricingModel }) {
  const { t } = useTranslation()
  const model = props.model
  const groups = normalizeCatalogItems(model.enable_groups)
  const tags = parseTags(model.tags)
  const cells: React.ReactNode[] = []

  if (model.vendor_name) {
    cells.push(
      <CatalogInfoCell key='provider' label={t('Provider')}>
        <CatalogTextValue>{model.vendor_name}</CatalogTextValue>
      </CatalogInfoCell>
    )
  }

  cells.push(
    <CatalogInfoCell key='type' label={t('Type')}>
      <ModelBillingModeBadge model={model} />
    </CatalogInfoCell>
  )

  if (groups.length > 0) {
    cells.push(
      <CatalogInfoCell key='groups' label={t('Groups')}>
        <CatalogPillList items={groups} />
      </CatalogInfoCell>
    )
  }

  if (tags.length > 0) {
    cells.push(
      <CatalogInfoCell key='tags' label={t('Tags')}>
        <CatalogPillList items={tags} />
      </CatalogInfoCell>
    )
  }

  if (model.parameter_count) {
    cells.push(
      <CatalogInfoCell key='parameters' label={t('Parameters')}>
        <CatalogTextValue>{model.parameter_count}</CatalogTextValue>
      </CatalogInfoCell>
    )
  }

  if (cells.length === 0) return null

  return (
    <section>
      <SectionTitle>{t('Model')}</SectionTitle>
      <div className='border-border/60 bg-border/60 grid grid-cols-1 gap-px overflow-hidden rounded-lg border sm:grid-cols-2'>
        {cells}
      </div>
    </section>
  )
}

function ModelBackendDetailsSection(props: { model: PricingModel }) {
  return (
    <>
      <ModelBackendQuickStats model={props.model} />
      <ModelBackendSignalsSection model={props.model} />
      <ModelBackendProviderSection model={props.model} />
    </>
  )
}

// ----------------------------------------------------------------------------
// Model header (always visible above the detail sections)
// ----------------------------------------------------------------------------

function ModelHeader(props: { model: PricingModel }) {
  const { t } = useTranslation()
  const model = props.model
  const modelIconKey = model.icon || model.vendor_icon
  const modelIcon = modelIconKey ? getLobeIcon(modelIconKey, 20) : null
  const description = model.description || model.vendor_description || null

  return (
    <header className='pb-4'>
      <div className='flex items-center gap-2.5'>
        {modelIcon}
        <h1 className='font-mono text-xl font-bold tracking-tight sm:text-2xl'>
          {model.model_name}
        </h1>
        <CopyButton
          value={model.model_name || ''}
          className='size-6'
          iconClassName='size-3'
          tooltip={t('Copy model name')}
          successTooltip={t('Copied!')}
          aria-label={t('Copy model name')}
        />
      </div>
      <div className='mt-1 flex flex-wrap items-center gap-1.5 text-xs'>
        {model.vendor_name && (
          <span className='text-muted-foreground'>{model.vendor_name}</span>
        )}
        <span className='text-muted-foreground/30'>·</span>
        <ModelBillingModeBadge model={model} />
      </div>
      {description && (
        <p className='text-muted-foreground mt-2 text-sm leading-relaxed'>
          {description}
        </p>
      )}
    </header>
  )
}

// ----------------------------------------------------------------------------
// Automatic group routing
// ----------------------------------------------------------------------------

function AutoGroupChain(props: { model: PricingModel; autoGroups: string[] }) {
  const { t } = useTranslation()
  const modelEnableGroups = Array.isArray(props.model.enable_groups)
    ? props.model.enable_groups
    : []
  const autoChain = props.autoGroups.filter((g) =>
    modelEnableGroups.includes(g)
  )

  if (autoChain.length === 0) return null

  return (
    <div className='text-muted-foreground mb-3 flex flex-wrap items-center gap-1 text-xs'>
      <span className='font-medium'>{t('Auto Group Chain')}</span>
      <span className='text-muted-foreground/40'>→</span>
      {autoChain.map((g, idx) => (
        <span key={g} className='flex items-center gap-1'>
          <GroupBadge group={g} size='sm' />
          {idx < autoChain.length - 1 && (
            <span className='text-muted-foreground/40'>→</span>
          )}
        </span>
      ))}
    </div>
  )
}

type DynamicPriceOptions = Parameters<typeof getDynamicPriceEntries>[1]
type DynamicPricingTier = ReturnType<typeof getDynamicPricingTiers>[number]
type GroupPricingRow = {
  group: string
  tier: DynamicPricingTier
  tiers: DynamicPricingTier[]
  index: number
}
type DynamicFormattedPricesByTier = Map<DynamicPricingTier, Map<string, string>>

function getDynamicPriceFields(
  tiers: DynamicPricingTier[],
  options: DynamicPriceOptions
) {
  return [
    ...new Map(
      tiers
        .flatMap((tier) => getDynamicPriceEntries(tier, options))
        .map((entry) => [entry.field, entry])
    ).values(),
  ]
}

function getDynamicFormattedPricesByTier(
  tiers: DynamicPricingTier[],
  options: DynamicPriceOptions
): DynamicFormattedPricesByTier {
  return new Map(
    tiers.map((tier) => [
      tier,
      new Map(
        getDynamicPriceEntries(tier, options).map((entry) => [
          entry.field,
          entry.formatted,
        ])
      ),
    ])
  )
}

// ----------------------------------------------------------------------------
// Group pricing table
// ----------------------------------------------------------------------------

type GroupPricingSectionProps = {
  model: PricingModel
  groupRatio: Record<string, number>
  usableGroup: Record<string, { desc: string; ratio: number }>
  autoGroups: string[]
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice?: boolean
}

function sortPricingGroupsByInputPrice(
  model: PricingModel,
  groups: string[],
  groupRatio: Record<string, number>
): string[] {
  const prices = groups.map((group, index) => {
    const ratio = getConfiguredGroupRatio(groupRatio, group)
    const expression = model.group_billing_expr?.[group]
    const groupModel = { ...model, group_billing_expr: undefined }
    if (expression) {
      groupModel.billing_mode = 'tiered_expr'
      groupModel.billing_expr = expression
      groupModel.billing_plugin_variants = undefined
    }
    let inputPrice: number | undefined
    if (isDynamicPricingModel(groupModel)) {
      const summary = getDynamicPricingSummary(groupModel, { tokenUnit: 'M' })
      const input = summary?.entries.find(
        (entry) => entry.field === 'inputPrice'
      )
      const basePrice = input?.minValue ?? input?.value
      if (basePrice !== undefined) inputPrice = basePrice * ratio
    } else if (isTokenBasedModel(groupModel)) {
      inputPrice = calculateTokenPrice(groupModel, 'input', ratio)
    }
    return {
      group,
      index,
      price:
        typeof inputPrice === 'number' && Number.isFinite(inputPrice)
          ? inputPrice
          : Infinity,
    }
  })
  prices.sort((a, b) => {
    if (a.price === b.price) return a.index - b.index
    return a.price < b.price ? -1 : 1
  })
  return prices.map((item) => item.group)
}

function GroupPricingSection(props: GroupPricingSectionProps) {
  const { t } = useTranslation()
  const variants = props.model.billing_plugin_variants
  if (!variants?.length) {
    return <ProviderGroupPricingSection {...props} />
  }
  return (
    <section>
      <GroupPricingHeading
        tokenUnit={props.tokenUnit}
        usageUnits={
          Boolean(props.model.billing_usage_schema) ||
          !isTokenBasedModel(props.model)
        }
      />
      <Tabs key={props.model.model_name} defaultValue={variants[0].plugin_key}>
        <TabsList
          aria-label={t('Provider')}
          className='max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto'
        >
          {variants.map((variant) => (
            <TabsTrigger
              key={variant.plugin_key}
              value={variant.plugin_key}
              className='max-w-full min-w-0'
            >
              <PluginIcon
                plugin={{
                  key: variant.plugin_key,
                  name: variant.plugin_name,
                  icon: variant.icon,
                }}
                size={16}
              />
              <span className='truncate' title={variant.plugin_name}>
                {variant.plugin_name}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
        {variants.map((variant) => (
          <TabsContent key={variant.plugin_key} value={variant.plugin_key}>
            {variant.billing_expr || variant.billing_mode === 'ratio' ? (
              <ProviderGroupPricingSection
                {...props}
                model={withPluginPricing(props.model, variant)}
                hideTitle
              />
            ) : (
              <UnconfiguredTaskPricingNotice
                model={withPluginPricing(props.model, variant)}
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </section>
  )
}

function ProviderGroupPricingSection(
  props: GroupPricingSectionProps & { hideTitle?: boolean }
) {
  const { t, i18n } = useTranslation()
  const showRechargePrice = props.showRechargePrice ?? false

  const availableGroups = useMemo(
    () =>
      sortPricingGroupsByInputPrice(
        props.model,
        getAvailableGroups(props.model, props.usableGroup || {}),
        props.groupRatio
      ),
    [props.model, props.usableGroup, props.groupRatio]
  )

  const isTokenBased = isTokenBasedModel(props.model)
  const tokenUnitLabel = props.tokenUnit === 'K' ? '1K' : '1M'

  const extraPriceTypes = useMemo(() => {
    const types: { label: string; type: PriceType }[] = []
    if (props.model.cache_ratio != null) {
      types.push({ label: t('Cache'), type: 'cache' })
    }
    if (props.model.create_cache_ratio != null) {
      types.push({ label: t('Cache Write'), type: 'create_cache' })
    }
    if (props.model.image_ratio != null) {
      types.push({ label: t('Image'), type: 'image' })
    }
    if (props.model.audio_ratio != null) {
      types.push({ label: t('Audio In'), type: 'audio_input' })
    }
    if (
      props.model.audio_ratio != null &&
      props.model.audio_completion_ratio != null
    ) {
      types.push({ label: t('Audio Out'), type: 'audio_output' })
    }
    return types
  }, [props.model, t])

  if (availableGroups.length === 0) {
    return (
      <section>
        {!props.hideTitle && (
          <GroupPricingHeading
            tokenUnit={props.tokenUnit}
            usageUnits={
              Boolean(props.model.billing_usage_schema) ||
              !isTokenBasedModel(props.model)
            }
          />
        )}
        <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
        <p className='text-muted-foreground text-sm'>
          {t(
            'This model is not available in any group, or no group pricing information is configured.'
          )}
        </p>
      </section>
    )
  }

  const thClass = cn(
    'text-muted-foreground py-2 text-xs font-medium whitespace-normal break-words',
    !props.model.billing_usage_schema && 'tracking-wider uppercase'
  )

  if (isDynamicPricingModel(props.model)) {
    const tierGroups = availableGroups.map((group) => {
      const expression =
        props.model.group_billing_expr?.[group] ?? props.model.billing_expr
      const groupModel = {
        ...props.model,
        group_billing_expr: undefined,
        billing_expr: expression,
      }
      if (props.model.group_billing_expr?.[group]) {
        groupModel.billing_mode = 'tiered_expr'
      }
      let tiers: DynamicPricingTier[] = props.model.billing_usage_schema
        ? getTaskPricingDisplayTiers(
            expression,
            props.model.billing_usage_schema
          )
        : getDynamicPricingTiers(groupModel)
      if (
        !tiers.length &&
        !isDynamicPricingModel(groupModel) &&
        !groupModel.billing_usage_schema &&
        isTokenBasedModel(groupModel)
      ) {
        const legacy: ParsedTier = {
          label: t('No range limit'),
          conditions: [],
        }
        for (const [type, field] of [
          ['input', 'inputPrice'],
          ['output', 'outputPrice'],
          ['cache', 'cacheReadPrice'],
          ['create_cache', 'cacheCreatePrice'],
          ['image', 'imageInputPrice'],
          ['audio_input', 'audioInputPrice'],
          ['audio_output', 'audioOutputPrice'],
        ] as const) {
          const price = calculateTokenPrice(groupModel, type, 1)
          if (Number.isFinite(price)) legacy[field] = price
        }
        tiers = [legacy]
      }
      return { group, tiers }
    })
    const dynamicTiers = tierGroups.flatMap(({ tiers }) => tiers)
    const priceRows: GroupPricingRow[] = tierGroups.flatMap(
      ({ group, tiers }) =>
        tiers.map((tier, index) => ({ group, tier, tiers, index }))
    )
    const hasRequestPrice = dynamicTiers.some(
      (tier) => !('unitPrices' in tier) && tier.billingUnit === 'request'
    )

    if (dynamicTiers.length === 0) {
      return (
        <section>
          {!props.hideTitle && (
            <GroupPricingHeading
              tokenUnit={props.tokenUnit}
              usageUnits={
                Boolean(props.model.billing_usage_schema) ||
                !isTokenBasedModel(props.model)
              }
            />
          )}
          <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
          <div className='rounded-lg border border-amber-200/70 bg-amber-50/70 p-3 dark:border-amber-500/20 dark:bg-amber-500/10'>
            <div className='text-sm font-medium text-amber-800 dark:text-amber-200'>
              {t('Special billing expression')}
            </div>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                pricingDisplayFallbackKey(
                  props.model.billing_expr || '',
                  props.model.billing_usage_schema
                )
              )}
            </p>
            <div className='mt-3'>
              <div className='text-muted-foreground mb-1 text-[10px] font-medium tracking-wider uppercase'>
                {t('Raw expression')}
              </div>
              <code className='text-muted-foreground bg-background/80 block max-h-28 overflow-auto rounded-md border px-2 py-1.5 font-mono text-xs break-all'>
                {props.model.billing_expr}
              </code>
            </div>
          </div>
        </section>
      )
    }

    const usageExampleRows = evaluateTaskUsageExamples(
      props.model.billing_expr,
      props.model.billing_usage_schema,
      props.model.billing_usage_examples
    )
    const priceFields = getDynamicPriceFields(dynamicTiers, {
      tokenUnit: props.tokenUnit,
      showRechargePrice,
      priceRate: props.priceRate,
      usdExchangeRate: props.usdExchangeRate,
      groupRatioMultiplier: 1,
      usageSchema: props.model.billing_usage_schema,
    })
    const formattedPricesByGroup = new Map(
      tierGroups.map(({ group, tiers }) => {
        const ratio = getConfiguredGroupRatio(props.groupRatio, group)
        return [
          group,
          getDynamicFormattedPricesByTier(tiers, {
            tokenUnit: props.tokenUnit,
            showRechargePrice,
            priceRate: props.priceRate,
            usdExchangeRate: props.usdExchangeRate,
            groupRatioMultiplier: ratio,
            usageSchema: props.model.billing_usage_schema,
          }),
        ] as const
      })
    )

    // Only savings are shown: a group priced at or above the official list
    // price gets no comparison badge at all.
    const officialSummary = getOfficialPriceSummary(props.model)
    let targetField: 'fixedPrice' | 'inputPrice' | null = null
    if (officialSummary) {
      targetField =
        officialSummary.unit === 'request' ? 'fixedPrice' : 'inputPrice'
    }
    const deltaByGroupTier = new Map<
      string,
      Map<DynamicPricingTier, number>
    >()
    if (officialSummary && targetField) {
      for (const { group, tiers } of tierGroups) {
        const ratio = getConfiguredGroupRatio(props.groupRatio, group)
        const perTier = new Map<DynamicPricingTier, number>()
        for (const tier of tiers) {
          const entry = getDynamicPriceEntries(tier, {
            tokenUnit: 'M',
            groupRatioMultiplier: ratio,
          }).find((item) => item.field === targetField)
          const value = entry?.minValue ?? entry?.value
          if (typeof value !== 'number' || value <= 0) continue
          // Entries carry the raw tier price; the group ratio is applied when
          // the cell is formatted, so include it in the comparison.
          perTier.set(tier, (value * ratio) / officialSummary.input - 1)
        }
        if (perTier.size > 0) deltaByGroupTier.set(group, perTier)
      }
    }

    const columns: StaticDataTableColumn<GroupPricingRow>[] = [
      {
        id: 'group',
        header: t('Pricing group name'),
        className: thClass,
        cellClassName: 'py-2.5',
        cell: (row) => <GroupBadge group={row.group} size='sm' />,
      },
      ...(hasSimpleTaskPricing(props.model)
        ? []
        : [
            {
              id: 'tier',
              header: props.model.billing_usage_schema
                ? t('Applicable conditions')
                : t('Input token count'),
              className: thClass,
              cellClassName:
                'text-muted-foreground py-2.5 whitespace-normal break-words',
              cell: (row: GroupPricingRow) => {
                const tier = row.tier
                if ('unitPrices' in tier) {
                  return (
                    taskTierConditions(
                      tier as ParsedTaskTier,
                      props.model.billing_usage_schema,
                      i18n.language,
                      t
                    ) ||
                    t(row.tiers.length > 1 ? 'Other cases' : 'All requests')
                  )
                }
                const range = formatOpenLuxTierRange(
                  tier,
                  row.tiers,
                  t('No range limit'),
                  props.model.group_input_token_limits?.[row.group] ??
                    props.model.input_token_limit
                )
                if (range) return range
                if (tier.conditionText) {
                  return `${tier.label}: ${formatBillingCondition(tier.conditionText, t, i18n.language) ?? tier.conditionText}`
                }
                return tier.label || t('Default')
              },
            },
          ]),
      ...priceFields.map((fieldEntry) => {
        const unitLabelKey = getDynamicPriceUnitLabelKey(fieldEntry)
        let unitLabel = taskUsageUnitLabel(
          fieldEntry,
          i18n.language,
          unitLabelKey ? t(unitLabelKey) : ''
        )
        if (!unitLabel && hasRequestPrice) {
          unitLabel = t('{{unit}} tokens', { unit: tokenUnitLabel })
        }
        const fieldLabel =
          fieldEntry.labelKind === 'schema' ? (
            <DynamicPriceEntryLabel entry={fieldEntry} />
          ) : (
            t(fieldEntry.shortLabel)
          )
        return {
          id: fieldEntry.field,
          header: unitLabel ? (
            <>
              {fieldLabel}
              {` / ${unitLabel}`}
            </>
          ) : (
            fieldLabel
          ),
          className: `${thClass} text-right`,
          cellClassName: 'py-2.5 text-right font-mono',
          cell: (row: GroupPricingRow) =>
            formattedPricesByGroup
              .get(row.group)
              ?.get(row.tier)
              ?.get(fieldEntry.field) ?? '-',
        }
      }),
      {
        id: 'savings',
        header: t('Savings'),
        className: `${thClass} text-right`,
        cellClassName: 'py-2.5 text-right font-mono',
        cell: (row: GroupPricingRow) => (
          <SavingsCell delta={deltaByGroupTier.get(row.group)?.get(row.tier)} />
        ),
      },
    ]

    return (
      <section>
        {!props.hideTitle && (
          <GroupPricingHeading
            tokenUnit={props.tokenUnit}
            usageUnits={dynamicTiers.some(
              (tier) => 'unitPrices' in tier || tier.billingUnit === 'request'
            )}
          />
        )}
        <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
        <OfficialReferencePrice
          model={props.model}
          tokenUnit={props.tokenUnit}
        />
        <StaticDataTable
          className='rounded-lg'
          tableClassName='text-sm'
          headerRowClassName='hover:bg-transparent'
          data={priceRows}
          getRowKey={(row) => `${row.group}-${row.tier.label}-${row.index}`}
          columns={columns}
          renderRow={(row, rowIndex) => (
            <TableRow>
              {columns.map((column) => {
                if (column.id === 'group' && row.index > 0) return null
                const cellClassName =
                  typeof column.cellClassName === 'function'
                    ? column.cellClassName(row, rowIndex)
                    : column.cellClassName
                return (
                  <TableCell
                    key={column.id}
                    rowSpan={
                      column.id === 'group' ? row.tiers.length : undefined
                    }
                    className={cn('align-middle', cellClassName)}
                  >
                    {column.cell?.(row, rowIndex)}
                  </TableCell>
                )
              })}
            </TableRow>
          )}
        />
        {usageExampleRows.length > 0 &&
          availableGroups.map((group) => {
            const ratio = getConfiguredGroupRatio(props.groupRatio, group)
            return (
              <div key={group} className='mt-4 rounded-lg border'>
                <GroupBadge group={group} size='sm' />
                <div className='text-muted-foreground px-3 pt-2 text-[10px] font-medium tracking-wider uppercase'>
                  {t('Price examples')}
                </div>
                <StaticDataTable
                  className='rounded-none border-0'
                  tableClassName='text-sm'
                  headerRowClassName='hover:bg-transparent'
                  data={usageExampleRows}
                  getRowKey={(row) => `${group}-${row.label}`}
                  columns={[
                    {
                      id: 'spec',
                      header: t('Spec'),
                      className: thClass,
                      cellClassName: 'text-muted-foreground py-2.5',
                      cell: (row) => row.label,
                    },
                    {
                      id: 'price',
                      header: t('Example price'),
                      className: `${thClass} text-right`,
                      cellClassName: 'py-2.5 text-right font-mono',
                      cell: (row) =>
                        `≈ ${formatTaskUsageUnitPrice(row.total, {
                          tokenUnit: props.tokenUnit,
                          showRechargePrice,
                          priceRate: props.priceRate,
                          usdExchangeRate: props.usdExchangeRate,
                          groupRatioMultiplier: ratio,
                        })}`,
                    },
                  ]}
                />
                <p className='text-muted-foreground/40 px-3 pb-2 text-[10px]'>
                  {t('Approximate prices for common specs.')}
                </p>
              </div>
            )
          })}
      </section>
    )
  }

  if (isUnconfiguredTaskUsageModel(props.model)) {
    return (
      <section>
        {!props.hideTitle && (
          <GroupPricingHeading
            tokenUnit={props.tokenUnit}
            usageUnits={
              Boolean(props.model.billing_usage_schema) ||
              !isTokenBasedModel(props.model)
            }
          />
        )}
        <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
        <UnconfiguredTaskPricingNotice model={props.model} />
      </section>
    )
  }

  const renderGroupPrice = (group: string, type: PriceType) =>
    formatGroupPrice(
      props.model,
      group,
      type,
      props.tokenUnit,
      showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      props.groupRatio
    )
  const renderFixedGroupPrice = (group: string) =>
    formatFixedPrice(
      props.model,
      group,
      showRechargePrice,
      props.priceRate,
      props.usdExchangeRate,
      props.groupRatio
    )

  return (
    <section>
      {!props.hideTitle && (
        <GroupPricingHeading
          tokenUnit={props.tokenUnit}
          usageUnits={
            Boolean(props.model.billing_usage_schema) ||
            !isTokenBasedModel(props.model)
          }
        />
      )}
      <AutoGroupChain model={props.model} autoGroups={props.autoGroups} />
      <OfficialReferencePrice model={props.model} tokenUnit={props.tokenUnit} />
      <StaticDataTable
        className='-mx-4 rounded-none border-0 sm:mx-0'
        tableClassName='text-sm'
        headerRowClassName='hover:bg-transparent'
        data={availableGroups}
        getRowKey={(group) => group}
        columns={[
          {
            id: 'group',
            header: t('Pricing group name'),
            className: thClass,
            cellClassName: 'py-2.5',
            cell: (group) => <GroupBadge group={group} size='sm' />,
          },
          ...(isTokenBased
            ? [
                {
                  id: 'input',
                  header: t('Input'),
                  className: `${thClass} text-right`,
                  cellClassName: 'py-2.5 text-right font-mono',
                  cell: (group: string) => renderGroupPrice(group, 'input'),
                },
                {
                  id: 'output',
                  header: t('Output'),
                  className: `${thClass} text-right`,
                  cellClassName: 'py-2.5 text-right font-mono',
                  cell: (group: string) => renderGroupPrice(group, 'output'),
                },
                ...extraPriceTypes.map((ep) => ({
                  id: ep.type,
                  header: ep.label,
                  className: `${thClass} text-right`,
                  cellClassName: 'py-2.5 text-right font-mono',
                  cell: (group: string) => renderGroupPrice(group, ep.type),
                })),
              ]
            : [
                {
                  id: 'price',
                  header: t('Price'),
                  className: `${thClass} text-right`,
                  cellClassName: 'py-2.5 text-right font-mono',
                  cell: (group: string) => renderFixedGroupPrice(group),
                },
              ]),
          {
            id: 'savings',
            header: t('Savings'),
            className: `${thClass} text-right`,
            cellClassName: 'py-2.5 text-right font-mono',
            cell: (group: string) => (
              <SavingsCell
                delta={
                  getPriceComparison(
                    props.model,
                    getConfiguredGroupRatio(props.groupRatio, group)
                  )?.inputDelta
                }
              />
            ),
          },
        ]}
      />
    </section>
  )
}

export interface ModelDetailsContentProps {
  model: PricingModel
  groupRatio: Record<string, number>
  usableGroup: Record<string, { desc: string; ratio: number }>
  endpointMap: Record<string, { path?: string; method?: string }>
  autoGroups: string[]
  priceRate: number
  usdExchangeRate: number
  tokenUnit: TokenUnit
  showRechargePrice?: boolean
}

export function ModelDetailsContent(props: ModelDetailsContentProps) {
  const showRechargePrice = props.showRechargePrice ?? false
  const metricsQuery = useQuery({
    queryKey: ['perf-metrics', props.model.model_name],
    queryFn: async () =>
      requireServerSuccess(await getPerfMetrics(props.model.model_name, 24)),
    staleTime: 60 * 1000,
  })
  const summary = metricsQuery.data?.data.summary
  const hasPerformance = Boolean(
    summary && metricsQuery.data?.data.groups?.length
  )
  return (
    <div className='@container/details space-y-6'>
      <ModelHeader model={props.model} />
      <ModelBackendDetailsSection model={props.model} />
      <ModelEndpointSection
        model={props.model}
        endpointMap={props.endpointMap}
      />
      {hasPerformance && summary && <OverviewSummaryGrid summary={summary} />}
      <GroupPricingSection
        model={props.model}
        groupRatio={props.groupRatio}
        usableGroup={props.usableGroup}
        autoGroups={props.autoGroups}
        priceRate={props.priceRate}
        usdExchangeRate={props.usdExchangeRate}
        tokenUnit={props.tokenUnit}
        showRechargePrice={showRechargePrice}
      />
    </div>
  )
}

function ModelEndpointSection(props: {
  model: PricingModel
  endpointMap: Record<string, { path?: string; method?: string }>
}) {
  const { t } = useTranslation()
  const supported = [...new Set(props.model.supported_endpoint_types ?? [])]
  const hasChat = supported.some(
    (type) => type === 'openai' || type === 'anthropic'
  )
  // The gateway converts chat requests between these two public wire formats.
  const types = hasChat
    ? [
        'anthropic',
        'openai',
        ...supported.filter(
          (type) => type !== 'anthropic' && type !== 'openai'
        ),
      ]
    : supported
  const standard: Record<string, { method: string; path: string }> = {
    anthropic: { method: 'POST', path: '/v1/messages' },
    openai: { method: 'POST', path: '/v1/chat/completions' },
  }
  const labels: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
  }
  const endpoints = types.flatMap((type) => {
    const info = standard[type] ?? props.endpointMap[type]
    if (!info?.path) return []
    return [
      {
        type,
        label: labels[type] ?? type,
        method: (info.method || 'POST').toUpperCase(),
        path: replaceModelInPath(info.path, props.model.model_name),
      },
    ]
  })
  if (!endpoints.length) return null
  return (
    <section className='space-y-3'>
      <div>
        <SectionTitle>{t('API Endpoints')}</SectionTitle>
        <p className='text-muted-foreground mt-1 text-sm'>
          {t("Information on the model's supported API endpoints")}
        </p>
      </div>
      <ul className='divide-y overflow-hidden rounded-xl border'>
        {endpoints.map((endpoint) => (
          <li
            key={endpoint.type}
            className='grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-4 sm:grid-cols-[auto_minmax(7rem,auto)_minmax(0,1fr)_auto]'
          >
            <Badge
              variant='outline'
              className='border-emerald-600/25 bg-emerald-500/10 font-mono text-emerald-700 dark:text-emerald-400'
            >
              {endpoint.method}
            </Badge>
            <span className='min-w-0 font-medium break-words'>
              {endpoint.label}
            </span>
            <code className='text-muted-foreground col-start-2 min-w-0 text-sm break-all sm:col-start-auto'>
              {endpoint.path}
            </code>
            <CopyButton
              value={endpoint.path}
              tooltip={t('Copy endpoint path')}
              aria-label={t('Copy endpoint path')}
              className='col-start-3 row-start-1 size-8 sm:col-start-4'
              iconClassName='size-4'
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

// ----------------------------------------------------------------------------
// Drawer & page wrappers
// ----------------------------------------------------------------------------

export interface ModelDetailsDrawerProps extends ModelDetailsContentProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ModelDetailsDrawer(props: ModelDetailsDrawerProps) {
  const { t } = useTranslation()
  const { open, onOpenChange, ...contentProps } = props

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className={sideDrawerContentClassName(
          'sm:max-w-2xl lg:max-w-3xl xl:max-w-4xl 2xl:max-w-5xl'
        )}
      >
        <SheetHeader className='sr-only'>
          <SheetTitle>{props.model.model_name}</SheetTitle>
          <SheetDescription>{t('Model details')}</SheetDescription>
        </SheetHeader>
        <div className='flex-1 overflow-y-auto px-4 pt-11 pb-5 sm:px-6 sm:pt-12 sm:pb-6'>
          <ModelDetailsContent {...contentProps} />
        </div>
      </SheetContent>
    </Sheet>
  )
}

export function ModelDetails() {
  const { t } = useTranslation()
  const { modelId } = useParams({ from: '/pricing/$modelId/' })
  const search = useSearch({ from: '/pricing/$modelId/' })
  const navigate = useNavigate()

  const {
    models,
    groupRatio,
    usableGroup,
    endpointMap,
    autoGroups,
    isLoading,
    priceRate,
    usdExchangeRate,
  } = usePricingData()

  const tokenUnit: TokenUnit =
    search.tokenUnit === 'K' ? 'K' : DEFAULT_TOKEN_UNIT

  const model = useMemo(() => {
    if (!models || !modelId) return null
    return models.find((m) => m.model_name === modelId) || null
  }, [models, modelId])

  const handleBack = () => {
    navigate({ to: '/pricing', search })
  }

  if (isLoading) {
    return (
      <PublicLayout>
        <div className='site-container px-4 sm:px-6 xl:px-8'>
          <Skeleton className='mb-4 h-5 w-16' />
          <div className='space-y-2'>
            <Skeleton className='h-7 w-64' />
            <Skeleton className='h-4 w-40' />
            <Skeleton className='h-4 w-full max-w-md' />
          </div>
          <div className='mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4'>
            {MODEL_DETAILS_SKELETON_KEYS.map((key) => (
              <Skeleton key={`metric-${key}`} className='h-16 w-full' />
            ))}
          </div>
          <div className='mt-6 space-y-3'>
            {MODEL_DETAILS_SKELETON_KEYS.map((key) => (
              <Skeleton key={`section-${key}`} className='h-24 w-full' />
            ))}
          </div>
        </div>
      </PublicLayout>
    )
  }

  if (!model) {
    return (
      <PublicLayout>
        <div className='mx-auto max-w-2xl px-4 text-center sm:px-6'>
          <h2 className='mb-1 text-base font-semibold'>
            {t('Model not found')}
          </h2>
          <p className='text-muted-foreground mb-4 text-sm'>
            {t("The model you're looking for doesn't exist.")}
          </p>
          <Button onClick={handleBack} variant='outline' size='sm'>
            {t('Back to Models')}
          </Button>
        </div>
      </PublicLayout>
    )
  }

  return (
    <PublicLayout>
      <div className='site-container px-4 sm:px-6 xl:px-8'>
        <Button
          variant='ghost'
          size='sm'
          onClick={handleBack}
          className='text-muted-foreground hover:text-foreground mb-4 h-auto gap-1 px-0 py-1 text-xs'
        >
          <ArrowLeft className='size-3.5' />
          {t('Back')}
        </Button>

        <ModelDetailsContent
          model={model}
          groupRatio={groupRatio || {}}
          usableGroup={usableGroup || {}}
          autoGroups={autoGroups || []}
          priceRate={priceRate ?? 1}
          usdExchangeRate={usdExchangeRate ?? 1}
          tokenUnit={tokenUnit}
          showRechargePrice={search.rechargePrice ?? false}
          endpointMap={
            (endpointMap as Record<
              string,
              { path?: string; method?: string }
            >) || {}
          }
        />
      </div>
    </PublicLayout>
  )
}
