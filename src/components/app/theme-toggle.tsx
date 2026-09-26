'use client'

import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Building2, Check, Coffee, Moon, Palette, Sun } from 'lucide-react'
import { useI18n } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const emptySubscribe = () => () => {}

/**
 * Anti-mismatch d'hydratation : avant montage, la valeur serveur (faux) et la
 * première passe client (faux) coïncident — on rend TOUJOURS l'option par
 * défaut (corporate), puis la préférence réelle après montage.
 */
function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

const OPTIONS: {
  value: string
  labelKey: 'chrome.themeCorporate' | 'chrome.themeClair' | 'chrome.themeCafe' | 'chrome.themeEspresso'
  hintKey: 'chrome.themeCorporateHint' | 'chrome.themeClairHint' | 'chrome.themeCafeHint' | 'chrome.themeEspressoHint'
  icon: React.ComponentType<{ className?: string }>
}[] = [
  { value: 'corporate', labelKey: 'chrome.themeCorporate', hintKey: 'chrome.themeCorporateHint', icon: Building2 },
  { value: 'clair', labelKey: 'chrome.themeClair', hintKey: 'chrome.themeClairHint', icon: Sun },
  { value: 'light', labelKey: 'chrome.themeCafe', hintKey: 'chrome.themeCafeHint', icon: Coffee },
  { value: 'dark', labelKey: 'chrome.themeEspresso', hintKey: 'chrome.themeEspressoHint', icon: Moon },
]

/** Sélecteur des 4 thèmes du design system café (icône + libellé + coche). */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()
  const mounted = useMounted()
  const effective = mounted ? theme : 'corporate'
  const Current = OPTIONS.find(o => o.value === effective)?.icon ?? Palette

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`h-8 w-8 ${className ?? ''}`}
          aria-label={t('chrome.themeAria')}
        >
          <Current className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('chrome.themeLabel')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map(o => (
          <DropdownMenuItem
            key={o.value}
            onSelect={() => setTheme(o.value)}
            className="gap-3 py-2"
          >
            <o.icon className="h-4 w-4 shrink-0 text-[var(--c-brown)]" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold">{t(o.labelKey)}</span>
              <span className="block text-[10px] text-muted-foreground">{t(o.hintKey)}</span>
            </span>
            {mounted && effective === o.value && (
              <Check className="h-3.5 w-3.5 shrink-0 text-[var(--c-green)]" aria-hidden />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
