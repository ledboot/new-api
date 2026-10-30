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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { PasswordInput } from '@/components/password-input'
import { Button } from '@/components/ui/button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'

import {
  createChannelMethod,
  type ChannelListItem,
  type PaymentChannel,
  type ChannelMethod,
} from './types'

// Stripe accepts these payment_method_types; an operator can still type a
// value this list does not know about yet.
const stripePaymentTypes = [
  'auto',
  'card',
  'alipay',
  'wechat_pay',
  'link',
  'cashapp',
  'us_bank_account',
  'paypal',
  'sepa_debit',
  'ideal',
  'bancontact',
  'p24',
  'eps',
  'klarna',
  'affirm',
  'afterpay_clearpay',
  'multibanco',
  'boleto',
  'oxxo',
  'pix',
  'grabpay',
  'paynow',
  'promptpay',
  'twint',
  'blik',
  'amazon_pay',
  'revolut_pay',
  'mobilepay',
  'swish',
]

const stripePaymentTypeLabels: Record<string, string> = {
  auto: 'Auto',
  card: 'Card',
  alipay: 'Alipay',
  wechat_pay: 'WeChat Pay',
  cashapp: 'Cash App',
  us_bank_account: 'US bank account',
  paypal: 'PayPal',
  sepa_debit: 'SEPA direct debit',
  ideal: 'iDEAL',
  bancontact: 'Bancontact',
  p24: 'Przelewy24',
  eps: 'EPS',
  klarna: 'Klarna',
  affirm: 'Affirm',
  afterpay_clearpay: 'Afterpay / Clearpay',
  multibanco: 'Multibanco',
  boleto: 'Boleto',
  oxxo: 'OXXO',
  pix: 'Pix',
  grabpay: 'GrabPay',
  paynow: 'PayNow',
  promptpay: 'PromptPay',
  twint: 'TWINT',
  blik: 'BLIK',
  amazon_pay: 'Amazon Pay',
  revolut_pay: 'Revolut Pay',
  mobilepay: 'MobilePay',
  swish: 'Swish',
}

// Brand names stay as they are; only labels that carry meaning are translated.
const translatedPaymentTypeLabels = new Set([
  'Auto',
  'Card',
  'Alipay',
  'WeChat Pay',
  'US bank account',
  'SEPA direct debit',
])

export function PaymentChannelEditor(props: {
  item: ChannelListItem
  saving: boolean
  onClose: () => void
  onSave: (channel: PaymentChannel) => void
}) {
  const { t } = useTranslation()
  const [channel, setChannel] = useState<PaymentChannel>(() => {
    const cloned = structuredClone(props.item.channel)
    return {
      ...cloned,
      methods: cloned.methods.map((method) => ({
        ...method,
        fee_percent: method.fee_percent ?? '0',
        fee_fixed: method.fee_fixed ?? '0',
      })),
    }
  })
  const hosted = ['stripe', 'creem'].includes(channel.provider)
  const epay = channel.provider === 'epay' || channel.provider === '502'
  const patchMethod = (id: string, patch: Partial<ChannelMethod>) =>
    setChannel((previous) => ({
      ...previous,
      methods: previous.methods.map((method) =>
        method.id === id ? { ...method, ...patch } : method
      ),
    }))
  const paymentTypeLabel = (value: string) => {
    const label = stripePaymentTypeLabels[value] ?? value
    return translatedPaymentTypeLabels.has(label) ? t(label) : label
  }
  const patchConfig = (patch: Partial<PaymentChannel['config']>) =>
    setChannel((previous) => ({
      ...previous,
      config: { ...previous.config, ...patch },
    }))
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !props.saving) props.onClose()
      }}
      title={channel.id ? t('Edit payment channel') : t('Add payment channel')}
      description={t(
        'A channel can provide multiple wallet payment methods using the same merchant credentials.'
      )}
      footer={
        <>
          <Button
            type='button'
            variant='outline'
            disabled={props.saving}
            onClick={props.onClose}
          >
            {t('Cancel')}
          </Button>
          <Button
            type='submit'
            form='payment-channel-form'
            disabled={props.saving}
          >
            {props.saving ? t('Saving...') : t('Save payment channel')}
          </Button>
        </>
      }
    >
      <form
        id='payment-channel-form'
        className='space-y-6'
        onSubmit={(event) => {
          event.preventDefault()
          props.onSave(channel)
        }}
      >
        <fieldset disabled={props.saving} className='min-w-0 space-y-4'>
          <div className='grid gap-4 sm:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='channel-name'>{t('Channel name')}</Label>
              <Input
                id='channel-name'
                required
                maxLength={120}
                value={channel.name}
                onChange={(event) =>
                  setChannel({ ...channel, name: event.target.value })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label>{t('Payment provider')}</Label>
              <Combobox
                aria-label={t('Payment provider')}
                disabled={channel.id !== 0}
                value={channel.provider as string}
                options={['502', 'epay', 'bepusdt', 'stripe', 'creem'].map(
                  (provider) => ({
                    value: provider,
                    label:
                      {
                        '502': '502 Pay',
                        epay: 'Epay V1',
                        bepusdt: 'BEpusdt',
                        stripe: 'Stripe',
                        creem: 'Creem',
                      }[provider] ?? provider,
                  })
                )}
                onValueChange={(value) => {
                  if (!value) return
                  const provider = value as PaymentChannel['provider']
                  setChannel({
                    ...channel,
                    provider,
                    currency:
                      provider === '502' || provider === 'epay' ? 'CNY' : 'USD',
                    config: {
                      gateway_url:
                        provider === '502'
                          ? 'https://pay.502k.cn/xpay/epay'
                          : '',
                      api_key: '',
                      merchant_id: '',
                      webhook_secret: '',
                      test_mode: false,
                    },
                    methods: [createChannelMethod(provider)],
                  })
                }}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='channel-order'>{t('Sort order')}</Label>
              <Input
                id='channel-order'
                type='number'
                required
                min={0}
                max={1000000}
                value={channel.sort_order}
                onChange={(event) =>
                  setChannel({
                    ...channel,
                    sort_order: Number(event.target.value),
                  })
                }
              />
            </div>
            <div className='space-y-2'>
              <Label>{t('Currency')}</Label>
              <Combobox
                aria-label={t('Currency')}
                disabled={epay || channel.provider === 'bepusdt'}
                value={channel.currency as string}
                options={['CNY', 'USD', 'EUR'].map((value) => ({
                  value,
                  label: value,
                }))}
                onValueChange={(value) => {
                  if (value) {
                    setChannel({
                      ...channel,
                      currency: value as PaymentChannel['currency'],
                    })
                  }
                }}
              />
            </div>
          </div>
          <div className='flex items-center justify-between gap-3'>
            <Label htmlFor='channel-enabled'>{t('Enabled')}</Label>
            <Switch
              id='channel-enabled'
              checked={channel.enabled}
              onCheckedChange={(enabled) => setChannel({ ...channel, enabled })}
            />
          </div>
          {!hosted && (
            <div className='space-y-2'>
              <Label htmlFor='channel-url'>{t('Gateway URL')}</Label>
              <Input
                id='channel-url'
                type='url'
                required
                value={channel.config.gateway_url}
                onChange={(event) =>
                  patchConfig({ gateway_url: event.target.value })
                }
              />
            </div>
          )}
          {epay && (
            <div className='space-y-2'>
              <Label htmlFor='channel-merchant'>{t('Merchant ID')}</Label>
              <Input
                id='channel-merchant'
                required
                value={channel.config.merchant_id}
                onChange={(event) =>
                  patchConfig({ merchant_id: event.target.value })
                }
              />
            </div>
          )}
          <div className='space-y-2'>
            <Label htmlFor='channel-key'>{t('API key')}</Label>
            <PasswordInput
              id='channel-key'
              autoComplete='new-password'
              required={!props.item.api_key_configured}
              value={channel.config.api_key}
              placeholder={
                props.item.api_key_configured
                  ? t('Leave blank to keep the current secret')
                  : ''
              }
              onChange={(event) => patchConfig({ api_key: event.target.value })}
            />
          </div>
          {['stripe', 'creem'].includes(channel.provider) && (
            <div className='space-y-2'>
              <Label htmlFor='channel-webhook'>{t('Webhook secret')}</Label>
              <PasswordInput
                id='channel-webhook'
                autoComplete='new-password'
                required={!props.item.webhook_secret_configured}
                value={channel.config.webhook_secret}
                placeholder={
                  props.item.webhook_secret_configured
                    ? t('Leave blank to keep the current secret')
                    : ''
                }
                onChange={(event) =>
                  patchConfig({ webhook_secret: event.target.value })
                }
              />
            </div>
          )}
          {channel.provider === 'creem' && (
            <div className='flex items-center justify-between'>
              <Label htmlFor='channel-test'>{t('Test mode')}</Label>
              <Switch
                id='channel-test'
                checked={channel.config.test_mode}
                onCheckedChange={(test_mode) => patchConfig({ test_mode })}
              />
            </div>
          )}
          {props.item.notify_url && (
            <div className='space-y-2'>
              <Label>{t('Payment callback URL')}</Label>
              <div className='flex min-w-0 items-center gap-2'>
                <code className='min-w-0 break-all text-xs'>
                  {props.item.notify_url}
                </code>
                <CopyButton value={props.item.notify_url} />
              </div>
            </div>
          )}
          {!props.item.notify_url && (
            <p className='text-muted-foreground text-sm'>
              {t(
                'Save the channel to obtain its callback URL. Configure this URL in Stripe or Creem webhook settings.'
              )}
            </p>
          )}
          {hosted && (
            <p className='text-muted-foreground text-sm'>
              {t(
                'This integration uses hosted checkout. QR payment is available for Epay, 502 and BEpusdt channels.'
              )}
            </p>
          )}
          <div className='flex items-center justify-between gap-3'>
            <h4 className='font-medium'>{t('Payment methods')}</h4>
            <Button
              type='button'
              variant='outline'
              disabled={channel.methods.length >= 50}
              onClick={() =>
                setChannel({
                  ...channel,
                  methods: [
                    ...channel.methods,
                    createChannelMethod(channel.provider),
                  ],
                })
              }
            >
              {t('Add payment method')}
            </Button>
          </div>
          {channel.methods.map((method, index) => (
            <div key={method.id} className='space-y-4 rounded-lg border p-4'>
              <div className='flex items-center justify-between gap-2'>
                <Label htmlFor={`method-enabled-${method.id}`}>
                  {t('Enabled')} {index + 1}
                </Label>
                <div className='flex items-center gap-2'>
                  <Switch
                    id={`method-enabled-${method.id}`}
                    checked={method.enabled}
                    onCheckedChange={(enabled) =>
                      patchMethod(method.id, { enabled })
                    }
                  />
                  <Button
                    type='button'
                    variant='ghost'
                    disabled={channel.methods.length === 1}
                    aria-label={`${t('Remove payment method')} ${index + 1}`}
                    onClick={() =>
                      setChannel({
                        ...channel,
                        methods: channel.methods.filter(
                          (entry) => entry.id !== method.id
                        ),
                      })
                    }
                  >
                    {t('Remove')}
                  </Button>
                </div>
              </div>
              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor={`method-name-${method.id}`}>
                    {t('Method name')} {index + 1}
                  </Label>
                  <Input
                    id={`method-name-${method.id}`}
                    required
                    maxLength={120}
                    value={method.name}
                    onChange={(event) =>
                      patchMethod(method.id, { name: event.target.value })
                    }
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor={`method-type-${method.id}`}>
                    {t('Payment type')} {index + 1}
                  </Label>
                  {channel.provider === '502' || channel.provider === 'stripe' ? (
                    <Combobox
                      id={`method-type-${method.id}`}
                      aria-label={`${t('Payment type')} ${index + 1}`}
                      value={method.type}
                      allowCustomValue={channel.provider === 'stripe'}
                      options={
                        channel.provider === '502'
                          ? [
                              { value: 'alipay', label: t('Alipay') },
                              { value: 'wxpay', label: t('WeChat Pay') },
                            ]
                          : stripePaymentTypes.map((value) => ({
                              value,
                              label: paymentTypeLabel(value),
                            }))
                      }
                      onValueChange={(value) => {
                        if (value) patchMethod(method.id, { type: value })
                      }}
                    />
                  ) : (
                    <Input
                      id={`method-type-${method.id}`}
                      required
                      maxLength={80}
                      value={method.type}
                      placeholder={
                        channel.provider === 'bepusdt'
                          ? 'usdt.trc20 / usdt.bep20'
                          : 'alipay / wxpay / card'
                      }
                      onChange={(event) =>
                        patchMethod(method.id, { type: event.target.value })
                      }
                    />
                  )}
                </div>
                <div className='space-y-2'>
                  <Label>
                    {t('Interaction mode')} {index + 1}
                  </Label>
                  <Combobox
                    aria-label={`${t('Interaction mode')} ${index + 1}`}
                    disabled={hosted}
                    value={method.interaction}
                    options={[
                      { value: 'redirect', label: t('Redirect') },
                      ...(!hosted
                        ? [{ value: 'qr', label: t('QR code') }]
                        : []),
                    ]}
                    onValueChange={(value) => {
                      if (value) {
                        patchMethod(method.id, {
                          interaction: value as ChannelMethod['interaction'],
                        })
                      }
                    }}
                  />
                </div>
                <div className='space-y-2'>
                  <Label htmlFor={`method-price-${method.id}`}>
                    {channel.provider === 'creem'
                      ? t('Product price')
                      : t('Price per USD of wallet credit')}{' '}
                    ({channel.currency}) {index + 1}
                  </Label>
                  <Input
                    id={`method-price-${method.id}`}
                    type='number'
                    required
                    min={0.01}
                    max={1000000}
                    step='any'
                    value={method.unit_price}
                    onChange={(event) =>
                      patchMethod(method.id, { unit_price: event.target.value })
                    }
                  />
                </div>
                {channel.provider !== 'creem' && (
                  <>
                    <div className='space-y-2'>
                      <Label htmlFor={`method-fee-percent-${method.id}`}>
                        {t('Fee percentage (%)')} {index + 1}
                      </Label>
                      <Input
                        id={`method-fee-percent-${method.id}`}
                        type='number'
                        min={0}
                        max={100}
                        step='any'
                        value={method.fee_percent}
                        onChange={(event) =>
                          patchMethod(method.id, {
                            fee_percent: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor={`method-fee-fixed-${method.id}`}>
                        {t('Fixed fee')} ({channel.currency}) {index + 1}
                      </Label>
                      <Input
                        id={`method-fee-fixed-${method.id}`}
                        type='number'
                        min={0}
                        max={1000000}
                        step='any'
                        value={method.fee_fixed}
                        onChange={(event) =>
                          patchMethod(method.id, {
                            fee_fixed: event.target.value,
                          })
                        }
                      />
                    </div>
                  </>
                )}
                {channel.provider === 'creem' ? (
                  <>
                    <div className='space-y-2'>
                      <Label htmlFor={`method-product-${method.id}`}>
                        {t('Product ID')} {index + 1}
                      </Label>
                      <Input
                        id={`method-product-${method.id}`}
                        required
                        value={method.product_id}
                        onChange={(event) =>
                          patchMethod(method.id, {
                            product_id: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor={`method-credit-${method.id}`}>
                        {t('Wallet credit in USD')} {index + 1}
                      </Label>
                      <Input
                        id={`method-credit-${method.id}`}
                        type='number'
                        required
                        min={0.01}
                        max={1000000}
                        step='any'
                        value={method.credit_amount}
                        onChange={(event) =>
                          patchMethod(method.id, {
                            credit_amount: event.target.value,
                          })
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className='space-y-2'>
                      <Label htmlFor={`method-min-${method.id}`}>
                        {t('Minimum wallet credit in USD')} {index + 1}
                      </Label>
                      <Input
                        id={`method-min-${method.id}`}
                        type='number'
                        required
                        min={1}
                        max={1000000}
                        value={method.min_topup}
                        onChange={(event) =>
                          patchMethod(method.id, {
                            min_topup: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className='space-y-2'>
                      <Label htmlFor={`method-max-${method.id}`}>
                        {t('Maximum wallet credit in USD (0 for unlimited)')}{' '}
                        {index + 1}
                      </Label>
                      <Input
                        id={`method-max-${method.id}`}
                        type='number'
                        required
                        min={0}
                        max={1000000}
                        value={method.max_topup}
                        onChange={(event) =>
                          patchMethod(method.id, {
                            max_topup: Number(event.target.value),
                          })
                        }
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
          {channel.provider !== 'creem' && (
            <p className='text-muted-foreground text-sm'>
              {t(
                'Fees are added on top of the amount charged by the gateway. Wallet credit stays the same.'
              )}
            </p>
          )}
          {channel.provider === 'creem' && (
            <p className='text-muted-foreground text-sm'>
              {t(
                'The product price and currency must match Creem. Each product credits the configured fixed wallet amount.'
              )}
            </p>
          )}
        </fieldset>
      </form>
    </Dialog>
  )
}
