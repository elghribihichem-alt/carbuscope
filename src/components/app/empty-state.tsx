'use client'

import * as React from 'react'
import { AlertTriangle, Inbox } from 'lucide-react'

/**
 * EmptyState — état vide standardisé (icône, message, action optionnelle).
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  hint,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  hint?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--c-line-2)] bg-[var(--c-tint)]/40 px-6 py-10 text-center ${className ?? ''}`}
    >
      <Icon className="h-8 w-8 text-[var(--c-ink-ghost)]" aria-hidden />
      <p className="text-sm font-medium text-[var(--c-ink)]">{title}</p>
      {hint ? <p className="max-w-sm text-xs leading-relaxed text-[var(--c-ink-muted)]">{hint}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

/**
 * ErrorState — état d'erreur standardisé (bandeau terracotta, action).
 */
export function ErrorState({
  title,
  hint,
  action,
  className,
}: {
  title: React.ReactNode
  hint?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-lg border border-[var(--a-rd-200)] bg-[var(--a-rd-50)] px-4 py-3 dark:border-[var(--a-rd-800)] dark:bg-[var(--a-rd-950)] ${className ?? ''}`}
    >
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--a-rd-700)] dark:text-[var(--a-rd-400)]" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--a-rd-700)] dark:text-[var(--a-rd-400)]">{title}</p>
        {hint ? <p className="mt-0.5 text-xs leading-relaxed text-[var(--c-ink-muted)]">{hint}</p> : null}
        {action ? <div className="mt-2">{action}</div> : null}
      </div>
    </div>
  )
}
