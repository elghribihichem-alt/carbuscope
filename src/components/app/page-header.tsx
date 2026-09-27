'use client'

import * as React from 'react'

/**
 * PageHeader — en-tête de page standardisé du design system café :
 * titre (xl bold, encre profonde) + description + actions alignées à droite.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 ${className ?? ''}`}>
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-tight text-[var(--c-ink-deep)]">{title}</h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--c-ink-muted)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  )
}
