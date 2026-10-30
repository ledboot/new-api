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
import i18next from 'i18next'
import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'

import { handleServerError } from '@/lib/handle-server-error'

import {
  calculateChannelAmount,
  requestChannelPayment,
  type ChannelCheckout,
  calculateBepusdtAmount,
  requestBepusdtPayment,
  calculateAmount,
  calculateStripeAmount,
  calculateWaffoAmount,
  calculateWaffoPancakeAmount,
  requestPayment,
  requestStripePayment,
  isApiSuccess,
} from '../api'
import { PAYMENT_TYPES } from '../constants'
import {
  isStripePayment,
  isWaffoPayment,
  isWaffoPancakePayment,
  submitPaymentForm,
  getHostedCheckoutUrl,
} from '../lib'
import type { AmountRequest, AmountResponse } from '../types'

// ============================================================================
// Payment Hook
// ============================================================================

type AmountCalculator = (request: AmountRequest) => Promise<AmountResponse>

export interface PaymentAmountCalculators {
  bepusdt?: AmountCalculator
  regular: AmountCalculator
  stripe: AmountCalculator
  waffo: AmountCalculator
  waffoPancake: AmountCalculator
}

const defaultPaymentAmountCalculators: PaymentAmountCalculators = {
  bepusdt: calculateBepusdtAmount,
  regular: calculateAmount,
  stripe: calculateStripeAmount,
  waffo: calculateWaffoAmount,
  waffoPancake: calculateWaffoPancakeAmount,
}

export async function requestPaymentAmount(
  topupAmount: number,
  paymentType: string,
  calculators: PaymentAmountCalculators = defaultPaymentAmountCalculators
): Promise<number> {
  if (paymentType.startsWith('channel:')) {
    const response = await calculateChannelAmount(
      paymentType,
      Math.floor(topupAmount)
    )
    if (!isApiSuccess(response) || !response.data) {
      handleServerError(response, i18next.t('Payment request failed'))
      return 0
    }
    return Number.parseFloat(response.data)
  }
  let calculator = calculators.regular
  if (paymentType === PAYMENT_TYPES.BEPUSDT) {
    calculator = calculators.bepusdt ?? calculateBepusdtAmount
  } else if (isStripePayment(paymentType)) {
    calculator = calculators.stripe
  } else if (isWaffoPayment(paymentType)) {
    calculator = calculators.waffo
  } else if (isWaffoPancakePayment(paymentType)) {
    calculator = calculators.waffoPancake
  }

  const response = await calculator({ amount: topupAmount })
  if (!isApiSuccess(response) || !response.data) {
    return 0
  }

  return Number.parseFloat(response.data)
}

export function usePayment() {
  const [amount, setAmount] = useState<number>(0)
  const quoteVersion = useRef(0)
  const [channelCheckout, setChannelCheckout] =
    useState<ChannelCheckout | null>(null)
  const [calculating, setCalculating] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Calculate payment amount
  const calculatePaymentAmount = useCallback(
    async (topupAmount: number, paymentType: string) => {
      const version = ++quoteVersion.current
      try {
        setCalculating(true)
        const calculatedAmount = await requestPaymentAmount(
          topupAmount,
          paymentType
        )
        if (version === quoteVersion.current) setAmount(calculatedAmount)
        return calculatedAmount
      } catch (error) {
        if (paymentType.startsWith('channel:')) {
          handleServerError(error, i18next.t('Payment request failed'))
        }
        if (version === quoteVersion.current) setAmount(0)
        return 0
      } finally {
        if (version === quoteVersion.current) setCalculating(false)
      }
    },
    []
  )

  // Process payment
  const processPayment = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setProcessing(true)

        if (paymentType.startsWith('channel:')) {
          const response = await requestChannelPayment(
            paymentType,
            Math.floor(topupAmount)
          )
          if (!isApiSuccess(response) || !response.data) {
            handleServerError(response, i18next.t('Payment request failed'))
            return false
          }
          if (response.data.kind === 'qr' && response.data.qr_code) {
            setChannelCheckout(response.data)
            return true
          }
          const url = getHostedCheckoutUrl(response.data)
          if (!url) {
            handleServerError(response, i18next.t('Payment request failed'))
            return false
          }
          window.location.assign(url)
          return true
        }
        if (paymentType === PAYMENT_TYPES.BEPUSDT) {
          const response = await requestBepusdtPayment({
            amount: Math.floor(topupAmount),
          })
          const checkoutUrl = getHostedCheckoutUrl(response.data)
          if (!isApiSuccess(response) || !checkoutUrl) {
            handleServerError(response, i18next.t('Payment request failed'))
            return false
          }
          window.location.assign(checkoutUrl)
          return true
        }

        const isStripe = isStripePayment(paymentType)
        const amount = Math.floor(topupAmount)

        const response = isStripe
          ? await requestStripePayment({
              amount,
              payment_method: 'stripe',
            })
          : await requestPayment({
              amount,
              payment_method: paymentType,
            })

        if (!isApiSuccess(response)) {
          handleServerError(response, i18next.t('Payment request failed'))
          return false
        }

        // Handle Stripe payment
        if (isStripe && response.data?.pay_link) {
          window.open(response.data.pay_link as string, '_blank')
          toast.success(i18next.t('Redirecting to payment page...'))
          return true
        }

        // Handle non-Stripe payment
        if (!isStripe && response.data) {
          const url = (response as unknown as { url?: string }).url
          if (url) {
            submitPaymentForm(url, response.data)
            toast.success(i18next.t('Redirecting to payment page...'))
            return true
          }
        }

        return false
      } catch (error) {
        handleServerError(error, i18next.t('Payment request failed'))
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  return {
    amount,
    channelCheckout,
    clearChannelCheckout: () => setChannelCheckout(null),
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
    setAmount,
  }
}
