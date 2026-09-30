'use client'

// Shadow Market — Recensement, onglet « ➕ Nouveau Point » (T44-d).
// Formulaire de saisie terrain : GPS auto (± ajustements manuels), typologie
// en cartes radio visuelles, localisation liée, volume slider+input, prix
// comparé au prix officiel, photo (aperçu local en démo), notes — avec
// aperçu temps réel à droite (perte estimée + station la plus proche).

import { useEffect, useMemo, useRef, useState } from "react"
import {
  Camera, CheckCircle2, Crosshair, Eye, FileImage, List, MapPin, Minus, Plus,
  RefreshCw, Save, TrendingDown, TrendingUp, TriangleAlert,
} from "lucide-react"
import { toast } from "sonner"
import { useAppStore } from "@/store/app-store"
import type { ShadowMapResponse, ShadowPointDTO, ShadowTypologyDTO } from "@/lib/types"
import { SHADOW_SOURCE_LABELS } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import {
  SHADOW_COLORS, SectionHeader, ShadowPhoto, TypologyIcon, formatMillimes, formatTnd, typologyLabel,
} from "../shadow-shared"
import {
  DAYS_PER_MONTH, MARGIN_TND_PER_L, OFFICIAL_ESSENCE_MILL, distanceM,
} from "./recensement-shared"

type GovernoratDTO = { name: string }

const round5 = (v: number) => Math.round(v * 100000) / 100000
const clampLat = (v: number) => Math.min(37.4, Math.max(30.0, v))
const clampLng = (v: number) => Math.min(12.4, Math.max(7.4, v))

type MapStationLite = ShadowMapResponse["stations"][number]

export function TabNewPoint({ onGoToList, onNavigate }: { onGoToList?: (code?: string) => void; onNavigate?: (section: string) => void }) {
  const session = useAppStore((s) => s.session)

  // ---- Référentiels (typologies + délégations déduites des points) ----
  const [typologies, setTypologies] = useState<ShadowTypologyDTO[]>([])
  const [delegationMap, setDelegationMap] = useState<Record<string, string[]>>({})
  const [governorats, setGovernorats] = useState<string[]>([])

  // ---- Formulaire ----
  const [typologyCode, setTypologyCode] = useState("BIDONS")
  const [gouvernorat, setGouvernorat] = useState("")
  const [delegation, setDelegation] = useState("")
  const [cite, setCite] = useState("")
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [volumeLJ, setVolumeLJ] = useState(120)
  const [priceStr, setPriceStr] = useState("")
  const [notes, setNotes] = useState("")
  const [reporter, setReporter] = useState("")
  const [source, setSource] = useState("AGENT")
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [photoName, setPhotoName] = useState<string | null>(null)

  // ---- GPS ----
  const [gpsState, setGpsState] = useState<"idle" | "loading" | "ok" | "error">("idle")
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null)
  const [gpsError, setGpsError] = useState<string | null>(null)

  // ---- Station la plus proche (carte shadow, chargée à la demande) ----
  const [mapStations, setMapStations] = useState<MapStationLite[] | null>(null)
  const [needMap, setNeedMap] = useState(false)
  const mapStarted = useRef(false)

  // ---- Soumission ----
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<ShadowPointDTO | null>(null)

  // Référentiels : typologies + carte des délégations + gouvernorats.
  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/shadow/points?limit=1000&active=true", { signal: ctrl.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Erreur ${res.status}`)
        return res.json() as Promise<{ points: ShadowPointDTO[]; typologies: ShadowTypologyDTO[] }>
      })
      .then((json) => {
        setTypologies(json.typologies ?? [])
        const map: Record<string, string[]> = {}
        for (const p of json.points ?? []) {
          const list = (map[p.gouvernorat] ??= [])
          if (!list.includes(p.delegation)) list.push(p.delegation)
        }
        for (const key of Object.keys(map)) map[key].sort((a, b) => a.localeCompare(b, "fr"))
        setDelegationMap(map)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        toast.error("Référentiels indisponibles", { description: e instanceof Error ? e.message : "Erreur inconnue" })
      })
    const ctrl2 = new AbortController()
    fetch("/api/governorats", { signal: ctrl2.signal })
      .then((res) => (res.ok ? (res.json() as Promise<{ governorats: GovernoratDTO[] }>) : Promise.reject(new Error(`Erreur ${res.status}`))))
      .then((json) => {
        setGovernorats((json.governorats ?? []).map((g) => g.name).sort((a, b) => a.localeCompare(b, "fr")))
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
      })
    return () => {
      ctrl.abort()
      ctrl2.abort()
    }
  }, [])

  // Reporter par défaut : nom de la session connectée.
  useEffect(() => {
    setReporter(session?.name ?? "équipe plateforme")
  }, [session?.name])

  // Carte des stations (une seule fois, dès que des coordonnées existent).
  useEffect(() => {
    if (!needMap || mapStarted.current) return
    mapStarted.current = true
    const ctrl = new AbortController()
    fetch("/api/shadow/map", { signal: ctrl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<ShadowMapResponse>) : Promise.reject(new Error(`Erreur ${res.status}`))))
      .then((json) => setMapStations(json.stations ?? []))
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setMapStations([])
      })
    return () => ctrl.abort()
  }, [needMap])

  // ---- Géolocalisation ----
  const locateGps = () => {
    setGpsError(null)
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setGpsState("error")
      setGpsError("Géolocalisation non supportée par ce navigateur — saisissez les coordonnées manuellement.")
      return
    }
    setGpsState("loading")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(round5(pos.coords.latitude))
        setLng(round5(pos.coords.longitude))
        setGpsAccuracy(Math.round(pos.coords.accuracy))
        setGpsState("ok")
        setNeedMap(true)
      },
      (err) => {
        setGpsState("error")
        setGpsError(
          err.code === err.PERMISSION_DENIED
            ? "Position refusée — autorisez la localisation ou saisissez les coordonnées à la main."
            : "Position indisponible (hors couverture ?) — saisissez les coordonnées à la main.",
        )
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    )
  }

  const setCoord = (which: "lat" | "lng", raw: string) => {
    if (raw.trim() === "") {
      if (which === "lat") setLat(null)
      else setLng(null)
      return
    }
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    if (which === "lat") setLat(clampLat(round5(n)))
    else setLng(clampLng(round5(n)))
    setNeedMap(true)
  }

  const nudge = (which: "lat" | "lng", delta: number) => {
    if (which === "lat") setLat((v) => clampLat(round5((v ?? 33.8) + delta)))
    else setLng((v) => clampLng(round5((v ?? 10.8) + delta)))
    setNeedMap(true)
  }

  // ---- Typologie : carte radio (le volume indicatif devient la proposition) ----
  const currentTypo = typologies.find((t) => t.code === typologyCode)
  const selectTypology = (code: string) => {
    setTypologyCode(code)
    const typo = typologies.find((t) => t.code === code)
    if (typo) setVolumeLJ(typo.volumeLJ)
    setPhotoPreview(null)
    setPhotoName(null)
  }

  const delegations = gouvernorat ? delegationMap[gouvernorat] ?? [] : []

  // ---- Comparaison du prix vs officiel ----
  const priceValue = priceStr.trim() === "" ? null : Number(priceStr)
  const priceGap = useMemo(() => {
    if (priceValue == null || !Number.isFinite(priceValue) || priceValue <= 0) return null
    const pct = ((priceValue - OFFICIAL_ESSENCE_MILL) / OFFICIAL_ESSENCE_MILL) * 100
    return { pct, cheaper: priceValue < OFFICIAL_ESSENCE_MILL }
  }, [priceValue])

  // ---- Photo locale (aperçu uniquement, non envoyée) ----
  const onPickPhoto = (file: File | null) => {
    if (file === null) {
      setPhotoPreview(null)
      setPhotoName(null)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setPhotoPreview(typeof reader.result === "string" ? reader.result : null)
      setPhotoName(file.name)
    }
    reader.readAsDataURL(file)
  }

  // ---- Aperçu : station la plus proche + perte estimée ----
  const nearest = useMemo(() => {
    if (lat == null || lng == null || mapStations === null) return null
    let best: { station: MapStationLite; m: number } | null = null
    for (const s of mapStations) {
      const m = distanceM(lat, lng, s.lat, s.lng)
      if (best === null || m < best.m) best = { station: s, m }
    }
    return best
  }, [lat, lng, mapStations])

  const estLoss = volumeLJ > 0 ? volumeLJ * MARGIN_TND_PER_L * DAYS_PER_MONTH : 0
  const displayPhoto = photoPreview ?? (currentTypo ? `/images/shadow/${photoFile(currentTypo.code)}` : null)

  const canSubmit =
    !saving &&
    typologyCode !== "" &&
    gouvernorat !== "" &&
    delegation !== "" &&
    lat != null &&
    lng != null &&
    volumeLJ > 0 &&
    (priceValue == null || (Number.isFinite(priceValue) && priceValue >= 0 && priceValue <= 5000))

  // ---- Réinitialisation ----
  const resetForm = () => {
    setTypologyCode("BIDONS")
    setGouvernorat("")
    setDelegation("")
    setCite("")
    setLat(null)
    setLng(null)
    const bidons = typologies.find((t) => t.code === "BIDONS")
    setVolumeLJ(bidons?.volumeLJ ?? 120)
    setPriceStr("")
    setNotes("")
    setPhotoPreview(null)
    setPhotoName(null)
    setGpsState("idle")
    setGpsAccuracy(null)
    setGpsError(null)
  }

  // ---- Enregistrement ----
  const submit = async () => {
    if (!canSubmit) {
      toast.error("Formulaire incomplet", {
        description: "Typologie, gouvernorat, délégation, coordonnées et volume sont obligatoires.",
      })
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/shadow/points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          typologyCode,
          gouvernorat,
          delegation,
          cite: cite.trim() || null,
          lat,
          lng,
          volumeLJ,
          priceMillimes: priceValue != null && Number.isFinite(priceValue) ? Math.round(priceValue) : null,
          // En démo, la photo locale reste sur l'appareil : on rattache la
          // photo indicative de la typologie au point enregistré.
          photoUrl: currentTypo ? photoFile(currentTypo.code) : null,
          notes: notes.trim() || "",
          reporter: reporter.trim() || undefined,
          source,
        }),
      })
      const json = (await res.json()) as { point?: ShadowPointDTO; error?: string }
      if (!res.ok || !json.point) throw new Error(json.error ?? `Erreur ${res.status}`)
      setCreated(json.point)
      toast.success(`Point ${json.point.code} enregistré`, {
        description: `${typologyLabel(json.point.typologyCode)} · ${json.point.delegation} (${json.point.gouvernorat}) — statut Brut, en attente de validation.`,
      })
      resetForm()
    } catch (e) {
      toast.error("Enregistrement impossible", { description: e instanceof Error ? e.message : "Erreur inconnue" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        emoji="➕"
        title="Nouveau point informel"
        description="Saisie terrain : géolocalisez le vendeur, choisissez la typologie, estimez volume et prix. Le point naît « Brut » puis suit le workflow de validation."
      />

      {created ? (
        <Card className="border-emerald-300 bg-emerald-50/70 dark:border-emerald-900 dark:bg-emerald-950/40">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                Point {created.code} enregistré ({typologyLabel(created.typologyCode)})
              </p>
              <p className="mt-0.5 text-xs text-emerald-800/80 dark:text-emerald-300/80">
                {created.delegation} · {created.gouvernorat} — perte estimée {formatTnd(created.lossTnd)}/mois
                {created.nearestStation ? ` · station la plus proche : ${created.nearestStation.name} (${created.nearestStation.distanceM} m)` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => onGoToList?.(created.code)}>
                <List className="h-3.5 w-3.5" aria-hidden /> Voir dans la liste
              </Button>
              <Button size="sm" variant="outline" onClick={() => setCreated(null)}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> Recenser un autre
              </Button>
              {onNavigate ? (
                <Button size="sm" onClick={() => onNavigate("impact")}>
                  <TrendingDown className="h-3.5 w-3.5" aria-hidden /> Analyser l&apos;impact
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* grid-cols-1 explicite (= minmax(0,1fr)) : sans lui, la piste implicite « auto »
          peut prendre max-content et déborde à 390 px (pattern T53-T6a). */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* ------------------------------ Formulaire ------------------------------ */}
        <div className="space-y-4">
          {/* GPS */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Localisation GPS</p>
                  <p className="text-xs text-muted-foreground">
                    Position du point informel — précision indispensable pour la détection de proximité.
                  </p>
                </div>
                <Button size="sm" onClick={locateGps} disabled={gpsState === "loading"}>
                  <Crosshair className={gpsState === "loading" ? "animate-pulse" : ""} aria-hidden />
                  {gpsState === "loading" ? "Localisation…" : "GPS auto"}
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="np-lat" className="text-xs">Latitude</Label>
                  <Input
                    id="np-lat"
                    type="number"
                    inputMode="decimal"
                    step={0.00001}
                    min={29}
                    max={38}
                    value={lat == null ? "" : lat.toFixed(5)}
                    onChange={(e) => setCoord("lat", e.target.value)}
                    placeholder="ex. 33,35699"
                    className="tabular-nums"
                  />
                  <div className="flex items-center gap-1">
                    <Button type="button" size="sm" variant="outline" className="h-6 px-2" onClick={() => nudge("lat", -0.001)} aria-label="Latitude −0,001">
                      <Minus className="h-3 w-3" aria-hidden />
                    </Button>
                    <span className="text-[10px] tabular-nums text-muted-foreground">±0,001</span>
                    <Button type="button" size="sm" variant="outline" className="h-6 px-2" onClick={() => nudge("lat", 0.001)} aria-label="Latitude +0,001">
                      <Plus className="h-3 w-3" aria-hidden />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="np-lng" className="text-xs">Longitude</Label>
                  <Input
                    id="np-lng"
                    type="number"
                    inputMode="decimal"
                    step={0.00001}
                    min={7}
                    max={12.5}
                    value={lng == null ? "" : lng.toFixed(5)}
                    onChange={(e) => setCoord("lng", e.target.value)}
                    placeholder="ex. 10,52913"
                    className="tabular-nums"
                  />
                  <div className="flex items-center gap-1">
                    <Button type="button" size="sm" variant="outline" className="h-6 px-2" onClick={() => nudge("lng", -0.001)} aria-label="Longitude −0,001">
                      <Minus className="h-3 w-3" aria-hidden />
                    </Button>
                    <span className="text-[10px] tabular-nums text-muted-foreground">±0,001</span>
                    <Button type="button" size="sm" variant="outline" className="h-6 px-2" onClick={() => nudge("lng", 0.001)} aria-label="Longitude +0,001">
                      <Plus className="h-3 w-3" aria-hidden />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                {gpsState === "ok" ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    <MapPin className="h-3 w-3" aria-hidden /> GPS obtenu
                    {gpsAccuracy != null ? ` · précision ±${gpsAccuracy} m` : ""}
                  </span>
                ) : null}
                {lat != null && lng != null ? (
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 font-medium tabular-nums text-stone-700 dark:bg-stone-800 dark:text-stone-300">
                    {lat.toFixed(5).replace(".", ",")}, {lng.toFixed(5).replace(".", ",")}
                  </span>
                ) : null}
                {gpsError ? (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                    {gpsError}
                  </span>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Typologie */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div>
                <p className="text-sm font-semibold">Typologie du point</p>
                <p className="text-xs text-muted-foreground">Le volume indicatif devient la proposition de départ.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Typologie du point">
                {(typologies.length > 0 ? typologies : DEFAULT_TYPOLOGIES).map((t) => {
                  const selected = typologyCode === t.code
                  return (
                    <button
                      key={t.code}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => selectTypology(t.code)}
                      className={`flex flex-col overflow-hidden rounded-lg border text-left transition-all ${
                        selected
                          ? "border-stone-900 ring-2 ring-stone-900/70 dark:border-stone-100 dark:ring-stone-100/60"
                          : "border-stone-200 hover:border-stone-400 dark:border-stone-800 dark:hover:border-stone-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 p-2">
                        <TypologyIcon code={t.code} className="h-4 w-4 shrink-0" />
                        <span className="truncate text-xs font-medium">{typologyLabel(t.code)}</span>
                      </div>
                      <img
                        src={photoFile(t.code)}
                        alt={`Photo indicative — ${typologyLabel(t.code)}`}
                        className="h-12 w-full object-cover"
                        loading="lazy"
                      />
                      <span className="px-2 py-1 text-[10px] text-muted-foreground">
                        indicatif : {t.volumeLJ.toLocaleString("fr-FR")} L/j
                      </span>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Localisation administrative */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <p className="text-sm font-semibold">Localisation administrative</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Gouvernorat</Label>
                  <Select value={gouvernorat || undefined} onValueChange={(v) => { setGouvernorat(v); setDelegation("") }}>
                    <SelectTrigger className="w-full" aria-label="Gouvernorat">
                      <SelectValue placeholder="Sélectionner…" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(governorats.length > 0 ? governorats : Object.keys(delegationMap)).map((g) => (
                        <SelectItem key={g} value={g}>{g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Délégation</Label>
                  {delegations.length > 0 ? (
                    <Select value={delegation || undefined} onValueChange={setDelegation}>
                      <SelectTrigger className="w-full" aria-label="Délégation">
                        <SelectValue placeholder="Sélectionner…" />
                      </SelectTrigger>
                      <SelectContent className="max-h-72">
                        {delegations.map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      value={delegation}
                      onChange={(e) => setDelegation(e.target.value)}
                      placeholder={gouvernorat ? "saisie libre" : "choisir un gouvernorat"}
                      aria-label="Délégation (saisie libre)"
                    />
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="np-cite" className="text-xs">Cité / quartier (libre)</Label>
                  <Input id="np-cite" value={cite} onChange={(e) => setCite(e.target.value)} placeholder="ex. Cité Ennour" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Volume + prix */}
          <Card>
            <CardContent className="space-y-4 p-4">
              <div className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Label className="text-xs font-medium">Volume estimé</Label>
                  <span className="text-sm font-semibold tabular-nums" style={{ color: SHADOW_COLORS.orange }}>
                    {volumeLJ.toLocaleString("fr-FR")} L/j
                  </span>
                </div>
                <Slider
                  value={[volumeLJ]}
                  min={20}
                  max={2000}
                  step={10}
                  onValueChange={(v) => setVolumeLJ(v[0] ?? volumeLJ)}
                  aria-label="Volume estimé en litres par jour"
                />
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={20}
                    max={2000}
                    value={volumeLJ}
                    onChange={(e) => {
                      const n = Number(e.target.value)
                      setVolumeLJ(Number.isFinite(n) && n > 0 ? Math.min(2000, Math.round(n)) : 20)
                    }}
                    className="h-9 w-28 tabular-nums"
                    aria-label="Volume estimé (saisie)"
                  />
                  <span className="text-xs text-muted-foreground">
                    L/j — indicatif de la typologie : {currentTypo ? `${currentTypo.volumeLJ.toLocaleString("fr-FR")} L/j` : "—"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="np-price" className="text-xs font-medium">Prix affiché (millimes/L)</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="np-price"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={5000}
                    value={priceStr}
                    onChange={(e) => setPriceStr(e.target.value)}
                    placeholder="ex. 1 480"
                    className="h-9 w-32 tabular-nums"
                  />
                  {priceGap ? (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        backgroundColor: priceGap.cheaper ? "#4CAF5022" : "#E5393522",
                        color: priceGap.cheaper ? SHADOW_COLORS.green : SHADOW_COLORS.red,
                      }}
                    >
                      {priceGap.cheaper ? <TrendingDown className="h-3 w-3" aria-hidden /> : <TrendingUp className="h-3 w-3" aria-hidden />}
                      {priceGap.pct > 0 ? "+" : ""}
                      {priceGap.pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % vs officiel (2 650 mill.)
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">officiel essence : 2 650 mill. (2,650 DT/L)</span>
                  )}
                </div>
                {priceValue != null && Number.isFinite(priceValue) && priceValue > 0 ? (
                  <p className="text-[11px] text-muted-foreground">≈ {(priceValue / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 3 })} DT/L</p>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {/* Photo + notes + méta */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">Photo terrain</p>
                  <p className="text-xs text-muted-foreground">Aperçu local uniquement — stockage local en démo, non envoyé.</p>
                </div>
                <Label
                  htmlFor="np-photo"
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-stone-100 dark:border-stone-700 dark:hover:bg-stone-800"
                >
                  <FileImage className="h-3.5 w-3.5" aria-hidden /> Choisir un fichier
                  <input
                    id="np-photo"
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => onPickPhoto(e.target.files?.[0] ?? null)}
                  />
                </Label>
              </div>
              <div className="flex items-center gap-3">
                <ShadowPhoto
                  url={displayPhoto}
                  alt="Aperçu de la photo du point"
                  typology={typologyCode}
                  className="h-20 w-28 shrink-0 rounded-md object-cover"
                />
                <div className="min-w-0 text-xs text-muted-foreground">
                  {photoName ? (
                    <p className="truncate">
                      <Camera className="mr-1 inline h-3 w-3" aria-hidden />
                      {photoName} — conservée sur l&apos;appareil ; le point reçoit la photo indicative de la typologie.
                    </p>
                  ) : (
                    <p>Photo indicative de la typologie par défaut. Le fichier local n&apos;est pas téléversé (démo).</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="np-notes" className="text-xs font-medium">Notes terrain</Label>
                <Textarea
                  id="np-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Contexte, horaires d'activité, récipients, clientèle…"
                  rows={3}
                  className="text-xs"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="np-reporter" className="text-xs font-medium">Recensé par</Label>
                  <Input id="np-reporter" value={reporter} onChange={(e) => setReporter(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Source</Label>
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger className="w-full" aria-label="Source du recensement">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(SHADOW_SOURCE_LABELS).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={submit} disabled={!canSubmit}>
              <Save className="h-4 w-4" aria-hidden />
              {saving ? "Enregistrement…" : "Enregistrer le point"}
            </Button>
            <Button variant="ghost" onClick={resetForm} disabled={saving}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Réinitialiser
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Statut initial : Brut (validation requise) · une alerte est créée si le point est à moins de 500 m d&apos;une station.
            </p>
          </div>
        </div>

        {/* ------------------------------ Aperçu ------------------------------ */}
        <Card className="sticky top-32 border-stone-300 dark:border-stone-700">
          <CardContent className="space-y-3 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Eye className="h-4 w-4 text-stone-500" aria-hidden /> Aperçu temps réel
            </p>

            <div className="rounded-lg border border-dashed border-stone-300 p-3 dark:border-stone-700">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-bold tabular-nums">SM-26-••••</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                  code attribué à l&apos;enregistrement
                </span>
              </div>
              <ShadowPhoto
                url={displayPhoto}
                alt="Photo du futur point"
                typology={typologyCode}
                className="mt-2 h-32 w-full rounded-md object-cover"
              />
              <div className="mt-3 space-y-1.5 text-xs">
                <p className="flex items-center gap-2">
                  <TypologyIcon code={typologyCode} className="h-3.5 w-3.5" aria-hidden />
                  <span className="font-medium">{typologyLabel(typologyCode)}</span>
                </p>
                <p className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                  {gouvernorat || "—"}{delegation ? ` · ${delegation}` : ""}{cite ? ` · ${cite}` : ""}
                </p>
                <p className="tabular-nums text-muted-foreground">
                  {lat != null && lng != null ? `${lat.toFixed(5).replace(".", ",")}, ${lng.toFixed(5).replace(".", ",")}` : "coordonnées non renseignées"}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-stone-50 p-3 text-xs dark:bg-stone-900">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Perte mensuelle estimée</p>
              <p className="mt-0.5 text-lg font-bold tabular-nums" style={{ color: SHADOW_COLORS.red }}>
                {formatTnd(estLoss)}
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {volumeLJ.toLocaleString("fr-FR")} L/j × {MARGIN_TND_PER_L.toFixed(3).replace(".", ",")} DT/L × {DAYS_PER_MONTH.toString().replace(".", ",")} j
              </p>
            </div>

            <div className="rounded-lg border border-stone-200 p-3 text-xs dark:border-stone-800">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Station la plus proche</p>
              {lat == null || lng == null ? (
                <p className="mt-1 text-muted-foreground">Renseignez les coordonnées pour la détection.</p>
              ) : mapStations === null ? (
                <p className="mt-1 text-muted-foreground">Détection en cours…</p>
              ) : nearest ? (
                <div className="mt-1 space-y-1">
                  <p className="font-medium">
                    {nearest.station.name}
                    <span className="ml-2 font-normal text-muted-foreground">{nearest.m.toLocaleString("fr-FR")} m</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    <span
                      className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                      style={{ backgroundColor: nearest.station.brandColor }}
                      aria-hidden
                    />
                    {nearest.station.brandName} · {nearest.station.delegation}
                  </p>
                  {nearest.m < 500 ? (
                    <p
                      className="mt-1 flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-white"
                      style={{ backgroundColor: SHADOW_COLORS.red }}
                    >
                      <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                      &lt; 500 m d&apos;une station → alerte automatique
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-1 text-muted-foreground">Aucune station détectée.</p>
              )}
            </div>

            <div className="rounded-lg bg-stone-50 p-3 text-[11px] leading-relaxed text-muted-foreground dark:bg-stone-900">
              <p><span className="font-semibold">Prix :</span> {priceValue != null && Number.isFinite(priceValue) && priceValue > 0 ? formatMillimes(Math.round(priceValue)) : "non renseigné"}</p>
              <p><span className="font-semibold">Volume :</span> {volumeLJ.toLocaleString("fr-FR")} L/j</p>
              <p><span className="font-semibold">Rapporteur :</span> {reporter || "—"}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

/** Fichier photo indicatif par typologie (miroir de TYPOLOGY_PHOTOS). */
function photoFile(code: string): string {
  const files: Record<string, string> = {
    BIDONS: "bidons-route.png",
    KIOSQUE: "kiosque-essence.png",
    CAMION_CITERNE: "camion-citerne.png",
    STATION_PIRATE: "station-pirate.png",
    GARAGE: "garage-clandestin.png",
    EPICERIE: "epicerie-fuel.png",
  }
  return files[code] ?? "bidons-route.png"
}

/** Repli avant chargement des typologies (libellés + volumes indicatifs). */
const DEFAULT_TYPOLOGIES: { code: string; volumeLJ: number }[] = [
  { code: "BIDONS", volumeLJ: 120 },
  { code: "KIOSQUE", volumeLJ: 250 },
  { code: "CAMION_CITERNE", volumeLJ: 900 },
  { code: "STATION_PIRATE", volumeLJ: 1600 },
  { code: "GARAGE", volumeLJ: 180 },
  { code: "EPICERIE", volumeLJ: 90 },
]
