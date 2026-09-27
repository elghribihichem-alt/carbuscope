"use client"

// Shadow Market (T44-c) — onglet « 📅 Calendrier » : frise chronologique des
// recensements par équipe — timeline verticale groupée par mois, chaque
// événement affiche équipe, zone, type, date FR, rendement (points trouvés /
// ciblés en barre de progression) et statut.

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type { ShadowOverviewResponse } from "@/lib/types"
import { ShadowKpiCard, monthLabelFr, dateFr, SHADOW_COLORS } from "@/components/shadow/shadow-shared"
import { CalendarDays, ClipboardList, Users, CheckCircle2 } from "lucide-react"

const KIND_LABELS: Record<string, string> = {
  RECENSEMENT: "Recensement",
  RECHECK: "Re-contrôle",
  VALIDATION: "Validation",
}

const KIND_STYLES: Record<string, string> = {
  RECENSEMENT: "border-stone-300 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300",
  RECHECK: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  VALIDATION: "border-[#2196F3]/40 bg-[#2196F3]/10 text-[#2196F3]",
}

const STATUS_STYLES: Record<string, string> = {
  PLANIFIE: "border-stone-300 bg-stone-50 text-stone-600 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-400",
  EN_COURS: "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300",
  TERMINE: "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
}

const STATUS_LABELS: Record<string, string> = {
  PLANIFIE: "Planifié",
  EN_COURS: "En cours",
  TERMINE: "Terminé",
}

export function CalendarTab({ data }: { data: ShadowOverviewResponse }) {
  // ----- Groupement par mois (dérivé) -----
  const groups = useMemo(() => {
    const map = new Map<string, typeof data.calendar>()
    for (const ev of [...data.calendar].sort((a, b) => a.date.localeCompare(b.date))) {
      const month = ev.date.slice(0, 7)
      if (!map.has(month)) map.set(month, [])
      map.get(month)!.push(ev)
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [data.calendar])

  const totals = useMemo(() => {
    const targeted = data.calendar.reduce((s, e) => s + e.pointsTargeted, 0)
    const found = data.calendar.reduce((s, e) => s + e.pointsFound, 0)
    const done = data.calendar.filter(e => e.status === "TERMINE").length
    return { targeted, found, done, total: data.calendar.length }
  }, [data.calendar])

  return (
    <div className="space-y-4">
      {/* ----- Résumé ----- */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <ShadowKpiCard label="Campagnes planifiées" value={String(totals.total)} sub={`dont ${totals.done} terminées`} icon={CalendarDays} tone="neutral" />
        <ShadowKpiCard label="Points ciblés" value={totals.targeted.toLocaleString("fr-FR")} sub="objectifs cumulés des équipes" icon={ClipboardList} tone="orange" />
        <ShadowKpiCard label="Points recensés" value={totals.found.toLocaleString("fr-FR")} sub={`${Math.round((totals.found / Math.max(totals.targeted, 1)) * 100)} % de l'objectif`} icon={Users} tone="yellow" />
        <ShadowKpiCard
          label="Rendement terrain"
          value={`${Math.round((totals.found / Math.max(totals.targeted, 1)) * 100)} %`}
          sub="points trouvés / points ciblés"
          icon={CheckCircle2}
          tone="green"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recensements par équipe</CardTitle>
          <CardDescription>
            {data.calendar.length} campagnes de recensement, re-contrôle et validation — frise chronologique
            descendante (plus récent en tête)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[560px] overflow-y-auto pr-2 scroll-coffee">
            {groups.map(([month, events]) => (
              <section key={month} className="mb-4" aria-label={`Campagnes de ${monthLabelFr(month)}`}>
                <h3 className="sticky top-0 z-10 mb-2 inline-flex items-center gap-2 rounded-full border border-stone-200 bg-background/95 px-3 py-1 text-xs font-bold uppercase tracking-wide text-stone-700 backdrop-blur dark:border-stone-700 dark:text-stone-300">
                  <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  {monthLabelFr(month)}
                  <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground dark:bg-stone-800">
                    {events.length} campagne{events.length > 1 ? "s" : ""}
                  </span>
                </h3>
                <div className="relative border-l-2 border-stone-200 pl-4 dark:border-stone-700">
                  {events.map(ev => {
                    const ratio = Math.min(100, Math.round((ev.pointsFound / Math.max(ev.pointsTargeted, 1)) * 100))
                    return (
                      <article key={ev.id} className="relative mb-3 pb-1">
                        <span
                          className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background"
                          style={{ backgroundColor: ev.status === "TERMINE" ? SHADOW_COLORS.green : ev.status === "EN_COURS" ? SHADOW_COLORS.orange : SHADOW_COLORS.gray }}
                          aria-hidden
                        />
                        <div className="rounded-lg border border-stone-200 px-3 py-2.5 transition-colors hover:border-stone-300 dark:border-stone-700 dark:hover:border-stone-600">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-stone-900 dark:text-stone-50">{ev.teamLabel}</p>
                            <Badge variant="outline" className={`text-[10px] ${KIND_STYLES[ev.kind] ?? KIND_STYLES.RECENSEMENT}`}>
                              {KIND_LABELS[ev.kind] ?? ev.kind}
                            </Badge>
                            <Badge variant="outline" className={`text-[10px] ${STATUS_STYLES[ev.status] ?? STATUS_STYLES.PLANIFIE}`}>
                              {STATUS_LABELS[ev.status] ?? ev.status}
                            </Badge>
                            <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{dateFr(ev.date)}</span>
                          </div>
                          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <Users className="h-3 w-3" aria-hidden />
                            Zone : <strong className="font-semibold text-foreground">{ev.zone}</strong>
                          </p>
                          <div className="mt-2 flex items-center gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>
                                  Points trouvés : <strong className="tabular-nums text-foreground">{ev.pointsFound}</strong> / {ev.pointsTargeted} ciblés
                                </span>
                                <span className="tabular-nums">{ratio} %</span>
                              </div>
                              <Progress value={ratio} className="h-1.5" aria-label={`Rendement : ${ev.pointsFound} points trouvés sur ${ev.pointsTargeted} ciblés`} />
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            ))}
            {groups.length === 0 && (
              <p className="py-10 text-center text-sm text-muted-foreground">Aucune campagne de recensement enregistrée.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
