'use client'

// CarbuScope Mobile — Espace agent (T44-e) : « Recensement parallèle ».
// Écran mobile des contrôleurs terrain pour recenser les vendeurs clandestins
// (bidons, kiosque, camion…). Monté en overlay du téléphone par la vue
// « Agents terrain » — style de l'app agent : bandeau émeraude AgentBand,
// cartes blanches arrondies, chiffres tabular-nums. Workflow : bandeau
// explicatif → derniers points de l'équipe (pull-refresh visuel) →
// signalement (chips typologies, GPS auto + repli manuel, volume, photo) →
// écran de succès « la plateforme vérifiera sous 48 h » (pattern
// agent-success-screen). POST /api/shadow/points { source: "CONTROLEUR" }.

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import {
  Camera, Check, ChevronLeft, Clock3, Fuel, Ghost, Loader2, LocateFixed, MapPin, PartyPopper, RefreshCw, Send, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { ShadowStatusBadge, TypologyIcon, formatLJ, relDateFr, typologyLabel } from "@/components/shadow/shadow-shared"
import type { ShadowPointDTO, ShadowTypologyDTO } from "@/lib/types"
import { AgentBand } from "../agent-shared"
import { USER_POS } from "../shared"

type GovernoratRow = { name: string }

type SuccessInfo = {
  code: string
  typologyCode: string
  volumeLJ: number
  gouvernorat: string
  delegation: string
  alertCreated: boolean
}

export function AgentShadowScreen({ onClose }: { onClose: () => void }) {
  // ---- Données ----
  const [points, setPoints] = useState<ShadowPointDTO[] | null>(null)
  const [typologies, setTypologies] = useState<ShadowTypologyDTO[]>([])
  const [governorats, setGovernorats] = useState<GovernoratRow[]>([])
  const [agentName, setAgentName] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastSync, setLastSync] = useState<string | null>(null)

  // ---- Formulaire ----
  const [typologyCode, setTypologyCode] = useState("")
  const [lat, setLat] = useState(String(USER_POS.lat))
  const [lng, setLng] = useState(String(USER_POS.lng))
  const [gpsBusy, setGpsBusy] = useState(false)
  const [gouvernorat, setGouvernorat] = useState("")
  const [delegation, setDelegation] = useState("")
  const [cite, setCite] = useState("")
  const [volume, setVolume] = useState(120)
  const [price, setPrice] = useState("")
  const [notes, setNotes] = useState("")
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [sending, setSending] = useState(false)
  const [success, setSuccess] = useState<SuccessInfo | null>(null)

  // ---- Chargement initial : points, typologies, gouvernorats, agent ----
  useEffect(() => {
    const ctrl = new AbortController()
    const agentCode = typeof window !== "undefined" ? localStorage.getItem("cs-agent-code") : null
    Promise.all([
      fetch("/api/shadow/points?limit=10&active=true", { signal: ctrl.signal })
        .then(r => (r.ok ? (r.json() as Promise<{ points: ShadowPointDTO[] }>) : Promise.resolve(null)))
        .catch(() => null),
      fetch("/api/shadow/typologies", { signal: ctrl.signal })
        .then(r => (r.ok ? (r.json() as Promise<{ typologies: ShadowTypologyDTO[] }>) : Promise.resolve(null)))
        .catch(() => null),
      fetch("/api/governorats", { signal: ctrl.signal })
        .then(r => (r.ok ? (r.json() as Promise<{ governorats: GovernoratRow[] }>) : Promise.resolve(null)))
        .catch(() => null),
      agentCode
        ? fetch(`/api/missions?agentCode=${encodeURIComponent(agentCode)}`, { signal: ctrl.signal })
            .then(r => (r.ok ? (r.json() as Promise<{ agents?: { code: string; name: string; zone: string }[] }>) : Promise.resolve(null)))
            .catch(() => null)
        : Promise.resolve(null),
    ]).then(([p, t, g, m]) => {
      if (ctrl.signal.aborted) return
      setPoints(p?.points ?? [])
      setTypologies((t?.typologies ?? []).filter(x => x.active))
      setGovernorats(g?.governorats ?? [])
      setLastSync(new Date().toISOString())
      const agent = agentCode ? m?.agents?.find(a => a.code === agentCode) : null
      setAgentName(agent?.name ?? null)
      // Gouvernorat par défaut : la zone de l'agent si c'est un gouvernorat réel.
      const govNames = new Set((g?.governorats ?? []).map(x => x.name))
      if (agent && govNames.has(agent.zone)) setGouvernorat(agent.zone)
    })
    return () => ctrl.abort()
  }, [])

  const refreshPoints = () => {
    setRefreshing(true)
    fetch("/api/shadow/points?limit=10&active=true")
      .then(r => (r.ok ? (r.json() as Promise<{ points: ShadowPointDTO[] }>) : Promise.resolve(null)))
      .then(j => {
        setPoints(j?.points ?? [])
        setLastSync(new Date().toISOString())
      })
      .catch(() => toast.error("Synchronisation impossible", { description: "La liste n'a pas pu être rafraîchie." }))
      .finally(() => setRefreshing(false))
  }

  // ---- GPS auto (repli manuel) ----
  const locate = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.info("GPS indisponible", { description: "Saisissez les coordonnées manuellement ci-dessous." })
      return
    }
    setGpsBusy(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        setLat(pos.coords.latitude.toFixed(5))
        setLng(pos.coords.longitude.toFixed(5))
        setGpsBusy(false)
        toast.success("Position GPS captée", { description: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} — vérifiez le gouvernorat.` })
      },
      () => {
        setGpsBusy(false)
        toast.warning("Position GPS refusée", { description: "Saisissez latitude / longitude manuellement (position de repli : Tunis — Centre)." })
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 },
    )
  }

  // ---- Photo (preview locale) ----
  const onPhoto = (f: File | null) => {
    if (photoUrl) URL.revokeObjectURL(photoUrl)
    if (!f) {
      setPhotoUrl(null)
      return
    }
    setPhotoUrl(URL.createObjectURL(f))
  }

  // ---- Envoi ----
  const submit = () => {
    if (!typologyCode) {
      toast.error("Typologie requise", { description: "Choisissez la nature du point (bidons, kiosque, camion…)." })
      return
    }
    if (!gouvernorat) {
      toast.error("Gouvernorat requis")
      return
    }
    if (delegation.trim().length < 2) {
      toast.error("Délégation requise", { description: "Précisez la délégation (ex. Médenine Nord)." })
      return
    }
    const nLat = Number(lat.replace(",", "."))
    const nLng = Number(lng.replace(",", "."))
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng) || nLat < 29 || nLat > 38 || nLng < 7 || nLng > 12.5) {
      toast.error("Coordonnées invalides", { description: "Latitude 29–38, longitude 7–12,5 (Tunisie) — utilisez le GPS ou corrigez la saisie." })
      return
    }
    setSending(true)
    fetch("/api/shadow/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        typologyCode,
        gouvernorat,
        delegation: delegation.trim(),
        cite: cite.trim() || null,
        lat: nLat,
        lng: nLng,
        volumeLJ: volume,
        priceMillimes: price.trim() ? Number(price.replace(",", ".")) : null,
        notes: notes.trim(),
        reporter: agentName ?? "Contrôleur mobile",
        source: "CONTROLEUR",
      }),
    })
      .then(async r => {
        if (!r.ok) {
          const j = (await r.json().catch(() => null)) as { error?: string } | null
          throw new Error(j?.error ?? "envoi impossible")
        }
        return r.json() as Promise<{ point: ShadowPointDTO; alert: unknown }>
      })
      .then(j => {
        setSuccess({
          code: j.point.code,
          typologyCode: j.point.typologyCode,
          volumeLJ: j.point.volumeLJ,
          gouvernorat: j.point.gouvernorat,
          delegation: j.point.delegation,
          alertCreated: Boolean(j.alert),
        })
        // Le point apparaît en tête de la liste au retour.
        setPoints(prev => (prev ? [j.point, ...prev].slice(0, 10) : [j.point]))
        toast.success("Signalement transmis", { description: `${j.point.code} — statut Brut, vérification plateforme sous 48 h.` })
      })
      .catch(e => {
        toast.error("Envoi impossible", { description: e instanceof Error ? e.message : "Vérifiez les champs puis réessayez." })
      })
      .finally(() => setSending(false))
  }

  const resetForm = () => {
    setTypologyCode("")
    setDelegation("")
    setCite("")
    setVolume(120)
    setPrice("")
    setNotes("")
    onPhoto(null)
    setSuccess(null)
  }

  // =====================================================================
  // Écran de succès (pattern agent-success-screen)
  // =====================================================================
  if (success) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
        <AgentBand
          title="Signalement transmis"
          subtitle="Shadow Market — recensement parallèle"
          onBack={() => setSuccess(null)}
          right={
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E53935]/90 ring-1 ring-white/30">
              <Ghost className="h-4.5 w-4.5 text-white" aria-hidden />
            </span>
          }
        />
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
              <h2 className="mt-4 text-[17px] font-extrabold tracking-tight text-slate-800">Point recensé</h2>
              <p className="mt-1 flex items-center justify-center gap-1.5 text-[11.5px] leading-snug text-slate-500">
                <Clock3 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
                La plateforme vérifiera ce signalement sous 48 h (statut « Brut »).
              </p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.25 }}
              className="mt-4 w-full rounded-2xl border border-slate-200 bg-white p-3.5 text-start shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[14px] font-extrabold tracking-wider text-emerald-700">{success.code}</p>
                <ShadowStatusBadge status="BRUT" />
              </div>
              <div className="mt-2.5 flex items-center gap-2 border-t border-slate-100 pt-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E53935]/10 text-[#E53935]">
                  <TypologyIcon code={success.typologyCode} className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[12px] font-bold leading-tight text-slate-700">{typologyLabel(success.typologyCode)}</p>
                  <p className="text-[10.5px] text-slate-400">
                    {success.gouvernorat} · {success.delegation} — {formatLJ(success.volumeLJ)}
                  </p>
                </div>
              </div>
              {success.alertCreated && (
                <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#E53935]/5 px-2.5 py-2 text-[10.5px] font-semibold leading-snug text-[#C62828]">
                  <PartyPopper className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  Alerte « nouveau point proche station » déclenchée — l&apos;enseigne menacée est notifiée.
                </p>
              )}
              {photoUrl && (
                <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400">
                  <Camera className="h-3 w-3 shrink-0" aria-hidden />
                  Photo jointe au signalement (preview locale).
                </p>
              )}
            </motion.div>
            <Button
              onClick={resetForm}
              className="mt-5 h-11 w-full rounded-xl bg-emerald-600 text-[13.5px] font-bold text-white shadow-md hover:bg-emerald-700"
            >
              Recenser un autre point
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="mt-3 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-400 underline-offset-2 transition-colors hover:text-emerald-700 hover:underline"
            >
              <ChevronLeft className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
              Retour à mes missions
            </button>
          </div>
        </div>
      </div>
    )
  }

  // =====================================================================
  // Écran principal : bandeau + liste + formulaire
  // =====================================================================
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f6f7f5]">
      <AgentBand
        title="Shadow Market — Recensement"
        subtitle="Vendeurs clandestins · photo + GPS"
        onBack={onClose}
        right={
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E53935]/90 ring-1 ring-white/30">
            <Ghost className="h-4.5 w-4.5 text-white" aria-hidden />
          </span>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-3 py-3 pb-6">
        {/* ① Bandeau explicatif */}
        <div className="flex items-start gap-2.5 rounded-2xl border border-[#E53935]/30 bg-[#E53935]/5 p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#E53935]/15 text-[#E53935]">
            <Ghost className="h-4 w-4" aria-hidden />
          </span>
          <p className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">
            <strong className="text-slate-800 dark:text-slate-100">Recensement parallèle.</strong> Photographiez et
            géolocalisez un vendeur clandestin — bidons, kiosque, camion… Chaque signalement alimente la carte du
            marché parallèle et les alertes des stations proches.
          </p>
        </div>

        {/* ② Derniers points recensés par l'équipe */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
              <MapPin className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
              Derniers points de l&apos;équipe
            </h2>
            <button
              type="button"
              onClick={refreshPoints}
              disabled={refreshing}
              aria-label="Rafraîchir la liste des points"
              className="ms-auto flex h-7 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 text-[10px] font-bold text-slate-500 transition-colors hover:border-emerald-300 hover:text-emerald-700 disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} aria-hidden />
              {refreshing ? "Sync…" : "Actualiser"}
            </button>
          </div>
          {points === null ? (
            <div className="h-28 animate-pulse rounded-2xl bg-white" />
          ) : points.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-center text-[11px] text-slate-400">
              Aucun point recensé pour l&apos;instant — le premier signalement ouvrira la liste.
            </p>
          ) : (
            <div className="space-y-1.5">
              {points.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-sm"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${(typologies.find(t => t.code === p.typologyCode)?.color ?? "#9E9E9E")}22`, color: typologies.find(t => t.code === p.typologyCode)?.color ?? "#9E9E9E" }}
                    aria-hidden
                  >
                    <TypologyIcon code={p.typologyCode} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5">
                      <span className="font-mono text-[10.5px] font-bold tracking-wide text-slate-700">{p.code}</span>
                      <span className="truncate text-[10.5px] text-slate-400">{p.delegation}</span>
                    </p>
                    <p className="mt-0.5 text-[10px] leading-none text-slate-400">
                      {typologyLabel(p.typologyCode)} · {formatLJ(p.volumeLJ)} · {relDateFr(p.firstSeenAt)}
                    </p>
                  </div>
                  <ShadowStatusBadge status={p.status} />
                </div>
              ))}
              {lastSync && (
                <p className="pt-0.5 text-center text-[9.5px] text-slate-400">
                  Synchronisé {relDateFr(lastSync)} — tirez la liste ou « Actualiser » pour rafraîchir.
                </p>
              )}
            </div>
          )}
        </section>

        {/* ③ Formulaire « Signaler un point » */}
        <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">
            <Send className="h-3.5 w-3.5 text-[#E53935]" aria-hidden />
            Signaler un point
          </h2>

          {/* Typologie — chips horizontales */}
          <Label className="text-[10.5px] font-bold text-slate-500">Nature du point</Label>
          <div className="mt-1.5 -mx-3.5 flex gap-1.5 overflow-x-auto px-3.5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {typologies.map(t => {
              const selected = typologyCode === t.code
              return (
                <button
                  key={t.code}
                  type="button"
                  onClick={() => setTypologyCode(t.code)}
                  aria-pressed={selected}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[10.5px] font-bold transition-all active:scale-95",
                    selected
                      ? "border-[#E53935] bg-[#E53935]/10 text-[#C62828]"
                      : "border-slate-200 bg-white text-slate-500 hover:border-[#E53935]/40",
                  )}
                >
                  <TypologyIcon code={t.code} className="h-3.5 w-3.5" />
                  {t.label.length > 18 ? `${t.label.slice(0, 17)}…` : t.label}
                </button>
              )
            })}
            {typologies.length === 0 && <span className="text-[10.5px] text-slate-400">Catalogue en chargement…</span>}
          </div>

          {/* GPS + coordonnées */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10.5px] font-bold text-slate-500">Position</Label>
              <button
                type="button"
                onClick={locate}
                disabled={gpsBusy}
                className="flex h-7 items-center gap-1 rounded-full bg-emerald-50 px-2.5 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
              >
                {gpsBusy ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : <LocateFixed className="h-3 w-3" aria-hidden />}
                {gpsBusy ? "Recherche…" : "GPS auto"}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                value={lat}
                onChange={e => setLat(e.target.value)}
                inputMode="decimal"
                aria-label="Latitude"
                className="h-9 text-[11px] font-mono"
                placeholder="36.8065"
              />
              <Input
                value={lng}
                onChange={e => setLng(e.target.value)}
                inputMode="decimal"
                aria-label="Longitude"
                className="h-9 text-[11px] font-mono"
                placeholder="10.1815"
              />
            </div>
            <p className="text-[9.5px] leading-snug text-slate-400">
              GPS auto si autorisé — sinon repli manuel (Tunis — Centre par défaut, Tunisie : lat 29–38, lng 7–12,5).
            </p>
          </div>

          {/* Localisation administrative */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[10.5px] font-bold text-slate-500">Gouvernorat</Label>
              <Select value={gouvernorat || undefined} onValueChange={setGouvernorat}>
                <SelectTrigger className="h-9 w-full text-[11px]" aria-label="Gouvernorat">
                  <SelectValue placeholder="Sélectionner…" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {governorats.map(g => (
                    <SelectItem key={g.name} value={g.name} className="text-xs">
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10.5px] font-bold text-slate-500">Délégation</Label>
              <Input
                value={delegation}
                onChange={e => setDelegation(e.target.value)}
                aria-label="Délégation"
                className="h-9 text-[11px]"
                placeholder="ex. Ben Guerdane"
              />
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <Label className="text-[10.5px] font-bold text-slate-500">Cité / lieu (optionnel)</Label>
            <Input value={cite} onChange={e => setCite(e.target.value)} aria-label="Cité" className="h-9 text-[11px]" placeholder="ex. Cité Ennour, route de Ras Jedir" />
          </div>

          {/* Volume */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10.5px] font-bold text-slate-500">Volume écoulé</Label>
              <span className="text-[12.5px] font-extrabold tabular-nums text-slate-800">
                {volume.toLocaleString("fr-FR")} <span className="text-[9.5px] font-semibold text-slate-400">L/j</span>
              </span>
            </div>
            <Slider
              value={[volume]}
              onValueChange={vals => setVolume(vals[0] ?? 120)}
              min={10}
              max={2000}
              step={10}
              aria-label="Volume journalier en litres"
              className="py-1"
            />
            <div className="flex justify-between text-[9px] font-semibold text-slate-400">
              <span>10 L/j</span>
              <span>2 000 L/j</span>
            </div>
          </div>

          {/* Prix */}
          <div className="mt-2 space-y-1">
            <Label className="text-[10.5px] font-bold text-slate-500">Prix constaté (millimes / L — optionnel)</Label>
            <Input
              value={price}
              onChange={e => setPrice(e.target.value)}
              inputMode="numeric"
              aria-label="Prix en millimes"
              className="h-9 text-[11px]"
              placeholder="ex. 1780 (≈ prix officiel)"
            />
          </div>

          {/* Photo */}
          <div className="mt-3 space-y-1.5">
            <Label className="text-[10.5px] font-bold text-slate-500">Photo</Label>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              aria-label="Photo du point informel"
              onChange={e => onPhoto(e.target.files?.[0] ?? null)}
            />
            {photoUrl ? (
              <div className="flex items-center gap-2.5 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/60 p-2.5">
                <img src={photoUrl} alt="Aperçu de la photo du point informel" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                <span className="min-w-0 flex-1 text-[10.5px] font-semibold text-slate-600">
                  Photo attachée (preview locale)
                  <span className="block text-[9.5px] font-normal text-slate-400">Géolocalisée avec le signalement</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onPhoto(null)
                    if (photoInputRef.current) photoInputRef.current.value = ""
                  }}
                  aria-label="Retirer la photo"
                  className="shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-3 text-[11px] font-medium text-slate-500 transition-colors hover:border-[#E53935]/50 hover:bg-[#E53935]/5 hover:text-[#C62828]"
              >
                <Camera className="h-4 w-4" aria-hidden />
                Photographier le point
              </button>
            )}
          </div>

          {/* Notes */}
          <div className="mt-3 space-y-1">
            <Label className="text-[10.5px] font-bold text-slate-500">Notes courtes</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              aria-label="Notes"
              className="text-[11px]"
              placeholder="ex. Vente en bidons de 20 L, afflux en fin de journée"
            />
          </div>

          {/* Rapporteur + envoi */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] text-slate-400">
              <Fuel className="h-3 w-3 shrink-0 text-emerald-600" aria-hidden />
              {agentName ? (
                <>Signalement signé <strong className="text-slate-600">{agentName}</strong> (code agent enregistré).</>
              ) : (
                <>Aucun code agent enregistré — signalement signé « Contrôleur mobile » (connectez-vous dans l&apos;espace agent pour signer).</>
              )}
            </p>
            <Button
              onClick={submit}
              disabled={sending}
              className="h-11 w-full rounded-xl bg-[#E53935] text-[13px] font-bold text-white shadow-md transition-colors hover:bg-[#d32f2f]"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
              {sending ? "Envoi du signalement…" : "Envoyer le signalement"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
