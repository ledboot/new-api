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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'

import { api } from '@/lib/api'

import { OpenLuxPublishedPrices } from '../models/openlux-published-prices'

const published = {
  sales: {
    'Kiro-Claude-1': {
      channel_id: 1,
      normalized_prices: true,
      multiplier: 1.2,
      source_version: 'saved',
      models: {
        'claude-opus-5': {
          cost: 'tier("openlux_1", p * 0.4412 + c * 2.206 + cr * 0.04412)',
          expression: 'tier("openlux_1", p * 6 + c * 30 + cr * 0.6)',
        },
      },
    },
    'Image-Free': {
      channel_id: 2,
      multiplier: 1.2,
      source_version: 'saved',
      models: {
        'gpt-image-2-c': {
          cost: 'tier("image", fixed(0.012)) * image_count',
          expression: 'tier("image", fixed(0.144)) * image_count',
        },
      },
    },
  },
  group_ratios: { 'Kiro-Claude-1': 0.11, 'Image-Free': 0 },
  effective_prices: {
    'Kiro-Claude-1': {
      'claude-opus-5': 'tier("openlux_1", p * 0.66 + c * 3.3 + cr * 0.066)',
    },
    'Image-Free': { 'gpt-image-2-c': 'tier("image", fixed(0)) * image_count' },
  },
}

function view() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <OpenLuxPublishedPrices />
    </QueryClientProvider>
  )
  return client
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('shows saved base prices and current effective prices without fetching upstream or multiplying the group twice', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data: published } })
  const post = vi.spyOn(api, 'post')
  const client = view()
  const table = await screen.findByRole('region', {
    name: 'Published OpenLux prices',
  })
  const row = (await within(table).findAllByRole('row')).find(
    (row) =>
      row.textContent?.includes('claude-opus-5') &&
      within(row).queryByText('Input')
  )
  if (!row) throw new Error('Expected the input pricing row')
  expect(within(row).getByText('$0.4412')).toBeVisible()
  expect(within(row).getByText('$6')).toBeVisible()
  expect(within(row).getByText('0.11')).toBeVisible()
  expect(within(row).getByText('0.08824')).toBeVisible()
  const headers = within(table).getAllByRole('columnheader')
  const labels = headers.map((header) => header.textContent)
  expect(labels).not.toContain('Billing expression')
  expect(labels).toContain('Upstream group ratio')
  expect(labels.indexOf('Effective billing unit price')).toBe(
    labels.indexOf('Upstream cost') + 1
  )
  expect(
    headers.every((header) => !header.classList.contains('align-top'))
  ).toBe(true)
  expect(within(row).getByText('$0.66')).toBeVisible()
  expect(within(row).getByText('Output')).toBeVisible()
  expect(within(row).getByText('$3.3')).toBeVisible()
  expect(within(table).getAllByText('claude-opus-5')).toHaveLength(1)
  expect(within(table).getAllByRole('row')).toHaveLength(3)
  expect(table).toHaveClass('flex-1', 'min-h-0')
  expect(screen.getByRole('button', { name: 'Go to next page' })).toHaveClass(
    'size-8'
  )
  expect(within(table).getAllByText('Per image').length).toBeGreaterThan(0)
  expect(within(table).getByText('$0')).toBeVisible()
  const legacyRow = within(table).getByText('gpt-image-2-c').closest('tr')
  if (!legacyRow) throw new Error('Expected the legacy pricing row')
  expect(
    within(legacyRow).getAllByRole('cell')[
      labels.indexOf('Upstream group ratio')
    ]
  ).toHaveTextContent('—')
  expect(get).toHaveBeenCalledWith('/api/ratio_sync/openlux/sales')
  expect(
    get.mock.calls.every(([url]) => url === '/api/ratio_sync/openlux/sales')
  ).toBe(true)
  expect(post).not.toHaveBeenCalled()
  const user = userEvent.setup()
  await user.type(
    screen.getByRole('textbox', { name: 'Search models' }),
    'gpt-image'
  )
  expect(within(table).queryByText('claude-opus-5')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() => expect(get.mock.calls.length).toBeGreaterThan(1))
  client.clear()
})

it('shows an empty state when no sales were published', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: { sales: {}, group_ratios: {} } },
  })
  const client = view()
  expect(await screen.findByText('No published OpenLux prices')).toBeVisible()
  client.clear()
})

it('keeps source context bounds and supports selecting a single group', async () => {
  const price = {
    cost: 'len <= 100000 ? tier("openlux_1", p * 1) : tier("openlux_2", p * 5)',
    expression:
      'len <= 100000 ? tier("openlux_1", p * 6) : tier("openlux_2", p * 30)',
    input_token_limit: 1000000,
  }
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        ...published,
        sales: {
          ...published.sales,
          Bounds: {
            channel_id: 3,
            multiplier: 1.2,
            source_version: 'saved',
            models: { bounded: price },
          },
        },
        group_ratios: { ...published.group_ratios, Bounds: 0.1 },
      },
    },
  })
  const client = view()
  await screen.findByRole('region', { name: 'Published OpenLux prices' })
  const user = userEvent.setup()
  const filter = screen.getByRole('combobox', { name: 'Filter by group' })
  await user.click(filter)
  await user.type(filter, 'Bounds')
  await user.click(await screen.findByRole('option', { name: 'Bounds' }))
  const table = screen.getByRole('region', { name: 'Published OpenLux prices' })
  expect(within(table).getByText('[0, 100000]')).toBeVisible()
  expect(within(table).getByText('(100000, 1000000]')).toBeVisible()
  expect(within(table).getAllByText('bounded')).toHaveLength(1)
  expect(within(table).getAllByRole('row')).toHaveLength(2)
  expect(within(table).queryByText('claude-opus-5')).not.toBeInTheDocument()
  client.clear()
})

it('shows failed reads and retries without publishing or changing prices', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockRejectedValueOnce(new Error('Pricing temporarily unavailable'))
    .mockResolvedValue({
      data: { success: true, data: { sales: {}, group_ratios: {} } },
    })
  const client = view()
  expect(
    await screen.findByText('Pricing temporarily unavailable')
  ).toBeVisible()
  await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('No published OpenLux prices')).toBeVisible()
  expect(get).toHaveBeenCalledTimes(2)
  client.clear()
})

it('paginates published models and resets the page when searching', async () => {
  const models = Object.fromEntries(
    Array.from({ length: 21 }, (_, i) => [
      `model-${String(i).padStart(2, '0')}`,
      {
        cost: 'tier("openlux_1", p * 1)',
        expression: 'tier("openlux_1", p * 2 + c * 4)',
      },
    ])
  )
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        sales: {
          saved: {
            channel_id: 1,
            multiplier: 2,
            source_version: 'saved',
            models,
          },
        },
        group_ratios: { saved: 1 },
      },
    },
  })
  const client = view()
  const table = await screen.findByRole('region', {
    name: 'Published OpenLux prices',
  })
  const user = userEvent.setup()
  expect(within(table).queryByText('model-20')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Go to next page' }))
  expect(await within(table).findByText('model-20')).toBeVisible()
  await user.type(
    screen.getByRole('textbox', { name: 'Search models' }),
    'model-00'
  )
  expect(await within(table).findByText('model-00')).toBeVisible()
  expect(within(table).queryByText('model-20')).not.toBeInTheDocument()
  client.clear()
})

it('shows server-rounded unit prices and group multipliers with at most four decimals', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        sales: {
          saved: {
            channel_id: 1,
            multiplier: 1.2,
            models: {
              rounded: {
                cost: 'tier("base", p * 0.0033 + cr * 0.00165)',
                expression: 'tier("base", p * 0.18 + cr * 0.09)',
              },
            },
          },
        },
        group_ratios: { saved: 0.0551 },
        effective_prices: {
          saved: { rounded: 'tier("base", p * 0.01 + cr * 0.005)' },
        },
      },
    },
  })
  const client = view()
  const table = await screen.findByRole('region', {
    name: 'Published OpenLux prices',
  })
  const headers = within(table)
    .getAllByRole('columnheader')
    .map((header) => header.textContent)
  const row = within(table).getByText('rounded').closest('tr')
  if (!row) throw new Error('Expected rounded model row')
  const cells = within(row).getAllByRole('cell')
  expect(
    cells[headers.indexOf('Effective billing unit price')]
  ).toHaveTextContent('$0.01')
  expect(
    cells[headers.indexOf('Effective billing unit price')]
  ).toHaveTextContent('$0.005')
  expect(cells[headers.indexOf('Group ratio')]).toHaveTextContent('0.0551')
  expect(
    screen.getByText(
      /OpenLux selling unit prices and group multipliers round up/
    )
  ).toBeVisible()
  client.clear()
})
