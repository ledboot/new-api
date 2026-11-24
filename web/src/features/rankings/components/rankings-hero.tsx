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
import { motion, useReducedMotion } from 'motion/react'
import { useTranslation } from 'react-i18next'

import { MOTION_TRANSITION } from '@/lib/motion'
import { cn } from '@/lib/utils'

import type { RankingPeriod } from '../types'

const PERIODS: { id: RankingPeriod; labelKey: string }[] = [
  { id: 'today', labelKey: 'Today' },
  { id: 'week', labelKey: 'Week' },
  { id: 'month', labelKey: 'Month' },
  { id: 'year', labelKey: 'Year' },
]

type RankingsHeroProps = {
  period: RankingPeriod
  onPeriodChange: (period: RankingPeriod) => void
}

export function RankingsHero(props: RankingsHeroProps) {
  const { t } = useTranslation()
  const shouldReduceMotion = useReducedMotion()

  return (
    <section className='border-border/65 flex flex-col justify-between gap-4 border-b pb-5 sm:pb-6 lg:flex-row lg:items-end'>
      <div className='space-y-2'>
        <p
          aria-hidden='true'
          className='text-primary font-mono text-[11px] font-semibold tracking-[0.2em] uppercase'
        >
          // LIVE TELEMETRY
        </p>
        <h1 className='text-[clamp(1.75rem,3.6vw,2.65rem)] leading-[1.12] font-bold tracking-[-0.03em]'>
          {t('Rankings')}
        </h1>
        <p className='text-muted-foreground max-w-2xl text-xs leading-relaxed sm:text-sm'>
          {t(
            'Discover the most-used models and rising vendors on the platform, updated from live usage data.'
          )}
        </p>
      </div>

      {/* Segmented glass pill period switcher */}
      <div
        role='tablist'
        aria-label={t('Period')}
        className='border-border/75 bg-card/80 no-scrollbar inline-flex max-w-full items-center gap-0.5 self-start overflow-x-auto rounded-xl border p-1 shadow-2xs backdrop-blur-md lg:self-auto'
      >
        {PERIODS.map((p) => {
          const isActive = props.period === p.id
          return (
            <button
              key={p.id}
              role='tab'
              type='button'
              aria-selected={isActive}
              onClick={() => props.onPeriodChange(p.id)}
              className={cn(
                'focus-visible:ring-ring/40 relative shrink-0 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                isActive
                  ? 'text-primary-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId={
                    shouldReduceMotion ? undefined : 'rankings-period-pill'
                  }
                  transition={MOTION_TRANSITION.spring}
                  aria-hidden='true'
                  className='bg-primary absolute inset-0 rounded-lg shadow-xs'
                />
              )}
              <span className='relative z-10'>{t(p.labelKey)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
