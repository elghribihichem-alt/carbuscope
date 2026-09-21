'use client'

// CarbuScope Mobile — Espace agent : détail de mission (T28)
// Instructions, échéance, avancement et liste des cibles (statut, dernier
// rapport condensé, bouton rapport pour les TODO, itinéraire Google Maps).

import { useMemo } from "react"
import { motion } from "framer-motion"
import { AlertTriangle, CalendarDays, ClipboardList, MapPin, Navigation, Pencil, RotateCcw, Swords } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { MissionTaskDTO, VisitReportDTO } from "@/lib/types"
import type { AgentApi } from "../agent-shared"
import {
  AgentBand, MissionProgressBar, MissionStatusBadge, MissionTypeBadge, TaskStatusBadge, TYPE_META,
  dateFr, fmtDt, isOverdue, pluralFr,
} from "../agent-shared"

const REPORT_CHIP = "inline-flex items-center rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9.5px] font-semibold tabular-nums text-slate-600"

function LastReportSummary({ report }: { report: VisitReportDTO }) {
  return (
    <div className="mt-2.5 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5">
      <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
        Dernier rapport · {dateFr(report.createdAt)}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {report.gazolePrice != null && <span className={REPORT_CHIP}>GA {fmtDt(report.gazolePrice)} DT</span>}
        {report.essencePrice != null && <span className={REPORT_CHIP}>ES {fmtDt(report.essencePrice)} DT</span>}
        {report.gplPrice != null && <span className={REPORT_CHIP}>GPL {fmtDt(report.gplPrice)} DT</span>}
        {report.queueMinutes != null && <span className={REPORT_CHIP}>File {report.queueMinutes} min</span>}
        {report.staffCount != null && <span className={REPORT_CHIP}>Personnel {report.staffCount}</span>}
        {report.cleanliness != null && <span className={REPORT_CHIP}>Propreté {report.cleanliness}/5</span>}
        {report.complianceScore != null && (
          <span className={cn(REPORT_CHIP, "border-emerald-200 bg-emerald-50 text-emerald-700")}>
            Conformité {report.complianceScore} %
          </span>
        )}
      </div>
      {report.anomalies && (
        <p className="mt-1.5 flex items-start gap-1 text-[10px] font-medium leading-snug text-red-600">
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          <span title={report.anomalies}>{report.anomalies}</span>
        </p>
      )}
      {report.competitorPractices && (
        <p className="mt-1 flex items-start gap-1 text-[10px] font-medium leading-snug text-orange-700">
          <Swords className="mt-px h-3 w-3 shrink-0" />
          <span title={report.competitorPractices}>{report.competitorPractices}</span>
        </p>
      )}
      {report.notes && (
        <p className="mt-1 text-[10px] italic leading-snug text-slate-400" title={report.notes}>
          {report.notes}
        </p>
      )}
    </div>
  )
}

function TaskCard({ task, index, onReport }: { task: MissionTaskDTO; index: number; onReport: () => void }) {
  const hasGps = task.lat != null && task.lng != null
  const sub = task.stationCode ?? (task.targetLabel !== task.stationName ? task.targetLabel : null)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index * 0.04, 0.25) }}
      className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold tabular-nums",
            task.status === "TODO" ? "bg-emerald-50 text-emerald-700"
              : task.status === "ANOMALIE" ? "bg-red-50 text-red-600"
                : "bg-emerald-600 text-white"
          )}
        >
          {task.order + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-snug text-slate-800">{task.stationName}</p>
          {sub && <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">{sub}</p>}
        </div>
        <TaskStatusBadge status={task.status} />
      </div>

      {task.lastReport && <LastReportSummary report={task.lastReport} />}

      <div className="mt-2.5 flex items-center gap-2">
        {task.status === "TODO" && (
          <Button
            onClick={onReport}
            className="h-9 flex-1 rounded-xl bg-emerald-600 text-[12px] font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            <Pencil className="h-3.5 w-3.5" />
            Remplir le rapport
          </Button>
        )}
        {hasGps && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${task.lat},${task.lng}`}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-[11px] font-bold text-slate-500 transition-colors hover:border-emerald-300 hover:text-emerald-700",
              task.status !== "TODO" && "flex-1 justify-center"
            )}
          >
            <Navigation className="h-3.5 w-3.5" />
            Itinéraire
          </a>
        )}
      </div>
    </motion.div>
  )
}

export function AgentMissionScreen({ api }: { api: AgentApi }) {
  const m = api.mission
  const tasks = useMemo(() => (m ? [...m.tasks].sort((a, b) => a.order - b.order) : []), [m])

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <AgentBand
        title={m?.title ?? "Mission"}
        subtitle={m ? `${TYPE_META[m.type].label} · ${m.zone}` : "Chargement…"}
        onBack={api.back}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 py-3 pb-6">
        {/* Chargement */}
        {api.missionLoading && (
          <div className="space-y-3">
            <Skeleton className="h-20 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
            <Skeleton className="h-28 rounded-2xl" />
          </div>
        )}

        {/* Erreur */}
        {!api.missionLoading && api.missionError && (
          <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4 text-center" role="alert">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-red-100 text-red-500">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <p className="mt-2 text-[12.5px] font-semibold text-red-700">{api.missionError}</p>
            <Button
              onClick={api.retryMission}
              variant="outline"
              className="mt-3 h-9 rounded-xl border-red-300 text-[12px] font-bold text-red-600 hover:bg-red-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Réessayer
            </Button>
          </div>
        )}

        {/* Détail */}
        {!api.missionLoading && !api.missionError && m && (
          <>
            {/* Identité + avancement */}
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex flex-wrap items-center gap-1.5">
                <MissionTypeBadge type={m.type} />
                <MissionStatusBadge status={m.status} />
                {m.dueDate && (
                  <span className={cn("ms-auto inline-flex items-center gap-1 text-[10.5px] font-semibold", isOverdue(m) ? "text-red-600" : "text-slate-500")}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    Échéance : {dateFr(m.dueDate)}
                    {isOverdue(m) && " · dépassée"}
                  </span>
                )}
              </div>
              <div className="mt-2.5">
                <MissionProgressBar mission={m} />
                <p className="mt-1.5 text-[10.5px] font-medium text-slate-500">
                  <span className="font-semibold tabular-nums">
                    {m.tasksDone + m.tasksAnomaly}/{m.tasksTotal}
                  </span>{" "}
                  cibles traitées
                  {m.tasksAnomaly > 0 && (
                    <span className="ms-1.5 font-bold text-red-600">· {pluralFr(m.tasksAnomaly, "anomalie")}</span>
                  )}
                </p>
              </div>
              <p className="mt-2 flex items-center gap-1.5 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
                <MapPin className="h-3 w-3" />
                {m.zone} · Créée le {dateFr(m.createdAt)}
              </p>
            </div>

            {/* Instructions */}
            <section className="mt-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                <ClipboardList className="h-3.5 w-3.5 text-emerald-600" />
                Instructions
              </h2>
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="text-[12px] leading-relaxed text-slate-600">
                  {m.instructions || "Aucune instruction particulière."}
                </p>
              </div>
            </section>

            {/* Cibles */}
            <section className="mt-4">
              <h2 className="mb-2 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
                Cibles
                <span className="rounded-full bg-slate-100 px-1.5 py-px text-[9.5px] font-bold text-slate-500">{tasks.length}</span>
              </h2>
              <div className="flex flex-col gap-2">
                {tasks.map((t, i) => (
                  <TaskCard key={t.id} task={t} index={i} onReport={() => api.openReport(t)} />
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  )
}
