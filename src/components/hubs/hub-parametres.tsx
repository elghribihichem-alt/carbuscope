'use client'

// CarbuScope — T54-Cb — Module 2 « Mobility Hub Operations », volet 5/5 :
// « Paramètres TMP ». Configuration d'exploitation par hub (données
// /api/hubs + /api/hubs/settings + PATCH /api/hubs) :
//   a) « Identité & exploitation » : formulaire d'édition (nom, adresse,
//      responsable, téléphone +216, surface, trafic journalier, CA mensuel
//      éditable avec badge « est. » — les hubs PLANNED affichent « — » pour
//      trafic/CA, zéro casse) + TIMELINE verticale du cycle de vie à SENS
//      UNIQUE (Planifié → En construction → Actif → Fermé) avec action
//      « Passer à l'étape suivante » sous AlertDialog explicite (l'ouverture
//      horodate openedAt — conséquence documentée, pas de retour arrière) ;
//   b) « Horaires & tarifs » : grille 7 jours éditable (créneaux HH:MM-HH:MM
//      pré-remplis 06:00-22:00 + « Appliquer à tous »), tarifs par
//      prestation min-max DT (lavage/vidange/pneus par défaut, « Suggérer
//      depuis les services » relit les tarifs réels du hub),
//      Enregistrer h-11 → PUT + toast + « dernière mise à jour : date +
//      e-mail ». Aucun paramètre enregistré → pré-remplissage par défaut
//      présenté comme tel (défaut vide honnête).
// Panneaux remontés par clé hubId (état neuf à chaque changement de hub —
// pattern dialogs T54-Ca, aucun setState synchrone dans les effets).

import { useEffect, useMemo, useState } from "react"
import type * as React from "react"
import { toast } from "sonner"
import {
  ArrowRight, Building2, CalendarClock, Clock, Coins, Gauge, Lightbulb,
  Loader2, MapPin, Phone, Ruler, Save, Settings, User,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { ErrorState, Skeleton, TabSkeleton } from "@/components/shell/loading"
import { num } from "@/lib/chart"
import {
  HUB_STATUS_META, dateFr, priceFr,
  type HubDTO, type HubServiceDTO, type HubSettingDTO,
} from "./hub-shared"

/* ============================== Constantes ============================== */

/** Les 7 jours (clés du modèle HubSetting + libellés FR affichés). */
const DAYS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "lundi", label: "Lundi" },
  { key: "mardi", label: "Mardi" },
  { key: "mercredi", label: "Mercredi" },
  { key: "jeudi", label: "Jeudi" },
  { key: "vendredi", label: "Vendredi" },
  { key: "samedi", label: "Samedi" },
  { key: "dimanche", label: "Dimanche" },
]

/** Créneau par défaut (pré-remplissage, jamais présenté comme enregistré). */
const DEFAULT_SLOT = "06:00-22:00"

/** Prestations de repli quand le hub n'a pas encore de service actif. */
const DEFAULT_TARIFS: Record<string, { min: number; max: number }> = {
  lavage: { min: 20, max: 35 },
  vidange: { min: 80, max: 160 },
  pneus: { min: 60, max: 180 },
}

/** Catégories de services → prestation des tarifs (suggestion réelle). */
const CATEGORY_TO_TARIF: Readonly<Record<string, { key: string; label: string }>> = {
  LAVAGE: { key: "lavage", label: "Lavage" },
  VIDANGE: { key: "vidange", label: "Vidange" },
  PNEUS: { key: "pneus", label: "Pneus" },
  RECHARGE: { key: "recharge", label: "Recharge VE" },
  LAVERIE: { key: "laverie", label: "Laverie" },
  RELAIS: { key: "relais", label: "Relais colis" },
}

/** Cycle de vie à sens unique (miroir serveur — spec T54-Cb). */
const LIFECYCLE: ReadonlyArray<{ status: string; label: string; hint: string }> = [
  { status: "PLANNED", label: "Planifié", hint: "Site identifié — dossier d'implantation en cours." },
  { status: "CONSTRUCTION", label: "En construction", hint: "Travaux en cours, préparation de l'ouverture." },
  { status: "ACTIVE", label: "Actif", hint: "En exploitation — trafic capteur et CA consolidés." },
  { status: "CLOSED", label: "Fermé", hint: "Cessation d'exploitation (statut terminal — V1)." },
]

/** Prestation des tarifs → libellé FR affiché (suggestion depuis catégories). */
const TARIFF_LABELS: Readonly<Record<string, string>> = {
  lavage: "Lavage",
  vidange: "Vidange",
  pneus: "Pneus",
  recharge: "Recharge VE",
  laverie: "Laverie",
  relais: "Relais colis",
}

const labelOfTarif = (key: string): string =>
  TARIFF_LABELS[key] ?? key.charAt(0).toUpperCase() + key.slice(1)

const SLOT_RE = /^([01]\d|2[0-3]):([0-5]\d)-([01]\d|2[0-3]):([0-5]\d)$/

/* ============================== Panneau a) Identité & exploitation ============================== */

function HubIdentityPanel({
  hub,
  onSaved,
}: {
  hub: HubDTO
  onSaved: (hub: HubDTO) => void
}) {
  const isPlanned = hub.status === "PLANNED"
  const [name, setName] = useState(hub.name)
  const [address, setAddress] = useState(hub.address)
  const [manager, setManager] = useState(hub.manager ?? "")
  const [phone, setPhone] = useState(hub.phone ?? "")
  const [surface, setSurface] = useState(hub.surfaceM2 != null ? String(hub.surfaceM2) : "")
  const [traffic, setTraffic] = useState(String(hub.dailyVehicles))
  const [revenue, setRevenue] = useState(String(hub.monthlyRevenue))
  const [saving, setSaving] = useState(false)

  // ---- Étape suivante du cycle de vie (AlertDialog explicite) ----
  const idx = LIFECYCLE.findIndex(s => s.status === hub.status)
  const next = idx >= 0 && idx < LIFECYCLE.length - 1 ? LIFECYCLE[idx + 1] : null
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [stepping, setStepping] = useState(false)

  const saveIdentity = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        id: hub.id,
        name: name.trim(),
        address: address.trim(),
        manager: manager.trim() || null,
        phone: phone.trim() || null,
        surfaceM2: surface.trim() === "" ? undefined : Number(surface),
      }
      // Zéro casse : les hubs PLANNED n'ont ni trafic ni CA (invariant seed
      // T54-A1) — ces champs restent « — » jusqu'à l'ouverture.
      if (!isPlanned) {
        body.dailyVehicles = traffic.trim() === "" ? undefined : Number(traffic)
        body.monthlyRevenue = revenue.trim() === "" ? undefined : Number(revenue.replace(",", "."))
      }
      const r = await fetch("/api/hubs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = (await r.json()) as { hub?: HubDTO; error?: string }
      if (!r.ok || !json.hub) {
        toast.error("Enregistrement impossible", {
          description: json.error ?? `Erreur ${r.status}`,
        })
        return
      }
      onSaved(json.hub)
      toast.success(`« ${json.hub.name} » mis à jour`, {
        description: "Identité et exploitation enregistrées — action tracée dans le journal.",
      })
    } catch {
      toast.error("Enregistrement impossible — vérifiez votre connexion.")
    } finally {
      setSaving(false)
    }
  }

  const stepForward = async () => {
    if (!next) return
    setStepping(true)
    try {
      const r = await fetch("/api/hubs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: hub.id, status: next.status }),
      })
      const json = (await r.json()) as { hub?: HubDTO; error?: string }
      if (!r.ok || !json.hub) {
        toast.error("Transition impossible", { description: json.error ?? `Erreur ${r.status}` })
        return
      }
      onSaved(json.hub)
      toast.success(
        next.status === "ACTIVE"
          ? `« ${json.hub.name} » est ACTIF — ouverture horodatée`
          : `« ${json.hub.name} » passe à « ${next.label} »`,
        {
          description:
            next.status === "ACTIVE"
              ? `openedAt = ${dateFr(json.hub.openedAt)} — le trafic et le CA seront consolidés.`
              : "Cycle de vie à sens unique — aucune marche arrière en V1.",
        },
      )
      setConfirmOpen(false)
    } catch {
      toast.error("Transition impossible — vérifiez votre connexion.")
    } finally {
      setStepping(false)
    }
  }

  const field = (
    label: string,
    value: string,
    setter: (v: string) => void,
    opts: { icon: React.ComponentType<{ className?: string }>; placeholder?: string; type?: string; suffix?: string; badge?: string; disabled?: boolean; hint?: string } = { icon: Building2 },
  ) => (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <opts.icon className="h-3.5 w-3.5" aria-hidden /> {label}
        {opts.badge && (
          <Badge variant="outline" className="h-4 px-1 text-[10px] text-muted-foreground">
            {opts.badge}
          </Badge>
        )}
      </Label>
      <div className="relative">
        <Input
          className="h-11 pr-14"
          value={opts.disabled ? "" : value}
          placeholder={opts.disabled ? "—" : opts.placeholder}
          type={opts.type ?? "text"}
          inputMode={opts.type === "number" ? "numeric" : undefined}
          disabled={opts.disabled}
          onChange={e => setter(e.target.value)}
          aria-label={label}
        />
        {opts.suffix && !opts.disabled && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {opts.suffix}
          </span>
        )}
      </div>
      {opts.hint && <p className="text-[11px] leading-snug text-muted-foreground">{opts.hint}</p>}
    </div>
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          Identité &amp; exploitation
          <Badge variant="outline" className="font-mono text-[10px]">{hub.code}</Badge>
        </CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Fiche du site et indicateurs d&apos;exploitation — chaque enregistrement est tracé dans
          le journal d&apos;audit (module HUBS).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {field("Nom du hub", name, setName, { icon: Building2, placeholder: "Hub Multiservice…" })}
          {field("Responsable", manager, setManager, {
            icon: User, placeholder: "Prénom Nom (vide = non affecté)",
          })}
          {field("Adresse", address, setAddress, {
            icon: MapPin, placeholder: "RN1 — zone industrielle…",
          })}
          {field("Téléphone", phone, setPhone, {
            icon: Phone, placeholder: "+216 71 234 567",
          })}
          {field("Surface", surface, setSurface, {
            icon: Ruler, type: "number", suffix: "m²", placeholder: "2800",
          })}
          {field("Trafic journalier", traffic, setTraffic, {
            icon: Gauge,
            type: "number",
            suffix: "véh./j",
            badge: "est.",
            placeholder: "1240",
            disabled: isPlanned,
            hint: isPlanned
              ? "Hub planifié — le trafic capteur sera mesuré à l'ouverture."
              : "Véhicules/jour détectés par les capteurs du hub.",
          })}
          {field("CA mensuel", revenue, setRevenue, {
            icon: Coins,
            type: "number",
            suffix: "DT",
            badge: "est.",
            placeholder: "96800",
            disabled: isPlanned,
            hint: isPlanned
              ? "Hub planifié — pas de CA avant l'ouverture (« — »)."
              : "CA services mensuel consolidé (estimation éditable).",
          })}
        </div>

        <Button className="h-11 gap-1.5" onClick={saveIdentity} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Enregistrer l&apos;identité
        </Button>

        <Separator />

        {/* ---- Timeline du cycle de vie (sens unique) ---- */}
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <CalendarClock className="h-3.5 w-3.5" aria-hidden /> Cycle de vie du site
          </p>
          <ol className="mt-3 space-y-0" aria-label="Cycle de vie du hub">
            {LIFECYCLE.map((step, i) => {
              const current = step.status === hub.status
              const past = i < idx
              const future = i > idx
              const meta = HUB_STATUS_META[step.status]
              return (
                <li key={step.status} className="relative flex gap-3 pb-4 last:pb-0">
                  {/* Trait vertical de liaison */}
                  {i < LIFECYCLE.length - 1 && (
                    <span
                      className={`absolute left-[13px] top-6 h-[calc(100%-14px)] w-0.5 ${past ? "bg-emerald-400 dark:bg-emerald-700" : "bg-border"}`}
                      aria-hidden
                    />
                  )}
                  <span
                    className={`relative z-10 mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 ${
                      current
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950"
                        : past
                          ? "border-emerald-400 bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/50"
                          : "border-dashed border-muted-foreground/40 bg-background"
                    }`}
                    aria-current={current ? "step" : undefined}
                  >
                    <span className={`h-2.5 w-2.5 rounded-full ${current ? meta?.dot ?? "bg-emerald-500" : past ? "bg-emerald-400 dark:bg-emerald-600" : "bg-muted-foreground/30"}`} aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${current ? "" : "text-muted-foreground"}`}>
                      {step.label}
                      {current && (
                        <Badge variant="outline" className={`ml-2 align-middle text-[10px] ${meta?.badge ?? ""}`}>
                          actuel
                        </Badge>
                      )}
                    </p>
                    <p className="text-[11px] leading-snug text-muted-foreground">{step.hint}</p>
                    {step.status === "ACTIVE" && hub.openedAt && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        Ouvert le <span className="font-medium text-foreground">{dateFr(hub.openedAt)}</span>
                      </p>
                    )}
                    {future && step.status === "CLOSED" && (
                      <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                        Statut terminal — le hub ne peut plus être rouvert en V1.
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>

          {next ? (
            <div className="mt-2">
              <Button
                variant="outline"
                className="h-11 gap-1.5 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900"
                onClick={() => setConfirmOpen(true)}
              >
                <ArrowRight className="h-4 w-4" aria-hidden />
                Passer à l&apos;étape suivante — « {next.label} »
              </Button>
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Passer « {hub.name} » à « {next.label} » ?
                    </AlertDialogTitle>
                    {/* AlertDialogDescription rend un <p> : les enfants sont des
                        <div> (imbrication p > p invalide en HTML → erreur
                        d'hydratation, corrigée en finalisation T54-Cb). */}
                    <AlertDialogDescription asChild>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div>
                          {next.status === "CONSTRUCTION" &&
                            "Le hub quittera le stade « Planifié » pour la phase de travaux — il restera sans trafic ni CA tant que l'ouverture n'aura pas eu lieu."}
                          {next.status === "ACTIVE" &&
                            "L'OUVERTURE sera horodatée (champ openedAt) : le trafic capteur et le CA mensuel seront consolidés à partir de cette date, et le hub deviendra actif sur la carte et dans les analytics."}
                          {next.status === "CLOSED" &&
                            "Cessation DÉFINITIVE d'exploitation : les services ne seront plus proposés et le hub sortira du réseau actif (statut terminal, aucune réouverture en V1)."}
                        </div>
                        <div className="font-medium text-foreground">
                          Action à sens unique — il n&apos;y a pas de retour arrière en V1.
                        </div>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="h-11">Annuler</AlertDialogCancel>
                    <AlertDialogAction
                      className="h-11 gap-1.5"
                      disabled={stepping}
                      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                        // L'action est asynchrone : on garde le dialogue
                        // ouvert jusqu'au résultat (fermeture manuelle après
                        // toast) et l'on bloque le double-clic.
                        e.preventDefault()
                        void stepForward()
                      }}
                    >
                      {stepping ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
                      Confirmer la transition
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ) : (
            <p className="mt-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Statut terminal atteint — plus aucune transition possible (V1 : cycle de vie à sens
              unique, pas de réouverture).
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* ============================== Panneau b) Horaires & tarifs ============================== */

type TarifRow = { key: string; label: string; min: string; max: string }

function HubSettingsPanel({ hub }: { hub: HubDTO }) {
  const [setting, setSetting] = useState<HubSettingDTO | null>(null)
  const [loading, setLoading] = useState(true)
  const [slots, setSlots] = useState<Record<string, string>>(() =>
    Object.fromEntries(DAYS.map(d => [d.key, DEFAULT_SLOT])),
  )
  const [tarifs, setTarifs] = useState<TarifRow[]>(() => [
    { key: "lavage", label: "Lavage", min: String(DEFAULT_TARIFS.lavage.min), max: String(DEFAULT_TARIFS.lavage.max) },
    { key: "vidange", label: "Vidange", min: String(DEFAULT_TARIFS.vidange.min), max: String(DEFAULT_TARIFS.vidange.max) },
    { key: "pneus", label: "Pneus", min: String(DEFAULT_TARIFS.pneus.min), max: String(DEFAULT_TARIFS.pneus.max) },
  ])
  const [saving, setSaving] = useState(false)
  const [suggestInfo, setSuggestInfo] = useState<string | null>(null)

  // ---- Lecture du setting enregistré (défauts si null — présentés comme tels) ----
  useEffect(() => {
    const ctrl = new AbortController()
    setLoading(true)
    fetch(`/api/hubs/settings?hubId=${encodeURIComponent(hub.id)}`, { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/hubs/settings → ${r.status}`)
        return (await r.json()) as { setting: HubSettingDTO | null }
      })
      .then(d => {
        if (d.setting) {
          setSetting(d.setting)
          setSlots(prev => ({ ...prev, ...d.setting!.horaires }))
          const rows: TarifRow[] = Object.entries(d.setting.tarifs).map(([k, v]) => ({
            key: k,
            label: labelOfTarif(k),
            min: String(v.min),
            max: String(v.max),
          }))
          if (rows.length > 0) setTarifs(rows)
        } else {
          setSetting(null)
        }
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setLoading(false)
      })
    return () => ctrl.abort()
  }, [hub.id])

  // ---- « Suggérer depuis les services » : bornes réelles du hub ----
  const suggestFromServices = async () => {
    try {
      const r = await fetch(`/api/hubs/services?hubId=${encodeURIComponent(hub.id)}`)
      if (!r.ok) throw new Error(`Erreur ${r.status}`)
      const d = (await r.json()) as { services: HubServiceDTO[] }
      const active = d.services.filter(s => s.status === "ACTIVE" && s.price != null)
      const rows: TarifRow[] = []
      for (const [cat, meta] of Object.entries(CATEGORY_TO_TARIF)) {
        const prices = active
          .filter(s => s.category === cat && s.price != null)
          .map(s => s.price as number)
        if (prices.length > 0) {
          rows.push({
            key: meta.key,
            label: meta.label,
            min: String(Math.min(...prices)),
            max: String(Math.max(...prices)),
          })
        }
      }
      if (rows.length === 0) {
        toast.info("Aucun service tarifé actif sur ce hub", {
          description: "La suggestion relit les tarifs des services ACTIFS du hub — ajoutez-en depuis le volet « Gestion des services ».",
        })
        return
      }
      setTarifs(rows)
      setSuggestInfo(`${rows.length} prestation(s) suggérée(s) depuis ${active.length} service(s) actif(s) tarifé(s) du hub`)
      toast.success("Tarifs suggérés depuis les services du hub", {
        description: "Bornes min/max recalculées sur les services actifs — ajustez puis enregistrez.",
      })
    } catch {
      toast.error("Suggestion impossible — vérifiez votre connexion.")
    }
  }

  // ---- Validation locale + PUT ----
  const saveSettings = async () => {
    // Validation des créneaux (miroir serveur — messages FR).
    for (const d of DAYS) {
      const v = (slots[d.key] ?? "").trim()
      if (!SLOT_RE.test(v)) {
        toast.error(`Horaire « ${d.label} » invalide`, {
          description: `« ${v || "—"} » — format attendu HH:MM-HH:MM (ex. ${DEFAULT_SLOT}).`,
        })
        return
      }
      const [, oh, om, fh, fm] = SLOT_RE.exec(v)!
      if (Number(oh) * 60 + Number(om) >= Number(fh) * 60 + Number(fm)) {
        toast.error(`Horaire « ${d.label} » incohérent`, {
          description: `« ${v} » — l'ouverture doit précéder la fermeture.`,
        })
        return
      }
    }
    const bodyTarifs: Record<string, { min: number; max: number }> = {}
    for (const t of tarifs) {
      const min = Number(t.min.replace(",", "."))
      const max = Number(t.max.replace(",", "."))
      if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < 0) {
        toast.error(`Tarif « ${t.label} » invalide`, {
          description: "Les bornes min et max doivent être des montants positifs en DT.",
        })
        return
      }
      if (min > max) {
        toast.error(`Tarif « ${t.label} » incohérent`, {
          description: `Le minimum (${min} DT) dépasse le maximum (${max} DT).`,
        })
        return
      }
      bodyTarifs[t.key.trim().toLowerCase()] = { min, max }
    }
    setSaving(true)
    try {
      const r = await fetch("/api/hubs/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hubId: hub.id,
          horaires: Object.fromEntries(DAYS.map(d => [d.key, slots[d.key].trim()])),
          tarifs: bodyTarifs,
        }),
      })
      const json = (await r.json()) as { setting?: HubSettingDTO; error?: string }
      if (!r.ok || !json.setting) {
        toast.error("Enregistrement impossible", { description: json.error ?? `Erreur ${r.status}` })
        return
      }
      setSetting(json.setting)
      toast.success("Horaires & tarifs enregistrés", {
        description: `${hub.code} — paramètres d'exploitation tracés dans le journal (module HUBS).`,
      })
    } catch {
      toast.error("Enregistrement impossible — vérifiez votre connexion.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4 sm:p-6" aria-busy="true">
          <Skeleton className="h-5 w-52" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 rounded-lg" />)}
          </div>
          <Skeleton className="h-11 w-40 rounded-lg" />
        </CardContent>
      </Card>
    )
  }

  const majFr = setting
    ? `${new Date(setting.updatedAt).toLocaleString("fr-TN", { dateStyle: "long", timeStyle: "short" })} · ${setting.updatedBy ?? "—"}`
    : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
          Horaires &amp; tarifs
        </CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {setting
            ? "Paramètres d'exploitation enregistrés pour ce hub — modifiables à tout moment."
            : "Aucun paramètre enregistré pour ce hub — les champs ci-dessous sont des pré-remplissages par défaut (06:00-22:00, bornes indicatives) tant qu'ils ne sont pas enregistrés."}
        </p>
        {majFr && (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <CalendarClock className="h-3 w-3" aria-hidden />
            Dernière mise à jour : {majFr}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ---- Grille 7 jours ---- */}
        <div>
          <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden /> Horaires d&apos;ouverture (7 jours)
            </p>
            <Button
              variant="outline"
              className="h-9 gap-1.5 text-xs"
              onClick={() =>
                setSlots(prev => {
                  const ref = prev.lundi?.trim() || DEFAULT_SLOT
                  return Object.fromEntries(DAYS.map(d => [d.key, d.key === "lundi" ? prev.lundi : ref]))
                })
              }
              title="Applique le créneau du lundi aux six autres jours"
            >
              Appliquer à tous
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DAYS.map(d => (
              <div key={d.key} className="space-y-1.5">
                <Label htmlFor={`slot-${d.key}`} className="text-xs font-medium text-muted-foreground">
                  {d.label}
                </Label>
                <Input
                  id={`slot-${d.key}`}
                  className="h-11 font-mono text-[13px] tabular-nums"
                  value={slots[d.key] ?? ""}
                  placeholder={DEFAULT_SLOT}
                  onChange={e => setSlots(prev => ({ ...prev, [d.key]: e.target.value }))}
                  aria-label={`Horaire du ${d.label}`}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            Format « HH:MM-HH:MM » — la validation refuse un créneau incohérent (fermeture avant
            ouverture).
          </p>
        </div>

        <Separator />

        {/* ---- Tarifs par prestation ---- */}
        <div>
          <div className="mb-2 flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Coins className="h-3.5 w-3.5" aria-hidden /> Tarifs par prestation (DT)
            </p>
            <Button
              variant="outline"
              className="h-9 gap-1.5 text-xs"
              onClick={() => void suggestFromServices()}
              title="Relit les bornes min/max des services ACTIFS du hub"
            >
              <Lightbulb className="h-3.5 w-3.5" aria-hidden /> Suggérer depuis les services
            </Button>
          </div>
          {suggestInfo && (
            <p className="mb-2 text-[11px] text-muted-foreground">{suggestInfo}</p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {tarifs.map((t, i) => (
              <div key={t.key} className="space-y-1.5 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-xs font-semibold">{t.label}</Label>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">min – max</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground" htmlFor={`tarif-min-${i}`}>Minimum</Label>
                    <Input
                      id={`tarif-min-${i}`}
                      className="h-11 tabular-nums"
                      value={t.min}
                      inputMode="decimal"
                      onChange={e => setTarifs(prev => prev.map((x, j) => (j === i ? { ...x, min: e.target.value } : x)))}
                      aria-label={`Tarif minimum ${t.label}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground" htmlFor={`tarif-max-${i}`}>Maximum</Label>
                    <Input
                      id={`tarif-max-${i}`}
                      className="h-11 tabular-nums"
                      value={t.max}
                      inputMode="decimal"
                      onChange={e => setTarifs(prev => prev.map((x, j) => (j === i ? { ...x, max: e.target.value } : x)))}
                      aria-label={`Tarif maximum ${t.label}`}
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {priceFr(Number(t.min.replace(",", ".")) || 0)} → {priceFr(Number(t.max.replace(",", ".")) || 0)}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            Bornes indicatives par prestation (min ≤ max, montants en dinars
            tunisien). La suggestion relit les services actifs du hub ; les bornes
            restent ajustables avant enregistrement.
          </p>
        </div>

        <Button className="h-11 gap-1.5" onClick={() => void saveSettings()} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Save className="h-4 w-4" aria-hidden />}
          Enregistrer horaires &amp; tarifs
        </Button>
      </CardContent>
    </Card>
  )
}

/* ============================== Volet ============================== */

export function HubParametres({ preselect }: { preselect: string }) {
  // ---- Hubs (sélecteur, une passe abortable) ----
  const [hubs, setHubs] = useState<HubDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [hubId, setHubId] = useState("")

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/hubs", { signal: ctrl.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`/api/hubs → ${r.status}`)
        return (await r.json()) as { hubs: HubDTO[] }
      })
      .then(d => {
        setHubs(d.hubs ?? [])
        setError(null)
        setHubId(prev =>
          prev ||
          d.hubs.find(h => h.id === preselect)?.id ||
          d.hubs[0]?.id ||
          "",
        )
      })
      .catch((e: unknown) => {
        if (e instanceof Error && e.name === "AbortError") return
        setError(e instanceof Error ? e.message : "Erreur inconnue")
      })
    return () => ctrl.abort()
  }, [reloadKey, preselect])

  const hub = useMemo(() => hubs?.find(h => h.id === hubId) ?? null, [hubs, hubId])

  /** Applique un hub muté (PATCH identité ou transition) au sélecteur. */
  const applyHub = (next: HubDTO) =>
    setHubs(prev => (prev ? prev.map(h => (h.id === next.id ? next : h)) : prev))

  if (error !== null) {
    return <ErrorState message={error} retry={() => setReloadKey(k => k + 1)} />
  }
  if (hubs === null) {
    return <TabSkeleton title="Chargement des paramètres TMP…" />
  }

  return (
    <div className="min-w-0 space-y-4">
      {/* ---- Sélecteur de hub : cartes défilantes (présélection nav.hubsSel) ---- */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Settings className="h-3.5 w-3.5" aria-hidden /> Terminal Multi-Services
        </p>
        <div
          className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]"
          role="list"
          aria-label="Sélecteur de hub"
        >
          {hubs.map(h => {
            const meta = HUB_STATUS_META[h.status]
            const isSel = h.id === hubId
            return (
              <button
                key={h.id}
                role="listitem"
                onClick={() => setHubId(h.id)}
                aria-current={isSel ? "true" : undefined}
                className={`min-w-[210px] shrink-0 rounded-lg border p-3 text-left transition-colors ${
                  isSel
                    ? "border-emerald-500 bg-emerald-50/60 ring-1 ring-emerald-500/40 dark:bg-emerald-950/40"
                    : "hover:bg-accent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono text-[10px] tracking-tight">{h.code}</Badge>
                  {meta && (
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <span className={`inline-block h-2 w-2 rounded-full ${meta.dot}`} aria-hidden />
                      {meta.label}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 truncate text-[13px] font-medium">{h.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {h.gouvernorat} ·{" "}
                  {h.status === "PLANNED"
                    ? "trafic/CA : —"
                    : `${num(h.dailyVehicles)} véh./j · ${num(h.monthlyRevenue)} DT/mois`}
                </p>
              </button>
            )
          })}
        </div>
      </div>

      {hub && (
        <div className="grid gap-4 xl:grid-cols-2">
          {/* Panneaux remontés par clé : état neuf à chaque changement de hub. */}
          <HubIdentityPanel key={`ident-${hub.id}`} hub={hub} onSaved={applyHub} />
          <HubSettingsPanel key={`set-${hub.id}`} hub={hub} />
        </div>
      )}
    </div>
  )
}
