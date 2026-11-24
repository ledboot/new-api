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
import {
  Zap,
  Shield,
  Globe,
  Code,
  Gauge,
  DollarSign,
  Users,
  HeartHandshake,
  Check,
} from 'lucide-react'
import type { PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { cn } from '@/lib/utils'

interface FeaturesProps {
  className?: string
}

function handleSpotlightMove(event: PointerEvent<HTMLDivElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty(
    '--mouse-x',
    `${event.clientX - rect.left}px`
  )
  event.currentTarget.style.setProperty(
    '--mouse-y',
    `${event.clientY - rect.top}px`
  )
}

export function Features(props: FeaturesProps) {
  const { t } = useTranslation()

  const features = [
    {
      id: 'fast',
      num: '01',
      tag: 'LOW-LATENCY MESH',
      title: t('Lightning Fast'),
      desc: t(
        'Optimized network architecture ensures millisecond response times'
      ),
      span: 'lg:col-span-7',
      icon: <Zap className='text-primary size-4' />,
      visual: (
        <div className='mt-6 grid grid-cols-2 gap-2 sm:grid-cols-3'>
          {[
            { name: 'OpenAI', ms: '12ms', bar: 'w-4/5' },
            { name: 'Claude', ms: '15ms', bar: 'w-3/4' },
            { name: 'Gemini', ms: '9ms', bar: 'w-11/12' },
            { name: 'DeepSeek', ms: '14ms', bar: 'w-4/5' },
            { name: 'Qwen', ms: '11ms', bar: 'w-5/6' },
            { name: 'Llama', ms: '8ms', bar: 'w-11/12' },
          ].map((item) => (
            <div
              key={item.name}
              className='border-border/65 bg-background/65 hover:border-primary/40 flex flex-col gap-2 rounded-xl border p-2.5 transition-colors duration-200'
            >
              <div className='flex items-center justify-between gap-2'>
                <span className='truncate text-xs font-semibold'>
                  {item.name}
                </span>
                <span className='text-primary font-mono text-[10px] tabular-nums'>
                  {item.ms}
                </span>
              </div>
              <div className='bg-muted h-1 overflow-hidden rounded-full'>
                <div
                  className={cn(
                    'from-primary to-chart-2 h-full rounded-full bg-linear-to-r',
                    item.bar
                  )}
                />
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: 'secure',
      num: '02',
      tag: 'ZERO-TRUST GUARD',
      title: t('Secure & Reliable'),
      desc: t(
        'Enterprise-grade security with comprehensive permission management'
      ),
      span: 'lg:col-span-5',
      icon: <Shield className='text-primary size-4' />,
      visual: (
        <div className='border-border/65 bg-background/60 mt-6 flex items-center justify-between gap-4 rounded-xl border p-3.5'>
          <div className='relative flex size-14 shrink-0 items-center justify-center'>
            <div className='border-primary/20 absolute inset-0 rounded-2xl border border-dashed' />
            <div className='border-primary/30 bg-primary/10 flex size-11 items-center justify-center rounded-xl border'>
              <Shield className='text-primary size-5' strokeWidth={1.75} />
            </div>
            <span className='bg-success text-success-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full shadow-xs'>
              <Check className='size-2.5' strokeWidth={3} />
            </span>
          </div>
          <div className='grid min-w-0 flex-1 grid-cols-2 gap-1.5 font-mono text-[10px]'>
            {['RBAC · CASBIN', 'JWT · PASSKEY', 'RATE QUOTA', 'AUDIT LOG'].map(
              (chip) => (
                <span
                  key={chip}
                  className='border-border/60 bg-card/80 text-muted-foreground truncate rounded-md border px-2 py-1 text-center'
                >
                  {chip}
                </span>
              )
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'global',
      num: '03',
      tag: 'SMART SCHEDULER',
      title: t('Global Coverage'),
      desc: t('Multi-region deployment for stable global access'),
      span: 'lg:col-span-5',
      icon: <Globe className='text-primary size-4' />,
      visual: (
        <div className='mt-6 space-y-2'>
          {[t('Load Balancing'), t('Rate Limiting'), t('Cost Tracking')].map(
            (step, i) => (
              <div
                key={step}
                className='border-border/60 bg-background/60 flex items-center gap-3 rounded-xl border px-3 py-2'
              >
                <span
                  className={cn(
                    'flex size-5 shrink-0 items-center justify-center rounded-md font-mono text-[10px] font-bold tabular-nums',
                    i === 0
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  0{i + 1}
                </span>
                <span className='min-w-0 flex-1 truncate text-xs font-medium'>
                  {step}
                </span>
                <span className='bg-success/80 size-1.5 shrink-0 rounded-full' />
              </div>
            )
          )}
        </div>
      ),
    },
    {
      id: 'developer',
      num: '04',
      tag: 'DROP-IN SDK',
      title: t('Developer Friendly'),
      desc: t('Compatible API routes for common AI application workflows'),
      span: 'lg:col-span-7',
      icon: <Code className='text-primary size-4' />,
      visual: (
        <div className='border-border/65 bg-background/65 mt-6 flex flex-col justify-between gap-3 rounded-xl border p-3.5 sm:flex-row sm:items-center'>
          <div className='flex flex-wrap items-center gap-1.5'>
            {['API', 'SDK', 'CLI', 'Docs'].map((surface, index) => (
              <span
                key={surface}
                className={cn(
                  'rounded-lg border px-2.5 py-1 font-mono text-xs font-semibold',
                  index === 0
                    ? 'border-primary/35 bg-primary/12 text-primary'
                    : 'border-border/70 bg-card text-muted-foreground'
                )}
              >
                {surface}
              </span>
            ))}
          </div>
          <div className='text-muted-foreground flex items-center gap-2 font-mono text-xs'>
            <Code className='text-primary size-3.5 shrink-0' />
            <span className='truncate'>{t('Multi-protocol Compatible')}</span>
          </div>
        </div>
      ),
    },
  ]

  const additionalFeatures = [
    {
      code: 'A1',
      icon: <Gauge className='size-4' strokeWidth={1.75} />,
      title: t('High Performance'),
      desc: t('Support for high concurrency with automatic load balancing'),
    },
    {
      code: 'A2',
      icon: <DollarSign className='size-4' strokeWidth={1.75} />,
      title: t('Transparent Billing'),
      desc: t('Pay-as-you-go with real-time usage monitoring'),
    },
    {
      code: 'A3',
      icon: <Users className='size-4' strokeWidth={1.75} />,
      title: t('Team Collaboration'),
      desc: t('Multi-user management with flexible permission allocation'),
    },
    {
      code: 'A4',
      icon: <HeartHandshake className='size-4' strokeWidth={1.75} />,
      title: t('Open Source'),
      desc: t('Community driven, self-hosted, and extensible'),
    },
  ]

  return (
    <section
      className={cn(
        'tokara-features relative z-10 px-5 py-16 sm:px-6 md:py-24',
        props.className
      )}
    >
      <div className='site-container mx-auto'>
        <AnimateInView className='mb-10 flex flex-col gap-3 md:mb-12 md:flex-row md:items-end md:justify-between'>
          <div className='max-w-xl'>
            <p className='text-primary mb-2 font-mono text-[11px] font-semibold tracking-[0.22em] uppercase'>
              // {t('Core Features')}
            </p>
            <h2 className='text-2xl leading-[1.15] font-bold tracking-[-0.025em] md:text-4xl'>
              {t('Built for developers,')}{' '}
              <span className='text-muted-foreground font-semibold'>
                {t('designed for scale')}
              </span>
            </h2>
          </div>
          <div
            aria-hidden='true'
            className='text-muted-foreground/70 hidden font-mono text-xs tracking-widest uppercase md:block'
          >
            [ ARCH.SPEC · V2 ]
          </div>
        </AnimateInView>

        {/* Asymmetric 12-column Bento Grid with pointer-tracked spotlight */}
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-12'>
          {features.map((f, i) => (
            <AnimateInView
              key={f.id}
              delay={i * 70}
              animation='scale-in'
              className={cn('min-w-0', f.span)}
            >
              <div
                onPointerMove={handleSpotlightMove}
                className='tech-bento-card bg-card/85 border-border/80 group hover:border-primary/40 flex h-full flex-col justify-between rounded-2xl border p-5 shadow-2xs transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md sm:p-6 dark:border-white/[0.08]'
              >
                <div className='relative z-10'>
                  <div className='mb-3 flex items-center justify-between gap-3'>
                    <div className='flex items-center gap-2.5'>
                      <span className='border-primary/25 bg-primary/10 text-primary flex size-7 items-center justify-center rounded-lg border font-mono text-[11px] font-semibold tabular-nums'>
                        {f.num}
                      </span>
                      <span
                        aria-hidden='true'
                        className='text-muted-foreground/70 font-mono text-[10px] tracking-[0.18em] uppercase'
                      >
                        {f.tag}
                      </span>
                    </div>
                    <span className='border-border/60 bg-muted/40 group-hover:border-primary/30 flex size-8 items-center justify-center rounded-lg border transition-colors'>
                      {f.icon}
                    </span>
                  </div>
                  <h3 className='text-base font-semibold tracking-tight sm:text-lg'>
                    {f.title}
                  </h3>
                  <p className='text-muted-foreground mt-1.5 max-w-xl text-sm leading-relaxed'>
                    {f.desc}
                  </p>
                </div>
                <div className='relative z-10'>{f.visual}</div>
              </div>
            </AnimateInView>
          ))}
        </div>

        {/* Connected Architectural Spec Strip */}
        <div className='border-border/75 bg-card/60 divide-border/65 mt-6 grid grid-cols-1 divide-y overflow-hidden rounded-2xl border backdrop-blur-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4'>
          {additionalFeatures.map((f) => (
            <div
              key={f.title}
              className='hover:bg-muted/35 flex items-start gap-3.5 p-5 transition-colors duration-200'
            >
              <div className='text-primary border-primary/20 bg-primary/10 flex size-9 shrink-0 items-center justify-center rounded-xl border'>
                {f.icon}
              </div>
              <div className='min-w-0'>
                <div className='flex items-center gap-2'>
                  <h3 className='truncate text-sm font-semibold tracking-tight'>
                    {f.title}
                  </h3>
                  <span
                    aria-hidden='true'
                    className='text-muted-foreground/50 font-mono text-[10px]'
                  >
                    {f.code}
                  </span>
                </div>
                <p className='text-muted-foreground mt-1 text-xs leading-relaxed'>
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
