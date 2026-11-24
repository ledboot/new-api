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
  ArrowRight,
  BarChartIcon,
  CodeSquareIcon,
  GraduationCapIcon,
  MessageSquarePlusIcon,
  NotepadTextIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

type PlaygroundEmptyStateProps = {
  onSelectPrompt: (prompt: string) => void
}

const starterPrompts = [
  { code: '01', icon: BarChartIcon, text: 'Analyze data' },
  { code: '02', icon: NotepadTextIcon, text: 'Summarize text' },
  { code: '03', icon: CodeSquareIcon, text: 'Code' },
  { code: '04', icon: GraduationCapIcon, text: 'Get advice' },
]

export function PlaygroundEmptyState({
  onSelectPrompt,
}: PlaygroundEmptyStateProps) {
  const { t } = useTranslation()

  return (
    <div className='tech-dot-matrix relative flex min-h-[min(520px,calc(100svh-18rem))] items-center justify-center px-3 py-8 md:py-12'>
      <div className='relative z-10 grid w-full max-w-2xl gap-6 text-center'>
        <div className='mx-auto flex flex-col items-center gap-3'>
          <div className='relative flex size-16 items-center justify-center'>
            <div
              aria-hidden='true'
              className='border-primary/20 absolute inset-0 rounded-2xl border border-dashed'
            />
            <div className='border-primary/30 bg-card text-primary relative flex size-12 items-center justify-center rounded-xl border shadow-[0_0_28px_-6px_color-mix(in_oklch,var(--primary)_42%,transparent)]'>
              <MessageSquarePlusIcon className='size-5' aria-hidden='true' />
            </div>
          </div>
          <span
            aria-hidden='true'
            className='text-primary font-mono text-[10px] font-semibold tracking-[0.2em] uppercase'
          >
            // INTERACTIVE MODEL STUDIO
          </span>
        </div>

        <div className='grid gap-2'>
          <h2 className='text-xl font-bold tracking-[-0.025em] text-balance md:text-2xl'>
            {t('Start a playground chat')}
          </h2>
          <p className='text-muted-foreground mx-auto max-w-lg text-sm leading-6 text-balance'>
            {t(
              'Test a model with a starter prompt, or write your own request below.'
            )}
          </p>
        </div>

        <div className='grid gap-2.5 sm:grid-cols-2'>
          {starterPrompts.map(({ code, icon: Icon, text }) => {
            const prompt = t(text)

            return (
              <Button
                className='group/prompt bg-card/85 hover:border-primary/45 hover:bg-card h-auto min-h-12 justify-between gap-3 rounded-xl px-4 py-3 text-left whitespace-normal shadow-2xs backdrop-blur-sm'
                key={text}
                onClick={() => onSelectPrompt(prompt)}
                variant='outline'
              >
                <span className='flex min-w-0 items-center gap-3'>
                  <span className='bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
                    <Icon className='size-4' />
                  </span>
                  <span className='min-w-0 truncate font-medium'>{prompt}</span>
                </span>
                <span
                  aria-hidden='true'
                  className='flex shrink-0 items-center gap-1.5'
                >
                  <span className='text-muted-foreground/60 font-mono text-[10px]'>
                    {code}
                  </span>
                  <ArrowRight className='text-muted-foreground/50 group-hover/prompt:text-primary size-3.5 transition-transform duration-200 group-hover/prompt:translate-x-0.5' />
                </span>
              </Button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
