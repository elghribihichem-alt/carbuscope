'use client'

// T55-B3-a — Plans masse schématiques des 3 formats (arbitrage utilisateur
// n°5 : PAS de 3D en V1 — SVG stylisé, dessiné en dur, lisible et léger).
// viewBox 400×280, fond muted, éléments schématiques avec libellés, voiries
// fléchées (entrée basse / sortie haute), citerne enterrée en pointillé pour
// la station classique. Légende + superficie sous chaque plan (dans la carte
// parente). Palette : émeraude (pistes / atelier), ambre (commerce), prune
// (services mobilité), terracotta (citerne / pneus) — jamais de bleu.

import type { FormatKey } from "./radar-formats-engine"
import { FORMAT_META } from "./radar-formats-engine"

/* ---------- Socle commun : parcelle + voiries + flux ---------- */

function PlanFrame({
  id, title, children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <svg viewBox="0 0 400 280" role="img" aria-label={title} className="h-auto w-full select-none">
      <title>{title}</title>
      <defs>
        {/* Hachures de parking (diagonales discrètes) */}
        <pattern id={`${id}-hatch`} width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="10" height="10" className="fill-muted/40" />
          <line x1="0" y1="0" x2="0" y2="10" className="stroke-border" strokeWidth="3" />
        </pattern>
        {/* Pointe de flèche des flux véhicule */}
        <marker id={`${id}-arrow`} markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto" markerUnits="userSpaceOnUse">
          <path d="M0,0 L9,4.5 L0,9 Z" className="fill-muted-foreground" />
        </marker>
      </defs>

      {/* Voirie haute (sortie) */}
      <rect x="15" y="8" width="370" height="22" rx="3" className="fill-background stroke-border" strokeWidth="1" />
      <line x1="24" y1="19" x2="376" y2="19" className="stroke-border" strokeWidth="1.5" strokeDasharray="7 6" />
      <text x="26" y="22" className="fill-muted-foreground text-[8px]">voie rapide — sortie</text>

      {/* Parcelle */}
      <rect x="15" y="36" width="370" height="208" rx="8" className="fill-muted/40 stroke-border" strokeWidth="1.5" />

      {/* Voirie basse (entrée) */}
      <rect x="15" y="250" width="370" height="22" rx="3" className="fill-background stroke-border" strokeWidth="1" />
      <line x1="24" y1="261" x2="376" y2="261" className="stroke-border" strokeWidth="1.5" strokeDasharray="7 6" />
      <text x="26" y="264" className="fill-muted-foreground text-[8px]">voie d&apos;accès — entrée</text>

      {/* Flux : entrée depuis la voie basse, sortie vers la voie haute */}
      <line x1="82" y1="256" x2="82" y2="206" className="stroke-muted-foreground" strokeWidth="2" markerEnd={`url(#${id}-arrow)`} />
      <text x="96" y="248" className="fill-muted-foreground text-[9px] font-medium">Entrée</text>
      <line x1="318" y1="46" x2="318" y2="24" className="stroke-muted-foreground" strokeWidth="2" markerEnd={`url(#${id}-arrow)`} />
      <text x="332" y="40" className="fill-muted-foreground text-[9px] font-medium">Sortie</text>

      {children}
    </svg>
  )
}

/** Libellé principal + sous-libellé centrés. */
function Lbl({ x, y, children, sub, subY }: { x: number; y: number; children: string; sub?: string; subY?: number }) {
  return (
    <>
      <text x={x} y={y} textAnchor="middle" className="fill-foreground text-[9.5px] font-semibold">{children}</text>
      {sub && (
        <text x={x} y={subY ?? y + 11} textAnchor="middle" className="fill-muted-foreground text-[8px]">{sub}</text>
      )}
    </>
  )
}

/* ---------- Plan 1 : Station Classique (4 pistes) ---------- */

export function ClassiquePlan() {
  const id = "fc"
  return (
    <PlanFrame id={id} title="Plan masse schématique — station classique : canopy 4 pistes, boutique 120 m², zone TMP, parking, citerne enterrée">
      {/* Canopy 4 pistes */}
      <rect x="40" y="52" width="168" height="98" rx="4" className="fill-emerald-500/10 stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="1.5" />
      <Lbl x={124} y={66} sub="4 pistes carburant" subY={76}>Canopy</Lbl>
      {/* Îlots pompes P1..P4 */}
      {[0, 1, 2, 3].map(i => {
        const x = 55 + i * 39
        return (
          <g key={i}>
            <rect x={x} y={82} width={26} height={62} rx={2} className="fill-background stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="1" />
            <rect x={x + 5} y={98} width={16} height={22} rx={2} className="fill-emerald-600/50 stroke-emerald-700 dark:stroke-emerald-300" strokeWidth="1" />
            <text x={x + 13} y={94} textAnchor="middle" className="fill-muted-foreground text-[7.5px] font-semibold">{`P${i + 1}`}</text>
          </g>
        )
      })}

      {/* Citerne enterrée — tracé pointillé terracotta */}
      <rect x="216" y="58" width="22" height="86" rx={3} className="fill-[#b0563b]/10 stroke-[#b0563b]" strokeWidth="1.5" strokeDasharray="5 4" />
      <text x={227} y={104} textAnchor="middle" transform="rotate(-90 227 104)" className="fill-[#b0563b] text-[8px] font-medium">citerne 30 m³</text>

      {/* Boutique 120 m² */}
      <rect x="248" y="52" width="122" height="60" rx="4" className="fill-amber-500/15 stroke-amber-700 dark:stroke-amber-500" strokeWidth="1.5" />
      <Lbl x={309} y={78} sub="boutique · services" subY={88}>120 m²</Lbl>

      {/* Zone TMP (vidange / pneus) */}
      <rect x="248" y="118" width="122" height="80" rx="4" className="fill-purple-500/15 stroke-purple-700 dark:stroke-purple-400" strokeWidth="1.5" />
      <Lbl x={309} y={140} sub="vidange · pneus · diagnostic" subY={150}>Zone TMP</Lbl>
      {/* 2 bays de l'atelier TMP */}
      <rect x="258" y="160" width="48" height="28" rx={2} className="fill-background stroke-purple-700 dark:stroke-purple-400" strokeDasharray="4 3" strokeWidth="1" />
      <rect x="312" y="160" width="48" height="28" rx={2} className="fill-background stroke-purple-700 dark:stroke-purple-400" strokeDasharray="4 3" strokeWidth="1" />

      {/* Parking (hachures) */}
      <rect x="40" y="158" width="168" height="74" rx={3} fill={`url(#${id}-hatch)`} className="stroke-border" strokeWidth="1" />
      <Lbl x={124} y={194} sub="places clients + PL" subY={204}>Parking</Lbl>
    </PlanFrame>
  )
}

/* ---------- Plan 2 : Micro-station Express (2 pistes) ---------- */

export function ExpressPlan() {
  const id = "fe"
  return (
    <PlanFrame id={id} title="Plan masse schématique — micro-station express : canopy 2 pistes, kiosque 30 m², parking réduit">
      {/* Canopy 2 pistes */}
      <rect x="40" y="60" width="150" height="90" rx={4} className="fill-emerald-500/10 stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="1.5" />
      <Lbl x={115} y={74} sub="2 pistes carburant" subY={84}>Canopy</Lbl>
      {[0, 1].map(i => {
        const x = 68 + i * 55
        return (
          <g key={i}>
            <rect x={x} y={90} width={30} height={54} rx={2} className="fill-background stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="1" />
            <rect x={x + 7} y={104} width={16} height={24} rx={2} className="fill-emerald-600/50 stroke-emerald-700 dark:stroke-emerald-300" strokeWidth="1" />
            <text x={x + 15} y={100} textAnchor="middle" className="fill-muted-foreground text-[7.5px] font-semibold">{`P${i + 1}`}</text>
          </g>
        )
      })}

      {/* Parking réduit (hachures) */}
      <rect x="200" y={60} width={100} height={90} rx={3} fill={`url(#${id}-hatch)`} className="stroke-border" strokeWidth="1" />
      <Lbl x={250} y={102} sub="places réduites" subY={112}>Parking</Lbl>

      {/* Kiosque boutique 30 m² */}
      <rect x="308" y={60} width="62" height="90" rx={4} className="fill-amber-500/15 stroke-amber-700 dark:stroke-amber-500" strokeWidth="1.5" />
      <Lbl x={339} y={102} sub="kiosque" subY={112}>30 m²</Lbl>

      {/* Zone de manœuvre */}
      <rect x="40" y="158" width="330" height="74" rx={3} className="fill-muted/30 stroke-border" strokeWidth="1" />
      <text x="205" y="190" textAnchor="middle" className="fill-muted-foreground text-[9px]">zone de manœuvre et air</text>
      {/* Sens de circulation dans la parcelle */}
      <line x1={70} y1={216} x2={180} y2={216} className="stroke-muted-foreground" strokeWidth="1.5" markerEnd={`url(#${id}-arrow)`} />
      <line x1={340} y1={200} x2={230} y2={200} className="stroke-muted-foreground" strokeWidth="1.5" markerEnd={`url(#${id}-arrow)`} />
    </PlanFrame>
  )
}

/* ---------- Plan 3 : Mobility Hub (atelier sans carburant) ---------- */

export function HubPlan() {
  const id = "fh"
  return (
    <PlanFrame id={id} title="Plan masse schématique — Mobility Hub : atelier vidange 2 bays, zone pneus, cabine diagnostic, petite boutique">
      {/* Atelier vidange — 2 bays */}
      <rect x="40" y="52" width="130" height="104" rx={4} className="fill-emerald-500/10 stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="1.5" />
      <Lbl x={105} y={66} sub="atelier vidange" subY={76}>2 bays</Lbl>
      {[0, 1].map(i => {
        const x = 52 + i * 58
        return (
          <g key={i}>
            <rect x={x} y={82} width={48} height={64} rx={2} className="fill-background stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="1" />
            <text x={x + 24} y={104} textAnchor="middle" className="fill-muted-foreground text-[8px] font-semibold">{`Bay ${i + 1}`}</text>
            <rect x={x + 10} y={114} width={28} height={8} rx={1} className="fill-emerald-600/40" />
          </g>
        )
      })}

      {/* Zone pneumatiques — terracotta */}
      <rect x="178" y="52" width="90" height="64" rx={4} className="fill-[#b0563b]/15 stroke-[#b0563b]" strokeWidth="1.5" />
      <text x="223" y="70" textAnchor="middle" className="fill-foreground text-[9.5px] font-semibold">Zone pneus</text>
      {/* pneus stylisés */}
      <circle cx={200} cy={94} r={11} className="fill-background stroke-[#b0563b]" strokeWidth="1.5" />
      <circle cx={223} cy={94} r={11} className="fill-background stroke-[#b0563b]" strokeWidth="1.5" />
      <circle cx={246} cy={94} r={11} className="fill-background stroke-[#b0563b]" strokeWidth="1.5" />

      {/* Cabine diagnostic — ambre */}
      <rect x="276" y="52" width="94" height="64" rx={4} className="fill-amber-500/15 stroke-amber-700 dark:stroke-amber-500" strokeWidth="1.5" />
      <Lbl x={323} y={78} sub="diagnostic électronique" subY={88}>Cabine</Lbl>

      {/* Petite boutique d'accessoires — prune */}
      <rect x="178" y="124" width="192" height="58" rx={4} className="fill-purple-500/15 stroke-purple-700 dark:stroke-purple-400" strokeWidth="1.5" />
      <Lbl x={274} y={150} sub="accessoires & boutique" subY={160}>15 m²</Lbl>

      {/* Parking */}
      <rect x="40" y="164" width="130" height="68" rx={3} fill={`url(#${id}-hatch)`} className="stroke-border" strokeWidth="1" />
      <Lbl x={105} y={196} sub="clients" subY={206}>Parking</Lbl>
    </PlanFrame>
  )
}

/* ---------- Dispatch par format + légendes ---------- */

export const FORMAT_PLANS: Record<FormatKey, () => React.ReactNode> = {
  CLASSIQUE: ClassiquePlan,
  EXPRESS: ExpressPlan,
  MOBILITY_HUB: HubPlan,
}

/** Éléments de légende communs (swatch → classes). */
const SW = {
  emerald: "bg-emerald-500/30 border-emerald-600 dark:border-emerald-400",
  amber: "bg-amber-500/30 border-amber-700 dark:border-amber-500",
  purple: "bg-purple-500/30 border-purple-700 dark:border-purple-400",
  terracotta: "bg-[#b0563b]/25 border-[#b0563b]",
  hatch: "bg-muted border-border",
} as const

export const FORMAT_LEGENDS: Record<FormatKey, { swatch: string; label: string }[]> = {
  CLASSIQUE: [
    { swatch: SW.emerald, label: "Canopy + 4 îlots pompes" },
    { swatch: SW.amber, label: "Boutique 120 m²" },
    { swatch: SW.purple, label: "Zone TMP (vidange, pneus)" },
    { swatch: SW.terracotta, label: "Citerne enterrée 30 m³ (pointillé)" },
    { swatch: SW.hatch, label: "Parking (hachures)" },
  ],
  EXPRESS: [
    { swatch: SW.emerald, label: "Canopy 2 pistes" },
    { swatch: SW.amber, label: "Kiosque 30 m²" },
    { swatch: SW.hatch, label: "Parking réduit (hachures)" },
  ],
  MOBILITY_HUB: [
    { swatch: SW.emerald, label: "Atelier vidange 2 bays" },
    { swatch: SW.terracotta, label: "Zone pneumatiques" },
    { swatch: SW.amber, label: "Cabine diagnostic" },
    { swatch: SW.purple, label: "Boutique accessoires 15 m²" },
    { swatch: SW.hatch, label: "Parking (hachures)" },
  ],
}

/** Superficie totale indicative affichée sous le plan. */
export function planSurface(format: FormatKey): string {
  const m2 = FORMAT_META[format].surfaceM2
  return `≈ ${m2.toLocaleString("fr-FR")} m²`
}
