'use client'

import { Fuel, MapPin, Users, Database } from "lucide-react"
import { useI18n } from "@/lib/i18n"

export function AppFooter() {
  const { t } = useI18n()

  return (
    <footer className="mt-auto border-t border-[var(--c-line-2)] bg-[var(--c-paper)] px-4 py-3 sm:px-6">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--c-ink-muted)]">
        <span className="flex items-center gap-1.5 font-medium text-[var(--c-ink-deep)]">
          <Fuel className="h-3.5 w-3.5 text-[var(--c-brown)]" aria-hidden />
          {t('footer.brand')}
        </span>
        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" aria-hidden />{t('footer.stations')}</span>
        <span className="flex items-center gap-1"><Users className="h-3 w-3" aria-hidden />{t('footer.brands')}</span>
        <span className="flex items-center gap-1"><Database className="h-3 w-3" aria-hidden />{t('footer.data')}</span>
        <span className="ml-auto">{t('footer.copyright')}</span>
      </div>
    </footer>
  )
}
