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
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'
import { Button } from '@/components/ui/button'

interface CTAProps {
  className?: string
  isAuthenticated?: boolean
}

export function CTA(props: CTAProps) {
  const { t } = useTranslation()

  if (props.isAuthenticated) {
    return null
  }

  return (
    <section className='mx-5 my-16 md:mx-6 xl:mx-8'>
      <div className='border-primary/25 site-container relative z-10 mx-auto overflow-hidden rounded-2xl border bg-[linear-gradient(135deg,color-mix(in_oklch,var(--primary)_92%,#050814)_0%,color-mix(in_oklch,var(--primary)_68%,#060b19)_55%,#091124_100%)] px-6 py-14 text-white shadow-[0_24px_60px_-24px_color-mix(in_oklch,var(--primary)_45%,transparent)] md:py-18'>
        <div
          aria-hidden='true'
          className='pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.07)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_75%_75%_at_50%_50%,black_20%,transparent_85%)] bg-[size:48px_48px]'
        />
        <AnimateInView
          className='relative mx-auto max-w-2xl text-center'
          animation='scale-in'
        >
          <h2 className='text-2xl leading-tight font-bold tracking-tight md:text-4xl'>
            {t('Ready to simplify')}
            <br />
            <span className='text-white/95'>{t('your AI integration?')}</span>
          </h2>
          <p className='mx-auto mt-4 max-w-md text-sm leading-relaxed text-white/75 md:text-base'>
            {t(
              'Deploy your own gateway and start routing requests through your configured upstream services.'
            )}
          </p>
          <div className='mt-8 flex flex-wrap items-center justify-center gap-3'>
            <Button
              variant='secondary'
              className='group h-10 rounded-xl bg-white px-5 font-semibold text-slate-950 hover:bg-white/90'
              render={<Link to='/sign-up' />}
            >
              {t('Get Started')}
              <ArrowRight className='ml-1 size-3.5 transition-transform duration-200 group-hover:translate-x-0.5' />
            </Button>
            <Button
              variant='outline'
              className='h-10 rounded-xl border-white/30 bg-white/5 px-5 text-white hover:border-white/50 hover:bg-white/15 hover:text-white'
              render={<Link to='/pricing' />}
            >
              {t('View Pricing')}
            </Button>
          </div>
        </AnimateInView>
      </div>
    </section>
  )
}
