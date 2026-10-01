'use client'

// CarbuScope — T54-A2/B1 : carte « volet en préparation » partagée par les coques
// des modules « Opportunity Radar » (rounds B2/B3) et « Mobility Hub Operations »
// (rounds C1-C3). Honnête par construction : aucune fausse donnée, seulement le
// périmètre annoncé du volet (plan canonique T54-A0) + badge « Bientôt ».

import type * as React from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type SoonAccent = "amber" | "terra"

const ACCENTS: Record<SoonAccent, { icon: string; dot: string; badge: string }> = {
  // Ambre — module Opportunity Radar.
  amber: {
    icon: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    dot: "bg-amber-400 dark:bg-amber-600",
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  },
  // Terracotta — module Mobility Hub Operations.
  terra: {
    icon: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
    dot: "bg-orange-400 dark:bg-orange-600",
    badge: "border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400",
  },
}

interface ModuleSoonProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  /** 3-4 puces décrivant le contenu fonctionnel prévu (sans fausse donnée). */
  bullets: string[]
  accent?: SoonAccent
  /** Round de livraison annoncé (ex. « B2 », « C1 »). */
  planned?: string
}

export function ModuleSoonCard({
  icon: Icon,
  title,
  description,
  bullets,
  accent = "amber",
  planned,
}: ModuleSoonProps) {
  const a = ACCENTS[accent]
  return (
    <Card className="min-w-0">
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
              a.icon,
            )}
            aria-hidden
          >
            <Icon className="h-5.5 w-5.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h2 className="text-base font-bold leading-tight">{title}</h2>
              <Badge variant="outline" className={cn("gap-1 text-[11px]", a.badge)}>
                Bientôt
              </Badge>
              {planned && (
                <Badge variant="secondary" className="text-[11px] tabular-nums">
                  prévu round {planned}
                </Badge>
              )}
            </div>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
            <ul className="mt-4 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
              {bullets.map(b => (
                <li
                  key={b}
                  className="flex min-w-0 items-start gap-2 text-sm leading-snug"
                >
                  <span className={cn("mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full", a.dot)} aria-hidden />
                  <span className="min-w-0">{b}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-xs italic text-muted-foreground">
              Coque du volet livrée ce round — le contenu fonctionnel arrive avec le round{" "}
              {planned ?? "suivant"} (plan T54-A0, aucune donnée simulée ici).
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
