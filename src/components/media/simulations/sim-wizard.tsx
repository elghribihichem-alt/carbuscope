'use client'

// CarbuScope — T60-f — ASSISTANT DE CAMPAGNE en 5 étapes (le cœur du volet
// Simulations). État CONSERVÉ à chaque étape : autosauvegarde PATCH par étape
// (save immédiat au changement d'étape, debounce 800 ms sur les champs texte).
//   1. Sélection des faces (table FULL + recherche + filtres + compteur live)
//   2. Paramétrage (nom/client/dates, lignes prix prorata + remises, total)
//   3. Simulation (moteur POST compute, KPIs)
//   4. Rapport (SimReport — graphiques + impact réseau + recommandations)
//   5. Export & diffusion (SimShare — PDF/XLSX/lien signé/wa.me/mailto)
// Handoff explorateur : initialFaceIds → présélection + ouverture étape 2.

import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  Check,
  ChevronRight,
  CircleAlert,
  Info,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { MEDIA_CAPS, toMediaRole, type SimulationDTO, type SimulationSelectionDTO } from "@/lib/media/shared"
import type { FacesListResponse } from "@/lib/media/shared"
import { useAppStore } from "@/store/app-store"
import { apiJson, dtFr, numFr, SIM_STATUS_META, useLocalT } from "../media-shared"
import { SimReport, SimKpis } from "./sim-report"
import { SimShare } from "./sim-share"
import {
  clampNum,
  dateInputValue,
  estimateTotal,
  flattenFaces,
  periodDays,
  prorataPrix,
  selectionStats,
  WIZARD_STEPS,
  type FlatFace,
} from "./sim-shared"

const DICT = {
  fr: {
    "step.1": "Sélection des faces",
    "step.2": "Paramétrage",
    "step.3": "Simulation",
    "step.4": "Rapport",
    "step.5": "Export & diffusion",
    back: "Retour à la liste",
    prev: "Précédent",
    next: "Suivant",
    saving: "Enregistrement…",
    saved: "Enregistré",
    readOnly: "Consultation seule — votre rôle ne permet pas de modifier cette simulation.",
    search: "Rechercher (code, ville)…",
    allGov: "Tous les gouvernorats",
    allFmt: "Tous les formats",
    selectAll: "Tout sélectionner (filtré)",
    clear: "Vider",
    max: "Maximum 500 faces par simulation.",
    "col.code": "Face",
    "col.ville": "Ville",
    "col.gov": "Gouvernorat",
    "col.format": "Format",
    "col.prixSem": "Prix / semaine",
    "col.odv": "ODV / jour",
    "col.prix": "Prix unitaire",
    "col.remise": "Remise %",
    "col.remove": "Retirer",
    "f1.hint": "Seules les faces en accès complet (FULL) sont sélectionnables — les faces agrégées ne le sont jamais.",
    "f2.name": "Nom de la simulation",
    "f2.client": "Client / annonceur",
    "f2.start": "Date de début",
    "f2.end": "Date de fin",
    "f2.remiseGlobale": "Remise globale (%)",
    "f2.saisonnalite": "Appliquer la saisonnalité",
    "f2.saisonnaliteHint": "Coefficients mensuels par gouvernorat (Ramadan, été touristique…) appliqués au calcul des ODV. Sans saisonnalité, le moteur utilise un coefficient neutre de 1.",
    "f2.total": "Total estimé",
    "f2.prixHint": "Prix pré-rempli au prorata semaine (prix/semaine × ⌈jours/7⌉) — recalculé si les dates changent, reste éditable.",
    "f3.launch": "Lancer le calcul",
    "f3.recompute": "Recalculer",
    "f3.hint": "Exécution du moteur < 2 s — les résultats sont persistés avec la simulation.",
    "f3.empty": "Sélection vide — choisissez au moins une face (étape 1).",
    "f3.computing": "Calcul en cours…",
    "f3.done": "Calcul terminé",
    "err.faces": "Sélectionnez au moins une face pour continuer.",
    "err.name": "Le nom est requis (2 caractères minimum).",
    "err.dates": "La date de fin doit être postérieure ou égale à la date de début.",
    "err.compute": "Lancez d'abord le calcul (étape 3) pour consulter le rapport.",
    "err.save": "Sauvegarde impossible",
    "err.faces404": "Chargement des faces impossible",
    "reco.added": "Face ajoutée à la sélection",
    "reco.already": "Cette face est déjà dans la sélection",
    "counter.faces": "faces",
    "counter.formats": "formats",
    "counter.villes": "villes couvertes",
    removed: "Face retirée de la sélection",
    days: "jours",
    author: "Auteur",
  },
  en: {
    "step.1": "Face selection",
    "step.2": "Parameters",
    "step.3": "Simulation",
    "step.4": "Report",
    "step.5": "Export & sharing",
    back: "Back to list",
    prev: "Previous",
    next: "Next",
    saving: "Saving…",
    saved: "Saved",
    readOnly: "Read-only — your role cannot edit this simulation.",
    search: "Search (code, city)…",
    allGov: "All governorates",
    allFmt: "All formats",
    selectAll: "Select all (filtered)",
    clear: "Clear",
    max: "Maximum 500 faces per simulation.",
    "col.code": "Face",
    "col.ville": "City",
    "col.gov": "Governorate",
    "col.format": "Format",
    "col.prixSem": "Price / week",
    "col.odv": "ODV / day",
    "col.prix": "Unit price",
    "col.remise": "Discount %",
    "col.remove": "Remove",
    "f1.hint": "Only faces in full access (FULL) are selectable — aggregated faces never are.",
    "f2.name": "Simulation name",
    "f2.client": "Client / advertiser",
    "f2.start": "Start date",
    "f2.end": "End date",
    "f2.remiseGlobale": "Global discount (%)",
    "f2.saisonnalite": "Apply seasonality",
    "f2.saisonnaliteHint": "Monthly coefficients per governorate (Ramadan, summer tourism…) applied to ODV computation. Without seasonality, the engine uses a neutral coefficient of 1.",
    "f2.total": "Estimated total",
    "f2.prixHint": "Price pre-filled pro-rata per week (price/week × ⌈days/7⌉) — recomputed when dates change, still editable.",
    "f3.launch": "Run computation",
    "f3.recompute": "Recompute",
    "f3.hint": "Engine run < 2 s — results are persisted with the simulation.",
    "f3.empty": "Empty selection — pick at least one face (step 1).",
    "f3.computing": "Computing…",
    "f3.done": "Computation done",
    "err.faces": "Select at least one face to continue.",
    "err.name": "Name is required (2 characters minimum).",
    "err.dates": "End date must be on or after start date.",
    "err.compute": "Run the computation first (step 3) to view the report.",
    "err.save": "Save failed",
    "err.faces404": "Failed to load faces",
    "reco.added": "Face added to selection",
    "reco.already": "This face is already in the selection",
    "counter.faces": "faces",
    "counter.formats": "formats",
    "counter.villes": "cities covered",
    removed: "Face removed from selection",
    days: "days",
    author: "Author",
  },
  ar: {
    "step.1": "اختيار الأوجه",
    "step.2": "الإعدادات",
    "step.3": "المحاكاة",
    "step.4": "التقرير",
    "step.5": "التصدير والمشاركة",
    back: "العودة إلى القائمة",
    prev: "السابق",
    next: "التالي",
    saved: "تم الحفظ",
    search: "بحث (الرمز، المدينة)…",
    allGov: "كل الولايات",
    allFmt: "كل الصيغ",
    selectAll: "تحديد الكل (المصفى)",
    clear: "إفراغ",
    "col.code": "الوجه",
    "col.ville": "المدينة",
    "col.gov": "الولاية",
    "col.format": "الصيغة",
    "col.prix": "السعر",
    "col.remise": "الخصم %",
    "f2.name": "اسم المحاكاة",
    "f2.client": "العميل",
    "f2.start": "تاريخ البداية",
    "f2.end": "تاريخ النهاية",
    "f2.remiseGlobale": "الخصم العام (%)",
    "f2.total": "الإجمالي التقديري",
    "f3.launch": "إطلاق الحساب",
    "f3.recompute": "إعادة الحساب",
    "counter.faces": "أوجه",
    "counter.formats": "صيغ",
    "counter.villes": "مدن مغطاة",
    days: "أيام",
    author: "المؤلف",
  },
}

export function SimWizard({ sim: initialSim, initialFaceIds, onClose }: {
  sim: SimulationDTO
  /** Handoff explorateur : faces à présélectionner (ouvre à l'étape 2). */
  initialFaceIds?: string[]
  onClose: (refresh: boolean) => void
}) {
  const { t } = useLocalT(DICT)
  const session = useAppStore(s => s.session)
  const caps = MEDIA_CAPS[toMediaRole(session?.role ?? "VIEWER")]
  const readOnly = !caps.createSimulation

  const [sim, setSim] = useState<SimulationDTO>(initialSim)
  const [step, setStep] = useState<number>(Math.min(5, Math.max(1, initialSim.currentStep)))
  const [faces, setFaces] = useState<FlatFace[] | null>(null)
  const [facesError, setFacesError] = useState<string | null>(null)

  const [name, setName] = useState(initialSim.name)
  const [client, setClient] = useState(initialSim.client ?? "")
  const [dateStart, setDateStart] = useState(dateInputValue(initialSim.dateStart))
  const [dateEnd, setDateEnd] = useState(dateInputValue(initialSim.dateEnd))
  const [remiseGlobale, setRemiseGlobale] = useState(String(initialSim.params.remiseGlobale ?? 0))
  const [saisonnalite, setSaisonnalite] = useState(initialSim.params.saisonnalite ?? true)
  const [selections, setSelections] = useState<SimulationSelectionDTO[]>(initialSim.selections)
  const [prixEdited, setPrixEdited] = useState<Set<string>>(new Set())

  const [savingState, setSavingState] = useState<"idle" | "saving" | "saved">("idle")
  const [computing, setComputing] = useState(false)
  const [computeError, setComputeError] = useState<string | null>(null)

  // filtres étape 1
  const [query, setQuery] = useState("")
  const [govFilter, setGovFilter] = useState("ALL")
  const [fmtFilter, setFmtFilter] = useState("ALL")

  const facesById = useMemo(() => new Map((faces ?? []).map(f => [f.faceId, f])), [faces])
  const stats = useMemo(() => selectionStats(selections, facesById), [selections, facesById])
  const totalEstime = useMemo(
    () => estimateTotal(selections, clampNum(remiseGlobale, 0, 90)),
    [selections, remiseGlobale],
  )

  // ─────────── Chargement des faces (étape 1) ───────────
  useEffect(() => {
    let cancelled = false
    void apiJson<FacesListResponse>("/api/media/faces")
      .then(r => {
        if (!cancelled) setFaces(flattenFaces(r.panels))
      })
      .catch(e => {
        if (!cancelled) setFacesError(e instanceof Error ? e.message : "error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  // ─────────── Handoff explorateur : présélection à l'étape 2 ───────────
  const handoffApplied = useRef(false)
  useEffect(() => {
    if (!faces || handoffApplied.current) return
    handoffApplied.current = true
    const ids = (initialFaceIds ?? []).filter(id => facesById.has(id))
    if (ids.length === 0 || selections.length > 0) return
    const days = periodDays(dateStart || null, dateEnd || null)
    const rows: SimulationSelectionDTO[] = ids.slice(0, 500).map(id => ({
      faceId: id,
      prixUnitaire: prorataPrix(facesById.get(id)?.prixSemaine ?? 0, days),
      remise: 0,
    }))
    setSelections(rows)
    setStep(2)
    void savePatch({ selections: rows, currentStep: 2 })
  }, [faces])

  // ─────────── Autosauvegarde (debounce 800 ms, immédiat par étape) ───────────
  const pendingRef = useRef<Record<string, unknown>>({})
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      if (timerRef.current) clearTimeout(timerRef.current)
      const body = pendingRef.current
      if (Object.keys(body).length > 0 && sim.id) {
        void fetch(`/api/media/simulations/${sim.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          keepalive: true,
        }).catch(() => undefined)
      }
    }
  }, [sim.id])

  function queuePatch(fields: Record<string, unknown>, immediate = false) {
    if (readOnly) return
    Object.assign(pendingRef.current, fields)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (immediate) {
      void flushPatch()
    } else {
      timerRef.current = setTimeout(() => void flushPatch(), 800)
    }
  }

  async function flushPatch(): Promise<void> {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const body = pendingRef.current
    pendingRef.current = {}
    if (Object.keys(body).length === 0) return
    await applyPatch(body)
  }

  async function applyPatch(body: Record<string, unknown>): Promise<boolean> {
    if (readOnly) return true
    setSavingState("saving")
    try {
      const r = await apiJson<{ simulation: SimulationDTO }>(`/api/media/simulations/${sim.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      })
      if (!aliveRef.current) return true
      setSim(prev => {
        const merged: SimulationDTO = { ...prev, ...r.simulation }
        // si le serveur a écarté des faces hors permission, on aligne la sélection locale
        if (Array.isArray(r.simulation.selections) && r.simulation.selections.length !== selections.length) {
          merged.selections = r.simulation.selections
        }
        return merged
      })
      setSavingState("saved")
      setTimeout(() => setSavingState(s => (s === "saved" ? "idle" : s)), 2500)
      return true
    } catch (e) {
      setSavingState("idle")
      toast.error(t("err.save"), { description: e instanceof Error ? e.message : undefined })
      return false
    }
  }

  async function savePatch(fields: Record<string, unknown>): Promise<boolean> {
    Object.assign(pendingRef.current, fields)
    return applyPatch(pendingRef.current).then(ok => {
      if (ok) pendingRef.current = {}
      return ok
    })
  }

  function buildFullPatch(): Record<string, unknown> {
    const body: Record<string, unknown> = {}
    if (name.trim().length >= 2) body.name = name.trim()
    body.client = client.trim() || null
    body.dateStart = dateStart || null
    body.dateEnd = dateEnd || null
    body.params = { remiseGlobale: clampNum(remiseGlobale, 0, 90), saisonnalite }
    body.selections = selections
    return body
  }

  // ─────────── Navigation ───────────
  function gotoStep(n: number) {
    const target = Math.min(5, Math.max(1, n))
    setStep(target)
    // save immédiat au changement d'étape : l'état complet est conservé
    void savePatch({ ...buildFullPatch(), currentStep: target })
  }

  function next() {
    if (step === 1 && selections.length === 0) {
      toast.error(t("err.faces"))
      return
    }
    if (step === 2) {
      if (name.trim().length < 2) {
        toast.error(t("err.name"))
        return
      }
      if (dateStart && dateEnd && new Date(dateEnd).getTime() < new Date(dateStart).getTime()) {
        toast.error(t("err.dates"))
        return
      }
    }
    if (step === 3 && !sim.results) {
      toast.error(t("err.compute"))
      return
    }
    gotoStep(step + 1)
  }

  // ─────────── Édition des lignes / faces ───────────
  function currentDays(): number {
    return periodDays(dateStart || null, dateEnd || null)
  }

  function toggleFace(f: FlatFace, checked: boolean) {
    if (readOnly) return
    if (checked) {
      if (selections.length >= 500) {
        toast.error(t("max"))
        return
      }
      const row: SimulationSelectionDTO = {
        faceId: f.faceId,
        prixUnitaire: prorataPrix(f.prixSemaine, currentDays()),
        remise: 0,
      }
      const rows = [...selections, row]
      setSelections(rows)
      queuePatch({ selections: rows })
    } else {
      const rows = selections.filter(r => r.faceId !== f.faceId)
      setSelections(rows)
      setPrixEdited(prev => {
        const n = new Set(prev)
        n.delete(f.faceId)
        return n
      })
      queuePatch({ selections: rows })
    }
  }

  function removeRow(faceId: string) {
    if (readOnly) return
    const rows = selections.filter(r => r.faceId !== faceId)
    setSelections(rows)
    setPrixEdited(prev => {
      const n = new Set(prev)
      n.delete(faceId)
      return n
    })
    queuePatch({ selections: rows })
    toast.info(t("removed"))
  }

  function updateRow(faceId: string, field: "prixUnitaire" | "remise", raw: string) {
    const value = field === "remise" ? clampNum(raw, 0, 90) : Math.max(0, Math.round(Number(raw.replace(",", ".")) || 0))
    const rows = selections.map(r => (r.faceId === faceId ? { ...r, [field]: value } : r))
    setSelections(rows)
    if (field === "prixUnitaire") {
      setPrixEdited(prev => new Set(prev).add(faceId))
    }
    queuePatch({ selections: rows })
  }

  function onDateChange(which: "dateStart" | "dateEnd", value: string) {
    if (which === "dateStart") setDateStart(value)
    else setDateEnd(value)
    const s = which === "dateStart" ? value : dateStart
    const e = which === "dateEnd" ? value : dateEnd
    if (s && e && new Date(e).getTime() >= new Date(s).getTime()) {
      const days = periodDays(s, e)
      setSelections(prev =>
        prev.map(row => {
          if (prixEdited.has(row.faceId)) return row
          const f = facesById.get(row.faceId)
          if (!f) return row
          return { ...row, prixUnitaire: prorataPrix(f.prixSemaine, days) }
        }),
      )
    }
    queuePatch({ [which]: value || null })
  }

  function addFaceFromReco(faceId: string) {
    if (selections.some(s => s.faceId === faceId)) {
      toast.info(t("reco.already"))
      return
    }
    if (selections.length >= 500) {
      toast.error(t("max"))
      return
    }
    const f = facesById.get(faceId)
    const rows = [
      ...selections,
      { faceId, prixUnitaire: f ? prorataPrix(f.prixSemaine, currentDays()) : 0, remise: 0 },
    ]
    setSelections(rows)
    queuePatch({ selections: rows })
    toast.success(t("reco.added"))
    gotoStep(1)
  }

  // ─────────── Calcul (étape 3) ───────────
  async function compute() {
    if (readOnly || computing) return
    setComputing(true)
    setComputeError(null)
    try {
      await savePatch({ ...buildFullPatch(), currentStep: 3 })
      const r = await apiJson<{ simulation: SimulationDTO }>(`/api/media/simulations/${sim.id}/compute`, {
        method: "POST",
      })
      setSim(prev => ({ ...prev, ...r.simulation }))
      toast.success(t("f3.done"))
    } catch (e) {
      setComputeError(e instanceof Error ? e.message : "error")
      toast.error(t("err.save"), { description: e instanceof Error ? e.message : undefined })
    } finally {
      setComputing(false)
    }
  }

  // ─────────── Étape 1 : liste filtrée ───────────
  const govOptions = useMemo(
    () => Array.from(new Set((faces ?? []).map(f => f.governorat))).sort((a, b) => a.localeCompare(b)),
    [faces],
  )
  const fmtOptions = useMemo(
    () => Array.from(new Set((faces ?? []).map(f => f.format))).sort((a, b) => a.localeCompare(b)),
    [faces],
  )
  const filteredFaces = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (faces ?? []).filter(f => {
      if (q && !f.code.toLowerCase().includes(q) && !f.ville.toLowerCase().includes(q)) return false
      if (govFilter !== "ALL" && f.governorat !== govFilter) return false
      if (fmtFilter !== "ALL" && f.format !== fmtFilter) return false
      return true
    })
  }, [faces, query, govFilter, fmtFilter])

  const selectedIdSet = useMemo(() => new Set(selections.map(s => s.faceId)), [selections])

  function selectAllFiltered() {
    if (readOnly) return
    const missing = filteredFaces.filter(f => !selectedIdSet.has(f.faceId))
    if (missing.length === 0) return
    const room = 500 - selections.length
    if (room <= 0) {
      toast.error(t("max"))
      return
    }
    const days = currentDays()
    const rows = [
      ...selections,
      ...missing.slice(0, room).map<SimulationSelectionDTO>(f => ({
        faceId: f.faceId,
        prixUnitaire: prorataPrix(f.prixSemaine, days),
        remise: 0,
      })),
    ]
    setSelections(rows)
    queuePatch({ selections: rows })
  }

  function clearSelection() {
    if (readOnly) return
    setSelections([])
    setPrixEdited(new Set())
    queuePatch({ selections: [] })
  }

  const statusMeta = SIM_STATUS_META[sim.status] ?? SIM_STATUS_META.BROUILLON

  // ─────────── Rendu ───────────
  return (
    <div className="space-y-4">
      {/* En-tête assistant */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onClose(true)}
                className="h-9 gap-1.5 px-2 text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {t("back")}
              </Button>
              <Badge variant="outline" className={cn("shrink-0", statusMeta.className)}>
                {statusMeta.label}
              </Badge>
            </div>
            <h2 className="truncate text-base font-bold leading-tight">{sim.name}</h2>
            <p className="text-xs text-muted-foreground">
              {t("author")} : {sim.authorEmail} · {dateFrOr(sim.dateStart)} → {dateFrOr(sim.dateEnd)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
            {readOnly ? (
              <span className="flex items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1 dark:border-zinc-800">
                <CircleAlert className="h-3.5 w-3.5 text-[#b0563b]" aria-hidden />
                {t("readOnly")}
              </span>
            ) : (
              <>
                {savingState === "saving" ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    {t("saving")}
                  </span>
                ) : savingState === "saved" ? (
                  <span className="flex items-center gap-1.5 text-[#059669] dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" aria-hidden />
                    {t("saved")}
                  </span>
                ) : null}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stepper horizontal (scrollable mobile) */}
      <nav aria-label={t("next")} className="overflow-x-auto">
        <ol className="flex min-w-max items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50/60 p-1.5 dark:border-zinc-800 dark:bg-zinc-900/60">
          {WIZARD_STEPS.map((s, i) => (
            <li key={s.n} className="flex items-center gap-1">
              {i > 0 ? <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-700" aria-hidden /> : null}
              <button
                type="button"
                onClick={() => gotoStep(s.n)}
                aria-current={step === s.n ? "step" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  step === s.n
                    ? "bg-[#059669] text-white hover:bg-[#047857] dark:bg-emerald-700 dark:hover:bg-emerald-600"
                    : step > s.n
                      ? "text-[#059669] hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950"
                      : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-bold",
                    step === s.n
                      ? "border-white/60 text-white dark:border-emerald-300"
                      : step > s.n
                        ? "border-[#059669] bg-[#059669] text-white dark:border-emerald-600 dark:bg-emerald-600"
                        : "border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400",
                  )}
                  aria-hidden
                >
                  {step > s.n ? <Check className="h-3 w-3" /> : s.n}
                </span>
                <span className="whitespace-nowrap">{t(s.key)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* ─────────── Étape 1 : sélection des faces ─────────── */}
      {step === 1 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">{t("step.1")}</CardTitle>
            <CardDescription>{t("f1.hint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Compteur live */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1 border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                <Check className="h-3 w-3" aria-hidden />
                {stats.faces.toLocaleString("fr-FR")} {t("counter.faces")}
              </Badge>
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                {stats.formats.toLocaleString("fr-FR")} {t("counter.formats")}
              </Badge>
              <Badge variant="outline" className="border-[#e1b7a5] bg-[#fdeee8] text-[#b0563b] dark:border-[#7a3c2a] dark:bg-[#2a1a13] dark:text-[#e0957a]">
                {stats.villes.toLocaleString("fr-FR")} {t("counter.villes")}
              </Badge>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={selectAllFiltered} disabled={readOnly} className="h-9 gap-1.5 border-[#059669] text-[#059669] hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950">
                  <Plus className="h-3.5 w-3.5" aria-hidden />
                  {t("selectAll")}
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={clearSelection} disabled={readOnly} className="h-9 gap-1.5">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  {t("clear")}
                </Button>
              </div>
            </div>

            {/* Recherche + filtres */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t("search")}
                  className="h-10 pl-8"
                  aria-label={t("search")}
                />
              </div>
              <Select value={govFilter} onValueChange={setGovFilter}>
                <SelectTrigger className="h-10" aria-label={t("col.gov")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("allGov")}</SelectItem>
                  {govOptions.map(g => (
                    <SelectItem key={g} value={g}>{g}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={fmtFilter} onValueChange={setFmtFilter}>
                <SelectTrigger className="h-10" aria-label={t("col.format")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("allFmt")}</SelectItem>
                  {fmtOptions.map(f => (
                    <SelectItem key={f} value={f}>{f}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Table des faces FULL */}
            {faces === null && !facesError ? (
              <div className="space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 rounded-md" />
                ))}
              </div>
            ) : facesError ? (
              <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                <CircleAlert className="h-5 w-5 text-[#b0563b]" aria-hidden />
                {t("err.faces404")}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setFacesError(null)
                    setFaces(null)
                    void apiJson<FacesListResponse>("/api/media/faces")
                      .then(r => setFaces(flattenFaces(r.panels)))
                      .catch(() => setFacesError("error"))
                  }}
                  className="h-9"
                >
                  {t("f3.recompute")}
                </Button>
              </div>
            ) : (
              <div className="max-h-96 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-10" />
                      <TableHead>{t("col.code")}</TableHead>
                      <TableHead>{t("col.ville")}</TableHead>
                      <TableHead className="hidden sm:table-cell">{t("col.gov")}</TableHead>
                      <TableHead className="hidden md:table-cell">{t("col.format")}</TableHead>
                      <TableHead className="text-right">{t("col.prixSem")}</TableHead>
                      <TableHead className="hidden text-right sm:table-cell">{t("col.odv")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredFaces.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                          —
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredFaces.map(f => {
                        const checked = selectedIdSet.has(f.faceId)
                        return (
                          <TableRow
                            key={f.faceId}
                            className={cn(
                              "cursor-default",
                              checked && "bg-emerald-50/60 dark:bg-emerald-950/40",
                            )}
                          >
                            <TableCell>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={v => toggleFace(f, v === true)}
                                disabled={readOnly}
                                aria-label={f.code}
                                className="data-[state=checked]:border-[#059669] data-[state=checked]:bg-[#059669]"
                              />
                            </TableCell>
                            <TableCell className="font-mono text-xs">{f.code}</TableCell>
                            <TableCell className="text-xs">{f.ville}</TableCell>
                            <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">{f.governorat}</TableCell>
                            <TableCell className="hidden text-xs md:table-cell">{f.format}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs">{dtFr(f.prixSemaine)}</TableCell>
                            <TableCell className="hidden text-right tabular-nums text-xs text-muted-foreground sm:table-cell">
                              {numFr(f.odv)}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              {filteredFaces.length.toLocaleString("fr-FR")} / {(faces ?? []).length.toLocaleString("fr-FR")} {t("counter.faces")} · {t("max")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ─────────── Étape 2 : paramétrage ─────────── */}
      {step === 2 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">{t("step.2")}</CardTitle>
            <CardDescription>{t("f2.prixHint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="sim-name">{t("f2.name")} *</Label>
                <Input
                  id="sim-name"
                  value={name}
                  onChange={e => {
                    setName(e.target.value)
                    queuePatch(e.target.value.trim().length >= 2 ? { name: e.target.value.trim() } : {})
                  }}
                  disabled={readOnly}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-client">{t("f2.client")}</Label>
                <Input
                  id="sim-client"
                  value={client}
                  onChange={e => {
                    setClient(e.target.value)
                    queuePatch({ client: e.target.value })
                  }}
                  disabled={readOnly}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-start">{t("f2.start")}</Label>
                <Input
                  id="sim-start"
                  type="date"
                  value={dateStart}
                  onChange={e => onDateChange("dateStart", e.target.value)}
                  disabled={readOnly}
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-end">{t("f2.end")}</Label>
                <Input
                  id="sim-end"
                  type="date"
                  value={dateEnd}
                  onChange={e => onDateChange("dateEnd", e.target.value)}
                  disabled={readOnly}
                  className="h-10"
                />
              </div>
            </div>

            {/* Lignes sélectionnées */}
            <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("col.code")}</TableHead>
                    <TableHead>{t("col.ville")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("col.format")}</TableHead>
                    <TableHead className="text-right">{t("col.prix")}</TableHead>
                    <TableHead className="text-right">{t("col.remise")}</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selections.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        {t("err.faces")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    selections.map(row => {
                      const f = facesById.get(row.faceId)
                      return (
                        <TableRow key={row.faceId}>
                          <TableCell className="font-mono text-xs">{f?.code ?? row.faceId.slice(-8)}</TableCell>
                          <TableCell className="text-xs">{f?.ville ?? "—"}</TableCell>
                          <TableCell className="hidden text-xs sm:table-cell">{f?.format ?? "—"}</TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              value={row.prixUnitaire}
                              onChange={e => updateRow(row.faceId, "prixUnitaire", e.target.value)}
                              disabled={readOnly}
                              className="h-9 w-28 text-right tabular-nums"
                              aria-label={`${t("col.prix")} ${f?.code ?? row.faceId}`}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={90}
                              value={row.remise}
                              onChange={e => updateRow(row.faceId, "remise", e.target.value)}
                              disabled={readOnly}
                              className="h-9 w-20 text-right tabular-nums"
                              aria-label={`${t("col.remise")} ${f?.code ?? row.faceId}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeRow(row.faceId)}
                              disabled={readOnly}
                              className="h-9 w-9 p-0 text-muted-foreground hover:text-[#b0563b]"
                              aria-label={t("col.remove")}
                              title={t("col.remove")}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Remise globale + saisonnalité */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sim-remise">{t("f2.remiseGlobale")}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="sim-remise"
                    type="number"
                    min={0}
                    max={90}
                    value={remiseGlobale}
                    onChange={e => {
                      setRemiseGlobale(e.target.value)
                      queuePatch({ params: { remiseGlobale: clampNum(e.target.value, 0, 90), saisonnalite } })
                    }}
                    disabled={readOnly}
                    className="h-10 w-24 tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Switch
                    id="sim-saison"
                    checked={saisonnalite}
                    onCheckedChange={v => {
                      setSaisonnalite(v)
                      queuePatch({ params: { remiseGlobale: clampNum(remiseGlobale, 0, 90), saisonnalite: v } })
                    }}
                    disabled={readOnly}
                    aria-label={t("f2.saisonnalite")}
                  />
                  <Label htmlFor="sim-saison" className="text-sm">{t("f2.saisonnalite")}</Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground" aria-label={t("f2.saisonnaliteHint")}>
                        <Info className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-64 text-xs leading-snug">
                      {t("f2.saisonnaliteHint")}
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </div>

            {/* Total estimé */}
            <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950">
              <p className="text-sm font-medium text-emerald-900 dark:text-emerald-300">{t("f2.total")}</p>
              <p className="text-2xl font-bold tabular-nums text-[#059669] dark:text-emerald-400">
                {dtFr(totalEstime)}
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {currentDays()} {t("days")} · {stats.faces} {t("counter.faces")}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ─────────── Étape 3 : simulation ─────────── */}
      {step === 3 ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">{t("step.3")}</CardTitle>
            <CardDescription>{t("f3.hint")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selections.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">{t("f3.empty")}</p>
            ) : sim.results ? (
              <>
                <SimKpis results={sim.results} />
                {!readOnly ? (
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={compute}
                      disabled={computing}
                      className="h-9 gap-1.5 border-[#059669] text-[#059669] hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
                    >
                      {computing ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Calculator className="h-3.5 w-3.5" aria-hidden />}
                      {t("f3.recompute")}
                    </Button>
                  </div>
                ) : null}
              </>
            ) : computing ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-8 w-8 animate-spin text-[#059669]" aria-hidden />
                <p className="text-sm text-muted-foreground">{t("f3.computing")} (&lt; 2 s)</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 py-8">
                {computeError ? (
                  <p className="text-sm text-[#b0563b] dark:text-[#e0957a]">{computeError}</p>
                ) : null}
                {!readOnly ? (
                  <Button
                    type="button"
                    size="lg"
                    onClick={compute}
                    className="h-12 gap-2 bg-[#059669] px-8 text-white hover:bg-[#047857] dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  >
                    <Calculator className="h-5 w-5" aria-hidden />
                    {t("f3.launch")}
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("f3.empty")}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* ─────────── Étape 4 : rapport ─────────── */}
      {step === 4 ? <SimReport sim={sim} onAddFace={readOnly ? undefined : addFaceFromReco} /> : null}

      {/* ─────────── Étape 5 : export & diffusion ─────────── */}
      {step === 5 ? (
        <SimShare
          sim={sim}
          canExport={caps.export}
          canSend={caps.createSimulation}
          canListMembers={caps.manageMembers}
          onComputed={s => setSim(prev => ({ ...prev, ...s }))}
          onFinish={() => onClose(true)}
        />
      ) : null}

      {/* Pied : navigation étapes */}
      <div className="flex flex-col-reverse items-stretch justify-between gap-3 sm:flex-row sm:items-center">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={step === 1}
          onClick={() => gotoStep(step - 1)}
          className="h-11 gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("prev")}
        </Button>
        <div className="flex items-center justify-end gap-3">
          {step < 5 ? (
            <Button
              type="button"
              size="lg"
              onClick={next}
              className="h-11 gap-1.5 bg-[#059669] text-white hover:bg-[#047857] dark:bg-emerald-700 dark:hover:bg-emerald-600"
            >
              {t("next")}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function dateFrOr(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }) : "—"
}
