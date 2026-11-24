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
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

export function MaintenanceError() {
  const { t } = useTranslation()
  return (
    <div className='bg-background relative min-h-svh overflow-hidden'>
      <div
        aria-hidden='true'
        className='tech-aurora-top pointer-events-none absolute inset-x-0 top-0 h-[480px]'
      />
      <div
        aria-hidden='true'
        className='tech-grid-bg pointer-events-none absolute inset-0'
      />
      <div className='relative m-auto flex min-h-svh w-full flex-col items-center justify-center gap-2.5 px-6 py-12 text-center'>
        <h1 className='from-foreground to-foreground/45 bg-linear-to-b bg-clip-text font-mono text-[clamp(4.5rem,18vw,7.5rem)] leading-none font-bold tracking-tighter text-transparent'>
          503
        </h1>
        <span className='text-lg font-semibold tracking-tight'>
          {t('Website is under maintenance!')}
        </span>
        <p className='text-muted-foreground max-w-md text-center text-sm leading-relaxed'>
          {t('The site is not available at the moment.')} <br />
          {t("We'll be back online shortly.")}
        </p>
        <div className='mt-6 flex flex-wrap justify-center gap-3'>
          <Button variant='outline'>{t('Learn more')}</Button>
        </div>
      </div>
    </div>
  )
}
