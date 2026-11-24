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
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { AnimateInView } from '@/components/animate-in-view'

interface BrandFaqProps {
  className?: string
}

/**
 * Plain-language description of the product plus its most common questions.
 * Search engines and AI assistants answer brand questions from text like this,
 * so keep the copy factual and the questions phrased the way people ask them.
 */
export function BrandFaq(props: BrandFaqProps) {
  const { t } = useTranslation()

  const facts = [
    t('One API key for every model you use'),
    t('Pay only for the tokens you actually consume'),
    t('Every request is visible in your usage log'),
  ]

  const questions = [
    {
      question: t('Which AI models can I call through Tokara?'),
      answer: t(
        'Through Tokara you can call OpenAI, Claude, Gemini, DeepSeek and other mainstream models with a single API key. The model list and its prices are published on the pricing page.'
      ),
    },
    {
      question: t('Is Tokara compatible with the OpenAI API?'),
      answer: t(
        'Yes. Point any OpenAI-compatible SDK, plugin or client at the Tokara endpoint and use a Tokara API key. Existing code keeps working without changes, including streaming responses.'
      ),
    },
    {
      question: t('How is Tokara usage billed?'),
      answer: t(
        'Usage is billed per token. Input and output tokens are priced separately for each model, and the usage log records every request with its cost so the balance is always explainable.'
      ),
    },
    {
      question: t('How do I start using Tokara?'),
      answer: t(
        'Create an account, create an API key in the console, then top up the balance you need. The documentation walks through the first request with curl or an OpenAI SDK.'
      ),
    },
  ]

  return (
    <section
      id='about-tokara'
      className={props.className ?? 'mx-5 my-16 md:mx-6 xl:mx-8'}
    >
      <AnimateInView className='site-container mx-auto grid gap-10 md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] md:gap-16'>
        <div>
          <p className='text-primary text-[10px] font-medium tracking-[0.2em] uppercase'>
            {t('About Tokara')}
          </p>
          <h2 className='mt-4 text-2xl leading-tight font-bold tracking-tight md:text-3xl'>
            {t('What is Tokara?')}
          </h2>
          <p className='text-muted-foreground mt-5 text-sm leading-loose'>
            {t(
              'Tokara is an AI API platform for developers and creators. One OpenAI-compatible endpoint gives you OpenAI, Claude, Gemini, DeepSeek and other leading models, per-token billing and real-time usage analytics, without maintaining a separate integration for every provider.'
            )}
          </p>
          <ul className='text-muted-foreground mt-6 space-y-2 text-sm'>
            {facts.map((fact) => (
              <li key={fact} className='flex items-start gap-2'>
                <span aria-hidden='true' className='text-primary'>
                  ·
                </span>
                {fact}
              </li>
            ))}
          </ul>
        </div>

        <div className='border-border/80 bg-card/85 rounded-2xl border p-5 shadow-2xs sm:p-8'>
          <h3 className='text-base font-semibold tracking-tight'>
            {t('Frequently asked questions about Tokara')}
          </h3>
          <div className='divide-border/60 mt-4 divide-y'>
            {questions.map((item) => (
              <details key={item.question} className='group py-3.5'>
                <summary className='hover:text-primary flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium transition-colors [&::-webkit-details-marker]:hidden'>
                  <span>{item.question}</span>
                  <ChevronDown
                    aria-hidden='true'
                    className='text-muted-foreground size-4 shrink-0 transition-transform duration-200 group-open:rotate-180'
                  />
                </summary>
                <p className='text-muted-foreground mt-2.5 pr-6 text-sm leading-relaxed'>
                  {item.answer}
                </p>
              </details>
            ))}
          </div>
        </div>
      </AnimateInView>
    </section>
  )
}
