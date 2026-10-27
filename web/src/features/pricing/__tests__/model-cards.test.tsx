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
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createJSONStorage } from 'zustand/middleware'

import { api } from '@/lib/api'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'

import { CachedPriceCell } from '../components/cached-price-cell'
import { ModelCard } from '../components/model-card'
import { ModelCardGrid } from '../components/model-card-grid'
import type { PricingModel } from '../types'

function pricingModel(overrides: Partial<PricingModel> = {}): PricingModel {
  return {
    id: 1,
    model_name: 'example-model',
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 3,
    enable_groups: ['default', 'premium'],
    group_ratio: { default: 1, premium: 3 },
    ...overrides,
  }
}

let queryClient: QueryClient
const originalStorage = useSystemConfigStore.persist.getOptions().storage
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
    clear: () => storage.clear(),
    key: (index: number) => [...storage.keys()][index] ?? null,
    get length() {
      return storage.size
    },
  })
  useSystemConfigStore.persist.setOptions({
    storage: createJSONStorage(() => localStorage),
  })
  useSystemConfigStore.getState().setConfig({
    currency: { ...DEFAULT_CURRENCY_CONFIG, quotaDisplayType: 'USD' },
  })
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
})
afterEach(() => {
  queryClient.clear()
  useSystemConfigStore
    .getState()
    .setConfig({ currency: { ...DEFAULT_CURRENCY_CONFIG } })
  vi.useRealTimers()
  vi.unstubAllGlobals()
  useSystemConfigStore.persist.setOptions({ storage: originalStorage })
})

describe('model cards', () => {
  it('shows separate generic and image cache prices including a free image cache', () => {
    render(
      <CachedPriceCell
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr:
            'tier("standard", p * 5 + cr * 1.25 + img * 8 + img_cr * 0 + c * 30)',
        })}
        options={{ tokenUnit: 'M' }}
      />
    )
    expect(screen.getByText('Cache Read').parentElement).toHaveTextContent(
      '$1.25'
    )
    expect(screen.getByText('Image Cache').parentElement).toHaveTextContent(
      '$0'
    )
  })
  it('shows fixed prices per request in both token display units', () => {
    const model = pricingModel({
      billing_mode: 'tiered_expr',
      billing_expr: 'tier("request", fixed(0.01))',
    })
    const { rerender } = render(
      <ModelCard model={model} onClick={vi.fn()} tokenUnit='K' />
    )
    expect(screen.getByText('$0.01')).toBeVisible()
    expect(screen.getByText('/ request')).toBeVisible()
    rerender(<ModelCard model={model} onClick={vi.fn()} tokenUnit='M' />)
    expect(screen.getByText('$0.01')).toBeVisible()
    expect(screen.queryByText('/ 1M')).not.toBeInTheDocument()
  })
  it('updates the current time tier at a minute boundary and after returning to the page', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-07T08:59:59+08:00'))
    const model = pricingModel({
      billing_mode: 'tiered_expr',
      billing_expr:
        'hour("Asia/Shanghai") >= 9 && hour("Asia/Shanghai") < 12 ? tier("peak", p * 3 + c * 9) : tier("off_peak", p * 1.5 + c * 4.5)',
    })
    render(<ModelCard model={model} onClick={vi.fn()} tokenUnit='M' />)
    expect(screen.getByText('Current period price')).toBeVisible()
    expect(screen.getByText('$1.5')).toBeVisible()
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.getByText('$3')).toBeVisible()
    act(() => {
      vi.setSystemTime(new Date('2026-09-07T12:00:00+08:00'))
      fireEvent(document, new Event('visibilitychange'))
    })
    expect(screen.getByText('$1.5')).toBeVisible()
  })

  it('places input, output and cache read prices on separate horizontal rows', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", p * 1 + c * 5 + cr * 0.1)',
        })}
        onClick={vi.fn()}
      />
    )
    const pricing = screen.getByRole('group', { name: 'Pricing' })
    const rows = ['Input', 'Output', 'Cache Read'].map(
      (label) => within(pricing).getByText(label).parentElement
    )
    for (const row of rows) {
      expect(row).toHaveClass('items-baseline', 'justify-between')
    }
    expect(rows[0]?.parentElement).toHaveClass('flex-col')
    expect(new Set(rows).size).toBe(3)
  })

  it('copies the complete long model name without opening details', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const name = 'provider/model-with-a-long-name-and-a-version-suffix-20260906'
    render(
      <ModelCard model={pricingModel({ model_name: name })} onClick={onClick} />
    )
    expect(screen.getByRole('heading', { name })).toHaveAttribute('title', name)
    await user.click(screen.getByRole('button', { name: 'Copy model name' }))
    expect(await navigator.clipboard.readText()).toBe(name)
    expect(onClick).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(onClick).toHaveBeenCalledWith(name)
  })

  it('opens model details from the whole card with mouse or keyboard and removes the status footer', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ModelCard model={pricingModel()} onClick={onClick} />)
    expect(
      screen.queryByLabelText('Performance metrics for the last 24 hours')
    ).not.toBeInTheDocument()
    expect(screen.queryByText('Details')).not.toBeInTheDocument()
    const card = screen.getByRole('button', { name: 'example-model' })
    expect(card).toHaveClass('absolute', 'inset-0', 'cursor-pointer')
    await user.click(card)
    expect(onClick).toHaveBeenLastCalledWith('example-model')
    card.focus()
    await user.keyboard('{Enter}')
    await user.keyboard(' ')
    expect(onClick).toHaveBeenCalledTimes(3)
  })

  it('hides group and endpoint metadata while retaining tag overflow counts', () => {
    const groups = ['default-with-a-long-group-name', 'premium', 'internal']
    const endpoints = ['openai-response', 'openai', 'claude', 'gemini', 'jina']
    const tags = [
      'video-generation',
      'high-resolution',
      'fast',
      'batch',
      'hd',
      'pro',
    ]
    render(
      <ModelCard
        model={pricingModel({
          enable_groups: groups,
          supported_endpoint_types: endpoints,
          tags: tags.join(','),
        })}
        onClick={vi.fn()}
      />
    )

    expect(screen.queryByText('Groups')).not.toBeInTheDocument()
    expect(screen.queryByText('Endpoints')).not.toBeInTheDocument()
    const tagField = screen.getByRole('group', { name: 'Tags' })
    expect(
      within(tagField).getByText('video-generation, high-resolution')
    ).toHaveAttribute('title', tags.join(', '))
    expect(within(tagField).getByText('+4')).toBeVisible()
    expect(
      within(screen.getByRole('group', { name: 'Pricing' })).getByText(
        'Token-based'
      )
    ).toBeVisible()
  })

  it('omits metadata fields when the model has no groups, endpoints or tags', () => {
    render(
      <ModelCard
        model={pricingModel({ enable_groups: [] })}
        onClick={vi.fn()}
      />
    )
    expect(screen.queryByText('Groups')).not.toBeInTheDocument()
    expect(screen.queryByText('Endpoints')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'Tags' })
    ).not.toBeInTheDocument()
  })

  it('keeps group and recharge pricing correct when changing the token unit, including a free cache price', () => {
    const props = {
      model: pricingModel({ cache_ratio: 0 }),
      onClick: vi.fn(),
      selectedGroup: 'premium',
      showRechargePrice: true,
      priceRate: 3,
      usdExchangeRate: 6,
    }
    const { rerender } = render(<ModelCard {...props} tokenUnit='M' />)
    expect(screen.getByText('Input').parentElement).toHaveTextContent(
      /\$3\s*\/\s*1M/
    )
    expect(screen.getByText('Output').parentElement).toHaveTextContent(
      /\$9\s*\/\s*1M/
    )
    expect(screen.getByText('Cached').parentElement).toHaveTextContent(
      /\$0\s*\/\s*1M/
    )
    rerender(<ModelCard {...props} tokenUnit='K' />)
    expect(screen.getByText('Input').parentElement).toHaveTextContent(
      /\$0.003\s*\/\s*1K/
    )
    expect(screen.getByText('Output').parentElement).toHaveTextContent(
      /\$0.009\s*\/\s*1K/
    )
    expect(screen.getByText('Cached').parentElement).toHaveTextContent(
      /\$0\s*\/\s*1K/
    )
  })

  it('shows a per-request price with the selected group and recharge multiplier without a token unit', () => {
    render(
      <ModelCard
        model={pricingModel({ quota_type: 1, model_price: 0.4 })}
        onClick={vi.fn()}
        selectedGroup='premium'
        showRechargePrice
        priceRate={3}
        usdExchangeRate={6}
        tokenUnit='K'
      />
    )
    expect(screen.getByText(/\$0.6/)).toHaveTextContent(/\$0.6\s*\/\s*request/)
    expect(screen.queryByText(/1K|1M/)).not.toBeInTheDocument()
    expect(screen.getAllByText('Per Request')).toHaveLength(1)
    expect(screen.queryByText('Per-request')).not.toBeInTheDocument()
  })

  it('preserves expression prices and makes the selected token unit explicit', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", p * 3 + c * 15)',
        })}
        onClick={vi.fn()}
        tokenUnit='K'
        selectedGroup='premium'
        showRechargePrice
        priceRate={3}
        usdExchangeRate={6}
      />
    )
    expect(screen.getByText('Input').parentElement).toHaveTextContent(
      /\$0.0045\s*\/\s*1K/
    )
    expect(screen.getByText('Output').parentElement).toHaveTextContent(
      /\$0.0225\s*\/\s*1K/
    )
  })

  it('shows the cache read price of an expression model after its input and output prices', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", p * 0.15 + c * 0.6 + cr * 0.003)',
        })}
        onClick={vi.fn()}
        tokenUnit='M'
        selectedGroup='default'
      />
    )
    expect(screen.getByText('Input').parentElement).toHaveTextContent(
      /\$0.15\s*\/\s*1M/
    )
    expect(screen.getByText('Output').parentElement).toHaveTextContent(
      /\$0.6\s*\/\s*1M/
    )
    expect(screen.getByText('Cache Read').parentElement).toHaveTextContent(
      /\$0.003\s*\/\s*1M/
    )
  })

  it('shows the cache read price once when a plugin provider already lists it as a main price', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_plugin_variants: [
            {
              plugin_key: 'alpha',
              plugin_name: 'Alpha',
              billing_mode: 'tiered_expr',
              billing_expr: 'tier("base", p * 1 + c * 2 + cr * 0.5)',
              billing_usage_schema: {},
            },
          ],
        })}
        onClick={vi.fn()}
        tokenUnit='M'
        selectedGroup='default'
      />
    )
    expect(screen.getAllByText('Cache Read')).toHaveLength(1)
  })

  it('shows the cache read price of an expression model that prices nothing else', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", cr * 0.5)',
        })}
        onClick={vi.fn()}
        tokenUnit='M'
        selectedGroup='default'
      />
    )
    expect(screen.getByText('Cache Read').parentElement).toHaveTextContent(
      /\$0.5\s*\/\s*1M/
    )
  })

  it('keeps task price ranges in their actual usage unit instead of the selected token unit', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("mode") == "pro" ? tier("pro", u("seconds") * 0.8) : tier("std", u("seconds") * 0.4)',
          billing_usage_schema: {
            seconds: { type: 'number', unit: 'second' },
            mode: { enum: ['std', 'pro'] },
          },
        })}
        onClick={vi.fn()}
        tokenUnit='K'
      />
    )
    expect(screen.getByText(/0.4.*0.8/)).toHaveTextContent(/0.4 – \$0.8/)
    expect(screen.getByText(/^\/\s*s$/)).toBeVisible()
    expect(screen.queryByText(/1K|1M/)).not.toBeInTheDocument()
  })

  it('hides a task usage price left at zero while another usage price is set', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", u("count") * 0 + u("seconds") * 0.7)',
          billing_usage_schema: {
            count: {
              type: 'number',
              unit: 'count',
              description: { en: 'Per-task price' },
            },
            seconds: {
              type: 'number',
              unit: 'second',
              description: { en: 'Video generation unit price' },
            },
          },
        })}
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText('Video generation unit price')).toBeVisible()
    expect(screen.queryByText('Per-task price')).not.toBeInTheDocument()
  })

  it('does not show the tier name of a single-tier task price', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr: 'tier("base", u("seconds") * 0.4)',
          billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
        })}
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText(/^\$0\.4$/)).toBeVisible()
    expect(screen.queryByText('(base)')).not.toBeInTheDocument()
  })

  it('shows the unconfigured usage message without inventing a token price', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
        })}
        onClick={vi.fn()}
      />
    )
    expect(
      screen.getByText('Usage-based billing · price not configured')
    ).toBeVisible()
    expect(screen.queryByText('Input')).not.toBeInTheDocument()
  })

  it('shows a spaced task token range with its unit when an example price is present', () => {
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr:
            'u("mode") == "pro" ? tier("pro", u("tokens") * 70 / 1000000) : tier("std", u("tokens") * 42 / 1000000)',
          billing_usage_schema: {
            tokens: { type: 'number', unit: 'token' },
            mode: { enum: ['std', 'pro'] },
          },
          billing_usage_examples: [
            { label: '480p · 5s', facts: { tokens: 48000, mode: 'std' } },
          ],
        })}
        onClick={vi.fn()}
        tokenUnit='K'
      />
    )
    expect(screen.getByText('$42 – $70').parentElement).toHaveTextContent(
      '$42 – $70 / 1M token'
    )
    expect(screen.getByText(/480p · 5s ≈/)).toBeVisible()
  })

  it('keeps an unrecognized expression visible with the special billing message', () => {
    const expression =
      'u("seconds") > 30 ? tier("long", u("seconds") * 0.3) : tier("short", u("seconds") * 0.4)'
    render(
      <ModelCard
        model={pricingModel({
          billing_mode: 'tiered_expr',
          billing_expr: expression,
          billing_usage_schema: { seconds: { type: 'number', unit: 'second' } },
        })}
        onClick={vi.fn()}
      />
    )
    expect(screen.getByText('Special billing expression')).toBeVisible()
    expect(screen.getByText(expression)).toBeVisible()
  })

  it('does not request removed card performance metrics and keeps the details action available', async () => {
    const request = vi.spyOn(api, 'get')
    const onModelClick = vi.fn()
    render(
      <ModelCardGrid models={[pricingModel()]} onModelClick={onModelClick} />
    )
    expect(request).not.toHaveBeenCalled()
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'example-model' }))
    expect(onModelClick).toHaveBeenCalledWith('example-model')
  })

  it('paginates the model cards and disables navigation at both boundaries', async () => {
    const models = Array.from({ length: 21 }, (_, index) =>
      pricingModel({ id: index + 1, model_name: `model-${index + 1}` })
    )
    const user = userEvent.setup()
    render(
      <QueryClientProvider client={queryClient}>
        <ModelCardGrid models={models} onModelClick={vi.fn()} />
      </QueryClientProvider>
    )
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(20)
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'model-21' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    expect(screen.getByRole('heading', { name: 'model-1' })).toBeVisible()
  })

  it('switches the card grid to three columns at the xl breakpoint instead of 2xl', () => {
    queryClient.setQueryData(['perf-metrics-summary', 24, ['example-model']], {
      success: true,
      data: { models: [] },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <ModelCardGrid models={[pricingModel()]} onModelClick={vi.fn()} />
      </QueryClientProvider>
    )
    const grid = screen
      .getByRole('heading', { name: 'example-model' })
      .closest('.grid')
    expect(grid).toHaveClass(
      'grid-cols-1',
      'md:grid-cols-2',
      'xl:grid-cols-3',
      '2xl:grid-cols-4'
    )
    expect(grid).not.toHaveClass('2xl:grid-cols-3')
    expect(grid).not.toHaveClass('min-[1440px]:grid-cols-3')
  })
})
