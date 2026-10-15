'use client'

// T55-C-b — Hubs > Paramètres TMP › « catalogue » (pneus). Catalogue de
// référence V1 STATIQUE, documenté « sur devis » : 3 gammes (Économie /
// Confort / Sport-premium) × 4 dimensions courantes en Tunisie, avec
// positionnement typique par dimension (citadine → SUV). Complément MESURÉ :
// rotations réelles du réseau via /api/hubs/analytics (byService PNEUS) —
// panier moyen réel et positionnement de ce panier face aux gammes.

import { useEffect, useMemo, useState } from "react"
import { Armchair, Car, Leaf, Package, Ruler, Zap } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { KpiCard } from "@/components/shell/kpi-card"
import { SectionHeader } from "@/components/radar/radar-shared"
import { num } from "@/lib/chart"
import { useAppStore } from "@/store/app-store"

// ---------- Catalogue statique V1 (référence, tarifs sur devis) ----------

interface GammeDef {
  id: string
  nom: string
  min: number
  max: number
  usage: string
  icon: typeof Leaf
  badge: string
}

const GAMMES: GammeDef[] = [
  {
    id: "ECO",
    nom: "Économie",
    min: 95, max: 140,
    usage: "budget / grande distribution",
    icon: Leaf,
    badge: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  },
  {
    id: "CONFORT",
    nom: "Confort",
    min: 150, max: 220,
    usage: "silence et longévité renforcés",
    icon: Armchair,
    badge: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  },
  {
    id: "SPORT",
    nom: "Sport / premium",
    min: 260, max: 420,
    usage: "adhérence et poussée sportive",
    icon: Zap,
    badge: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-400",
  },
]

interface DimensionDef {
  dimension: string
  usage: string
  /** positionnement typique par gamme (1-3) — indicatif V1 */
  positionnement: Record<string, number>
}

const DIMENSIONS: DimensionDef[] = [
  {
    dimension: "175/65 R14",
    usage: "Citadines",
    positionnement: { ECO: 3, CONFORT: 2, SPORT: 1 },
  },
  {
    dimension: "185/65 R15",
    usage: "Citadines & compactes",
    positionnement: { ECO: 2, CONFORT: 3, SPORT: 2 },
  },
  {
    dimension: "195/65 R15",
    usage: "Berlines compactes",
    positionnement: { ECO: 2, CONFORT: 3, SPORT: 2 },
  },
  {
    dimension: "205/55 R16",
    usage: "Berlines & SUV",
    positionnement: { ECO: 1, CONFORT: 2, SPORT: 3 },
  },
]

// Échelle de visualisation du panier moyen (englobe les 3 gammes + marges).
const ECHELLE_MIN = 90
const ECHELLE_MAX = 430

/** Dots de positionnement typique (●●○) — indicatif V1. */
function PositionnementDots({ niveau }: { niveau: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`positionnement typique ${niveau} sur 3`}>
      {Array.from({ length: 3 }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < niveau ? "bg-foreground/70" : "bg-muted"}`}
          aria-hidden
        />
      ))}
    </span>
  )
}

// ---------- Rotations réelles (mesure) ----------

interface PneusRotation {
  count: number
  ca: number
}

function usePneusRotation(brandSlug: string | null) {
  const [rotation, setRotation] = useState<PneusRotation | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    fetch(`/api/hubs/analytics${brandSlug ? `?brand=${encodeURIComponent(brandSlug)}` : ""}`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { byService: { type: string; count: number; ca: number }[] }) => {
        if (!alive) return
        const p = d.byService.find(s => s.type === "PNEUS")
        setRotation(p ? { count: p.count, ca: p.ca } : { count: 0, ca: 0 })
        setError(null)
      })
      .catch(e => { if (alive) setError(e instanceof Error ? e.message : "Erreur inconnue") })
    return () => { alive = false }
  }, [brandSlug])
  return { rotation, error }
}

export function HubsParametresCatalogue() {
  const brandSlug = useAppStore(s => s.brandSlug)
  const { rotation, error: rotationError } = usePneusRotation(brandSlug)

  // Prix médian du catalogue = médiane des milieux de gamme (formule affichée).
  const prixMedian = useMemo(() => {
    const mids = GAMMES.map(g => (g.min + g.max) / 2).sort((a, b) => a - b)
    return mids.length % 2 ? mids[(mids.length - 1) / 2] : (mids[mids.length / 2 - 1] + mids[mids.length / 2]) / 2
  }, [])

  // Panier moyen réel pneus (mesure registre) + gamme de positionnement.
  const panierReel = rotation && rotation.count > 0 ? Math.round(rotation.ca / rotation.count) : null
  const gammePanier = panierReel !== null
    ? GAMMES.find(g => panierReel >= g.min && panierReel <= g.max) ?? null
    : null
  const gammeLabel = gammePanier
    ? `dans la gamme ${gammePanier.nom}`
    : panierReel !== null
      ? panierReel < GAMMES[0].min ? "sous la gamme Économie" : "au-dessus de la gamme Sport"
      : null

  const pct = (v: number) => `${Math.round(((v - ECHELLE_MIN) / (ECHELLE_MAX - ECHELLE_MIN)) * 1000) / 10}%`

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Catalogue pneus — référence V1"
        description="Catalogue de référence des pneus couramment montés en Tunisie : 3 gammes × 4 dimensions. Fourchettes indicatives par gamme, positionnement typique par dimension — tarifs pratiqués sur devis (V1), complétés par le panier moyen réel du réseau."
        icon={Package}
        badge="sur devis"
      />

      {/* KPIs du catalogue + mesure réelle */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Dimensions suivies" value={num(DIMENSIONS.length)} sub="montes courantes en Tunisie" icon={Ruler} />
        <KpiCard label="Gammes de référence" value={num(GAMMES.length)} sub="Économie · Confort · Sport" icon={Leaf} />
        <KpiCard
          label="Prix médian catalogue"
          value={`≈ ${num(prixMedian)} DT`}
          sub="médiane des milieux de gamme"
          icon={Armchair}
        />
        <KpiCard
          label="Panier moyen réel"
          value={panierReel !== null ? `${num(panierReel)} DT` : "…"}
          sub={rotationError
            ? "rotations indisponibles"
            : panierReel !== null
              ? `mesuré : ${num(panierReel)} DT moyen · ${gammeLabel}`
              : "rotation pneus nulle sur le périmètre"}
          icon={Car}
          tone={panierReel !== null ? "success" : "default"}
        />
      </div>

      {/* Cartes par dimension */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DIMENSIONS.map(d => (
          <Card key={d.dimension} className="gap-0">
            <CardHeader className="pb-2">
              <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Ruler className="h-4.5 w-4.5" aria-hidden />
                </span>
                <span className="font-mono">{d.dimension}</span>
                <Badge variant="outline" className="border-stone-300 bg-stone-50 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300">
                  {d.usage}
                </Badge>
              </CardTitle>
              <CardDescription>Fourchettes indicatives par gamme — tarifs sur devis (pose incluse dans le montage).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {GAMMES.map(g => {
                const Icon = g.icon
                return (
                  <div key={g.id} className="flex min-h-11 items-center gap-2.5 rounded-lg border bg-muted/20 px-3 py-1.5">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.nom}</span>
                    <span className="text-[11px] text-muted-foreground">{g.usage}</span>
                    <span className="tabular-nums text-sm font-semibold">
                      {g.min}–{g.max} <span className="text-xs font-medium text-muted-foreground">DT</span>
                    </span>
                    <PositionnementDots niveau={d.positionnement[g.id] ?? 1} />
                  </div>
                )
              })}
            </CardContent>
          </Card>
        ))}
        <p className="col-span-full flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground sm:col-span-2">
          <Package className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          Catalogue de référence V1 — prix indicatifs « sur devis » (fournisseurs locaux, marques et lots variables) ;
          le positionnement typique (points) indique la gamme la plus demandée pour chaque dimension. Aucun tarif
          n&apos;est facturé depuis cette page : la vente se traite dans Services › Pneus.
        </p>
      </div>

      {/* Rotations réelles — positionnement mesuré du réseau */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Rotations réelles du réseau — positionnement mesuré</CardTitle>
          <CardDescription>
            Panier moyen des ventes pneus enregistrées dans le registre (CA pneus ÷ prestations) face aux 3 gammes
            du catalogue de référence.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {rotationError ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              Rotations indisponibles ({rotationError}) — la mesure réapparaîtra au prochain chargement.
            </p>
          ) : !rotation ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Skeleton className="h-4 w-40" /> chargement des rotations…
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-medium">Panier moyen mesuré :</span>
                <span className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {panierReel !== null ? `${num(panierReel)} DT` : "—"}
                </span>
                <span className="text-xs text-muted-foreground">
                  sur {num(rotation.count)} prestation{rotation.count > 1 ? "s" : ""} pneus
                  {gammeLabel ? ` · ${gammeLabel}` : ""}
                </span>
              </div>
              {/* Échelle des gammes avec marqueur du panier réel */}
              <div className="space-y-1.5" role="img" aria-label="Positionnement du panier moyen réel sur l'échelle des gammes">
                <div className="relative h-7 overflow-visible rounded-lg bg-muted">
                  {GAMMES.map(g => (
                    <div
                      key={g.id}
                      className={`absolute top-1 h-5 rounded ${g.id === "ECO" ? "bg-emerald-500 dark:bg-emerald-400" : g.id === "CONFORT" ? "bg-amber-500 dark:bg-amber-400" : "bg-purple-600 dark:bg-purple-400"}`}
                      style={{ left: pct(g.min), width: `calc(${pct(g.max)} - ${pct(g.min)})` }}
                      title={`${g.nom} : ${g.min}–${g.max} DT`}
                    />
                  ))}
                  {panierReel !== null && (
                    <div
                      className="absolute -top-1 flex flex-col items-center"
                      style={{ left: pct(panierReel) }}
                    >
                      <span className="h-9 w-0.5 rounded-full bg-orange-700 dark:bg-orange-500" aria-hidden />
                      <span className="mt-0.5 -translate-x-1/2 whitespace-nowrap rounded-full border border-orange-300 bg-orange-50 px-1.5 py-0.5 text-[10px] font-bold text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-400">
                        réel {num(panierReel)} DT
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>{ECHELLE_MIN} DT</span>
                  {GAMMES.map(g => (
                    <span key={g.id} className="hidden sm:inline">{g.nom} {g.min}–{g.max} DT</span>
                  ))}
                  <span>{ECHELLE_MAX} DT</span>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Lecture : {gammeLabel ?? "rotation nulle — positionnement non mesurable"}
                {gammePanier
                  ? ` — le réseau vend typiquement dans la fourchette ${gammePanier.min}–${gammePanier.max} DT (${gammePanier.usage}), cohérent avec un montage citadines/compactes.`
                  : "."}{" "}
                Le panier moyen intègre les montes simples et doubles du registre — mesure brute, non ajustée.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
