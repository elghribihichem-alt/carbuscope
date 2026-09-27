'use client'

import * as React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

/**
 * DetailDialog — dialogue de détail standardisé : en-tête (titre + sous-titre),
 * sections (label xs uppercase + contenu), galerie optionnelle et timeline
 * (événements horodatés), corps scrollable scroll-coffee.
 */
export interface DetailSection {
  key: string
  label: string
  content: React.ReactNode
}

export interface DetailTimelineItem {
  key: string
  when: React.ReactNode
  what: React.ReactNode
}

export function DetailDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  sections,
  timeline,
  timelineLabel = 'Historique',
  footer,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  sections?: DetailSection[]
  timeline?: DetailTimelineItem[]
  timelineLabel?: string
  /** Barre d'actions basse (sticky) */
  footer?: React.ReactNode
  /** Contenu libre (galerie, cartes…) rendu après les sections */
  children?: React.ReactNode
  className?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg ${className ?? ''}`}>
        <DialogHeader className="border-b border-[var(--c-line-faint)] px-5 py-4">
          <DialogTitle className="text-base font-bold text-[var(--c-ink-deep)]">{title}</DialogTitle>
          {subtitle ? (
            <DialogDescription className="text-xs text-[var(--c-ink-muted)]">{subtitle}</DialogDescription>
          ) : null}
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] scroll-coffee">
          <div className="space-y-4 px-5 py-4">
            {sections && sections.length > 0 ? (
              <dl className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
                {sections.map(s => (
                  <div key={s.key} className="min-w-0">
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">
                      {s.label}
                    </dt>
                    <dd className="mt-0.5 text-sm text-[var(--c-ink)]">{s.content}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {children}
            {timeline && timeline.length > 0 ? (
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--c-ink-muted)]">
                  {timelineLabel}
                </p>
                <ol className="relative space-y-3 border-l border-[var(--c-line-2)] pl-4">
                  {timeline.map(item => (
                    <li key={item.key} className="relative">
                      <span
                        className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full border border-[var(--c-card)] bg-[var(--c-brown)]"
                        aria-hidden
                      />
                      <p className="text-xs font-semibold text-[var(--c-ink)]">{item.what}</p>
                      <p className="text-[11px] text-[var(--c-ink-faint)]">{item.when}</p>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        </ScrollArea>
        {footer ? (
          <>
            <Separator className="bg-[var(--c-line-faint)]" />
            <div className="flex items-center justify-end gap-2 px-5 py-3">{footer}</div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
