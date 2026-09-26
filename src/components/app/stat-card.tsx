'use client'

import * as React from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

/**
 * StatCard — KPI standardisé : valeur 2xl bold (encre profonde), libellé
 * discret (encre estompée), delta vert (hausse) ou terracotta (baisse),
 * icône optionnelle, focus/hover via les tints café.
 */
export function StatCard({
  label,
  value,
  unit,
  delta,
  deltaLabel,
  icon: Icon,
  hint,
  className,
}: {
  label: string
  value: React.ReactNode
  unit?: string
  /** Pourcentage signé, ex. +4.2 ou -1.8 ; undefined = pas de delta */
  delta?: number
  deltaLabel?: string
  icon?: React.ComponentType<{ className?: string }>
  hint?: string
  className?: string
}) {
  const positive = (delta ?? 0) >= 0
  return (
    <Card
      className={`border border-[var(--c-line)] bg-[var(--c-card)] transition-colors hover:bg-[var(--c-tint)]/40 ${className ?? ''}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--c-ink-muted)]">
            {label}
          </p>
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-[var(--c-brown)]" aria-hidden /> : null}
        </div>
        <p className="mt-2 flex items-baseline gap-1.5">
          <span className="text-2xl font-bold leading-none tracking-tight text-[var(--c-ink-deep)]">
            {value}
          </span>
          {unit ? (
            <span className="text-xs font-medium text-[var(--c-ink-faint)]">{unit}</span>
          ) : null}
        </p>
        {delta !== undefined ? (
          <p
            className={`mt-2 flex items-center gap-1 text-xs font-medium ${
              positive ? 'text-[var(--c-green-ink)]' : 'text-[var(--c-terra-ink)]'
            }`}
          >
            {positive ? (
              <TrendingUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <TrendingDown className="h-3.5 w-3.5" aria-hidden />
            )}
            <span>
              {positive ? '+' : ''}
              {delta.toFixed(1)} %
            </span>
            {deltaLabel ? (
              <span className="font-normal text-[var(--c-ink-faint)]">· {deltaLabel}</span>
            ) : null}
          </p>
        ) : hint ? (
          <p className="mt-2 text-xs text-[var(--c-ink-faint)]">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}
