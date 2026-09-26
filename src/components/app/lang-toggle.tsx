'use client'

import * as React from 'react'
import { useSyncExternalStore } from 'react'
import { Check, Languages, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LANGS, useI18n, useI18nStore } from '@/lib/i18n'

const emptySubscribe = () => () => {}

/**
 * Anti-mismatch d'hydratation : avant montage, on rend l'option par défaut
 * (FR, aucun coche) — HTML identique serveur/premier rendu client.
 */
function useMounted() {
  return useSyncExternalStore(emptySubscribe, () => true, () => false)
}

/**
 * LangToggle — sélecteur de langue branché sur le store i18n GLOBAL de
 * CarbuScope (zustand persisté « carbuscope-lang ») : 5 langues natives
 * avec drapeaux + mode « Automatique » (détection du terminal, B.3.4).
 * Le choix s'applique à tout le chrome ET à l'application mobile (aperçu B).
 */
export function LangToggle({ className }: { className?: string }) {
  const { t, lang, isAuto, explicit } = useI18n()
  const setLang = useI18nStore(s => s.setLang)
  const setAuto = useI18nStore(s => s.setAuto)
  const mounted = useMounted()

  const activeCode = mounted ? (explicit ?? lang) : 'fr'
  const active = LANGS.find(l => l.code === activeCode)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className={`h-8 w-8 ${className ?? ''}`}
          aria-label={t('chrome.langAria')}
        >
          <Languages className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {t('chrome.langLabel')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {LANGS.map(l => {
          const on = mounted && !isAuto && explicit === l.code
          return (
            <DropdownMenuItem
              key={l.code}
              onSelect={() => setLang(l.code)}
              className="gap-3 py-2"
            >
              <span className="text-base leading-none" aria-hidden>
                {l.flag}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold" dir={l.dir}>
                  {l.native}
                </span>
                {l.dir === 'rtl' ? (
                  <span className="block text-[10px] text-muted-foreground">RTL</span>
                ) : null}
              </span>
              {on && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--c-green)]" aria-hidden />}
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setAuto()} className="gap-3 py-2">
          <span className="flex h-5 w-5 items-center justify-center" aria-hidden>
            <Sparkles className="h-4 w-4 text-[var(--c-amber)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold">{t('chrome.langAuto')}</span>
            <span className="block text-[10px] text-muted-foreground">
              {t('chrome.langAutoHint')}
              {mounted && active ? ` · ${active.native}` : ''}
            </span>
          </span>
          {mounted && isAuto && <Check className="h-3.5 w-3.5 shrink-0 text-[var(--c-amber)]" aria-hidden />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
