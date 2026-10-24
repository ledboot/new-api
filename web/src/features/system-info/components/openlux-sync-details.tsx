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

import { Dialog } from '@/components/dialog'
import { Button } from '@/components/ui/button'
import { toIntlLocale } from '@/i18n/languages'
import { formatNumber } from '@/lib/format'

type OpenLuxChanges = {
  added: number
  removed: number
  updated: number
  names?: string[]
}

type OpenLuxSyncResult = {
  baseline: boolean
  changed: boolean
  models: OpenLuxChanges
  groups: OpenLuxChanges
  vendors: OpenLuxChanges
}

export function OpenLuxSyncDetails(props: { result: unknown }) {
  const { t, i18n } = useTranslation()
  const result = props.result as OpenLuxSyncResult | null
  if (!result?.models || !result.groups || !result.vendors) return null
  const locale = toIntlLocale(i18n.resolvedLanguage || i18n.language)
  let status = t('No changes')
  if (result.baseline) status = t('Source baseline established')
  else if (result.changed) status = t('Source changes detected')
  const sections = [
    { label: t('Models'), changes: result.models },
    { label: t('Groups'), changes: result.groups },
    { label: t('Vendors'), changes: result.vendors },
  ]
  return (
    <Dialog
      title={t('OpenLux source check')}
      description={t(
        'Source changes require manual review before updating models or selling prices.'
      )}
      trigger={
        <Button variant='link' size='sm'>
          {t('View details')}
        </Button>
      }
    >
      <div className='space-y-4'>
        <p className='font-medium'>{status}</p>
        {sections.map((section) => (
          <section
            key={section.label}
            className='space-y-1'
            aria-label={section.label}
          >
            <h4 className='font-medium'>{section.label}</h4>
            <p className='text-muted-foreground text-sm'>
              {t(
                'Added: {{added}}, removed: {{removed}}, updated: {{updated}}',
                {
                  added: formatNumber(section.changes.added, locale),
                  removed: formatNumber(section.changes.removed, locale),
                  updated: formatNumber(section.changes.updated, locale),
                }
              )}
            </p>
            {Boolean(section.changes.names?.length) && (
              <p className='text-sm break-words'>
                {section.changes.names?.join(', ')}
              </p>
            )}
          </section>
        ))}
        <p className='text-muted-foreground text-xs'>
          {t('Showing up to 20 changed names per category.')}
        </p>
      </div>
    </Dialog>
  )
}
