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

import { getDynamicPricingSummary } from '@/features/pricing/lib/dynamic-price'
import type { PricingModel } from '@/features/pricing/types'
import { api } from '@/lib/api'

import { OpenLuxSalesDialog } from '../models/openlux-sales-dialog'
import { SyncPriceCell } from '../models/upstream-price-cells'

const catalog = {
  version: 'source-v1',
  groups: { paid: 'Paid', media: 'Media' },
  ratios: { paid: 0.1, media: 1 },
  model_count: 2,
  fetched_at: 1,
  account_rates: false,
  sales: {},
  import_support: {
    text: '',
    video: 'Only explicit text token pricing is supported',
  },
  catalog: {
    data: [
      { model_name: 'text', enable_groups: ['paid'] },
      { model_name: 'video', enable_groups: ['media'] },
    ],
  },
}
const preview = {
  preview_version: 'review-v1',
  plan: {
    local_version: 'local-v1',
    groups: [
      {
        group: 'paid',
        multiplier: 1.2,
        group_ratio: 0.1,
        topup_ratio: 1,
        selling_prices: { text: 'tier("base", p * 1.2 + c * 6)' },
        models: {
          text: {
            cost: 'tier("base", p * 1 + c * 5)',
            expression: 'tier("base", p * 12 + c * 60)',
          },
        },
        excluded: {},
      },
    ],
  },
}
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

it('creates the complete sale only after reviewing prices and confirming, then clears upstream keys', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { success: true, data: catalog },
  })
  const post = vi.spyOn(api, 'post').mockImplementation(async (url) => ({
    data: {
      success: true,
      data: String(url).endsWith('/preview')
        ? preview
        : { groups: 1, channels: { paid: 7 } },
    },
  }))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const onOpenChange = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <OpenLuxSalesDialog open onOpenChange={onOpenChange} />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  const checkbox = await screen.findByRole('checkbox', { name: 'Sell paid' })
  expect(screen.getByRole('checkbox', { name: 'Sell media' })).toHaveAttribute(
    'aria-disabled',
    'true'
  )
  await user.click(checkbox)
  expect(screen.getByLabelText('Local group multiplier for paid')).toHaveValue(
    0.1
  )
  expect(screen.getByLabelText('Top-up multiplier for paid')).toHaveValue(1)
  await user.type(
    screen.getByLabelText('API key for paid'),
    'fixture-secret-key'
  )
  expect(screen.getByRole('button', { name: 'Preview prices' })).toBeDisabled()
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Every supplied API key is fixed to its selected upstream group, and I have verified the price unit and account rates.',
    })
  )
  await user.click(screen.getByRole('button', { name: 'Preview prices' }))
  await screen.findByRole('region', { name: 'Sales preview' })
  expect(post).toHaveBeenCalledWith(
    '/api/ratio_sync/openlux/sales/preview',
    expect.objectContaining({
      groups: [
        {
          group: 'paid',
          multiplier: 1.2,
          api_key: 'fixture-secret-key',
          group_ratio: 0.1,
          topup_ratio: 1,
        },
      ],
      ratio_unit: 2,
    })
  )
  expect(
    post.mock.calls.filter(([url]) => String(url).endsWith('/publish'))
  ).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: 'Publish sales' }))
  const confirm = await screen.findByRole('alertdialog', {
    name: 'Publish sales',
  })
  await user.click(
    within(confirm).getByRole('button', { name: 'Publish sales' })
  )
  await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  expect(post).toHaveBeenCalledWith(
    '/api/ratio_sync/openlux/sales/publish',
    expect.objectContaining({
      preview_version: 'review-v1',
      groups: [
        {
          group: 'paid',
          multiplier: 1.2,
          api_key: 'fixture-secret-key',
          group_ratio: 0.1,
          topup_ratio: 1,
        },
      ],
    })
  )
  expect(
    screen.queryByDisplayValue('fixture-secret-key')
  ).not.toBeInTheDocument()
  client.clear()
})

it('invalidates a reviewed sale when its markup changes and blocks publish until a fresh preview', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { ...catalog, sales: { paid: { channel_id: 7 } } },
    },
  })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: preview } })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <OpenLuxSalesDialog open onOpenChange={() => {}} />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox', { name: 'Sell paid' }))
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Every supplied API key is fixed to its selected upstream group, and I have verified the price unit and account rates.',
    })
  )
  await user.click(screen.getByRole('button', { name: 'Preview prices' }))
  await screen.findByRole('region', { name: 'Sales preview' })
  await user.clear(screen.getByLabelText('Selling price multiplier'))
  await user.type(screen.getByLabelText('Selling price multiplier'), '1.5')
  expect(
    screen.queryByRole('region', { name: 'Sales preview' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Publish sales' })).toBeDisabled()
  expect(
    post.mock.calls.filter(([url]) => String(url).endsWith('/publish'))
  ).toHaveLength(0)
  client.clear()
})

it('displays the selected group expression with its local discount and preserves explicit zero multipliers', () => {
  const model = {
    id: 1,
    model_name: 'text',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['a', 'b'],
    group_ratio: { a: 1, b: 0.5 },
    group_billing_expr: {
      a: 'tier("base", p * 1.2 + c * 6)',
      b: 'tier("base", p * 2.4 + c * 12)',
    },
  } as PricingModel
  const a = getDynamicPricingSummary(model, {
    tokenUnit: 'M',
    selectedGroup: 'a',
  })
  const b = getDynamicPricingSummary(model, {
    tokenUnit: 'M',
    selectedGroup: 'b',
  })
  expect(a?.entries.find((entry) => entry.field === 'inputPrice')?.value).toBe(
    1.2
  )
  expect(b?.entries.find((entry) => entry.field === 'inputPrice')?.value).toBe(
    1.2
  )
  const free = getDynamicPricingSummary(
    { ...model, group_ratio: { a: 0, b: 1 } },
    { tokenUnit: 'M', selectedGroup: 'a' }
  )
  expect(
    free?.entries.find((entry) => entry.field === 'outputPrice')?.value
  ).toBe(0)
  const all = getDynamicPricingSummary(
    { ...model, group_ratio: { a: 1, b: 1 } },
    { tokenUnit: 'M' }
  )
  expect(
    all?.entries.find((entry) => entry.field === 'inputPrice')?.minValue
  ).toBe(1.2)
  expect(
    all?.entries.find((entry) => entry.field === 'inputPrice')?.maxValue
  ).toBe(2.4)
})

it('paginates a bulk sales preview while retaining the entire batch for publishing', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { ...catalog, sales: { paid: { channel_id: 7 } } },
    },
  })
  const models = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `text-${index}`,
      { cost: 'tier("base", p * 1)', expression: 'tier("base", p * 1.2)' },
    ])
  )
  vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      success: true,
      data: {
        ...preview,
        plan: {
          ...preview.plan,
          groups: [{ ...preview.plan.groups[0], models }],
        },
      },
    },
  })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <OpenLuxSalesDialog open onOpenChange={() => {}} />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox', { name: 'Sell paid' }))
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Every supplied API key is fixed to its selected upstream group, and I have verified the price unit and account rates.',
    })
  )
  await user.click(screen.getByRole('button', { name: 'Preview prices' }))
  const region = await screen.findByRole('region', { name: 'Sales preview' })
  expect(within(region).getByText('text-0')).toBeVisible()
  expect(within(region).queryByText('text-11')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Go to next page' }))
  expect(within(region).getByText('text-11')).toBeVisible()
  expect(within(region).queryByText('text-0')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Publish sales' })).toBeEnabled()
  client.clear()
})

it('refreshes source prices without losing entered keys and requires a new preview', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { success: true, data: catalog } })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: preview } })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <OpenLuxSalesDialog open onOpenChange={() => {}} />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox', { name: 'Sell paid' }))
  await user.type(screen.getByLabelText('API key for paid'), 'fixture-key')
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Every supplied API key is fixed to its selected upstream group, and I have verified the price unit and account rates.',
    })
  )
  await user.click(screen.getByRole('button', { name: 'Preview prices' }))
  await screen.findByRole('region', { name: 'Sales preview' })
  get.mockResolvedValue({
    data: { success: true, data: { ...catalog, version: 'source-v2' } },
  })
  await user.click(screen.getByRole('button', { name: 'Refresh source data' }))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Preview prices' })).toBeEnabled()
  )
  expect(
    screen.queryByRole('region', { name: 'Sales preview' })
  ).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Publish sales' })).toBeDisabled()
  expect(screen.getByLabelText('API key for paid')).toHaveValue('fixture-key')
  await user.click(screen.getByRole('button', { name: 'Preview prices' }))
  await waitFor(() =>
    expect(post).toHaveBeenLastCalledWith(
      '/api/ratio_sync/openlux/sales/preview',
      expect.objectContaining({ version: 'source-v2' })
    )
  )
  client.clear()
})

it('reloads changed source prices after a rejected preview instead of repeatedly sending the stale version', async () => {
  const get = vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: { ...catalog, sales: { paid: { channel_id: 7 } } },
    },
  })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValueOnce({
      data: {
        success: false,
        message_key:
          'OpenLux prices changed; reload the source before previewing',
        message: 'OpenLux prices changed; reload the source before previewing',
      },
    })
    .mockResolvedValue({ data: { success: true, data: preview } })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <OpenLuxSalesDialog open onOpenChange={() => {}} />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox', { name: 'Sell paid' }))
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Every supplied API key is fixed to its selected upstream group, and I have verified the price unit and account rates.',
    })
  )
  get.mockResolvedValue({
    data: {
      success: true,
      data: {
        ...catalog,
        version: 'source-v2',
        sales: { paid: { channel_id: 7 } },
      },
    },
  })
  await user.click(screen.getByRole('button', { name: 'Preview prices' }))
  await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Preview prices' })).toBeEnabled()
  )
  await user.click(screen.getByRole('button', { name: 'Preview prices' }))
  await screen.findByRole('region', { name: 'Sales preview' })
  expect(post).toHaveBeenLastCalledWith(
    '/api/ratio_sync/openlux/sales/preview',
    expect.objectContaining({ version: 'source-v2' })
  )
  client.clear()
})

it.each([
  { local: undefined, expected: 0.1 },
  { local: 0, expected: 0 },
])(
  'defaults missing group rates to upstream and retains saved zero and top-up rates ($expected)',
  async ({ local, expected }) => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        success: true,
        data: {
          ...catalog,
          sales: { paid: { channel_id: 7 } },
          local_group_ratios: local === undefined ? {} : { paid: local },
          topup_group_ratios: { paid: 0.8 },
        },
      },
    })
    const post = vi
      .spyOn(api, 'post')
      .mockResolvedValue({ data: { success: true, data: preview } })
    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    render(
      <QueryClientProvider client={client}>
        <OpenLuxSalesDialog open onOpenChange={() => {}} />
      </QueryClientProvider>
    )
    const user = userEvent.setup()
    await user.click(await screen.findByRole('checkbox', { name: 'Sell paid' }))
    const group = screen.getByLabelText('Local group multiplier for paid')
    const topup = screen.getByLabelText('Top-up multiplier for paid')
    expect(group).toHaveValue(expected)
    expect(topup).toHaveValue(0.8)
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Every supplied API key is fixed to its selected upstream group, and I have verified the price unit and account rates.',
      })
    )
    await user.click(screen.getByRole('button', { name: 'Preview prices' }))
    const region = await screen.findByRole('region', { name: 'Sales preview' })
    expect(within(region).getByText('$1.2')).toBeInTheDocument()
    expect(post).toHaveBeenLastCalledWith(
      '/api/ratio_sync/openlux/sales/preview',
      expect.objectContaining({
        groups: [
          expect.objectContaining({ group_ratio: expected, topup_ratio: 0.8 }),
        ],
      })
    )
    await user.clear(group)
    expect(screen.getByRole('button', { name: 'Publish sales' })).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Preview prices' })
    ).toBeDisabled()
    await user.type(group, '-1')
    expect(
      screen.getByRole('button', { name: 'Preview prices' })
    ).toBeDisabled()
    await user.clear(group)
    await user.type(group, '0.25')
    await user.clear(topup)
    await user.type(topup, '0')
    await user.click(
      screen.getByRole('checkbox', {
        name: 'Every supplied API key is fixed to its selected upstream group, and I have verified the price unit and account rates.',
      })
    )
    await user.click(screen.getByRole('button', { name: 'Preview prices' }))
    await screen.findByRole('region', { name: 'Sales preview' })
    expect(post).toHaveBeenLastCalledWith(
      '/api/ratio_sync/openlux/sales/preview',
      expect.objectContaining({
        groups: [
          expect.objectContaining({ group_ratio: 0.25, topup_ratio: 0 }),
        ],
      })
    )
    client.clear()
  }
)

it('applies upstream rates times a bulk factor only to selected groups and invalidates the preview', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      success: true,
      data: {
        ...catalog,
        groups: { paid: 'Paid', image: 'Image' },
        ratios: { paid: 0.1, image: 0.2 },
        sales: { paid: { channel_id: 7 }, image: { channel_id: 8 } },
        import_support: { text: '', image: '' },
        catalog: {
          data: [
            { model_name: 'text', enable_groups: ['paid'] },
            { model_name: 'image', enable_groups: ['image'] },
          ],
        },
      },
    },
  })
  const post = vi
    .spyOn(api, 'post')
    .mockResolvedValue({ data: { success: true, data: preview } })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <OpenLuxSalesDialog open onOpenChange={() => {}} />
    </QueryClientProvider>
  )
  const user = userEvent.setup()
  await user.click(await screen.findByRole('checkbox', { name: 'Sell paid' }))
  await user.clear(screen.getByLabelText('OpenLux multiplier factor'))
  await user.type(screen.getByLabelText('OpenLux multiplier factor'), '2')
  await user.click(
    screen.getByRole('button', { name: 'Apply to selected groups' })
  )
  expect(screen.getByLabelText('Local group multiplier for paid')).toHaveValue(
    0.2
  )
  expect(screen.getByLabelText('Local group multiplier for image')).toHaveValue(
    0.2
  )
  await user.click(screen.getByRole('checkbox', { name: 'Sell image' }))
  await user.click(
    screen.getByRole('button', { name: 'Apply to selected groups' })
  )
  expect(screen.getByLabelText('Local group multiplier for image')).toHaveValue(
    0.4
  )
  expect(screen.getByLabelText('Top-up multiplier for image')).toHaveValue(1)
  await user.click(
    screen.getByRole('checkbox', {
      name: 'Every supplied API key is fixed to its selected upstream group, and I have verified the price unit and account rates.',
    })
  )
  await user.click(screen.getByRole('button', { name: 'Preview prices' }))
  await screen.findByRole('region', { name: 'Sales preview' })
  await user.click(
    screen.getByRole('button', { name: 'Apply to selected groups' })
  )
  expect(screen.getByRole('button', { name: 'Publish sales' })).toBeDisabled()
  expect(post).toHaveBeenCalledOnce()
  await user.clear(screen.getByLabelText('OpenLux multiplier factor'))
  await user.type(screen.getByLabelText('OpenLux multiplier factor'), '-1')
  expect(
    screen.getByRole('button', { name: 'Apply to selected groups' })
  ).toBeDisabled()
  client.clear()
})

it('shows fixed image prices with their per-image unit in the sales preview', () => {
  render(
    <SyncPriceCell
      values={{
        billing_mode: 'tiered_expr',
        billing_expr: 'tier("image", fixed(0.0144)) * image_count',
      }}
    />
  )
  expect(screen.getByText('Price per image')).toBeVisible()
  expect(screen.getByText('$0.0144')).toBeVisible()
})
