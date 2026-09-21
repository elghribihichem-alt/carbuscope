'use client'

// CarbuScope Mobile — Espace agent : confirmation d'envoi (T28)
// Animation succès (check émeraude), récap cible + statut mission recalculé.

import { motion } from "framer-motion"
import { Check, ClipboardList, PartyPopper } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AgentApi } from "../agent-shared"
import { AgentBand, MissionStatusBadge, TaskStatusBadge } from "../agent-shared"

export function AgentSuccessScreen({ api }: { api: AgentApi }) {
  const res = api.reportResult
  if (!res) return null

  const done = res.missionStatus === "TERMINEE"

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <AgentBand title="Rapport transmis" onBack={api.back} />

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-6">
        <div className="mx-auto flex w-full max-w-[300px] flex-1 flex-col items-center justify-center text-center">
          <motion.span
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 320, damping: 18, delay: 0.1 }}
            className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-lg shadow-emerald-600/30 ring-4 ring-emerald-100"
          >
            <Check className="h-10 w-10" strokeWidth={3} />
          </motion.span>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.25 }}>
            <h2 className="mt-4 text-[17px] font-extrabold tracking-tight text-slate-800">Rapport transmis</h2>
            <p className="mt-1 text-[11.5px] leading-snug text-slate-500">{res.missionTitle}</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.45, duration: 0.25 }}
            className="mt-4 w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-start shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-[12px] font-bold text-slate-700" title={res.targetLabel}>
                {res.targetLabel}
              </p>
              <TaskStatusBadge status={res.taskStatus} />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
              <p className="text-[11px] font-semibold text-slate-500">Mission mise à jour</p>
              <MissionStatusBadge status={res.missionStatus} />
            </div>
            {done && (
              <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-2 text-[10.5px] font-semibold leading-snug text-emerald-800">
                <PartyPopper className="h-3.5 w-3.5 shrink-0" />
                Toutes les cibles sont traitées — mission close.
              </p>
            )}
          </motion.div>

          <Button
            onClick={api.back}
            className="mt-5 h-11 w-full rounded-xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-md hover:bg-emerald-700"
          >
            Retour à la mission
          </Button>
          <button
            type="button"
            onClick={api.goHome}
            className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-400 underline-offset-2 transition-colors hover:text-emerald-700 hover:underline"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Mes missions
          </button>
        </div>
      </div>
    </div>
  )
}
