'use client'

// Shadow Market — Recensement (T44-d) : socle partagé des 6 onglets.
// Constantes métier, helpers CSV/recherche, fiche détaillée d'un point
// (Dialog + historique des mises à jour). Les couleurs et badges viennent
// de shadow-shared.tsx — aucune duplication.

import { useEffect, useState } from "react"
import { ArrowRight, MapPin, Phone } from "lucide-react"
import { toast } from "sonner"
import type { ShadowPointDTO, ShadowUpdateDTO } from "@/lib/types"
import { SHADOW_SOURCE_LABELS, SHADOW_STATUS_LABELS } from "@/lib/types"
import {
  Card, CardContent,
} from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { haversineKm } from "@/lib/geo"
import {
  SHADOW_COLORS, ShadowPhoto, ShadowStatusBadge, TypologyIcon, UpdateKindIcon,
  dateFr, formatLJ, formatMillimes, formatTnd, relDateFr, typologyLabel,
} from "../shadow-shared"
import { SHADOW_UPDATE_KIND_LABELS } from "@/lib/types"

// ---------------------------------------------------------------------------
// Constantes métier (modèle DG — miroir du backend)
// ---------------------------------------------------------------------------

export const MARGIN_TND_PER_L = 0.19
export const DAYS_PER_MONTH = 30.4
/** Prix officiel de l'essence (millimes/L) pour comparaison terrain. */
export const OFFICIAL_ESSENCE_MILL = 2650

/** Couleur par type d'événement du cycle de vie. */
export const KIND_COLORS: Record<string, string> = {
  APPARITION: SHADOW_COLORS.red,
  DISPARITION: SHADOW_COLORS.green,
  REAPPARITION: SHADOW_COLORS.orange,
  VOLUME: SHADOW_COLORS.yellow,
  PRIX: SHADOW_COLORS.blue,
  TYPE: SHADOW_COLORS.gray,
  DEPLACEMENT: SHADOW_COLORS.orange,
  STATUT: SHADOW_COLORS.gray,
}

// ---------------------------------------------------------------------------
// Helpers texte / CSV
// ---------------------------------------------------------------------------

/** Recherche insensible à la casse et aux accents. */
export function normalizeFr(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

/** Échappe une cellule CSV (guillemets si séparateur/présent). */
export function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Horodatage fichier : « 2026-09-30 ». */
export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Télécharge un contenu texte en pièce jointe (BOM UTF-8 pour Excel). */
export function downloadText(content: string, filename: string, mime = "text/csv"): void {
  const blob = new Blob([`\uFEFF${content}`], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** CSV des points recensés (séparateur « ; », pour tableurs FR). */
export function buildPointsCsv(points: ShadowPointDTO[]): string {
  const header = [
    "Code", "Typologie", "Gouvernorat", "Délégation", "Cité", "Latitude", "Longitude",
    "Volume L/j", "Prix millimes", "Perte DT/mois", "Station la plus proche", "Distance m",
    "Statut", "Actif", "Source", "Rapporteur", "Première obs.", "Dernière vérif.", "Notes",
  ]
  const rows = points.map((p) => [
    p.code, typologyLabel(p.typologyCode), p.gouvernorat, p.delegation, p.cite ?? "",
    p.lat, p.lng, p.volumeLJ, p.priceMillimes ?? "", Math.round(p.lossTnd),
    p.nearestStation?.name ?? "", p.nearestStation?.distanceM ?? "",
    SHADOW_STATUS_LABELS[p.status] ?? p.status, p.active ? "Oui" : "Non",
    SHADOW_SOURCE_LABELS[p.source] ?? p.source, p.reporter,
    dateFr(p.firstSeenAt), dateFr(p.lastCheckAt), p.notes,
  ])
  return [header, ...rows].map((r) => r.map(csvEscape).join(";")).join("\r\n")
}

/** Distance (m) entre deux coordonnées — wrapper arrondi sur haversine. */
export function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  return Math.round(haversineKm(lat1, lng1, lat2, lng2) * 1000)
}

// ---------------------------------------------------------------------------
// Fiche détaillée d'un point (Dialog) — utilisée par Liste et Galerie
// ---------------------------------------------------------------------------

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-stone-200 py-1.5 last:border-0 dark:border-stone-800">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-xs font-medium text-stone-800 dark:text-stone-200">{value}</span>
    </div>
  )
}

/** Historique compact d'un point (utilisé dans la fiche détaillée). */
function PointUpdates({ updates }: { updates: ShadowUpdateDTO[] }) {
  if (updates.length === 0) {
    return <p className="text-xs text-muted-foreground">Aucun événement enregistré.</p>
  }
  return (
    <ol className="relative space-y-3 border-l border-stone-200 pl-4 dark:border-stone-800">
      {updates.map((u) => (
        <li key={u.id} className="relative">
          <span
            className="absolute -left-[21px] flex h-4 w-4 items-center justify-center rounded-full text-white"
            style={{ backgroundColor: KIND_COLORS[u.kind] ?? SHADOW_COLORS.gray }}
            aria-hidden
          >
            <UpdateKindIcon kind={u.kind} className="h-2.5 w-2.5" />
          </span>
          <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">
            {SHADOW_UPDATE_KIND_LABELS[u.kind] ?? u.kind}
            <span className="ml-2 font-normal text-muted-foreground">{relDateFr(u.date)}</span>
          </p>
          {u.oldValue || u.newValue ? (
            <p className="text-[11px] text-muted-foreground">
              {u.oldValue ? <span className="line-through">{u.oldValue}</span> : null}
              {u.oldValue && u.newValue ? <ArrowRight className="mx-1 inline h-3 w-3" aria-hidden /> : null}
              {u.newValue ? <span className="font-medium text-stone-700 dark:text-stone-300">{u.newValue}</span> : null}
            </p>
          ) : null}
          <p className="text-[11px] text-muted-foreground">par {u.author}</p>
        </li>
      ))}
    </ol>
  )
}

export function PointDetailDialog({
  code,
  onClose,
  initial,
  onEdit,
}: {
  code: string | null
  onClose: () => void
  initial?: ShadowPointDTO | null
  onEdit?: (point: ShadowPointDTO) => void
}) {
  const [point, setPoint] = useState<ShadowPointDTO | null>(initial ?? null)
  const [fetched, setFetched] = useState<{ code: string; updates: ShadowUpdateDTO[] } | null>(null)

  useEffect(() => {
    if (code === null) return
    const ctrl = new AbortController()
    fetch(`/api/shadow/points/${encodeURIComponent(code)}`, { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<{ point: ShadowPointDTO; updates: ShadowUpdateDTO[] }>
      })
      .then((json) => {
        setPoint(json.point)
        setFetched({ code, updates: json.updates ?? [] })
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        toast.error("Fiche indisponible", { description: e instanceof Error ? e.message : "Erreur inconnue" })
      })
    return () => ctrl.abort()
  }, [code])

  // Fiche affichable : données en cache si elles correspondent au code
  // demandé, sinon la ligne transmise par l'appelant (affichage instantané),
  // sinon rien (squelette). Évite d'afficher la fiche du point précédent
  // pendant le rechargement.
  const shown =
    point !== null && point.code === code
      ? point
      : initial != null && initial.code === code
        ? initial
        : null
  const updates = fetched !== null && fetched.code === code ? fetched.updates : []

  return (
    <Dialog open={code !== null} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            {shown ? (
              <>
                <span className="tabular-nums">{shown.code}</span>
                <ShadowStatusBadge status={shown.status} />
                {!shown.active && (
                  <Badge variant="outline" className="gap-1.5 text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SHADOW_COLORS.gray }} aria-hidden />
                    Disparu
                  </Badge>
                )}
              </>
            ) : (
              "Fiche du point"
            )}
          </DialogTitle>
        </DialogHeader>

        {shown ? (
          <div className="space-y-4">
            <div className="overflow-hidden rounded-lg border border-stone-200 dark:border-stone-800">
              <ShadowPhoto
                url={shown.photoUrl}
                alt={`Photo terrain du point ${shown.code}`}
                typology={shown.typologyCode}
                className="h-44 w-full object-cover"
              />
            </div>

            <div className="flex items-center gap-3 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-900">
              <TypologyIcon code={shown.typologyCode} className="h-5 w-5 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{typologyLabel(shown.typologyCode)}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <MapPin className="h-3 w-3" aria-hidden />
                  {shown.delegation} · {shown.gouvernorat}{shown.cite ? ` · ${shown.cite}` : ""}
                </p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-sm font-bold tabular-nums" style={{ color: SHADOW_COLORS.red }}>
                  {formatTnd(shown.lossTnd)}
                </p>
                <p className="text-[10px] text-muted-foreground">perte estimée / mois</p>
              </div>
            </div>

            <div className="grid gap-x-6 sm:grid-cols-2">
              <div>
                <DetailRow label="Volume estimé" value={formatLJ(shown.volumeLJ)} />
                <DetailRow label="Prix affiché" value={formatMillimes(shown.priceMillimes)} />
                <DetailRow label="Coordonnées" value={`${shown.lat.toFixed(5).replace(".", ",")}, ${shown.lng.toFixed(5).replace(".", ",")}`} />
                <DetailRow
                  label="Station la plus proche"
                  value={
                    shown.nearestStation
                      ? `${shown.nearestStation.name} · ${shown.nearestStation.distanceM} m`
                      : "—"
                  }
                />
              </div>
              <div>
                <DetailRow label="Première observation" value={dateFr(shown.firstSeenAt)} />
                <DetailRow label="Dernière vérification" value={`${dateFr(shown.lastCheckAt)} (${relDateFr(shown.lastCheckAt)})`} />
                <DetailRow label="Source" value={SHADOW_SOURCE_LABELS[shown.source] ?? shown.source} />
                <DetailRow
                  label="Rapporteur"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3 w-3" aria-hidden />
                      {shown.reporter}
                    </span>
                  }
                />
              </div>
            </div>

            {shown.notes ? (
              <div className="rounded-lg border border-stone-200 p-3 dark:border-stone-800">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Notes terrain</p>
                <p className="mt-1 text-xs leading-relaxed text-stone-700 dark:text-stone-300">{shown.notes}</p>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Historique ({updates.length})
              </p>
              <div className="max-h-64 overflow-y-auto pr-1">
                <PointUpdates updates={updates} />
              </div>
            </div>

            {onEdit ? (
              <Card>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <p className="text-xs text-muted-foreground">
                    Corriger le volume, le prix ou les notes de ce point.
                  </p>
                  <button
                    type="button"
                    onClick={() => onEdit(shown)}
                    className="shrink-0 rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                  >
                    Modifier la fiche
                  </button>
                </CardContent>
              </Card>
            ) : null}
          </div>
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">Chargement de la fiche…</p>
        )}
      </DialogContent>
    </Dialog>
  )
}
