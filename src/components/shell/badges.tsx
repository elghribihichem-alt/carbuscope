'use client'

import * as React from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { STATUS_LABELS } from "@/lib/types"

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const map: Record<string, string> = {
    ACTIVE: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
    RENOVATION: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
    PROJECT: "border-dashed border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
    CLOSED: "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400",
  }
  return <Badge variant="outline" className={cn("text-[11px]", map[status] ?? "", className)}>{STATUS_LABELS[status] ?? status}</Badge>
}

export function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    CRITICAL: { cls: "border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400", label: "Critique" },
    MEDIUM: { cls: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400", label: "Moyen" },
    INFO: { cls: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400", label: "Info" },
  }
  const m = map[severity] ?? { cls: "", label: severity }
  return <Badge variant="outline" className={cn("text-[11px]", m.cls)}>{m.label}</Badge>
}

export function ImpactBadge({ impact }: { impact: string }) {
  const map: Record<string, string> = {
    "Fort": "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400",
    "Moyen": "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400",
    "Faible": "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  }
  return <Badge variant="secondary" className={cn("text-[11px] font-medium", map[impact] ?? "")}>{impact}</Badge>
}
