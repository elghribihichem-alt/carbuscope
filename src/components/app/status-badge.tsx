'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * StatusBadge — pastille d'état sémantique du design system café :
 * vert = actif · ambre = attention · terracotta = bloqué · taupe = neutre.
 */
export type StatusTone = 'actif' | 'attention' | 'bloque' | 'neutre'

const TONES: Record<StatusTone, { dot: string; chip: string }> = {
  actif: {
    dot: 'bg-[var(--c-green)]',
    chip: 'bg-[var(--a-vi-50)] text-[var(--a-vi-700)] dark:bg-[var(--a-vi-950)] dark:text-[var(--a-vi-400)] border-[var(--a-vi-200)] dark:border-[var(--a-vi-800)]',
  },
  attention: {
    dot: 'bg-[var(--c-amber)]',
    chip: 'bg-[var(--c-amber-tint)] text-[var(--c-amber-deep)] border-[var(--c-amber-line-soft)] dark:bg-[var(--a-am-950)] dark:text-[var(--a-am-400)] dark:border-[var(--a-am-800)]',
  },
  bloque: {
    dot: 'bg-[var(--c-terra)]',
    chip: 'bg-[var(--a-rd-50)] text-[var(--a-rd-700)] dark:bg-[var(--a-rd-950)] dark:text-[var(--a-rd-400)] border-[var(--a-rd-200)] dark:border-[var(--a-rd-800)]',
  },
  neutre: {
    dot: 'bg-[var(--c-taupe)]',
    chip: 'bg-[var(--c-tint)] text-[var(--c-ink-muted)] border-[var(--c-line-2)]',
  },
}

export function StatusBadge({
  tone,
  children,
  pulse = false,
  className,
}: {
  tone: StatusTone
  children: React.ReactNode
  /** Halottement discret pour les états « en direct » (coupé sous reduced-motion). */
  pulse?: boolean
  className?: string
}) {
  const t = TONES[tone]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
        t.chip,
        className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', t.dot, pulse && 'animate-ping-slow')} aria-hidden />
      {children}
    </span>
  )
}
