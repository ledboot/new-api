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
    },
    {
      num: '3',
      title: t('Monitor'),
      desc: t('Track usage, costs and performance with real-time analytics'),
      icon: <BarChart3 className='size-6' strokeWidth={1.5} />,
    },
  ]

  return (
    <section className='bg-muted/40 relative z-10 border-y px-6 py-16 md:py-20'>
      <div className='mx-auto grid site-container items-center gap-10 lg:grid-cols-2 lg:gap-16'>
        <div>
          <AnimateInView className='mb-9'>
            <p className='text-primary mb-3 text-xs font-medium tracking-widest uppercase'>
              {t('How It Works')}
            </p>
            <h2 className='text-2xl font-bold tracking-tight md:text-3xl'>
              {t('Three steps to get started')}
            </h2>
          </AnimateInView>

          <div className='grid gap-6'>
            {steps.map((step, i) => (
              <AnimateInView
                key={step.num}
                delay={i * 150}
                animation='fade-up'
                className='relative flex items-start gap-5'
              >
                <div className='relative shrink-0'>
                  <div className='text-muted-foreground border-border/50 bg-muted/30 flex size-12 items-center justify-center rounded-lg border transition-colors'>
                    {step.icon}
                  </div>
                  <div className='bg-primary text-primary-foreground absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full text-xs font-bold'>
                    {step.num}
                  </div>
                </div>
                <div>
                  <h3 className='mb-2 text-sm font-semibold'>{step.title}</h3>
                  <p className='text-muted-foreground max-w-md text-sm leading-relaxed'>
                    {step.desc}
                  </p>
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
