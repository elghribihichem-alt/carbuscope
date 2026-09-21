'use client'

// A.6 — Onglet « Calculateurs » : simuler et planifier (cœur de la valeur ajoutée)

import * as React from "react"
import { toast } from "sonner"
import { BookmarkPlus, Calculator, Check, History, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ErrorState, TabSkeleton } from "@/components/shell/loading"
import { useAppStore } from "@/store/app-store"
import type { BrandDTO, GovernoratRow, RoadDTO, SavedCalculationDTO } from "@/lib/types"
import { cn } from "@/lib/utils"
import {
  CALC_BY_SAVE_TYPE,
  CALC_DEFS,
  CALC_LABELS,
  type CalcId,
  type InitialScenario,
  fmtDateFr,
} from "./calc-shared"
import { CalcTraffic } from "./calc-traffic"
import { CalcCouverture } from "./calc-couverture"
import { CalcParc } from "./calc-parc"
import { CalcRentabilite } from "./calc-rentabilite"
import { CalcMultiSites } from "./calc-multi-sites"
import { CalcVeille } from "./calc-veille"

interface CalcData {
  roads: RoadDTO[]
  governorats: GovernoratRow[]
  brands: BrandDTO[]
}

export function CalculatorsTab() {
  const brandSlug = useAppStore((s) => s.brandSlug)
  const [data, setData] = React.useState<CalcData | null>(null)
  const [savedList, setSavedList] = React.useState<SavedCalculationDTO[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [active, setActive] = React.useState<CalcId>("trafic")
  const [restore, setRestore] = React.useState<{ nonce: number; scenario: InitialScenario } | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [reloadNonce, setReloadNonce] = React.useState(0)

  React.useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/roads").then((r) => r.json()),
      fetch("/api/governorats").then((r) => r.json()),
      fetch("/api/brands").then((r) => r.json()),
      fetch("/api/calculations").then((r) => r.json()),
    ])
      .then(
        ([
          roads,
          governorats,
          brands,
          calcs,
        ]: [{ roads?: RoadDTO[] }, { governorats?: GovernoratRow[] }, { brands?: BrandDTO[] }, { calculations?: SavedCalculationDTO[] }]) => {
          if (cancelled) return
          setData({
            roads: roads.roads ?? [],
            governorats: governorats.governorats ?? [],
            brands: brands.brands ?? [],
          })
          setSavedList(calcs.calculations ?? [])
        }
      )
      .catch(() => {
        if (!cancelled) setError("Les données de référence (axes routiers, gouvernorats, enseignes) n'ont pas pu être chargées.")
      })
    return () => {
      cancelled = true
    }
  }, [reloadNonce])

  const selectCalc = (id: CalcId) => {
    setActive(id)
    setRestore(null)
  }

  const handleSave = (type: string, label: string, params: Record<string, unknown>, result: Record<string, unknown>) => {
    setSaving(true)
    fetch("/api/calculations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, label, params, result }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("save failed")
        return r.json()
      })
      .then((j: { calculation: SavedCalculationDTO }) => {
        setSavedList((prev) => [j.calculation, ...prev])
        toast.success("Scénario sauvegardé", {
          description: `« ${label} » est disponible en bas de page et dans la liste des scénarios.`,
        })
      })
      .catch(() => {
        toast.error("Sauvegarde impossible", { description: "Le scénario n'a pas pu être enregistré. Réessayez." })
      })
      .finally(() => setSaving(false))
  }

  const handleReload = (s: SavedCalculationDTO) => {
    const calcId = CALC_BY_SAVE_TYPE[s.type]
    if (!calcId) return
    setActive(calcId)
    setRestore({
      nonce: Date.now(),
      scenario: { label: s.label, params: s.params, result: s.result },
    })
    toast.info("Scénario rechargé", { description: `« ${s.label} » — paramètres et résultats restaurés.` })
  }

  /** Dernier trafic captif sauvegardé (A.6.1) — importable dans le calculateur de rentabilité */
  const importableTraffic = React.useMemo(() => {
    const latest = savedList.find((s) => s.type === "trafic-captif")
    const n = Number(latest?.result?.captifTotal)
    return latest && Number.isFinite(n) ? n : null
  }, [savedList])

  const knownScenarios = savedList.filter((s) => CALC_BY_SAVE_TYPE[s.type] !== undefined)

  if (error) {
    return (
      <div className="p-4 md:p-6">
        <ErrorState message={error} retry={() => setReloadNonce((n) => n + 1)} />
      </div>
    )
  }
  if (!data) return <TabSkeleton title="Chargement des calculateurs…" />

  const onSave = handleSave

  return (
    <div className="space-y-4 p-4 md:p-6">
      {/* En-tête */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Calculator className="h-4.5 w-4.5" />
            </span>
            Calculateurs — simuler et planifier
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Le cœur de la valeur ajoutée CarbuScope : simulez le potentiel d&apos;un site, comparez des candidats et
            planifiez vos investissements avec des données réelles du réseau tunisien.
          </p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Sparkles className="h-3 w-3" />
          {knownScenarios.length} scénario{knownScenarios.length > 1 ? "s" : ""} au total
        </Badge>
      </header>

      {/* Navigation secondaire : une carte par calculateur */}
      <nav className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="Choisir un calculateur">
        {CALC_DEFS.map((def) => {
          const Icon = def.icon
          const isActive = active === def.id
          return (
            <button
              key={def.id}
              type="button"
              onClick={() => selectCalc(def.id)}
              aria-current={isActive ? "true" : undefined}
              className={cn(
                "flex h-full flex-col items-start gap-2 rounded-xl border p-3 text-left transition-all hover:shadow-md",
                isActive
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border bg-card hover:border-primary/40"
              )}
            >
              <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", def.tint)}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold leading-tight">{def.title}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{def.description}</span>
              {isActive && (
                <span className="mt-auto inline-flex items-center gap-1 text-[11px] font-semibold text-primary">
                  <Check className="h-3 w-3" />
                  Calculateur actif
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Calculateur actif (remonté via key pour restaurer un scénario) */}
      <section aria-label={`Calculateur : ${CALC_DEFS.find((d) => d.id === active)?.title ?? ""}`}>
        {active === "trafic" && (
          <CalcTraffic
            key={`trafic-${restore?.nonce ?? 0}`}
            roads={data.roads}
            governorats={data.governorats}
            onSave={onSave}
            saving={saving}
            initial={restore?.scenario ?? null}
          />
        )}
        {active === "couverture" && (
          <CalcCouverture
            key={`couverture-${restore?.nonce ?? 0}`}
            brandSlug={brandSlug}
            onSave={onSave}
            saving={saving}
            initial={restore?.scenario ?? null}
          />
        )}
        {active === "parc" && (
          <CalcParc
            key={`parc-${restore?.nonce ?? 0}`}
            governorats={data.governorats}
            onSave={onSave}
            saving={saving}
            initial={restore?.scenario ?? null}
          />
        )}
        {active === "rentabilite" && (
          <CalcRentabilite
            key={`rentabilite-${restore?.nonce ?? 0}`}
            onSave={onSave}
            saving={saving}
            initial={restore?.scenario ?? null}
            importableTraffic={importableTraffic}
          />
        )}
        {active === "multi-sites" && (
          <CalcMultiSites
            key={`multi-sites-${restore?.nonce ?? 0}`}
            governorats={data.governorats}
            onSave={onSave}
            saving={saving}
            initial={restore?.scenario ?? null}
          />
        )}
        {active === "veille" && (
          <CalcVeille
            key={`veille-${restore?.nonce ?? 0}`}
            brands={data.brands}
            onSave={onSave}
            saving={saving}
            initial={restore?.scenario ?? null}
          />
        )}
      </section>

      {/* Scénarios sauvegardés */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <BookmarkPlus className="h-4 w-4 text-primary" />
            Scénarios sauvegardés
            <Badge variant="secondary" className="font-normal">
              {knownScenarios.length}
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Cliquez sur « Recharger » pour restaurer les paramètres et les résultats d&apos;un scénario.
          </p>
        </CardHeader>
        <CardContent>
          {knownScenarios.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              Aucun scénario sauvegardé pour l&apos;instant. Configurez un calculateur puis cliquez sur « Sauvegarder le
              scénario » pour le conserver ici.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {knownScenarios.map((s) => {
                const calcId = CALC_BY_SAVE_TYPE[s.type]
                const def = CALC_DEFS.find((d) => d.id === calcId)
                const Icon = def?.icon
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                    {Icon && (
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", def?.tint)}>
                        <Icon className="h-4 w-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{s.label}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {CALC_LABELS[s.type] ?? s.type} · sauvegardé le {fmtDateFr(s.createdAt)}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => handleReload(s)}>
                      <History className="h-3.5 w-3.5" />
                      Recharger
                    </Button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
