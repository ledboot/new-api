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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { StaticDataTable } from '@/components/data-table/static/static-data-table'
import { StaticRowActions } from '@/components/data-table/static/static-row-actions'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { handleServerError } from '@/lib/handle-server-error'

import {
  deletePaymentChannel,
  listPaymentChannels,
  savePaymentChannel,
} from './api'
import { PaymentChannelEditor } from './payment-channel-editor'
import {
  createPaymentChannel,
  type ChannelListItem,
  type PaymentChannel,
} from './types'

export function PaymentChannels(props: { enabled: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['payment-channels'],
    queryFn: listPaymentChannels,
  })
  const [editing, setEditing] = useState<ChannelListItem | null>(null)
  const [deleting, setDeleting] = useState<PaymentChannel | null>(null)
  const save = useMutation({
    mutationFn: savePaymentChannel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-channels'] })
      setEditing(null)
      toast.success(t('Payment channel saved'))
    },
    onError: (error) => handleServerError(error),
  })
  const remove = useMutation({
    mutationFn: deletePaymentChannel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-channels'] })
      setDeleting(null)
      toast.success(t('Payment channel deleted'))
    },
    onError: (error) => handleServerError(error),
  })
  return (
    <div className='min-w-0 space-y-4'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='space-y-1'>
          <h4 className='font-semibold'>{t('Payment channels')}</h4>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Each channel has its own credentials and payment methods. Enabled methods appear in the wallet.'
            )}
          </p>
        </div>
        <Button
          type='button'
          disabled={!props.enabled}
          onClick={() =>
            setEditing({
              channel: createPaymentChannel(),
              api_key_configured: false,
              webhook_secret_configured: false,
              notify_url: '',
            })
          }
        >
          {t('Add payment channel')}
        </Button>
      </div>
      {query.isPending && <p role='status'>{t('Loading...')}</p>}
      {query.isError && (
        <Button type='button' variant='outline' onClick={() => query.refetch()}>
          {t('Retry')}
        </Button>
      )}
      {!query.isPending && !query.isError && (
        <StaticDataTable
          data={query.data ?? []}
          getRowKey={(item) => String(item.channel.id)}
          columns={[
            {
              id: 'name',
              header: t('Channel name'),
              cell: (item) => (
                <div>
                  <p className='font-medium'>{item.channel.name}</p>
                  <p className='text-muted-foreground text-xs'>
                    {item.channel.provider} · {item.channel.currency}
                  </p>
                </div>
              ),
            },
            {
              id: 'methods',
              header: t('Payment methods'),
              cell: (item) => (
                <div className='space-y-1'>
                  {item.channel.methods.map((method) => (
                    <p
                      key={method.id}
                      className={method.enabled ? '' : 'text-muted-foreground'}
                    >
                      {method.name}{' '}
                      <span className='text-muted-foreground text-xs'>
                        ({method.type} ·{' '}
                        {method.interaction === 'qr'
                          ? t('QR code')
                          : t('Redirect')}
                        )
                      </span>
                    </p>
                  ))}
                </div>
              ),
            },
            {
              id: 'order',
              header: t('Sort order'),
              cell: (item) => item.channel.sort_order,
            },
            {
              id: 'enabled',
              header: t('Enabled'),
              cell: (item) => (
                <Switch
                  aria-label={`${t('Enabled')} ${item.channel.name}`}
                  checked={item.channel.enabled}
                  disabled={!props.enabled || save.isPending}
                  onCheckedChange={(enabled) =>
                    save.mutate({ ...item.channel, enabled })
                  }
                />
              ),
            },
            {
              id: 'actions',
              header: t('Actions'),
              cell: (item) => (
                <StaticRowActions
                  editLabel={`${t('Edit')} ${item.channel.name}`}
                  deleteLabel={t('Delete')}
                  menuLabel={t('Open menu')}
                  editDisabled={!props.enabled}
                  deleteDisabled={!props.enabled}
                  onEdit={() => setEditing(item)}
                  onDelete={() => setDeleting(item.channel)}
                />
              ),
            },
          ]}
        />
      )}
      {!query.isPending && !query.isError && query.data?.length === 0 && (
        <p className='text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm'>
          {t('No payment channels configured')}
        </p>
      )}
      {editing && (
        <PaymentChannelEditor
          key={editing.channel.id}
          item={editing}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(channel) => save.mutate(channel)}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setDeleting(null)
        }}
        title={t('Delete payment channel')}
        desc={t(
          'This hides its payment methods from the wallet. Existing paid orders can still be credited.'
        )}
        destructive
        confirmText={t('Delete')}
        isLoading={remove.isPending}
        handleConfirm={() => {
          if (deleting) remove.mutate(deleting.id)
        }}
      />
    </div>
  )
}
