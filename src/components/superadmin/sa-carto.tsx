'use client'

// Super Administration — Délimitation cartographique (Phase 3, T33) : zone de
// couverture éditable (bounding box). CarbuScope ne couvre que la Tunisie :
// cette zone borne le chargement des cartes pour en réduire le poids et
// exclure les zones hors pays inutiles. 100 % additif : 8e onglet.

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Info, Loader2, MapPinned, RotateCcw, Save } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAppStore } from "@/store/app-store"
import { DEMO_ACCOUNTS_MAP } from "@/lib/demo-accounts"
import { CARTO_DEFAULTS, type CartoBoundaryDTO } from "@/lib/saas"
import { fmtDate, timeAgo } from "./sa-shared"

// ---- Aperçu SVG (projection fixe : x = (lng − 6,8) × 40, y = (38,1 − lat) × 40) ----

const SVG_X0 = 6.8
const SVG_Y0 = 38.1
const SVG_K = 40
const px = (lng: number) => (lng - SVG_X0) * SVG_K
const py = (lat: number) => (SVG_Y0 - lat) * SVG_K

/** Contour stylisé de la Tunisie (points [lng, lat]). */
const TUNISIA_POINTS: [number, number][] = [
  [8.7, 36.95], [9.15, 37.1], [9.85, 37.32], [10.45, 37.15], [11.05, 37.04],
  [10.75, 36.75], [10.6, 36.4], [10.9, 35.85], [11.05, 35.45], [10.85, 34.9],
  [10.35, 34.3], [10.1, 33.5], [10.8, 33.5], [11.05, 33.45], [11.5, 33.1],
  [11.0, 32.2], [11.55, 30.35], [10.5, 30.05], [9.7, 30.2], [9.0, 31.4],
  [8.6, 32.4], [8.35, 33.6], [8.65, 34.8], [8.35, 35.9], [8.65, 36.5],
]
const TUNISIA_PATH = TUNISIA_POINTS
  .map(([lng, lat]) => `${px(lng).toFixed(2)},${py(lat).toFixed(2)}`)
  .join(" ")

/** Décimal français accepté : « 30,2 » ou « 30.2 ». NaN si vide/invalide. */
function parseCoord(raw: string): number {
  const t = raw.trim().replace(",", ".")
  if (t === "") return NaN
  const v = Number(t)
  return Number.isFinite(v) ? v : NaN
}

export function SaCarto() {
  const userId = useAppStore(s => s.userId)
  const actor = userId ? DEMO_ACCOUNTS_MAP[userId]?.email ?? "system" : "system"

  const [boundary, setBoundary] = useState<CartoBoundaryDTO | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [minLat, setMinLat] = useState("")
  const [maxLat, setMaxLat] = useState("")
  const [minLng, setMinLng] = useState("")
  const [maxLng, setMaxLng] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    try {
      const r = await fetch("/api/super/carto")
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      const b: CartoBoundaryDTO = j.boundary
      setBoundary(b)
      setName(b.name)
      setMinLat(String(b.minLat))
      setMaxLat(String(b.maxLat))
      setMinLng(String(b.minLng))
      setMaxLng(String(b.maxLng))
      setLoadError(null)
    } catch {
      setLoadError("Impossible de charger la délimitation cartographique.")
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  // Valeurs de l'aperçu live : champs vides/invalide → bornes par défaut.
  const v = {
    minLat: Number.isNaN(parseCoord(minLat)) ? CARTO_DEFAULTS.minLat : parseCoord(minLat),
    maxLat: Number.isNaN(parseCoord(maxLat)) ? CARTO_DEFAULTS.maxLat : parseCoord(maxLat),
    minLng: Number.isNaN(parseCoord(minLng)) ? CARTO_DEFAULTS.minLng : parseCoord(minLng),
    maxLng: Number.isNaN(parseCoord(maxLng)) ? CARTO_DEFAULTS.maxLng : parseCoord(maxLng),
  }
  const invalid = v.minLat >= v.maxLat || v.minLng >= v.maxLng

  // T52-R3 : brouillon non enregistré — le formulaire diffère de la zone
  // enregistrée (comparaison des valeurs parsées, virgule décimale acceptée).
  const dirty = boundary !== null && (
    name.trim() !== boundary.name ||
    parseCoord(minLat) !== boundary.minLat ||
    parseCoord(maxLat) !== boundary.maxLat ||
    parseCoord(minLng) !== boundary.minLng ||
    parseCoord(maxLng) !== boundary.maxLng
  )

  // Étendue indicative : 1° de latitude ≈ 111 km ; longitude corrigée par cos(lat moyenne).
  const midLat = (v.minLat + v.maxLat) / 2
  const nsKm = Math.round(Math.max(0, v.maxLat - v.minLat) * 111)
  const ewKm = Math.round(Math.max(0, v.maxLng - v.minLng) * 111 * Math.cos((midLat * Math.PI) / 180))

  /** Validation FR (mêmes règles que l'API). */
  function validate(): { ok: true; data: { name: string; minLat: number; maxLat: number; minLng: number; maxLng: number } } | { ok: false; error: string } {
    const trimmed = name.trim()
    if (trimmed.length < 3 || trimmed.length > 80) {
      return { ok: false, error: "Nom de la zone requis — entre 3 et 80 caractères" }
    }
    const nums = { minLat: parseCoord(minLat), maxLat: parseCoord(maxLat), minLng: parseCoord(minLng), maxLng: parseCoord(maxLng) }
    if (Number.isNaN(nums.minLat) || Number.isNaN(nums.maxLat) || nums.minLat < -90 || nums.minLat > 90 || nums.maxLat < -90 || nums.maxLat > 90) {
      return { ok: false, error: "Latitude invalide — nombre entre -90 et 90" }
    }
    if (Number.isNaN(nums.minLng) || Number.isNaN(nums.maxLng) || nums.minLng < -180 || nums.minLng > 180 || nums.maxLng < -180 || nums.maxLng > 180) {
      return { ok: false, error: "Longitude invalide — nombre entre -180 et 180" }
    }
    if (nums.minLat >= nums.maxLat) {
      return { ok: false, error: "La latitude minimale doit être inférieure à la maximale" }
    }
    if (nums.minLng >= nums.maxLng) {
      return { ok: false, error: "La longitude minimale doit être inférieure à la maximale" }
    }
    return { ok: true, data: { name: trimmed, ...nums } }
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return
    const res = validate()
    if (!res.ok) {
      setError(res.error)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const r = await fetch("/api/super/carto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...res.data, actor }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.error ?? `Erreur ${r.status}`)
      const b: CartoBoundaryDTO = j.boundary
      setBoundary(b)
      setName(b.name)
      setMinLat(String(b.minLat))
      setMaxLat(String(b.maxLat))
      setMinLng(String(b.minLng))
      setMaxLng(String(b.maxLng))
      toast.success("Délimitation cartographique enregistrée")
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : "Échec de l'enregistrement de la zone.")
    } finally {
      setSaving(false)
    }
  }

  /** Restaure les valeurs par défaut dans le formulaire SANS enregistrer. */
  function resetDefaults() {
    setName(CARTO_DEFAULTS.name)
    setMinLat(String(CARTO_DEFAULTS.minLat))
    setMaxLat(String(CARTO_DEFAULTS.maxLat))
    setMinLng(String(CARTO_DEFAULTS.minLng))
    setMaxLng(String(CARTO_DEFAULTS.maxLng))
    setError(null)
    toast.info("Valeurs par défaut restaurées dans le formulaire", {
      description: "Rien n'est enregistré — relancez « Enregistrer la zone » pour appliquer.",
    })
  }

  if (loadError) {
    return <Card><CardContent className="p-6 text-sm text-destructive">{loadError}</CardContent></Card>
  }
  if (!boundary) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Chargement de la zone de couverture…
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            <MapPinned className="h-4 w-4 text-teal-700 dark:text-teal-400" aria-hidden />
            Délimitation cartographique — zone de couverture
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            CarbuScope ne couvre que la Tunisie : cette zone borne le chargement des cartes pour
            en réduire le poids et exclure les zones hors pays inutiles.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* ---- Aperçu SVG live (mis à jour à la frappe) ---- */}
            <div className="space-y-1.5">
              <div className="rounded-lg border bg-muted/20 p-3">
                <svg
                  viewBox="0 0 224 348"
                  className="mx-auto block w-full max-w-xs"
                  role="img"
                  aria-label={`Aperçu indicatif de la zone de couverture (latitude ${v.minLat} à ${v.maxLat}, longitude ${v.minLng} à ${v.maxLng})`}
                >
                  {/* Grille fine tous les 2° */}
                  {[8, 10, 12].map(lng => (
                    <g key={`g-lng-${lng}`} className="text-border">
                      <line x1={px(lng)} y1={0} x2={px(lng)} y2={348} stroke="currentColor" strokeWidth={0.5} strokeDasharray="2 2" />
                      <text x={px(lng)} y={346} textAnchor="middle" fontSize={7} className="fill-muted-foreground" fill="currentColor">{lng}°E</text>
                    </g>
                  ))}
                  {[30, 32, 34, 36, 38].map(lat => (
                    <g key={`g-lat-${lat}`} className="text-border">
                      <line x1={0} y1={py(lat)} x2={224} y2={py(lat)} stroke="currentColor" strokeWidth={0.5} strokeDasharray="2 2" />
                      <text x={2} y={py(lat) - 2} fontSize={7} className="fill-muted-foreground" fill="currentColor">{lat}°N</text>
                    </g>
                  ))}

                  {/* Contour stylisé de la Tunisie */}
                  <polygon
                    points={TUNISIA_PATH}
                    className="fill-teal-500/10 stroke-teal-600 dark:stroke-teal-400"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />

                  {/* Rectangle de la zone (rouge si bornes invalides min ≥ max) */}
                  <rect
                    x={Math.min(px(v.minLng), px(v.maxLng))}
                    y={Math.min(py(v.minLat), py(v.maxLat))}
                    width={Math.abs(px(v.maxLng) - px(v.minLng))}
                    height={Math.abs(py(v.minLat) - py(v.maxLat))}
                    className={invalid
                      ? "fill-red-500/5 stroke-red-600 dark:stroke-red-400"
                      : "fill-emerald-500/5 stroke-emerald-600 dark:stroke-emerald-400"}
                    strokeWidth={1.25}
                    strokeDasharray="6 3"
                  />
                </svg>
              </div>
              <p className="text-center text-[9px] text-muted-foreground">Aperçu indicatif</p>
            </div>

            {/* ---- Formulaire ---- */}
            <form onSubmit={save} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="carto-name">Nom de la zone</Label>
                <Input
                  id="carto-name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={120}
                  disabled={saving}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="carto-min-lat">Latitude min (bord sud)</Label>
                  <div className="relative">
                    <Input
                      id="carto-min-lat" type="number" step={0.01} min={-90} max={90}
                      inputMode="decimal" value={minLat}
                      onChange={e => setMinLat(e.target.value)}
                      className="pr-8 tabular-nums" disabled={saving}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground" aria-hidden>°</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="carto-max-lat">Latitude max (bord nord)</Label>
                  <div className="relative">
                    <Input
                      id="carto-max-lat" type="number" step={0.01} min={-90} max={90}
                      inputMode="decimal" value={maxLat}
                      onChange={e => setMaxLat(e.target.value)}
                      className="pr-8 tabular-nums" disabled={saving}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground" aria-hidden>°</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="carto-min-lng">Longitude min (bord ouest)</Label>
                  <div className="relative">
                    <Input
                      id="carto-min-lng" type="number" step={0.01} min={-180} max={180}
                      inputMode="decimal" value={minLng}
                      onChange={e => setMinLng(e.target.value)}
                      className="pr-8 tabular-nums" disabled={saving}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground" aria-hidden>°</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="carto-max-lng">Longitude max (bord est)</Label>
                  <div className="relative">
                    <Input
                      id="carto-max-lng" type="number" step={0.01} min={-180} max={180}
                      inputMode="decimal" value={maxLng}
                      onChange={e => setMaxLng(e.target.value)}
                      className="pr-8 tabular-nums" disabled={saving}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-muted-foreground" aria-hidden>°</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground tabular-nums">
                Étendue : ≈ {nsKm.toLocaleString("fr-FR")} km (N-S) × {ewKm.toLocaleString("fr-FR")} km (E-O)
              </p>

              {error && (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  {error}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button type="submit" size="sm" className="gap-1.5" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
                  Enregistrer la zone
                </Button>
                <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={resetDefaults} disabled={saving}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Réinitialiser (Tunisie entière)
                </Button>
                {dirty && !invalid && (
                  <span
                    role="status"
                    className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  >
                    Modifications non enregistrées
                  </span>
                )}
              </div>

              <p className="border-t pt-3 text-xs text-muted-foreground">
                {boundary.updatedAt && !boundary.isDefault
                  ? `Dernière modification : ${fmtDate(boundary.updatedAt)} · ${timeAgo(boundary.updatedAt)}`
                  : "Valeurs par défaut (jamais modifiée)"}
              </p>
            </form>
          </div>
        </CardContent>
      </Card>

      <Alert className="border-teal-200 bg-teal-50/50 dark:border-teal-900 dark:bg-teal-950/40">
        <Info className="text-teal-700 dark:text-teal-400" aria-hidden />
        <AlertDescription>
          Ce paramètre sera consommé par les vues cartographiques de la plateforme : seules les
          tuiles/services dans la zone seront chargés.
        </AlertDescription>
      </Alert>
    </div>
  )
}
