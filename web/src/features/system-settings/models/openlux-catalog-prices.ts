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
import type { OpenLuxCatalog, OpenLuxModel } from '../types'

export type OpenLuxGroupPriceRow = {
  group: string
  label: string
  available: boolean
  ratio: number | null
  uptime: number | null
  inputStart: number
  inputEnd: number | null
  outputEnd: number | null
  perImage: number | null
  imageInput: number | null
  imageCache: number | null
  input: number | null
  inputThinking: number | null
  output: number | null
  outputThinking: number | null
  cacheRead: number | null
  cacheWrite: number | null
  cacheWrite1h: number | null
}

// Missing and invalid upstream values are unknown, never a zero/free price.
export function openLuxPriceProduct(
  ...values: (number | null | undefined)[]
): number | null {
  let result = 1
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return null
    }
    const next = result * value
    if (!Number.isFinite(next) || (result > 0 && value > 0 && next === 0)) {
      return null
    }
    result = next
  }
  return result
}

// Reproduce the source detail table. Cache columns on OpenLux are model-level
// reference prices; cache_step_ratio is retained in raw data, not silently
// applied to these merged source columns. Publishing still uses server validation.
export function getOpenLuxGroupPrices(
  model: OpenLuxModel,
  catalog: OpenLuxCatalog,
  unit: number
): OpenLuxGroupPriceRow[] {
  const groups = model.enable_groups ?? []
  const steps = model.step_ratios?.length
    ? model.step_ratios
    : [{ step_size: -1, prompt_step_ratio: 1, completion_step_ratio: 1 }]
  return groups.flatMap((group) => {
    const available = Object.hasOwn(catalog.groups, group)
    let ratio: number | null = null
    if (available && Object.hasOwn(catalog.ratios, group)) {
      ratio = catalog.ratios[group]
    }
    const unknownModelRates =
      Object.keys(catalog.catalog?.group_model_ratio ?? {}).length > 0
    const base =
      model.quota_type === 0 &&
      !unknownModelRates &&
      !catalog.import_support?.[model.model_name]
        ? openLuxPriceProduct(unit, model.model_ratio, ratio)
        : null
    const uptime = catalog.uptime?.[group]?.uptime
    return steps.map((step, index) => ({
      group,
      label:
        catalog.groups[group] ??
        catalog.catalog?.usable_group?.[group] ??
        group,
      available,
      ratio,
      uptime:
        typeof uptime === 'number' &&
        Number.isFinite(uptime) &&
        uptime >= 0 &&
        uptime <= 1
          ? uptime
          : null,
      inputStart: index > 0 ? steps[index - 1].step_size : 0,
      inputEnd: step.step_size > 0 ? step.step_size : null,
      outputEnd:
        step.completion_step_size && step.completion_step_size > 0
          ? step.completion_step_size
          : null,
      perImage:
        model.quota_type === 1 &&
        !unknownModelRates &&
        !catalog.import_support?.[model.model_name]
          ? openLuxPriceProduct(model.model_price, ratio)
          : null,
      imageInput: openLuxPriceProduct(base, model.image_ratio),
      imageCache: openLuxPriceProduct(base, model.image_cache_ratio),
      input: openLuxPriceProduct(base, step.prompt_step_ratio),
      inputThinking:
        step.prompt_thinking_step_ratio && step.prompt_thinking_step_ratio > 0
          ? openLuxPriceProduct(base, step.prompt_thinking_step_ratio)
          : null,
      output: openLuxPriceProduct(
        base,
        model.completion_ratio,
        step.completion_step_ratio
      ),
      outputThinking:
        step.completion_thinking_step_ratio &&
        step.completion_thinking_step_ratio > 0
          ? openLuxPriceProduct(
              base,
              model.completion_ratio,
              step.completion_thinking_step_ratio
            )
          : null,
      cacheRead: openLuxPriceProduct(base, model.cache_ratio),
      cacheWrite: openLuxPriceProduct(
        base,
        model.cache_creation_5m_ratio ?? model.cache_creation_ratio
      ),
      cacheWrite1h: openLuxPriceProduct(base, model.cache_creation_1h_ratio),
    }))
  })
}
