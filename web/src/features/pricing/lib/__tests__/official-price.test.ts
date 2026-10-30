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
import { expect, test } from 'vitest'

import type { PricingModel } from '../../types'
import {
  formatDeltaPercent,
  getOfficialPriceSummary,
  getPriceComparison,
  isOfficialDiscount,
  OFFICIAL_PRICE_TOLERANCE,
} from '../price'

function model(overrides: Partial<PricingModel> = {}): PricingModel {
  return {
    id: 1,
    model_name: 'gpt-4o',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 4,
    enable_groups: ['default'],
    group_ratio: { default: 1 },
    ...overrides,
  } as PricingModel
}

test('decodes the official list price from the built-in default ratios', () => {
  const official = getOfficialPriceSummary(
    model({ official_input_price: 2.5, official_output_price: 10 })
  )
  expect(official).toEqual({ unit: 'token', input: 2.5, output: 10 })
})

test('returns no baseline for models without a built-in default', () => {
  expect(getOfficialPriceSummary(model())).toBeNull()
  expect(getPriceComparison(model(), 1)).toBeNull()
})

test('a site price half of the list price reports a 50% saving', () => {
  const comparison = getPriceComparison(
    model({
      model_ratio: 0.625,
      official_input_price: 2.5,
      official_output_price: 10,
    }),
    1
  )
  expect(comparison?.ourInput).toBeCloseTo(1.25)
  expect(comparison?.officialInput).toBeCloseTo(2.5)
  expect(comparison?.inputDelta).toBeCloseTo(-0.5)
  expect(comparison?.outputDelta).toBeCloseTo(-0.5)
  expect(comparison?.inputDelta).toBeDefined()
  expect(formatDeltaPercent(comparison?.inputDelta ?? 0)).toBe('50')
})

test('the group ratio is part of the saving, the baseline is not', () => {
  const comparison = getPriceComparison(
    model({ official_input_price: 2.5, official_output_price: 10 }),
    0.8
  )
  // 1.0 ratio at 0.8 group = $1.6 vs $2.5 official.
  expect(comparison?.ourInput).toBeCloseTo(1.6)
  expect(comparison?.officialInput).toBeCloseTo(2.5)
  expect(comparison?.inputDelta).toBeCloseTo(-0.36)
})

test('a marked-up price is reported as a positive delta', () => {
  const comparison = getPriceComparison(
    model({ model_ratio: 2, official_input_price: 2.5 }),
    1
  )
  expect(comparison?.inputDelta).toBeCloseTo(0.6)
  expect(comparison?.inputDelta ?? 0).toBeGreaterThan(OFFICIAL_PRICE_TOLERANCE)
})

test('per-request models compare the request price', () => {
  const comparison = getPriceComparison(
    model({
      quota_type: 1,
      model_price: 0.05,
      official_request_price: 0.1,
    }),
    1
  )
  expect(comparison).toMatchObject({ officialInput: 0.1, ourInput: 0.05 })
  expect(comparison?.inputDelta).toBeCloseTo(-0.5)
})

test('delta percentages stay readable', () => {
  expect(formatDeltaPercent(-0.2)).toBe('20')
  expect(formatDeltaPercent(0.125)).toBe('12.5')
  expect(formatDeltaPercent(0.0049)).toBe('0.5')
})

test('only real savings are worth showing; markups stay hidden', () => {
  expect(isOfficialDiscount(-0.2)).toBe(true)
  expect(isOfficialDiscount(-OFFICIAL_PRICE_TOLERANCE)).toBe(true)
  expect(isOfficialDiscount(-0.001)).toBe(false)
  expect(isOfficialDiscount(0)).toBe(false)
  expect(isOfficialDiscount(0.3)).toBe(false)
  expect(isOfficialDiscount(undefined)).toBe(false)
})
