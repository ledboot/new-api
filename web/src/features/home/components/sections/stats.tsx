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
import { useRef, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

interface CounterProps {
  end: number
  suffix?: string
  prefix?: string
  duration?: number
  decimals?: number
}

function Counter(props: CounterProps) {
  const { end, suffix = '', prefix = '', duration = 1200, decimals = 0 } = props
  const ref = useRef<HTMLSpanElement>(null)
  const startedRef = useRef(false)

  const formatValue = useCallback(
    (v: number) =>
      decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString(),
    [decimals]
  )

  const animate = useCallback(() => {
    const el = ref.current
    if (!el || startedRef.current) return
    startedRef.current = true
    const start = performance.now()
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      el.textContent = `${prefix}${formatValue(eased * end)}${suffix}`
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [end, duration, prefix, suffix, formatValue])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (mq.matches || typeof IntersectionObserver === 'undefined') {
      el.textContent = `${prefix}${formatValue(end)}${suffix}`
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          animate()
          observer.unobserve(el)
        }
      },
      { threshold: 0.05 }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [animate, end, prefix, suffix, formatValue])

  return (
    <span ref={ref} className='tabular-nums'>
      {prefix}
      {formatValue(end)}
      {suffix}
    </span>
  )
}

interface StatsProps {
  className?: string
}

interface StatItem {
  code: string
  end: number
  suffix: string
  label: string
  accentClass: string
  decimals?: number
}

export function Stats(props: StatsProps) {
  const { t } = useTranslation()

  const stats: StatItem[] = [
    {
      code: '01 // PROVIDERS',
      end: 50,
      suffix: '+',
      label: t('upstream services integrated'),
      accentClass: 'bg-primary',
    },
    {
      code: '02 // BILLING',
      end: 100,
      suffix: '+',
      label: t('model billing support'),
      accentClass: 'bg-chart-2',
    },
    {
      code: '03 // PROTOCOLS',
      end: 50,
      suffix: '+',
      label: t('compatible API routes'),
      accentClass: 'bg-chart-3',
    },
    {
      code: '04 // ROUTING',
      end: 10,
      suffix: '+',
      label: t('scheduling controls'),
      accentClass: 'bg-chart-4',
    },
  ]

  return (
    <div className={cn('relative z-10 px-5 sm:px-6', props.className)}>
      <div className='site-container mx-auto'>
        <div className='tech-corner-ticks rounded-2xl'>
          <div className='border-border/75 bg-card/75 divide-border/65 grid grid-cols-2 divide-x divide-y overflow-hidden rounded-2xl border shadow-2xs backdrop-blur-md md:grid-cols-4 md:divide-y-0'>
            {stats.map((s) => (
              <div
                key={s.code}
                className='group hover:bg-muted/35 relative flex flex-col justify-between gap-3 p-4 transition-colors duration-200 sm:p-6'
              >
                <div className='flex items-center justify-between gap-2'>
                  <span
                    aria-hidden='true'
                    className='text-muted-foreground/70 font-mono text-[10px] tracking-[0.16em] uppercase'
                  >
                    {s.code}
                  </span>
                  <span
                    aria-hidden='true'
                    className={cn(
                      'size-1.5 rounded-full opacity-80 transition-transform duration-200 group-hover:scale-125',
                      s.accentClass
                    )}
                  />
                </div>
                <div>
                  <div className='font-mono text-2xl font-bold tracking-tight sm:text-3xl md:text-4xl'>
                    <Counter
                      end={s.end}
                      suffix={s.suffix}
                      decimals={s.decimals}
                    />
                  </div>
                  <p className='text-muted-foreground mt-1 text-xs leading-snug font-medium'>
                    {s.label}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
