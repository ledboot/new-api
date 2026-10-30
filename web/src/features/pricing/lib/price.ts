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
import { formatBillingCurrencyFromUSD } from '@/lib/currency'

import { QUOTA_TYPE_VALUES, TOKEN_UNIT_DIVISORS } from '../constants'
import type { PricingModel, TokenUnit, PriceType } from '../types'
import { getConfiguredGroupRatio, getDisplayGroupRatio } from './model-helpers'

// ----------------------------------------------------------------------------
// Price Calculation Utilities
// ----------------------------------------------------------------------------

/**
 * Strip trailing zeros from formatted price string while preserving currency symbols
 */
export function stripTrailingZeros(formatted: string): string {
  // Match currency symbol at start, number, and potential 'k' suffix
  const match = formatted.match(/^([^\d-]*)([-\d,]+\.?\d*)(k?)$/)
  if (!match) return formatted

  const [, symbol, number, suffix] = match

  // Remove commas for processing
  const cleanNumber = number.replaceAll(',', '')

  // Convert to number and back to remove trailing zeros
  const parsed = Number.parseFloat(cleanNumber)
  if (Number.isNaN(parsed)) return formatted

  // Convert to string, which automatically removes trailing zeros
  let result = parsed.toString()

  // If the result is in scientific notation, format it properly
  if (result.includes('e')) {
    result = parsed.toFixed(20).replace(/\.?0+$/, '')
  }

  return `${symbol}${result}${suffix}`
}

/**
 * Calculate token price in USD.
 *
 * Returns NaN when the required ratio field is missing/null so callers can
 * skip rendering that price type.
 */
export function calculateTokenPrice(
  model: PricingModel,
  type: PriceType,
  ratio: number
): number {
  const base = model.model_ratio * 2 * ratio

  switch (type) {
    case 'input':
      return base
    case 'output':
      return base * model.completion_ratio
    case 'cache':
      return hasRatio(model.cache_ratio)
        ? base * Number(model.cache_ratio)
        : Number.NaN
    case 'create_cache':
      return hasRatio(model.create_cache_ratio)
        ? base * Number(model.create_cache_ratio)
        : Number.NaN
    case 'image':
      return hasRatio(model.image_ratio)
        ? base * Number(model.image_ratio)
        : Number.NaN
    case 'audio_input':
      return hasRatio(model.audio_ratio)
        ? base * Number(model.audio_ratio)
        : Number.NaN
    case 'audio_output':
      return hasRatio(model.audio_ratio) &&
        hasRatio(model.audio_completion_ratio)
        ? base *
            Number(model.audio_ratio) *
            Number(model.audio_completion_ratio)
        : Number.NaN
  }
}

function hasRatio(value: number | null | undefined): boolean {
  return value !== undefined && value !== null && Number.isFinite(Number(value))
}

/**
 * Apply recharge rate to price
 *
 * priceRate represents how much users need to recharge (in the display currency)
 * to get 1 USD credit. usdExchangeRate is the real exchange rate.
 *
 * The returned value will be formatted by formatBillingCurrencyFromUSD, which will
 * multiply by the display currency's exchange rate.
 *
 * Examples:
 *
 * 1. Display currency = USD:
 *    - Model: 1 USD
 *    - priceRate = 0.5 (recharge $0.5 to get $1 credit)
 *    - usdExchangeRate = 1
 *    - Return: 1 × 0.5 / 1 = 0.5
 *    - formatBillingCurrencyFromUSD(0.5) → $0.5 ✓
 *
 * 2. Display currency = CNY:
 *    - Model: 1 USD
 *    - priceRate = 4 (recharge ¥4 to get $1 credit)
 *    - usdExchangeRate = 7 (real rate: 1 USD = ¥7)
 *    - Return: 1 × 4 / 7 = 0.571
 *    - formatBillingCurrencyFromUSD(0.571) → 0.571 × 7 = ¥4 ✓
 *    - Normal price: ¥7, Recharge price: ¥4 (cheaper!)
 */
function applyRechargeRate(
  price: number,
  showWithRecharge: boolean,
  priceRate: number,
  usdExchangeRate: number
): number {
  if (!showWithRecharge) return price
  return (price * priceRate) / usdExchangeRate
}

/**
 * Format token-based price for display
 */
export function formatPrice(
  model: PricingModel,
  type: PriceType,
  tokenUnit: TokenUnit,
  showWithRecharge = false,
  priceRate = 1,
  usdExchangeRate = 1,
  selectedGroup?: string,
  showCurrencySymbol = true
): string {
  if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) {
    return '-'
  }

  const displayGroupRatio = getDisplayGroupRatio(model, selectedGroup)

  let priceInUSD = calculateTokenPrice(model, type, displayGroupRatio)
  priceInUSD = applyRechargeRate(
    priceInUSD,
    showWithRecharge,
    priceRate,
    usdExchangeRate
  )

  const price = priceInUSD / TOKEN_UNIT_DIVISORS[tokenUnit]
  return formatBillingCurrencyFromUSD(price, {
    showSymbol: showCurrencySymbol,
    digitsLarge: 4,
    digitsSmall: 6,
    abbreviate: false,
  })
}

/**
 * Format price for a specific group (token-based)
 */
export function formatGroupPrice(
  model: PricingModel,
  group: string,
  type: PriceType,
  tokenUnit: TokenUnit,
  showWithRecharge = false,
  priceRate = 1,
  usdExchangeRate = 1,
  groupRatio: Record<string, number>
): string {
  if (model.quota_type === QUOTA_TYPE_VALUES.REQUEST) {
    return '-'
  }

  const ratio = getConfiguredGroupRatio(groupRatio, group)
  let priceInUSD = calculateTokenPrice(model, type, ratio)

  priceInUSD = applyRechargeRate(
    priceInUSD,
    showWithRecharge,
    priceRate,
    usdExchangeRate
  )

  const price = priceInUSD / TOKEN_UNIT_DIVISORS[tokenUnit]
  return formatBillingCurrencyFromUSD(price, {
    digitsLarge: 4,
    digitsSmall: 6,
    abbreviate: false,
  })
}

/**
 * Format fixed price for pay-per-request models (with specific group)
 */
export function formatFixedPrice(
  model: PricingModel,
  group: string,
  showWithRecharge = false,
  priceRate = 1,
  usdExchangeRate = 1,
  groupRatio: Record<string, number>
): string {
  if (model.quota_type !== QUOTA_TYPE_VALUES.REQUEST) {
    return '-'
  }

  const ratio = getConfiguredGroupRatio(groupRatio, group)
  let priceInUSD = (model.model_price || 0) * ratio

  priceInUSD = applyRechargeRate(
    priceInUSD,
    showWithRecharge,
    priceRate,
    usdExchangeRate
  )

  return formatBillingCurrencyFromUSD(priceInUSD, {
    digitsLarge: 4,
    digitsSmall: 4,
    abbreviate: false,
  })
}

/**
 * Format fixed price for pay-per-request models (minimum price from all groups)
 */
export function formatRequestPrice(
  model: PricingModel,
  showWithRecharge = false,
  priceRate = 1,
  usdExchangeRate = 1,
  selectedGroup?: string,
  showCurrencySymbol = true
): string {
  if (model.quota_type !== QUOTA_TYPE_VALUES.REQUEST) {
    return '-'
  }

  const displayGroupRatio = getDisplayGroupRatio(model, selectedGroup)

  let priceInUSD = (model.model_price || 0) * displayGroupRatio

  priceInUSD = applyRechargeRate(
    priceInUSD,
    showWithRecharge,
    priceRate,
    usdExchangeRate
  )

  return formatBillingCurrencyFromUSD(priceInUSD, {
    showSymbol: showCurrencySymbol,
    digitsLarge: 4,
    digitsSmall: 4,
    abbreviate: false,
  })
}

// ----------------------------------------------------------------------------
// Official price comparison
// ----------------------------------------------------------------------------

export type PriceComparison = {
  /** Fractional change against the official list price; negative means cheaper. */
  inputDelta: number
  outputDelta?: number
  officialInput: number
  ourInput: number
  officialOutput?: number
  ourOutput?: number
}

/** Price unit of the official baseline: per 1M tokens or per request. */
export type OfficialPriceSummary = {
  unit: 'token' | 'request'
  input: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  cacheWrite1h?: number
}

function positive(value: number | null | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined
}

/**
 * Vendor list price (USD per 1M tokens, or per request) as resolved by the
 * backend: an administrator override or a synchronised price source wins over
 * the built-in default ratios.
 *
 * Returns null for models without a baseline — custom, renamed or task-plugin
 * models have no vendor list price to compare against.
 */
export function getOfficialPriceSummary(
  model: PricingModel
): OfficialPriceSummary | null {
  const requestPrice = positive(model.official_request_price)
  if (requestPrice) {
    return { unit: 'request', input: requestPrice }
  }
  const input = positive(model.official_input_price)
  if (!input) return null
  return {
    unit: 'token',
    input,
    output: positive(model.official_output_price),
    cacheRead: positive(model.official_cache_read_price),
    cacheWrite: positive(model.official_cache_write_price),
    cacheWrite1h: positive(model.official_cache_write_1h_price),
  }
}

/**
 * Compare the site price at the given group ratio with the vendor list price.
 * Negative deltas mean the site is cheaper; null when there is no baseline.
 */
export function getPriceComparison(
  model: PricingModel,
  groupRatio: number
): PriceComparison | null {
  if (!Number.isFinite(groupRatio) || groupRatio <= 0) return null
  const official = getOfficialPriceSummary(model)
  if (!official) return null

  if (official.unit === 'request') {
    const ourPrice = positive(model.model_price)
    if (!ourPrice) return null
    const ours = ourPrice * groupRatio
    return {
      officialInput: official.input,
      ourInput: ours,
      inputDelta: ours / official.input - 1,
    }
  }

  const ourRatio = positive(model.model_ratio)
  if (!ourRatio) return null
  const ourInput = ourRatio * 2 * groupRatio
  const inputDelta = ourInput / official.input - 1
  if (!official.output) {
    return { officialInput: official.input, ourInput, inputDelta }
  }
  const ourOutput = ourInput * (model.completion_ratio || 1)
  return {
    officialInput: official.input,
    ourInput,
    inputDelta,
    officialOutput: official.output,
    ourOutput,
    outputDelta: ourOutput / official.output - 1,
  }
}

/** Human-readable magnitude of a delta, e.g. 0.2 -> "20", 0.125 -> "12.5". */
export function formatDeltaPercent(delta: number): string {
  const percent = Math.abs(delta) * 100
  // One decimal at most, without a trailing ".0" (20 → "20", 12.5 → "12.5").
  return String(Math.round(percent * 10) / 10)
}

/** Prices within this band are treated as matching the official price. */
export const OFFICIAL_PRICE_TOLERANCE = 0.005

/**
 * Only real savings are worth showing. Anything at or above the official list
 * price is hidden instead of advertising a markup.
 */
export function isOfficialDiscount(
  delta: number | undefined
): delta is number {
  return (
    typeof delta === 'number' &&
    Number.isFinite(delta) &&
    delta <= -OFFICIAL_PRICE_TOLERANCE
  )
}
