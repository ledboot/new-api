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
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, expect, test, vi } from 'vitest'

import { OfficialPriceSettingsCard } from '../official-price-settings-card'
import * as api from '../official-price-api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('../hooks/use-update-option', () => ({
  useUpdateOption: () => ({ mutateAsync: vi.fn(), isPending: false }),
}))
vi.mock('../official-price-api', () => ({
  getOfficialPrices: vi.fn(),
  saveOfficialPrice: vi.fn(),
  resetOfficialPrice: vi.fn(),
  syncOfficialPrices: vi.fn(),
}))

const overview = {
  items: [
    {
      model_name: 'gpt-4o',
      quota_type: 0,
      input_price: 2.5,
      output_price: 10,
      request_price: 0,
      cache_read_price: 1.25,
      cache_write_price: 0,
      cache_write_1h_price: 0,
      source: 'sync' as const,
      updated_time: 1700000000,
    },
    {
      model_name: 'mj-image',
      quota_type: 1,
      input_price: 0,
      output_price: 0,
      request_price: 0.1,
      cache_read_price: 0,
      cache_write_price: 0,
      cache_write_1h_price: 0,
      source: 'manual' as const,
      updated_time: 1700000000,
    },
  ],
  state: {
    last_run_time: 1700000000,
    updated: 2,
    matched: 5,
    skipped: 1,
    error: '',
    source_url: '',
    source_format: 'litellm',
  },
  settings: { enabled: true, interval_hours: 24, source_url: '' },
}

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  vi.mocked(api.getOfficialPrices).mockResolvedValue(overview)
  vi.mocked(api.saveOfficialPrice).mockResolvedValue(undefined)
  vi.mocked(api.resetOfficialPrice).mockResolvedValue(undefined)
  vi.mocked(api.syncOfficialPrices).mockResolvedValue(overview.state)
})

test('lists official prices with their source and filters by name', async () => {
  render(
    wrap(
      <OfficialPriceSettingsCard
        defaultValues={{
          enabled: true,
          intervalHours: 24,
          sourceUrl: 'https://example.com/prices.json',
        }}
      />
    )
  )

  expect(await screen.findByText('gpt-4o')).toBeInTheDocument()
  expect(screen.getByText('mj-image')).toBeInTheDocument()
  expect(screen.getAllByText('Synced').length).toBeGreaterThan(0)
  expect(screen.getAllByText('Manual').length).toBeGreaterThan(0)

  fireEvent.change(screen.getByLabelText('Search models'), {
    target: { value: 'mj' },
  })
  await waitFor(() =>
    expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument()
  )
  expect(screen.getByText('mj-image')).toBeInTheDocument()
})

test('saves an edited price and resets a synced row', async () => {
  render(
    wrap(
      <OfficialPriceSettingsCard
        defaultValues={{
          enabled: true,
          intervalHours: 24,
          sourceUrl: 'https://example.com/prices.json',
        }}
      />
    )
  )

  await screen.findByText('gpt-4o')
  const input = screen.getByLabelText('gpt-4o Input')
  fireEvent.change(input, { target: { value: '3' } })
  const saveButtons = screen.getAllByRole('button', { name: 'Save' })
  fireEvent.click(saveButtons[0])

  await waitFor(() => expect(api.saveOfficialPrice).toHaveBeenCalled())
  expect(vi.mocked(api.saveOfficialPrice).mock.calls[0][0]).toEqual({
    model_name: 'gpt-4o',
    input_price: 3,
    output_price: 10,
    request_price: 0,
    cache_read_price: 1.25,
    cache_write_price: 0,
    cache_write_1h_price: 0,
  })

  const resetButtons = screen.getAllByRole('button', { name: 'Reset' })
  fireEvent.click(resetButtons[0])
  await waitFor(() => expect(api.resetOfficialPrice).toHaveBeenCalled())
  expect(vi.mocked(api.resetOfficialPrice).mock.calls[0][0]).toBe('gpt-4o')
})

test('runs a manual sync from the card', async () => {
  render(
    wrap(
      <OfficialPriceSettingsCard
        defaultValues={{
          enabled: true,
          intervalHours: 24,
          sourceUrl: 'https://example.com/prices.json',
        }}
      />
    )
  )

  await screen.findByText('gpt-4o')
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' }))
  await waitFor(() => expect(api.syncOfficialPrices).toHaveBeenCalled())
})
