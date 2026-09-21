'use client'

// CarbuScope — chips de services (icônes SERVICE_ICONS + libellés SERVICE_LABELS).
// Deux modes : compact (icônes seules, +N) pour les tableaux, détaillé (icône + libellé).

import { SERVICE_ICONS } from "@/components/map/tunisia-map"
import { SERVICE_LABELS } from "@/lib/types"
import { cn } from "@/lib/utils"

function ServiceChip({ slug, showLabel }: { slug: string; showLabel?: boolean }) {
  const Icon = SERVICE_ICONS[slug]
  const label = SERVICE_LABELS[slug] ?? slug
  return (
    <span
      title={label}
      className="inline-flex max-w-full items-center gap-1 rounded-md border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
    >
      {Icon ? <Icon className="h-3 w-3 shrink-0" aria-hidden /> : null}
      {showLabel ? <span className="truncate">{label}</span> : <span className="sr-only">{label}</span>}
    </span>
  )
}

export function ServiceChips({
  services,
  max = 4,
  showLabels = false,
  className,
}: {
  services: string[]
  max?: number
  showLabels?: boolean
  className?: string
}) {
  if (services.length === 0) {
    return <span className={cn("text-[10px] italic text-muted-foreground", className)}>Aucun service</span>
  }
  const shown = services.slice(0, max)
  const rest = services.slice(max)
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {shown.map((slug) => (
        <ServiceChip key={slug} slug={slug} showLabel={showLabels} />
      ))}
      {rest.length > 0 && (
        <span
          title={rest.map((s) => SERVICE_LABELS[s] ?? s).join(", ")}
          className="inline-flex items-center rounded-md border border-dashed px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground"
        >
          +{rest.length}
        </span>
      )}
    </div>
  )
}
