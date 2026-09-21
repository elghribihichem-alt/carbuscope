'use client'

import * as React from "react"
import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown } from "lucide-react"
import { cn } from "@/lib/utils"

export type KpiTone = "default" | "success" | "warning" | "danger" | "info"

const TONES: Record<KpiTone, { icon: string; chip: string }> = {
  default: { icon: "bg-muted text-foreground", chip: "" },
  success: { icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400", chip: "text-emerald-600" },
  warning: { icon: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400", chip: "text-amber-600" },
  danger: { icon: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400", chip: "text-red-600" },
  info: { icon: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400", chip: "text-purple-600" },
}

export interface KpiCardProps {
  label: string
  value: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  sub?: React.ReactNode
  trend?: { value: number; label?: string }
  tone?: KpiTone
  className?: string
  onClick?: () => void
}

export function KpiCard({ label, value, icon: Icon, sub, trend, tone = "default", className, onClick }: KpiCardProps) {
  return (
    <Card className={cn("transition-shadow", onClick && "cursor-pointer hover:shadow-md", className)} onClick={onClick}>
      <CardContent className="flex items-start gap-3 p-4">
        {Icon && (
          <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", TONES[tone].icon)}>
            <Icon className="h-4.5 w-4.5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
            <p className="text-xl font-bold tabular-nums leading-none">{value}</p>
            {trend && (
              <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold",
                trend.value >= 0 ? "text-emerald-600" : "text-red-600")}>
                {trend.value >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {trend.value > 0 ? "+" : ""}{trend.value}{trend.label ?? " %"}
              </span>
            )}
          </div>
          {sub && (
            <p
              className={cn("mt-1 line-clamp-2 break-words text-xs leading-snug text-muted-foreground", TONES[tone].chip)}
              title={typeof sub === "string" ? sub : undefined}
            >
              {sub}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
