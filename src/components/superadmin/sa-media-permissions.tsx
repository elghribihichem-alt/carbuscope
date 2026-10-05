'use client'

// CarbuScope — Module Média (T60-g) — volet SA « Permissions » : L'INTERFACE
// CŒUR du produit — qui voit quelle face. Jamais de code brut :
//   · MATRICE enseigne × face : lignes = faces, colonnes = enseignes ; chaque
//     cellule dérive l'état des règles (couche 2) : ✓ complet (émeraude),
//     ⛁ agrégé (ambre), — interdite/réservée (zinc) ; clic → éditeur guidé ;
//   · ÉDITEUR GUIDÉ (Sheet) — sa-media-permissions-editor.tsx ;
//   · GROUPES d'enseignes : Card liste + Dialog création/modification
//     (POST /api/media/permissions/[faceId] { groupName, brandSlugs }) ;
//   · APERÇU EN DIRECT (sticky) : enseigne + périmètre → POST
//     /api/media/permissions/preview → « c'est exactement ce que verra… ».
// Données : GET /api/media/permissions + GET /api/media/panels (gouvernorat
// des faces pour la dérivation des zones).

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { Eye, Grid3X3, Loader2, Pencil, Play, Plus, ShieldCheck, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ErrorState } from "@/components/shell/loading"
import { ModuleHeader, apiJson, numFr } from "@/components/media/media-shared"
import type { FaceRuleDTO, PermissionsMatrixResponse, PreviewResultDTO } from "@/lib/media/shared"
import { GOVERNORATS, useSaMediaGet, useSaMediaT } from "./sa-media/sa-media-shared"
import { SaMediaPermEditor } from "./sa-media/sa-media-permissions-editor"

const DICT = {
  fr: {
    header: "Matrice de visibilité enseigne × face",
    headerDesc: "Trois modes par face : publique, granulaire (autorisations, exclusions prioritaires, groupes, zones, conditions) ou exclusive. Cliquez sur une cellule pour éditer les règles de la face.",
    "matrix.title": "Matrice",
    "matrix.legend": "Légende",
    "matrix.legend.full": "accès complet",
    "matrix.legend.agg": "vue agrégée (restreinte)",
    "matrix.legend.none": "interdite / réservée",
    "matrix.hint": "Cliquez sur une cellule pour ouvrir l'éditeur guidé de la face.",
    "matrix.face": "Face",
    "matrix.panel": "Panneau",
    "matrix.ville": "Ville",
    "matrix.mode": "Mode",
    "matrix.search": "Filtrer les faces…",
    "matrix.empty": "Aucune face ne correspond au filtre.",
    "cell.full": "accès complet",
    "cell.agg": "vue agrégée",
    "cell.none": "interdite ou réservée à une autre enseigne",
    "groups.title": "Groupes d'enseignes",
    "groups.desc": "Ensembles réutilisables dans les règles granulaires — l'enseigne doit appartenir au groupe pour l'accès complet.",
    "groups.new": "Nouveau groupe",
    "groups.edit": "Modifier le groupe",
    "groups.name": "Nom du groupe",
    "groups.namePh": "Premium",
    "groups.brands": "Enseignes membres",
    "groups.empty": "Aucun groupe — créez-en un pour mutualiser des autorisations.",
    "groups.saved": "Groupe enregistré",
    "groups.err.name": "Nom de groupe requis (2 caractères minimum).",
    "groups.err.brands": "Sélectionnez au moins une enseigne.",
    "groups.members": "membre(s)",
    "preview.title": "Aperçu en direct",
    "preview.desc": "Simule la vue exacte d'une enseigne (couches 2 + 3) avant/après modification des règles.",
    "preview.brand": "Enseigne",
    "preview.perimeter": "Périmètre",
    "preview.p.tout": "Tout le territoire",
    "preview.p.gouv": "Gouvernorats",
    "preview.p.rayon": "Rayon (lat, lng, km)",
    "preview.gouv": "Gouvernorats inclus",
    "preview.lat": "Latitude",
    "preview.lng": "Longitude",
    "preview.km": "Rayon (km)",
    "preview.run": "Simuler la vue",
    "preview.total": "Faces au total",
    "preview.full": "Accès complet",
    "preview.agg": "Vue agrégée",
    "preview.invisible": "Invisibles",
    "preview.sample": "Échantillon",
    "preview.phrase": "C'est exactement ce que verra {brand} dans son explorateur.",
    "preview.empty": "Lancez une simulation pour voir les décomptes.",
    "preview.mode.FULL": "complet",
    "preview.mode.AGGREGE": "agrégé",
    "preview.mode.NONE": "invisible",
    note: "Les conditions d'ancienneté dépendent du contrat SaaS de chaque enseigne — l'aperçu en direct les résout réellement.",
  },
  en: {
    header: "Brand × face visibility matrix",
    headerDesc: "Three modes per face: public, granular (allowlists, priority exclusions, groups, zones, conditions) or exclusive. Click a cell to edit the face rules.",
    "matrix.title": "Matrix",
    "matrix.legend": "Legend",
    "matrix.legend.full": "full access",
    "matrix.legend.agg": "aggregated view (restricted)",
    "matrix.legend.none": "banned / reserved",
    "matrix.hint": "Click a cell to open the guided editor of the face.",
    "matrix.face": "Face",
    "matrix.panel": "Panel",
    "matrix.ville": "City",
    "matrix.mode": "Mode",
    "matrix.search": "Filter faces…",
    "matrix.empty": "No face matches the filter.",
    "cell.full": "full access",
    "cell.agg": "aggregated view",
    "cell.none": "banned or reserved to another brand",
    "groups.title": "Brand groups",
    "groups.desc": "Reusable sets in granular rules — the brand must belong to the group for full access.",
    "groups.new": "New group",
    "groups.edit": "Edit group",
    "groups.name": "Group name",
    "groups.namePh": "Premium",
    "groups.brands": "Member brands",
    "groups.empty": "No group — create one to mutualize authorizations.",
    "groups.saved": "Group saved",
    "groups.err.name": "Group name required (2 characters min).",
    "groups.err.brands": "Select at least one brand.",
    "groups.members": "member(s)",
    "preview.title": "Live preview",
    "preview.desc": "Simulates the exact view of a brand (layers 2 + 3).",
    "preview.brand": "Brand",
    "preview.perimeter": "Perimeter",
    "preview.p.tout": "Whole territory",
    "preview.p.gouv": "Governorates",
    "preview.p.rayon": "Radius (lat, lng, km)",
    "preview.gouv": "Included governorates",
    "preview.lat": "Latitude",
    "preview.lng": "Longitude",
    "preview.km": "Radius (km)",
    "preview.run": "Simulate the view",
    "preview.total": "Faces total",
    "preview.full": "Full access",
    "preview.agg": "Aggregated",
    "preview.invisible": "Invisible",
    "preview.sample": "Sample",
    "preview.phrase": "This is exactly what {brand} will see in its explorer.",
    "preview.empty": "Run a simulation to see the counts.",
    "preview.mode.FULL": "full",
    "preview.mode.AGGREGE": "aggregated",
    "preview.mode.NONE": "invisible",
    note: "Seniority conditions depend on each brand's SaaS contract — the live preview resolves them for real.",
  },
  ar: {
    header: "مصفوفة الرؤية بين العلامات والأوجه",
    headerDesc: "ثلاثة أوضاع لكل وجه: عام أو دقيق أو حصري. انقر على خلية لتحرير قواعد الوجه.",
    "matrix.title": "المصفوفة",
    "matrix.legend": "المفتاح",
    "matrix.legend.full": "وصول كامل",
    "matrix.legend.agg": "عرض مجمّع (مقيد)",
    "matrix.legend.none": "محظور / محجوز",
    "matrix.hint": "انقر على خلية لفتح المحرر الموجّه.",
    "matrix.face": "الوجه",
    "matrix.panel": "اللوحة",
    "matrix.ville": "المدينة",
    "matrix.mode": "الوضع",
    "matrix.search": "تصفية الأوجه…",
    "matrix.empty": "لا وجه يطابق التصفية.",
    "cell.full": "وصول كامل",
    "cell.agg": "عرض مجمّع",
    "cell.none": "محظور أو محجوز لعلامة أخرى",
    "groups.title": "مجموعات العلامات",
    "groups.desc": "مجموعات قابلة لإعادة الاستخدام في القواعد الدقيقة.",
    "groups.new": "مجموعة جديدة",
    "groups.edit": "تعديل المجموعة",
    "groups.name": "اسم المجموعة",
    "groups.namePh": "Premium",
    "groups.brands": "العلامات الأعضاء",
    "groups.empty": "لا مجموعات — أنشئ واحدة.",
    "groups.saved": "تم حفظ المجموعة",
    "groups.err.name": "اسم المجموعة مطلوب.",
    "groups.err.brands": "اختر علامة واحدة على الأقل.",
    "groups.members": "عضو",
    "preview.title": "معاينة مباشرة",
    "preview.desc": "محاكاة الرؤية الفعلية للعلامة.",
    "preview.brand": "العلامة",
    "preview.perimeter": "النطاق",
    "preview.p.tout": "كل الأراضي",
    "preview.p.gouv": "ولايات",
    "preview.p.rayon": "نطاق دائري",
    "preview.gouv": "الولايات المشمولة",
    "preview.lat": "خط العرض",
    "preview.lng": "خط الطول",
    "preview.km": "النطاق (كم)",
    "preview.run": "محاكاة",
    "preview.total": "إجمالي الأوجه",
    "preview.full": "وصول كامل",
    "preview.agg": "مجمّع",
    "preview.invisible": "غير مرئية",
    "preview.sample": "عينة",
    "preview.phrase": "هذا بالضبط ما ستراه {brand}.",
    "preview.empty": "شغّل المحاكاة لعرض الأعداد.",
    "preview.mode.FULL": "كامل",
    "preview.mode.AGGREGE": "مجمّع",
    "preview.mode.NONE": "غير مرئي",
    note: "شروط القدم تعتمد على عقد SaaS لكل علامة — المعاينة تحلها فعليًا.",
  },
}

type CellState = "FULL" | "AGGREGE" | "BLOQUE"

/** Dérivation client de la couche 2 (fidèle à resolveLayer2 serveur) :
 *  PUBLIQUE → complet · EXCLUSIVE → réservataire seul · GRANULAIRE →
 *  exclusion prioritaire, puis listes enseignes/groupes/zones. Les conditions
 *  d'ancienneté dépendent du contrat de chaque enseigne — résolues via
 *  l'aperçu en direct (route dédiée). */
function deriveCell(rule: FaceRuleDTO, brandSlug: string, groupsByBrand: Map<string, string[]>, governorat: string): CellState {
  if (rule.mode === "PUBLIQUE") return "FULL"
  if (rule.mode === "EXCLUSIVE") return rule.exclusiveBrandSlug === brandSlug ? "FULL" : "BLOQUE"
  if (rule.excludedBrandSlugs.includes(brandSlug)) return "BLOQUE"
  const mine = groupsByBrand.get(brandSlug) ?? []
  if (rule.allowedBrandSlugs.length > 0 && !rule.allowedBrandSlugs.includes(brandSlug)) return "AGGREGE"
  if (rule.allowedGroups.length > 0 && !rule.allowedGroups.some(g => mine.includes(g))) return "AGGREGE"
  if (rule.allowedZones.length > 0 && !rule.allowedZones.includes(governorat)) return "AGGREGE"
  return "FULL"
}

const CELL_META: Record<CellState, { glyph: string; className: string; titleKey: string }> = {
  FULL: {
    glyph: "✓",
    className: "border-emerald-300 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:border-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    titleKey: "cell.full",
  },
  AGGREGE: {
    glyph: "⛁",
    className: "border-amber-300 bg-amber-100 text-amber-700 hover:bg-amber-200 dark:border-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    titleKey: "cell.agg",
  },
  BLOQUE: {
    glyph: "—",
    className: "border-zinc-200 bg-zinc-50 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500",
    titleKey: "cell.none",
  },
}

export function SaMediaPermissions() {
  const { t } = useSaMediaT(DICT)
  const matrixQ = useSaMediaGet<PermissionsMatrixResponse>("/api/media/permissions")
  const panelsQ = useSaMediaGet<{ panels: { id: string; governorat: string; faces: { id: string }[] }[] }>("/api/media/panels")

  const [search, setSearch] = useState("")
  const [editingRule, setEditingRule] = useState<FaceRuleDTO | null>(null)
  const [groupOpen, setGroupOpen] = useState(false)
  const [groupEditing, setGroupEditing] = useState<{ id: string; name: string; brandSlugs: string[] } | null>(null)
  const [groupName, setGroupName] = useState("")
  const [groupSlugs, setGroupSlugs] = useState<Set<string>>(new Set())
  const [groupBusy, setGroupBusy] = useState(false)

  const [pvBrand, setPvBrand] = useState<string>("")
  const [pvPerimeter, setPvPerimeter] = useState<string>("TOUT")
  const [pvGouvs, setPvGouvs] = useState<Set<string>>(new Set())
  const [pvLat, setPvLat] = useState("36.8")
  const [pvLng, setPvLng] = useState("10.18")
  const [pvKm, setPvKm] = useState("10")
  const [pvBusy, setPvBusy] = useState(false)
  const [pvResult, setPvResult] = useState<PreviewResultDTO | null>(null)

  const matrix = matrixQ.data
  const brands = useMemo(() => matrix?.brands ?? [], [matrix])
  const groups = useMemo(() => matrix?.groups ?? [], [matrix])

  /** faceId → gouvernorat (pour les zones de la couche 2). */
  const govByFace = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of panelsQ.data?.panels ?? []) {
      for (const f of p.faces) m.set(f.id, p.governorat)
    }
    return m
  }, [panelsQ.data])

  /** brandSlug → noms de groupes auxquels l'enseigne appartient. */
  const groupsByBrand = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const g of groups) {
      for (const slug of g.brandSlugs) m.set(slug, [...(m.get(slug) ?? []), g.name])
    }
    return m
  }, [groups])

  const rules = useMemo(() => {
    const list = matrix?.rules ?? []
    const q = search.trim().toLowerCase()
    if (q === "") return list
    return list.filter(r =>
      r.code.toLowerCase().includes(q) || r.panelName.toLowerCase().includes(q) || r.ville.toLowerCase().includes(q),
    )
  }, [matrix, search])

  function openRule(rule: FaceRuleDTO) {
    setEditingRule(rule)
  }

  function openGroupNew() {
    setGroupEditing(null)
    setGroupName("")
    setGroupSlugs(new Set())
    setGroupOpen(true)
  }

  function openGroupEdit(g: { id: string; name: string; brandSlugs: string[] }) {
    setGroupEditing(g)
    setGroupName(g.name)
    setGroupSlugs(new Set(g.brandSlugs))
    setGroupOpen(true)
  }

  async function saveGroup() {
    if (groupBusy) return
    if (groupName.trim().length < 2) { toast.error(t("groups.err.name")); return }
    if (groupSlugs.size === 0) { toast.error(t("groups.err.brands")); return }
    // POST /api/media/permissions/[faceId] — le faceId de l'URL est ignoré par
    // le gestionnaire de groupes (route partagée) : on passe une face réelle.
    const faceId = matrix?.rules[0]?.faceId ?? "groupes"
    setGroupBusy(true)
    try {
      await apiJson(`/api/media/permissions/${faceId}`, {
        method: "POST",
        body: JSON.stringify({ groupName: groupName.trim(), brandSlugs: [...groupSlugs] }),
      })
      toast.success(t("groups.saved"), { description: `${groupName.trim()} — ${groupSlugs.size} ${t("groups.members")}` })
      setGroupOpen(false)
      matrixQ.reload()
    } catch (e) {
      toast.error("Échec de l'enregistrement", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setGroupBusy(false)
    }
  }

  async function runPreview() {
    if (pvBusy || !pvBrand) return
    setPvBusy(true)
    try {
      const body: Record<string, unknown> = { brandSlug: pvBrand, perimeterType: pvPerimeter }
      if (pvPerimeter === "GOUVERNORATS") body.perimeterValue = { gouvernorats: [...pvGouvs] }
      if (pvPerimeter === "RAYON") {
        body.perimeterValue = { lat: Number(pvLat.replace(",", ".")), lng: Number(pvLng.replace(",", ".")), rayonKm: Number(pvKm.replace(",", ".")) }
      }
      const r = await apiJson<PreviewResultDTO>("/api/media/permissions/preview", {
        method: "POST",
        body: JSON.stringify(body),
      })
      setPvResult(r)
    } catch (e) {
      toast.error("Échec de la simulation", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setPvBusy(false)
    }
  }

  if (matrixQ.error !== null) return <ErrorState message={matrixQ.error} retry={matrixQ.reload} />

  const loading = matrixQ.loading || matrix === null

  return (
    <div className="min-w-0 space-y-4">
      <ModuleHeader icon={ShieldCheck} title={t("header")} description={t("headerDesc")} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-4">
          {/* ---- Matrice ---- */}
          <Card>
            <CardHeader className="gap-3 pb-3">
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                <Grid3X3 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden /> {t("matrix.title")}
                <span className="text-sm font-normal text-muted-foreground">
                  {numFr(rules.length)} faces × {numFr(brands.length)} enseignes
                </span>
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder={t("matrix.search")} className="h-9 max-w-56"
                  aria-label={t("matrix.search")}
                />
                <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-emerald-300 bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-900/60" aria-hidden /> {t("matrix.legend.full")}</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-amber-300 bg-amber-100 dark:border-amber-700 dark:bg-amber-900/50" aria-hidden /> {t("matrix.legend.agg")}</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900" aria-hidden /> {t("matrix.legend.none")}</span>
                </div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("matrix.hint")}</p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2" aria-busy="true" aria-label={t("common.loading")}>
                  {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
                </div>
              ) : rules.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("matrix.empty")}</p>
              ) : (
                <div className="max-h-96 overflow-y-auto">
                  <div className="min-w-[52rem]">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-background">
                        <TableRow>
                          <TableHead className="w-32">{t("matrix.face")}</TableHead>
                          <TableHead className="min-w-40">{t("matrix.panel")}</TableHead>
                          <TableHead className="min-w-24">{t("matrix.ville")}</TableHead>
                          <TableHead className="w-24">{t("matrix.mode")}</TableHead>
                          {brands.map(b => (
                            <TableHead key={b.slug} className="w-16 text-center">
                              <span className="inline-flex items-center gap-1" title={b.name}>
                                <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                                <span className="max-w-16 truncate font-mono text-[10px]">{b.slug}</span>
                              </span>
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rules.map(r => (
                          <TableRow key={r.faceId}>
                            <TableCell className="font-mono text-xs font-semibold">{r.code}</TableCell>
                            <TableCell className="max-w-40 truncate text-sm text-muted-foreground" title={r.panelName}>{r.panelName}</TableCell>
                            <TableCell className="text-sm">{r.ville}</TableCell>
                            <TableCell>
                              <span className={`inline-block h-2.5 w-2.5 rounded-full ${r.mode === "PUBLIQUE" ? "bg-emerald-500" : r.mode === "GRANULAIRE" ? "bg-amber-500" : "bg-[#b0563b]"}`} title={r.mode} aria-label={r.mode} />
                            </TableCell>
                            {brands.map(b => {
                              const state = deriveCell(r, b.slug, groupsByBrand, govByFace.get(r.faceId) ?? "")
                              const meta = CELL_META[state]
                              return (
                                <TableCell key={b.slug} className="text-center">
                                  <button
                                    type="button"
                                    onClick={() => openRule(r)}
                                    title={`${r.code} · ${b.name} — ${t(meta.titleKey)}`}
                                    aria-label={`${r.code} / ${b.name} : ${t(meta.titleKey)} — ${t("matrix.hint")}`}
                                    className={`inline-flex h-7 w-7 items-center justify-center rounded border text-xs font-bold transition-colors ${meta.className}`}
                                  >
                                    {meta.glyph}
                                  </button>
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t("note")}</p>
            </CardContent>
          </Card>

          {/* ---- Groupes ---- */}
          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden /> {t("groups.title")}
                </CardTitle>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("groups.desc")}</p>
              </div>
              <Button size="sm" className="h-9 gap-1.5" onClick={openGroupNew}>
                <Plus className="h-4 w-4" aria-hidden /> {t("groups.new")}
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2" aria-busy="true">
                  {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
                </div>
              ) : groups.length === 0 ? (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("groups.empty")}</p>
              ) : (
                <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
                  {groups.map(g => (
                    <div key={g.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
                      <p className="min-w-0 flex-1 text-sm font-semibold">{g.name}</p>
                      <div className="flex max-w-md flex-wrap items-center gap-1.5">
                        {g.brandSlugs.map(slug => {
                          const b = brands.find(x => x.slug === slug)
                          return (
                            <span
                              key={slug}
                              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-900"
                              title={b?.name ?? slug}
                            >
                              <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: b?.color ?? "#a1a1aa" }} aria-hidden />
                              {b?.name ?? slug}
                            </span>
                          )
                        })}
                      </div>
                      <span className="text-xs text-muted-foreground">{g.brandSlugs.length} {t("groups.members")}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openGroupEdit(g)} aria-label={`${t("groups.edit")} ${g.name}`}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---- Aperçu en direct (sticky) ---- */}
        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Eye className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" aria-hidden /> {t("preview.title")}
              </CardTitle>
              <p className="text-xs leading-relaxed text-muted-foreground">{t("preview.desc")}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("preview.brand")}</Label>
                <Select value={pvBrand} onValueChange={v => { setPvBrand(v); setPvResult(null) }}>
                  <SelectTrigger className="h-10" aria-label={t("preview.brand")}><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {brands.map(b => (
                      <SelectItem key={b.slug} value={b.slug}>
                        <span className="inline-flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                          {b.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">{t("preview.perimeter")}</Label>
                <Select value={pvPerimeter} onValueChange={v => { setPvPerimeter(v); setPvResult(null) }}>
                  <SelectTrigger className="h-10" aria-label={t("preview.perimeter")}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TOUT">{t("preview.p.tout")}</SelectItem>
                    <SelectItem value="GOUVERNORATS">{t("preview.p.gouv")}</SelectItem>
                    <SelectItem value="RAYON">{t("preview.p.rayon")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {pvPerimeter === "GOUVERNORATS" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">{t("preview.gouv")}</Label>
                  <div className="grid max-h-36 grid-cols-2 gap-0.5 overflow-y-auto rounded-lg border p-2">
                    {GOVERNORATS.map(g => (
                      <label key={g} className="flex min-h-8 cursor-pointer items-center gap-1.5 text-xs">
                        <Checkbox
                          checked={pvGouvs.has(g)}
                          onCheckedChange={() => {
                            setPvGouvs(prev => {
                              const n = new Set(prev)
                              if (n.has(g)) n.delete(g)
                              else n.add(g)
                              return n
                            })
                            setPvResult(null)
                          }}
                        />
                        {g}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}

              {pvPerimeter === "RAYON" ? (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="pv-lat" className="text-xs">{t("preview.lat")}</Label>
                    <Input id="pv-lat" inputMode="decimal" value={pvLat} onChange={e => { setPvLat(e.target.value); setPvResult(null) }} className="h-9 tabular-nums" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pv-lng" className="text-xs">{t("preview.lng")}</Label>
                    <Input id="pv-lng" inputMode="decimal" value={pvLng} onChange={e => { setPvLng(e.target.value); setPvResult(null) }} className="h-9 tabular-nums" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pv-km" className="text-xs">{t("preview.km")}</Label>
                    <Input id="pv-km" inputMode="decimal" value={pvKm} onChange={e => { setPvKm(e.target.value); setPvResult(null) }} className="h-9 tabular-nums" />
                  </div>
                </div>
              ) : null}

              <Button
                className="h-11 w-full gap-1.5" disabled={pvBusy || !pvBrand}
                onClick={() => void runPreview()}
              >
                {pvBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Play className="h-4 w-4" aria-hidden />}
                {t("preview.run")}
              </Button>

              {pvResult ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <PreviewStat label={t("preview.total")} value={pvResult.total} className="border-zinc-300 dark:border-zinc-700" />
                    <PreviewStat label={t("preview.full")} value={pvResult.full} className="border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" />
                    <PreviewStat label={t("preview.agg")} value={pvResult.aggrege} className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" />
                    <PreviewStat label={t("preview.invisible")} value={pvResult.invisible} className="border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-500" />
                  </div>
                  <p className="rounded-md border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium leading-relaxed text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    {t("preview.phrase").replace("{brand}", brands.find(b => b.slug === pvResult.brandSlug)?.name ?? pvResult.brandSlug)}
                  </p>
                  {pvResult.sample.length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-muted-foreground">{t("preview.sample")}</p>
                      <ul className="max-h-36 space-y-1 overflow-y-auto pr-1 text-xs">
                        {pvResult.sample.map(s => (
                          <li key={s.code} className="flex items-center gap-2 rounded border px-2 py-1.5">
                            <span className="font-mono font-semibold">{s.code}</span>
                            <span
                              className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                s.mode === "FULL"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300"
                                  : s.mode === "AGGREGE"
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300"
                                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500"
                              }`}
                            >
                              {t(`preview.mode.${s.mode}`)}
                            </span>
                            <span className="text-muted-foreground">{s.ville}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">{t("preview.empty")}</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ---- Éditeur guidé ---- */}
      <SaMediaPermEditor
        rule={editingRule}
        matrix={matrix}
        open={editingRule !== null}
        onOpenChange={o => { if (!o) setEditingRule(null) }}
        onSaved={() => { matrixQ.reload(); setPvResult(null) }}
      />

      {/* ---- Dialog groupe ---- */}
      <Dialog open={groupOpen} onOpenChange={o => { if (!groupBusy) setGroupOpen(o) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{groupEditing ? t("groups.edit") : t("groups.new")}</DialogTitle>
            <DialogDescription>{t("groups.desc")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="gr-name">{t("groups.name")}</Label>
              <Input
                id="gr-name" value={groupName} disabled={groupBusy} placeholder={t("groups.namePh")}
                onChange={e => setGroupName(e.target.value)} className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{t("groups.brands")}</Label>
              <div className="grid max-h-56 grid-cols-1 gap-0.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                {brands.map(b => (
                  <label key={b.slug} className="flex min-h-9 cursor-pointer items-center gap-2 rounded px-1.5 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800">
                    <Checkbox
                      checked={groupSlugs.has(b.slug)}
                      onCheckedChange={() => setGroupSlugs(prev => {
                        const n = new Set(prev)
                        if (n.has(b.slug)) n.delete(b.slug)
                        else n.add(b.slug)
                        return n
                      })}
                    />
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: b.color }} aria-hidden />
                      {b.name}
                    </span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{groupSlugs.size} {t("groups.members")}</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={groupBusy} onClick={() => setGroupOpen(false)}>{t("common.cancel")}</Button>
            <Button disabled={groupBusy} onClick={() => void saveGroup()} className="gap-1.5">
              {groupBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function PreviewStat({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className={`rounded-lg border p-2.5 ${className}`}>
      <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums leading-none">{numFr(value)}</p>
    </div>
  )
}
