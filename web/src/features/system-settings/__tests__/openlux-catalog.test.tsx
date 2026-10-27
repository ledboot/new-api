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
import { render, screen, within, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'

import { OpenLuxCatalogBrowser } from '../models/openlux-catalog-browser'
import { getOpenLuxGroupPrices } from '../models/openlux-catalog-prices'
import type { OpenLuxCatalog } from '../types'

const catalog: OpenLuxCatalog = {
  version: 'v1',
  fetched_at: 1,
  groups: { codex: 'Codex', azure: 'Azure' },
  ratios: { codex: 0.03677, azure: 0.1 },
  model_count: 2,
  account_rates: false,
  price_unit: 2,
  import_support: {
    text: '',
    video: 'Only explicit text token pricing is supported',
  },
  catalog: {
    data: [
      {
        model_name: 'text',
        description: 'A text model',
        vendor_id: 52,
        quota_type: 0,
        model_ratio: 5,
        completion_ratio: 5,
        cache_ratio: 0,
        cache_creation_5m_ratio: 1.25,
        cache_creation_1h_ratio: 2,
        enable_groups: ['codex', 'azure'],
        supported_endpoint_types: ['openai'],
        step_ratios: [
          {
            step_size: 272000,
            prompt_step_ratio: 1,
            completion_step_ratio: 1,
            cache_step_ratio: 1,
          },
          {
            step_size: 1000000,
            prompt_step_ratio: 2,
            completion_step_ratio: 1.5,
            cache_step_ratio: 2,
          },
        ],
      },
      {
        model_name: 'video',
        quota_type: 4,
        model_price: 0.4,
        enable_groups: ['azure'],
        custom_resolution_prices: { '720p': 0.4 },
      },
    ],
    vendors: [{ id: 52, name: 'Vendor' }],
  },
}
afterEach(cleanup)

it('retains zero cache prices and derives each upstream group and context tier without inventing missing prices', () => {
  const rows = getOpenLuxGroupPrices(
    catalog.catalog?.data[0] ?? { model_name: 'missing' },
    catalog,
    2
  )
  expect(rows).toHaveLength(4)
  expect(rows[0].input).toBeCloseTo(0.3677)
  expect(rows[1].input).toBeCloseTo(0.7354)
  expect(rows[1].output).toBeCloseTo(2.75775)
  expect(rows[1].cacheWrite).toBeCloseTo(0.459625)
  expect(rows[1].cacheRead).toBe(0)
  const unavailable = getOpenLuxGroupPrices(
    catalog.catalog?.data[0] ?? { model_name: 'missing' },
    { ...catalog, groups: {}, ratios: {} },
    2
  )
  expect(unavailable[0].available).toBe(false)
  expect(unavailable[0].input).toBeNull()
  const invalid = getOpenLuxGroupPrices(
    catalog.catalog?.data[0] ?? { model_name: 'missing' },
    { ...catalog, ratios: { codex: Number.MAX_VALUE } },
    2
  )
  expect(invalid[0].input).toBeNull()
})

it('shows full catalog prices without a configured channel and permits searching unsupported models and inspecting raw data', async () => {
  render(<OpenLuxCatalogBrowser catalog={catalog} unit={2} multiplier={1.2} />)
  expect(screen.getByText('A text model')).toBeVisible()
  expect(screen.getByText('Vendor')).toBeVisible()
  const table = screen.getByRole('table', { name: 'OpenLux group prices' })
  expect(within(table).getAllByText('Codex')).toHaveLength(2)
  expect(within(table).getAllByText('Azure')).toHaveLength(2)
  expect(within(table).getByText('$0.3677')).toBeVisible()
  expect(within(table).getByText('$0.44124')).toBeVisible()
  const user = userEvent.setup()
  await user.click(screen.getByRole('combobox', { name: 'OpenLux model' }))
  await user.type(
    screen.getByRole('combobox', { name: 'OpenLux model' }),
    'video'
  )
  await user.click(await screen.findByRole('option', { name: 'video' }))
  expect(
    screen.getByText('Only explicit text token pricing is supported')
  ).toBeVisible()
  expect(screen.queryByText('$0.3677')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Show source data' }))
  expect(await screen.findByText(/custom_resolution_prices/)).toBeVisible()
})

it('shows an empty state for an empty source catalog', () => {
  render(
    <OpenLuxCatalogBrowser
      catalog={{ ...catalog, catalog: { data: [] } }}
      unit={2}
      multiplier={1.2}
    />
  )
  expect(screen.getByText('No results found')).toBeVisible()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})

it('shows account availability, the complete group directory, and updated selling prices', async () => {
  const accountCatalog = {
    ...catalog,
    account_rates: true,
    group_ids: { codex: 7 },
    uptime: { codex: { uptime: 0.9827 } },
  }
  const view = render(
    <OpenLuxCatalogBrowser catalog={accountCatalog} unit={2} multiplier={1.2} />
  )
  const priceTable = screen.getByRole('table', { name: 'OpenLux group prices' })
  expect(within(priceTable).getAllByText('98.27%')).toHaveLength(2)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: 'All upstream groups' }))
  const directory = screen.getByRole('table', { name: 'All upstream groups' })
  expect(within(directory).getByText('7')).toBeVisible()
  expect(within(directory).getByText('Azure')).toBeVisible()
  view.rerender(
    <OpenLuxCatalogBrowser catalog={accountCatalog} unit={2} multiplier={1.5} />
  )
  expect(within(priceTable).getByText('$0.55155')).toBeVisible()
  const unknown = getOpenLuxGroupPrices(
    accountCatalog.catalog?.data[0] ?? { model_name: 'missing' },
    {
      ...accountCatalog,
      catalog: {
        ...accountCatalog.catalog,
        data: accountCatalog.catalog?.data ?? [],
        group_model_ratio: { codex: { text: 0.1 } },
      },
    },
    2
  )
  expect(unknown[0].input).toBeNull()
})

it('shows fixed image prices per image and retains image token and cache categories', () => {
  const image = {
    model_name: 'gpt-image-2-c',
    quota_type: 1,
    model_price: 0.12,
    enable_groups: ['azure'],
  }
  const data = {
    ...catalog,
    import_support: { 'gpt-image-2-c': '' },
    catalog: { data: [image] },
  }
  render(<OpenLuxCatalogBrowser catalog={data} unit={2} multiplier={1.2} />)
  const table = screen.getByRole('table', { name: 'OpenLux group prices' })
  expect(
    within(table).getByRole('columnheader', { name: 'Price per image' })
  ).toBeVisible()
  expect(within(table).getByText('$0.012')).toBeVisible()
  expect(within(table).getByText('$0.0144')).toBeVisible()
  expect(
    within(table).queryByRole('columnheader', { name: 'Input price' })
  ).not.toBeInTheDocument()
  const token = {
    model_name: 'image-token',
    quota_type: 0,
    model_ratio: 2.5,
    image_ratio: 1.6,
    image_cache_ratio: 0.64,
    enable_groups: ['azure'],
  }
  const rows = getOpenLuxGroupPrices(
    token,
    { ...catalog, import_support: { 'image-token': '' } },
    2
  )
  expect(rows[0].imageInput).toBeCloseTo(0.8)
  expect(rows[0].imageCache).toBeCloseTo(0.32)
})
