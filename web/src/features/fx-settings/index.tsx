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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ErrorState } from '@/components/error-state'
import { SectionPageLayout } from '@/components/layout'
import { LoadingState } from '@/components/loading-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { handleServerError } from '@/lib/handle-server-error'

import {
  getFxStatus,
  refreshFxRate,
  saveFxOption,
  type FxConfig,
  type FxSnapshot,
} from './api'

type Draft = FxConfig

function toDraft(config: FxConfig): Draft {
  return config
}

function buildChanges(draft: Draft, original: FxConfig) {
  const changes: Array<{ key: string; value: string | number | boolean }> = []
  const push = (field: keyof FxConfig, value: string | number | boolean) => {
    changes.push({ key: `fx_setting.${field}`, value })
  }
  for (const field of Object.keys(original) as Array<keyof FxConfig>) {
    if (draft[field] !== original[field]) push(field, draft[field])
  }
  return changes
}

function formatTime(seconds?: number) {
  if (!seconds) return '-'
  return new Date(seconds * 1000).toLocaleString()
}

function RateSummary(props: { snapshot: FxSnapshot }) {
  const { t } = useTranslation()
  const snapshot = props.snapshot
  const stale = snapshot.stale || snapshot.updated_at === 0
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Current rate')}</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        <div className='flex flex-wrap items-baseline gap-3'>
          <span className='text-2xl font-semibold'>
            {snapshot.rate > 0 ? snapshot.rate : '-'}
          </span>
          <span className='text-muted-foreground text-sm'>
            {t('{{currency}} per 1 USD of wallet credit', {
              currency: snapshot.currency || '-',
            })}
          </span>
          {stale && <Badge variant='destructive'>{t('Stale')}</Badge>}
        </div>
        <dl className='text-muted-foreground grid gap-1 text-sm sm:grid-cols-2'>
          <div>
            {t('Market rate')}:{' '}
            {snapshot.raw_rate > 0 ? snapshot.raw_rate : '-'}
          </div>
          <div>
            {t('Markup')}: {snapshot.markup_percent}%
          </div>
          <div>
            {t('Updated')}: {formatTime(snapshot.updated_at)}
          </div>
          {snapshot.pending_rate ? (
            <div>
              {t('Pending rate')}: {snapshot.pending_rate}
            </div>
          ) : null}
          {snapshot.last_error ? (
            <div className='text-destructive sm:col-span-2'>
              {snapshot.last_error}
            </div>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  )
}

function SourceTable(props: { snapshot: FxSnapshot; config: FxConfig }) {
  const { t } = useTranslation()
  const quotes = props.snapshot.quotes ?? []
  const rows = [
    {
      id: 'ecb',
      label: 'Frankfurter (ECB)',
      enabled: props.config.source_ecb_enabled,
    },
    {
      id: 'er-api',
      label: 'open.er-api.com',
      enabled: props.config.source_erapi_enabled,
    },
    {
      id: 'fawazahmed',
      label: 'currency-api (jsDelivr)',
      enabled: props.config.source_fawazahmed_enabled,
    },
    {
      id: 'exchangerate-fun',
      label: 'exchangerate.fun',
      enabled: props.config.source_exchangeratefun_enabled,
    },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('Sources')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className='overflow-x-auto'>
          <table className='w-full text-sm'>
            <thead>
              <tr className='text-muted-foreground text-left'>
                <th className='py-2'>{t('Source')}</th>
                <th className='py-2'>{t('Quote')}</th>
                <th className='py-2'>{t('Published')}</th>
                <th className='py-2'>{t('Status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const quote = quotes.find((entry) => entry.source === row.id)
                let status = t('No data')
                if (!row.enabled) {
                  status = t('Disabled')
                } else if (quote?.error) {
                  status = quote.error
                } else if (quote) {
                  status = t('OK')
                }
                return (
                  <tr key={row.id} className='border-t'>
                    <td className='py-2'>{row.label}</td>
                    <td className='py-2'>{quote?.rate ? quote.rate : '-'}</td>
                    <td className='py-2'>{formatTime(quote?.published_at)}</td>
                    <td className='py-2'>{status}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}

function NumberField(props: {
  id: string
  label: string
  value: number
  step?: string
  onChange: (value: number) => void
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor={props.id}>{props.label}</Label>
      <Input
        id={props.id}
        type='number'
        step={props.step ?? 'any'}
        value={props.value}
        onChange={(event) => props.onChange(Number(event.target.value))}
      />
    </div>
  )
}

function SwitchRow(props: {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className='flex items-center gap-2'>
      <Switch
        id={props.id}
        checked={props.checked}
        onCheckedChange={props.onChange}
      />
      <Label htmlFor={props.id}>{props.label}</Label>
    </div>
  )
}

export function FxSettings() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const statusQuery = useQuery({
    queryKey: ['fx-status'],
    queryFn: getFxStatus,
  })
  const current =
    draft ?? (statusQuery.data ? toDraft(statusQuery.data.config) : null)
  const original = statusQuery.data?.config

  const refreshMutation = useMutation({
    mutationFn: refreshFxRate,
    onSuccess: () => {
      toast.success(t('Rate refreshed'))
      void queryClient.invalidateQueries({ queryKey: ['fx-status'] })
    },
    onError: (error) => handleServerError(error),
  })

  const saveMutation = useMutation({
    mutationFn: async (
      changes: Array<{ key: string; value: string | number | boolean }>
    ) => {
      for (const change of changes) {
        await saveFxOption(change.key, change.value)
      }
    },
    onSuccess: () => {
      toast.success(t('Exchange rate settings saved'))
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ['fx-status'] })
    },
    onError: (error) => handleServerError(error),
  })

  if (statusQuery.isLoading) return <LoadingState />
  if (statusQuery.isError || !statusQuery.data || !current || !original) {
    return <ErrorState onRetry={() => void statusQuery.refetch()} />
  }

  const patch = (changes: Partial<Draft>) =>
    setDraft({ ...current, ...changes })
  const changes = buildChanges(current, original)

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Exchange Rate')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button
          variant='outline'
          disabled={refreshMutation.isPending}
          onClick={() => refreshMutation.mutate()}
        >
          <RefreshCw className='mr-2 h-4 w-4' />
          {t('Refresh now')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='space-y-4'>
          <RateSummary snapshot={statusQuery.data.snapshot} />
          <SourceTable snapshot={statusQuery.data.snapshot} config={current} />

          <Card>
            <CardHeader>
              <CardTitle>{t('Conversion')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              <SwitchRow
                id='fx-enabled'
                label={t('Convert wallet credit into the channel currency')}
                checked={current.enabled}
                onChange={(checked) => patch({ enabled: checked })}
              />
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='fx-currency'>{t('Quote currency')}</Label>
                  <Input
                    id='fx-currency'
                    value={current.quote_currency}
                    maxLength={3}
                    onChange={(event) =>
                      patch({
                        quote_currency: event.target.value.toUpperCase(),
                      })
                    }
                  />
                </div>
                <NumberField
                  id='fx-markup'
                  label={t('Markup (%)')}
                  value={current.markup_percent}
                  onChange={(value) => patch({ markup_percent: value })}
                />
                <NumberField
                  id='fx-refresh'
                  label={t('Refresh interval (minutes)')}
                  value={current.refresh_minutes}
                  step='1'
                  onChange={(value) => patch({ refresh_minutes: value })}
                />
                <NumberField
                  id='fx-deviation'
                  label={t('Max deviation from median (%)')}
                  value={current.max_deviation_percent}
                  onChange={(value) => patch({ max_deviation_percent: value })}
                />
                <NumberField
                  id='fx-move'
                  label={t('Max move per refresh (%)')}
                  value={current.max_move_percent}
                  onChange={(value) => patch({ max_move_percent: value })}
                />
                <NumberField
                  id='fx-manual'
                  label={t('Manual rate (0 to use the aggregation)')}
                  value={current.manual_rate}
                  onChange={(value) => patch({ manual_rate: value })}
                />
                <NumberField
                  id='fx-fallback'
                  label={t('Fallback rate (0 to disable)')}
                  value={current.fallback_rate}
                  onChange={(value) => patch({ fallback_rate: value })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('Exchange rate sources')}</CardTitle>
            </CardHeader>
            <CardContent className='space-y-4'>
              {(
                [
                  ['ecb', 'Frankfurter (ECB)'],
                  ['erapi', 'open.er-api.com'],
                  ['fawazahmed', 'currency-api (jsDelivr)'],
                  ['exchangeratefun', 'exchangerate.fun'],
                ] as const
              ).map(([id, label]) => (
                <div key={id} className='space-y-2'>
                  <SwitchRow
                    id={`fx-${id}-enabled`}
                    label={label}
                    checked={
                      current[
                        `source_${id}_enabled` as keyof FxConfig
                      ] as boolean
                    }
                    onChange={(checked) =>
                      patch({
                        [`source_${id}_enabled`]: checked,
                      } as Partial<Draft>)
                    }
                  />
                  <Input
                    aria-label={`${label} ${t('Endpoint')}`}
                    value={
                      current[`source_${id}_url` as keyof FxConfig] as string
                    }
                    onChange={(event) =>
                      patch({
                        [`source_${id}_url`]: event.target.value,
                      } as Partial<Draft>)
                    }
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className='flex justify-end'>
            <Button
              disabled={changes.length === 0 || saveMutation.isPending}
              onClick={() => saveMutation.mutate(changes)}
            >
              {t('Save')}
            </Button>
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
