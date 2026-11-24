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
import { Link } from '@tanstack/react-router'
import { Settings, Zap, BarChart3 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

import { HeroTerminalDemo } from '../hero-terminal-demo'

export function HowItWorks() {
  const { t } = useTranslation()

  const steps = [
    {
      num: '1',
      title: t('Configure'),
      desc: t(
        'Add your API keys, set up channels and configure access permissions'
      ),
      icon: <Settings className='size-6' strokeWidth={1.5} />,
    },
    {
      num: '2',
      title: t('Connect'),
      desc: t(
        'Connect through OpenAI, Claude, Gemini, and other compatible API routes'
      ),
      icon: <Zap className='size-6' strokeWidth={1.5} />,
      links: [
        { label: 'Claude Code', href: '/claude-code' as const },
        { label: 'GPT-6.2 & Codex', href: '/gpt' as const },
        { label: 'Gemini 4', href: '/gemini' as const },
      ],
    },
    {
      num: '3',
      title: t('Monitor'),
      desc: t('Track usage, costs and performance with real-time analytics'),
      icon: <BarChart3 className='size-6' strokeWidth={1.5} />,
    },
  ]

  return (
    <section className='bg-muted/30 border-border/60 relative z-10 border-y px-5 py-16 sm:px-6 md:py-22'>
      <div className='site-container mx-auto grid items-center gap-10 lg:grid-cols-2 lg:gap-16'>
        <div>
          <AnimateInView className='mb-9'>
            <p className='text-primary mb-2.5 font-mono text-[11px] font-semibold tracking-[0.2em] uppercase'>
              // {t('How It Works')}
            </p>
            <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
              {t('Three steps to get started')}
            </h2>
          </AnimateInView>

          <div className='relative grid gap-6'>
            {steps.map((step, i) => (
              <AnimateInView
                key={step.num}
                delay={i * 120}
                animation='fade-up'
                className='group relative flex items-start gap-4 sm:gap-5'
              >
                {i < steps.length - 1 && (
                  <span
                    aria-hidden='true'
                    className='bg-border/80 absolute top-13 -bottom-6 left-6 w-px'
                  />
                )}
                <div className='relative z-10 shrink-0'>
                  <div className='text-primary border-border/80 bg-card group-hover:border-primary/40 flex size-12 items-center justify-center rounded-xl border shadow-2xs transition-colors'>
                    {step.icon}
                  </div>
                  <div className='bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full font-mono text-[11px] font-bold shadow-xs'>
                    {step.num}
                  </div>
                </div>
                <div className='pt-0.5'>
                  <h3 className='mb-1.5 text-sm font-semibold tracking-tight sm:text-base'>
                    {step.title}
                  </h3>
                  <p className='text-muted-foreground max-w-md text-sm leading-relaxed'>
                    {step.desc}
                  </p>
                  {step.links && (
                    <div className='mt-2.5 flex flex-wrap gap-1.5'>
                      {step.links.map((item) => (
                        <Link
                          key={item.href}
                          to={item.href}
                          className='border-border/75 bg-card/85 hover:border-primary/40 hover:text-primary rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium transition-colors'
                        >
                          {item.label} →
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </AnimateInView>
            ))}
          </div>
        </div>
        <HeroTerminalDemo className='w-full min-w-0' />
      </div>
    </section>
  )
}
