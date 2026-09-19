'use client'

// CarbuScope Mobile — Espace agent : accueil (T28)
// Identité agent (code mono, enseigne, zone), KPIs dérivés des missions,
// cartes de missions (avancement, échéance) + historique repliable.

import { useMemo, useState } from "react"
import { motion } from "framer-motion"
import type { LucideIcon } from "lucide-react"
import { CalendarDays, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, ClipboardList, Footprints, LogOut, MapPin, Target } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import type { MissionDTO } from "@/lib/types"
import type { AgentApi } from "../agent-shared"
import {
  AgentBand, AgentIdentityLine, MissionProgressBar, MissionStatusBadge, MissionTypeBadge,
  dateFr, isOverdue, pluralFr, remainingTargets,
} from "../agent-shared"

function KpiCard({ icon: Icon, value, label, tone }: { icon: LucideIcon; value: number; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
      <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", tone)}>
        <Icon className="h-3.5 w-3.5" />
      </span>
      <p className="mt-1.5 text-[18px] font-extrabold leading-none tabular-nums text-slate-800">{value}</p>
      <p className="mt-1 text-[9px] font-semibold uppercase leading-tight tracking-wide text-slate-400">{label}</p>
    </div>
  )
}

function MissionCard({ mission, index, onOpen }: { mission: MissionDTO; index: number; onOpen: () => void }) {
  const remaining = remainingTargets(mission)
  const treated = mission.tasksDone + mission.tasksAnomaly
  return (
    <motion.button
      type="button"
      layout
      onClick={onOpen}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.05, 0.3) }}
      className="w-full rounded-2xl border border-slate-200 bg-white p-3 text-start shadow-sm transition-colors hover:border-emerald-300 active:bg-emerald-50/60"
    >
      <div className="flex items-center gap-1.5">
        <MissionTypeBadge type={mission.type} />
        <MissionStatusBadge status={mission.status} />
        <ChevronRight className="ms-auto h-4 w-4 shrink-0 text-slate-300 rtl:rotate-180" />
      </div>
      <p className="mt-1.5 text-[13px] font-bold leading-snug text-slate-800">{mission.title}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-slate-400">
        <span className="inline-flex items-center gap-0.5">
          <MapPin className="h-3 w-3" />
          {mission.zone}
        </span>
        {mission.dueDate && (
          <>
            <span aria-hidden>·</span>
            <span className={cn("inline-flex items-center gap-0.5", isOverdue(mission) ? "font-bold text-red-600" : "")}>
              <CalendarDays className="h-3 w-3" />
              {dateFr(mission.dueDate)}
              {isOverdue(mission) && " · dépassée"}
            </span>
          </>
        )}
      </p>
      <div className="mt-2">
        <MissionProgressBar mission={mission} />
        <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500">
          <span className="font-semibold tabular-nums">
            {treated}/{mission.tasksTotal} cibles
          </span>
          <span className="flex items-center gap-1.5">
            {mission.tasksAnomaly > 0 && (
              <span className="font-bold text-red-600">{pluralFr(mission.tasksAnomaly, "anomalie")}</span>
            )}
            {remaining > 0 && (
              <span className="rounded-full bg-emerald-50 px-1.5 py-px font-bold text-emerald-700">
                {pluralFr(remaining, "restante")}
              </span>
            )}
            {remaining === 0 && mission.tasksAnomaly === 0 && (
              <span className="inline-flex items-center gap-0.5 font-bold text-emerald-600">
                <CheckCircle2 className="h-3 w-3" />
                Traitées
              </span>
            )}
          </span>
        </div>
      </div>
    </motion.button>
  )
}

export function AgentHomeScreen({ api }: { api: AgentApi }) {
  const agent = api.agent
  const [historyOpen, setHistoryOpen] = useState(false)

  const { active, history, kpis } = useMemo(() => {
    const activeMissions = api.missions.filter(m => m.status === "EN_COURS" || m.status === "PLANIFIEE")
    const pastMissions = api.missions.filter(m => m.status === "TERMINEE" || m.status === "ANNULEE")
    const remaining = activeMissions.reduce((sum, m) => sum + remainingTargets(m), 0)
    return {
      active: activeMissions,
      history: pastMissions,
      kpis: {
        active: activeMissions.length,
        remaining,
        reports: agent?.reportsCount ?? 0,
      },
    }
  }, [api.missions, agent])

  if (!agent) return null

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <AgentBand title={agent.name} subtitle="Agent de zone — veille terrain" onBack={api.back}>
        <AgentIdentityLine agent={agent} brands={api.brands} />
      </AgentBand>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3 pb-6">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-2">
          <KpiCard icon={ClipboardList} value={kpis.active} label="Missions en cours" tone="bg-emerald-50 text-emerald-600" />
          <KpiCard icon={Target} value={kpis.remaining} label="Cibles restantes" tone="bg-amber-50 text-amber-600" />
          <KpiCard icon={ClipboardCheck} value={kpis.reports} label="Rapports remontés" tone="bg-purple-50 text-purple-600" />
        </div>

        {/* Missions en cours */}
        <section className="mt-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
            <Footprints className="h-3.5 w-3.5 text-emerald-600" />
            Missions en cours
            {active.length > 0 && (
              <span className="ms-1 rounded-full bg-emerald-100 px-1.5 py-px text-[9.5px] font-bold text-emerald-700">{active.length}</span>
            )}
          </h2>
          {active.length > 0 ? (
            <div className="flex flex-col gap-2">
              {active.map((m, i) => (
                <MissionCard key={m.id} mission={m} index={i} onOpen={() => api.openMission(m.id)} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
                <ClipboardList className="h-6 w-6" />
              </span>
              <p className="mt-2 text-[12.5px] font-semibold text-slate-600">Aucune mission en cours</p>
              <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">
                Vos prochaines missions de contrôle ou de veille apparaîtront ici.
              </p>
            </div>
          )}
        </section>

        {/* Historique */}
        {history.length > 0 && (
          <section className="mt-4">
            <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
              <CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-start shadow-sm transition-colors hover:border-emerald-300">
                <h2 className="text-[11.5px] font-bold uppercase tracking-wide text-slate-500">Historique</h2>
                <span className="rounded-full bg-slate-100 px-1.5 py-px text-[9.5px] font-bold text-slate-500">{history.length}</span>
                <ChevronDown className={cn("ms-auto h-4 w-4 text-slate-400 transition-transform", historyOpen && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {history.map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => api.openMission(m.id)}
                      className="flex w-full items-center gap-2 p-2.5 text-start transition-colors hover:bg-slate-50 active:bg-slate-100"
                    >
                      <MissionTypeBadge type={m.type} />
                      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-700">{m.title}</span>
                      <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-400">
                        {m.tasksDone + m.tasksAnomaly}/{m.tasksTotal}
                      </span>
                      <MissionStatusBadge status={m.status} />
                    </button>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </section>
        )}

        {/* Déconnexion */}
        <button
          type="button"
          onClick={api.logout}
          className="mx-auto mt-6 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-[11px] font-semibold text-slate-400 transition-colors hover:border-red-200 hover:text-red-500"
        >
          <LogOut className="h-3.5 w-3.5" />
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
