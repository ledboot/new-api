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
import { QRCodeSVG } from 'qrcode.react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

import { getChannelPaymentStatus, type ChannelCheckout } from '../../api'

const COUNTDOWN_TICK_MS = 1000

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function ChannelPaymentDialog(props: {
  checkout: ChannelCheckout
  onClose: () => void
  onPaid: () => void
}) {
  const { t } = useTranslation()
  const onPaid = props.onPaid
  const expiresAt = props.checkout.expires_at
  const [now, setNow] = useState(() => Date.now())
  const remainingSeconds = expiresAt
    ? Math.max(0, Math.ceil((expiresAt * 1000 - now) / 1000))
    : null
  const expired = remainingSeconds === 0
  useEffect(() => {
    if (!expiresAt || expired) return
    const timer = setInterval(() => setNow(Date.now()), COUNTDOWN_TICK_MS)
    return () => clearInterval(timer)
  }, [expiresAt, expired])
  // epay-family gateways (CNY) confirm a payment only when its amount matches
  // the order exactly. Only the 502 gateway sends a deadline for CNY orders, so
  // the five-minute copy appears only when a deadline is present.
  const requiresExactAmount = props.checkout.currency === 'CNY'
  const showFiveMinuteNotice = requiresExactAmount && remainingSeconds !== null
  const status = useQuery({
    queryKey: ['wallet-payment', props.checkout.order_id],
    queryFn: () => getChannelPaymentStatus(props.checkout.order_id),
    refetchInterval: (query) =>
      query.state.data === 'success' || expired ? false : 2000,
    retry: false,
  })
  useEffect(() => {
    if (status.data === 'success') {
      toast.success(t('Payment successful'))
      onPaid()
    }
  }, [status.data, onPaid, t])
  return (
    <Dialog
      open
      title={t('Scan to pay')}
      description={t(
        'Wallet credit is added only after the payment gateway confirms payment.'
      )}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
      footer={
        <Button type='button' variant='outline' onClick={props.onClose}>
          {t('Close')}
        </Button>
      }
    >
      <div className='flex flex-col items-center gap-4'>
        <p className='text-xl font-semibold'>
          {props.checkout.amount} {props.checkout.currency}
        </p>
        {requiresExactAmount && (
          <Alert className='w-full'>
            <AlertDescription className='text-center'>
              <span className='block font-semibold'>
                {t('Enter the exact amount after scanning')}
              </span>
              <span className='block'>
                {t(
                  'You must enter the exact amount shown above, including fees. Do not pay less, pay more, or round the amount, or the order cannot be confirmed automatically.'
                )}
              </span>
            </AlertDescription>
          </Alert>
        )}
        {remainingSeconds !== null && !expired && (
          <div className='flex w-full flex-col items-center gap-1 rounded-lg border p-3 text-center'>
            <p className='text-muted-foreground text-sm'>
              {t('Time left to pay')}
            </p>
            <p className='text-3xl font-semibold tabular-nums' role='timer'>
              {formatCountdown(remainingSeconds)}
            </p>
            <p className='text-muted-foreground text-sm'>
              {showFiveMinuteNotice
                ? t(
                    'The order is held for at most 5 minutes. Pay before the countdown ends.'
                  )
                : t('Pay before the countdown ends.')}
            </p>
          </div>
        )}
        {props.checkout.network && (
          <p className='text-center font-medium'>
            {t('Network')}: {props.checkout.network}
          </p>
        )}
        {props.checkout.crypto_amount && (
          <p className='text-center font-semibold'>
            {t('Exact transfer amount')}: {props.checkout.crypto_amount}
          </p>
        )}
        {!expired && (
          <div className='max-w-full rounded-lg bg-white p-4'>
            <QRCodeSVG
              value={props.checkout.qr_code ?? ''}
              size={220}
              className='h-auto max-w-full'
              title={t('Payment QR code')}
            />
          </div>
        )}
        {!expired && (
          <CopyButton
            value={props.checkout.qr_code ?? ''}
            variant='outline'
            size='sm'
          >
            {t('Copy payment code')}
          </CopyButton>
        )}
        {props.checkout.network && (
          <p className='text-muted-foreground text-center text-sm'>
            {t(
              'Use the selected network and transfer the exact amount before the order expires.'
            )}
          </p>
        )}
        {expired && (
          <p role='status'>
            {t(
              'This payment code has expired. Check the payment status or create a new order.'
            )}
          </p>
        )}
        <p className='text-muted-foreground text-sm' role='status'>
          {status.isError
            ? t('Payment status unavailable. Retry to check your payment.')
            : t('Waiting for payment')}
        </p>
        {(status.isError || expired) && (
          <Button type='button' onClick={() => status.refetch()}>
            {t('Retry')}
          </Button>
        )}
      </div>
    </Dialog>
  )
}
