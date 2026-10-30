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
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { handleServerError } from '@/lib/handle-server-error'
import { cn } from '@/lib/utils'

import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import {
  getOfficialPrices,
  resetOfficialPrice,
  saveOfficialPrice,
  syncOfficialPrices,
  type OfficialPriceItem,
} from './official-price-api'

const schema = z.object({
  enabled: z.boolean(),
  intervalHours: z.coerce.number().int().min(1).max(720),
  sourceUrl: z.string().url(),
})

type Values = z.input<typeof schema>

type Draft = {
  input: string
  output: string
  request: string
  cacheRead: string
  cacheWrite: string
  cacheWrite1h: string
}

function toDraft(item: OfficialPriceItem): Draft {
  return {
    input: item.input_price ? String(item.input_price) : '',
    output: item.output_price ? String(item.output_price) : '',
    request: item.request_price ? String(item.request_price) : '',
    cacheRead: item.cache_read_price ? String(item.cache_read_price) : '',
    cacheWrite: item.cache_write_price ? String(item.cache_write_price) : '',
    cacheWrite1h: item.cache_write_1h_price
      ? String(item.cache_write_1h_price)
      : '',
  }
}

function formatTime(value: number) {
  if (!value) return ''
  return new Date(value * 1000).toLocaleString()
}

function sourceLabel(
  source: OfficialPriceItem['source'],
  t: (key: string) => string
) {
  if (source === 'manual') return t('Manual')
  if (source === 'sync') return t('Synced')
  return t('Default')
}

const sourceTone: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  sync: 'bg-primary/10 text-primary',
  manual: 'bg-warning/10 text-warning',
}

export function OfficialPriceSettingsCard(props: {
  defaultValues: { enabled: boolean; intervalHours: number; sourceUrl: string }
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const queryClient = useQueryClient()

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      enabled: props.defaultValues.enabled,
      intervalHours: props.defaultValues.intervalHours,
      sourceUrl: props.defaultValues.sourceUrl,
    },
  })

  const overview = useQuery({
    queryKey: ['official-prices'],
    queryFn: getOfficialPrices,
  })

  const [search, setSearch] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  useEffect(() => {
    if (!overview.data) return
    const next: Record<string, Draft> = {}
    for (const item of overview.data.items) {
      next[item.model_name] = toDraft(item)
    }
    setDrafts(next)
  }, [overview.data])

  const items = useMemo(() => {
    const term = search.trim().toLowerCase()
    const rows = overview.data?.items ?? []
    if (!term) return rows
    return rows.filter((row) => row.model_name.toLowerCase().includes(term))
  }, [overview.data, search])

  const saveRow = useMutation({
    mutationFn: saveOfficialPrice,
    onSuccess: () => {
      toast.success(t('Saved'))
      queryClient.invalidateQueries({ queryKey: ['official-prices'] })
    },
    onError: (error) => handleServerError(error),
  })

  const resetRow = useMutation({
    mutationFn: resetOfficialPrice,
    onSuccess: () => {
      toast.success(t('Reset'))
      queryClient.invalidateQueries({ queryKey: ['official-prices'] })
    },
    onError: (error) => handleServerError(error),
  })

  const syncNow = useMutation({
    mutationFn: syncOfficialPrices,
    onSuccess: (state) => {
      toast.success(
        t('Synced {{updated}} models ({{matched}} matched)', {
          updated: state.updated,
          matched: state.matched,
        })
      )
      queryClient.invalidateQueries({ queryKey: ['official-prices'] })
      queryClient.invalidateQueries({ queryKey: ['pricing'] })
    },
    onError: (error) => handleServerError(error),
  })

  const onSubmit = async (values: Values) => {
    const updates: Array<{ key: string; value: string }> = []
    if (values.enabled !== props.defaultValues.enabled) {
      updates.push({
        key: 'official_price_setting.enabled',
        value: String(values.enabled),
      })
    }
    if (values.intervalHours !== props.defaultValues.intervalHours) {
      updates.push({
        key: 'official_price_setting.interval_hours',
        value: String(values.intervalHours),
      })
    }
    if (values.sourceUrl !== props.defaultValues.sourceUrl) {
      updates.push({
        key: 'official_price_setting.source_url',
        value: values.sourceUrl,
      })
    }
    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }
    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
    form.reset(values)
  }

  const state = overview.data?.state

  return (
    <SettingsSection title={t('Official reference price')}>
      <p className='text-muted-foreground text-sm'>
        {t(
          'Vendor list prices are used only for the "cheaper than official" hint in the model square. Selling prices are unaffected.'
        )}
      </p>

      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />
          <FormField
            control={form.control}
            name='enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Sync vendor prices automatically')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Import list prices from LiteLLM on a schedule. Manual edits are never overwritten.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />
          <div className='grid gap-4 sm:grid-cols-2'>
            <FormField
              control={form.control}
              name='intervalHours'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Sync interval (hours)')}</FormLabel>
                  <FormControl>
                    <Input
                      type='number'
                      min={1}
                      max={720}
                      value={field.value as number}
                      onChange={(event) =>
                        field.onChange(event.target.valueAsNumber)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='sourceUrl'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('Price source URL')}</FormLabel>
                  <FormControl>
                    <Input
                      type='url'
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </SettingsForm>
      </Form>

      <div className='flex flex-wrap items-center justify-between gap-3'>
        <p className='text-muted-foreground text-xs'>
          {state?.last_run_time
            ? t('Last sync {{time}} · matched {{matched}} · updated {{updated}}', {
                time: formatTime(state.last_run_time),
                matched: state.matched,
                updated: state.updated,
              })
            : t('Never synced')}
          {state?.error ? ` · ${state.error}` : ''}
        </p>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={syncNow.isPending}
          onClick={() => syncNow.mutate()}
        >
          {syncNow.isPending ? (
            <Loader2 className='size-4 animate-spin' />
          ) : (
            <RefreshCw className='size-4' />
          )}
          {t('Sync now')}
        </Button>
      </div>

      <Input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={t('Search models')}
        className='sm:max-w-xs'
        aria-label={t('Search models')}
      />

      <div className='overflow-x-auto rounded-lg border'>
        <table className='w-full text-sm'>
          <thead className='bg-muted/60'>
            <tr className='text-muted-foreground text-left text-xs'>
              <th className='px-3 py-2 font-medium'>{t('Model')}</th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('Input')} ($/1M)
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('Output')} ($/1M)
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('Per request')} ($)
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('Cache read')} ($/1M)
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('Cache write (5m)')} ($/1M)
              </th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('Cache write (1h)')} ($/1M)
              </th>
              <th className='px-3 py-2 font-medium'>{t('Source')}</th>
              <th className='px-3 py-2 text-right font-medium'>
                {t('Actions')}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const draft = drafts[item.model_name] ?? toDraft(item)
              const original = toDraft(item)
              const dirty = (Object.keys(original) as (keyof Draft)[]).some(
                (key) => draft[key] !== original[key]
              )
              const updateField = (field: keyof Draft, value: string) =>
                setDrafts((previous) => ({
                  ...previous,
                  [item.model_name]: { ...draft, [field]: value },
                }))
              return (
                <tr key={item.model_name} className='border-t'>
                  <td className='px-3 py-2 font-mono text-xs break-all'>
                    {item.model_name}
                  </td>
                  <td className='px-3 py-2 text-right'>
                    <Input
                      aria-label={`${item.model_name} ${t('Input')}`}
                      className='h-8 w-24 text-right'
                      type='number'
                      min={0}
                      step='any'
                      disabled={item.quota_type === 1}
                      value={draft.input}
                      onChange={(event) =>
                        updateField('input', event.target.value)
                      }
                    />
                  </td>
                  <td className='px-3 py-2 text-right'>
                    <Input
                      aria-label={`${item.model_name} ${t('Output')}`}
                      className='h-8 w-24 text-right'
                      type='number'
                      min={0}
                      step='any'
                      disabled={item.quota_type === 1}
                      value={draft.output}
                      onChange={(event) =>
                        updateField('output', event.target.value)
                      }
                    />
                  </td>
                  <td className='px-3 py-2 text-right'>
                    <Input
                      aria-label={`${item.model_name} ${t('Per request')}`}
                      className='h-8 w-24 text-right'
                      type='number'
                      min={0}
                      step='any'
                      disabled={item.quota_type !== 1}
                      value={draft.request}
                      onChange={(event) =>
                        updateField('request', event.target.value)
                      }
                    />
                  </td>
                  {(
                    [
                      ['cacheRead', t('Cache read')],
                      ['cacheWrite', t('Cache write (5m)')],
                      ['cacheWrite1h', t('Cache write (1h)')],
                    ] as const
                  ).map(([field, label]) => (
                    <td key={field} className='px-3 py-2 text-right'>
                      <Input
                        aria-label={`${item.model_name} ${label}`}
                        className='h-8 w-24 text-right'
                        type='number'
                        min={0}
                        step='any'
                        disabled={item.quota_type === 1}
                        value={draft[field]}
                        onChange={(event) =>
                          updateField(field, event.target.value)
                        }
                      />
                    </td>
                  ))}
                  <td className='px-3 py-2'>
                    <span
                      className={cn(
                        'inline-flex rounded-full px-2 py-0.5 text-[11px]',
                        sourceTone[item.source] ?? sourceTone.default
                      )}
                    >
                      {sourceLabel(item.source, t)}
                    </span>
                  </td>
                  <td className='px-3 py-2 text-right whitespace-nowrap'>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      disabled={!dirty || saveRow.isPending}
                      onClick={() =>
                        saveRow.mutate({
                          model_name: item.model_name,
                          input_price: Number(draft.input || 0),
                          output_price: Number(draft.output || 0),
                          request_price: Number(draft.request || 0),
                          cache_read_price: Number(draft.cacheRead || 0),
                          cache_write_price: Number(draft.cacheWrite || 0),
                          cache_write_1h_price: Number(draft.cacheWrite1h || 0),
                        })
                      }
                    >
                      {t('Save')}
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      disabled={item.source === 'default' || resetRow.isPending}
                      onClick={() => resetRow.mutate(item.model_name)}
                    >
                      {t('Reset')}
                    </Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {!overview.isPending && items.length === 0 && (
        <p className='text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm'>
          {t('No models match this filter.')}
        </p>
      )}
    </SettingsSection>
  )
}
