'use client'

import * as React from 'react'
import { RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

/**
 * Chip de filtre actif — supprimable (X) = retire la contrainte.
 */
export function FilterChip({
  label,
  onRemove,
  className,
}: {
  label: React.ReactNode
  onRemove?: () => void
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-[var(--c-line-2)] bg-[var(--c-tint)] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[var(--c-ink)]',
        className,
      )}
    >
      {label}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--c-ink-muted)] transition-colors hover:bg-[var(--c-tint-3)] hover:text-[var(--c-ink-deep)]"
          aria-label={`Retirer le filtre ${typeof label === 'string' ? label : ''}`}
        >
          <X className="h-3 w-3" aria-hidden />
        </button>
      ) : null}
    </span>
  )
}

/**
 * FilterBar — barre de filtres standardisée : champ de recherche h-9, filtres
 * (contrôlés par le parent), chips actives supprimables, « Réinitialiser »
 * centralisé (visible dès qu'un filtre est actif). Compose avec des Select
 * shadcn en cascade : le composant parent verrouille/réinitialise le fils
 * quand le père change (pattern district → gouvernorat → délégation).
 */
export function FilterBar({
  search,
  onSearchChange,
  searchPlaceholder,
  searchAriaLabel,
  children,
  activeChips,
  onReset,
  className,
}: {
  search?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  searchAriaLabel?: string
  /** Selects / contrôles de filtre (h-9 attendus) */
  children?: React.ReactNode
  /** Chips actives : { label, onRemove } */
  activeChips?: { key: string; label: React.ReactNode; onRemove?: () => void }[]
  onReset?: () => void
  className?: string
}) {
  const { t } = useI18n()
  const hasActive = (activeChips?.length ?? 0) > 0 || Boolean(search)
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-lg border border-[var(--c-line)] bg-[var(--c-card)] p-2',
        className,
      )}
    >
      {onSearchChange ? (
        <Input
          value={search ?? ''}
          onChange={e => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder ?? 'Rechercher…'}
          aria-label={searchAriaLabel ?? 'Rechercher'}
          className="h-9 w-full max-w-[280px] flex-1"
        />
      ) : null}
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
      {activeChips && activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtres actifs">
          {activeChips.map(chip => (
            <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
          ))}
        </div>
      ) : null}
      {hasActive && onReset ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="ml-auto h-8 gap-1.5 text-xs text-[var(--c-ink-muted)] hover:text-[var(--c-terra-ink)]"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          {t('action.reset')}
        </Button>
      ) : null}
    </div>
  )
}
