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
import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Dialog } from '@/components/dialog'
import { ErrorState } from '@/components/error-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { requireServerSuccess } from '@/lib/server-error-message'

import { getOpenLuxCatalog } from '../api'
import type { OpenLuxSource, UpstreamChannel } from '../types'
import { OpenLuxCatalogBrowser } from './openlux-catalog-browser'

const SyncWizardDialog = lazy(() =>
  import('@/features/models/components/dialogs/sync-wizard-dialog').then(
    (module) => ({ default: module.SyncWizardDialog })
  )
)

const openLuxSourceSchema = z.object({
  channel_id: z.string().min(1),
  group: z.string().min(1),
  ratio_unit: z.number().finite().positive(),
  multiplier: z.number().finite().min(1).max(1000),
  key_group_confirmed: z.boolean().refine((value) => value),
})

export function OpenLuxSourceDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  channels: UpstreamChannel[]
  onConfirm: (channel: UpstreamChannel, source: OpenLuxSource) => void
}) {
  const { t } = useTranslation()
  const [metadataOpen, setMetadataOpen] = useState(false)
  const form = useForm<z.infer<typeof openLuxSourceSchema>>({
    resolver: zodResolver(openLuxSourceSchema),
    mode: 'onChange',
    defaultValues: {
      channel_id: '',
      group: '',
      multiplier: 1.2,
      key_group_confirmed: false,
    },
  })
  const [channelID, group, unit, multiplier, confirmed] = useWatch({
    control: form.control,
    name: [
      'channel_id',
      'group',
      'ratio_unit',
      'multiplier',
      'key_group_confirmed',
    ],
  })
  const catalog = useQuery({
    queryKey: ['openlux-catalog'],
    queryFn: async () => requireServerSuccess(await getOpenLuxCatalog()).data,
    enabled: props.open,
    staleTime: 0,
    retry: false,
  })
  const channels = useMemo(
    () =>
      props.channels.filter(
        (channel) =>
          channel.status === 1 &&
          (channel.type === undefined ||
            channel.type === 1 ||
            channel.type === 60) &&
          channel.base_url.replace(/\/+$/, '') === 'https://www.openlux.ai'
      ),
    [props.channels]
  )
  const selected = channels.find((channel) => String(channel.id) === channelID)
  const groups = Object.entries(catalog.data?.groups ?? {}).map(
    ([value, label]) => ({ value, label })
  )
  const valid = Boolean(
    form.formState.isValid &&
    selected &&
    group &&
    catalog.data &&
    Object.hasOwn(catalog.data.groups, group) &&
    Number.isFinite(Number(unit)) &&
    Number(unit) > 0 &&
    Number.isFinite(Number(multiplier)) &&
    Number(multiplier) >= 1 &&
    Number(multiplier) <= 1000 &&
    confirmed
  )
  return (
    <Dialog
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={t('OpenLux pricing source')}
      description={t(
        'Choose a saved channel and its upstream group, then preview cost and selling prices.'
      )}
      contentClassName='sm:max-w-6xl'
      contentHeight='min(72vh, 850px)'
      footer={
        <>
          <Button variant='outline' onClick={() => props.onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            disabled={!valid || catalog.isFetching}
            onClick={() => {
              if (!valid || !selected || !group || !catalog.data) return
              props.onConfirm(selected, {
                group,
                ratio_unit: Number(unit),
                multiplier: Number(multiplier),
                version: catalog.data.version,
                key_group_confirmed: Boolean(confirmed),
              })
              props.onOpenChange(false)
            }}
          >
            {t('Preview prices')}
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
        {catalog.data?.catalog && (
          <OpenLuxCatalogBrowser
            catalog={catalog.data}
            unit={
              Number.isFinite(Number(unit)) && Number(unit) > 0
                ? Number(unit)
                : (catalog.data.price_unit ?? 2)
            }
            multiplier={
              Number.isFinite(Number(multiplier)) &&
              Number(multiplier) >= 1 &&
              Number(multiplier) <= 1000
                ? Number(multiplier)
                : Number.NaN
            }
          />
        )}
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            disabled={catalog.isFetching}
            onClick={() => void catalog.refetch()}
          >
            {t('Refresh source data')}
          </Button>
          <Button variant='outline' onClick={() => setMetadataOpen(true)}>
            {t('Sync model metadata')}
          </Button>
        </div>
        <div className='space-y-2'>
          <Label>{t('Channel')}</Label>
          <Select
            value={channelID}
            items={channels.map((channel) => ({
              value: String(channel.id),
              label: channel.name,
            }))}
            onValueChange={(value) => {
              form.setValue('channel_id', value ?? '', { shouldValidate: true })
              form.setValue('key_group_confirmed', false)
            }}
          >
            <SelectTrigger className='w-full' aria-label={t('Channel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {channels.map((channel) => (
                <SelectItem key={channel.id} value={String(channel.id)}>
                  {channel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {channels.length === 0 && (
            <p className='text-muted-foreground text-sm'>
              {t(
                'Create an enabled channel with base URL https://www.openlux.ai and configure its models first.'
              )}
            </p>
          )}
        </div>
        <div className='space-y-2'>
          <Label>{t('OpenLux upstream group')}</Label>
          <Select
            value={group}
            items={groups}
            onValueChange={(value) => {
              form.setValue('group', value ?? '', { shouldValidate: true })
              form.setValue('key_group_confirmed', false)
            }}
          >
            <SelectTrigger
              className='w-full'
              aria-label={t('OpenLux upstream group')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groups.map((entry) => (
                <SelectItem key={entry.value} value={entry.value}>
                  {entry.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className='text-muted-foreground text-sm'>
            {catalog.data?.account_rates
              ? t('Using account-specific OpenLux rates.')
              : t(
                  'Using public rates. Verify your account pricing before publishing.'
                )}
          </p>
        </div>
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-2'>
            <Label htmlFor='openlux-unit'>
              {t('USD per 1M tokens at ratio 1')}
            </Label>
            <Input
              id='openlux-unit'
              type='number'
              min='0'
              step='any'
              {...form.register('ratio_unit', { valueAsNumber: true })}
            />
            {catalog.data?.price_unit && (
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Source reference: {{price}} USD per million tokens at ratio 1',
                  { price: catalog.data.price_unit }
                )}
              </p>
            )}
            <p className='text-muted-foreground text-xs'>
              {t(
                'Enter the verified upstream price unit; no currency conversion is assumed.'
              )}
            </p>
          </div>
          <div className='space-y-2'>
            <Label htmlFor='openlux-markup'>
              {t('Selling price multiplier')}
            </Label>
            <Input
              id='openlux-markup'
              type='number'
              min='1'
              max='1000'
              step='any'
              {...form.register('multiplier', { valueAsNumber: true })}
            />
            <p className='text-muted-foreground text-xs'>
              {t('For example, 1.2 adds 20% to upstream cost.')}
            </p>
          </div>
        </div>
        <Label className='flex items-start gap-2'>
          <Checkbox
            checked={confirmed}
            onCheckedChange={(value) =>
              form.setValue('key_group_confirmed', Boolean(value), {
                shouldValidate: true,
              })
            }
          />
          <span>
            {t(
              'I verified that every API key in this channel is fixed to the selected upstream group.'
            )}
          </span>
        </Label>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Only supported text models configured on this channel are quoted. Other enabled channels serving the same model must be resolved first. Local user-group multipliers still apply.'
          )}
        </p>
        {metadataOpen && (
          <Suspense fallback={<LoadingState />}>
            <SyncWizardDialog
              open
              initialSource='openlux'
              onOpenChange={setMetadataOpen}
            />
          </Suspense>
        )}
      </div>
    </Dialog>
  )
}
