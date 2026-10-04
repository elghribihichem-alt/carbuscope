'use client'

// CarbuScope — Module Média (T60-g) — volet SA « Panneaux & faces » : LA
// gestion du référentiel. Table imbriquée panneaux → faces :
//   · header : recherche texte, filtre statut, import CSV, édition en masse,
//     nouveau panneau (formulaire complet + mini-carte Leaflet) ;
//   · lignes panneaux (code, nom, propriétaire, ville, format, technologie,
//     faces n dont X dispo, TMJA max, prix min–max, statut, autorisation +
//     badge rouge < 30 j) → expansion : faces du panneau ;
//   · faces : ÉDITION EN LIGNE SA via PATCH /api/media/faces/[id] {field,
//     value} — TMJA, audience, ODV, prix/semaine, occupation (optimiste +
//     rollback) ; partDeVoix grisée « calculée » ;
//   · actions : ajouter une face (POST /api/media/faces), supprimer (face /
//     panneau en cascade), modifier (PATCH), Sheet détail + galerie PHOTOS
//     (URL, angle, mode jour/nuit).

import { useMemo, useState } from "react"
import { toast } from "sonner"
import {
  ChevronDown, ChevronRight, Eye, FileUp, Loader2, MapPin, PanelsTopLeft,
  Pencil, Plus, RefreshCw, Rows3, Search, SquareStack, Trash2,
} from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ErrorState } from "@/components/shell/loading"
import {
  ModuleHeader, PANEL_STATUS_META, FACE_STATUS_META, VISIBILITY_MODE_META,
  apiJson, numFr, dtFr, pctFr, dateFr,
} from "@/components/media/media-shared"
import { FIELD_BY_KEY } from "@/lib/media/shared"
import {
  daysLeft, dueBadgeClass, useSaMediaGet, useSaMediaT,
  EditableCell, type SaMediaPanelDTO,
} from "./sa-media/sa-media-shared"
import { SaMediaPanelForm } from "./sa-media/sa-media-panel-form"
import { SaMediaFaceForm } from "./sa-media/sa-media-face-form"
import { SaMediaPhotos } from "./sa-media/sa-media-photos"
import { SaMediaBulkEdit } from "./sa-media/sa-media-bulk-edit"
import { SaMediaCsvImport, type CsvColumn } from "./sa-media/sa-media-import"

const DICT = {
  fr: {
    header: "Référentiel des panneaux & faces",
    headerDesc: "Panneaux urbains du réseau et leurs faces. L'édition en ligne (champs trafic, audience, prix, occupation) est réservée à la Super Administration et journalisée.",
    search: "Rechercher (code, nom, ville, propriétaire…)",
    "f.status": "Statut",
    "f.all": "Tous",
    new: "Nouveau panneau",
    import: "Importer",
    bulk: "Édition en masse",
    count: "panneau(x)",
    countFaces: "face(s)",
    "th.code": "Code",
    "th.name": "Nom",
    "th.owner": "Propriétaire",
    "th.ville": "Ville",
    "th.format": "Format",
    "th.tech": "Techno.",
    "th.faces": "Faces",
    "th.tmja": "TMJA max",
    "th.prix": "Prix/sem.",
    "th.status": "Statut",
    "th.auth": "Autorisation",
    "th.actions": "Actions",
    "faces.code": "Code",
    "faces.orient": "Orient.",
    "faces.tmja": "TMJA (véh./j)",
    "faces.audience": "Audience/j",
    "faces.odv": "ODV/j",
    "faces.prix": "Prix/sem. (DT)",
    "faces.occ": "Occupation 12 m",
    "faces.sov": "SOV",
    "faces.status": "Statut",
    "faces.vis": "Visibilité",
    "faces.actions": "Actions",
    "faces.add": "Ajouter une face",
    "faces.none": "Aucune face sur ce panneau.",
    "faces.dispo": "dispo",
    empty: "Aucun panneau ne correspond à la recherche.",
    "del.panel.title": "Supprimer ce panneau ?",
    "del.panel.desc": "Les faces du panneau seront supprimées en cascade. Cette action est journalisée.",
    "del.face.title": "Supprimer cette face ?",
    "del.face.desc": "La face sera retirée du référentiel. Cette action est journalisée.",
    "del.confirm": "Supprimer",
    "del.ok.panel": "Panneau supprimé",
    "del.ok.face": "Face supprimée",
    "auth.none": "sans autorisation",
    "auth.expired": "expirée",
    "detail.title": "Fiche panneau",
    "detail.geo": "Coordonnées",
    "detail.dim": "Dimensions",
    "detail.owner": "Propriétaire",
    "detail.auth": "Autorisation municipale",
    "detail.faces": "Faces du panneau",
    "import.title": "Importer des panneaux (CSV)",
    "import.desc": "Création de panneaux ligne à ligne — le code propriétaire doit exister dans le référentiel. L'import est journalisé (action IMPORT).",
  },
  en: {
    header: "Panels & faces referential",
    headerDesc: "Network panels and their faces. Inline editing (traffic, audience, price, occupancy) is reserved to Super Administration and logged.",
    search: "Search (code, name, city, owner…)",
    "f.status": "Status",
    "f.all": "All",
    new: "New panel",
    import: "Import",
    bulk: "Bulk edit",
    count: "panel(s)",
    countFaces: "face(s)",
    "th.code": "Code",
    "th.name": "Name",
    "th.owner": "Owner",
    "th.ville": "City",
    "th.format": "Format",
    "th.tech": "Tech.",
    "th.faces": "Faces",
    "th.tmja": "Max TMJA",
    "th.prix": "Price/wk",
    "th.status": "Status",
    "th.auth": "Authorization",
    "th.actions": "Actions",
    "faces.code": "Code",
    "faces.orient": "Orient.",
    "faces.tmja": "TMJA (veh./d)",
    "faces.audience": "Audience/d",
    "faces.odv": "ODV/d",
    "faces.prix": "Price/wk (DT)",
    "faces.occ": "Occupancy 12m",
    "faces.sov": "SOV",
    "faces.status": "Status",
    "faces.vis": "Visibility",
    "faces.actions": "Actions",
    "faces.add": "Add a face",
    "faces.none": "No face on this panel.",
    "faces.dispo": "free",
    empty: "No panel matches the search.",
    "del.panel.title": "Delete this panel?",
    "del.panel.desc": "The panel faces will be deleted in cascade. This action is logged.",
    "del.face.title": "Delete this face?",
    "del.face.desc": "The face will be removed from the referential. This action is logged.",
    "del.confirm": "Delete",
    "del.ok.panel": "Panel deleted",
    "del.ok.face": "Face deleted",
    "auth.none": "no authorization",
    "auth.expired": "expired",
    "detail.title": "Panel sheet",
    "detail.geo": "Coordinates",
    "detail.dim": "Dimensions",
    "detail.owner": "Owner",
    "detail.auth": "Municipal authorization",
    "detail.faces": "Panel faces",
    "import.title": "Import panels (CSV)",
    "import.desc": "Panel creation line by line — the owner code must exist. The import is logged (IMPORT action).",
  },
  ar: {
    header: "مرجع اللوحات والأوجه",
    headerDesc: "لوحات الشبكة وأوجهها. التعديل المباشر محفوظ للإدارة العليا ومُسجَّل.",
    search: "بحث (الرمز، الاسم، المدينة، المالك…)",
    "f.status": "الحالة",
    "f.all": "الكل",
    new: "لوحة جديدة",
    import: "استيراد",
    bulk: "تعديل جماعي",
    count: "لوحة",
    countFaces: "وجه",
    "th.code": "الرمز",
    "th.name": "الاسم",
    "th.owner": "المالك",
    "th.ville": "المدينة",
    "th.format": "الصيغة",
    "th.tech": "التقنية",
    "th.faces": "الأوجه",
    "th.tmja": "أقصى TMJA",
    "th.prix": "السعر/أسبوع",
    "th.status": "الحالة",
    "th.auth": "الترخيص",
    "th.actions": "إجراءات",
    "faces.code": "الرمز",
    "faces.orient": "الاتجاه",
    "faces.tmja": "TMJA",
    "faces.audience": "الجمهور/يوم",
    "faces.odv": "ODV/يوم",
    "faces.prix": "السعر/أسبوع",
    "faces.occ": "الإشغال 12م",
    "faces.sov": "SOV",
    "faces.status": "الحالة",
    "faces.vis": "الرؤية",
    "faces.actions": "إجراءات",
    "faces.add": "إضافة وجه",
    "faces.none": "لا أوجه على هذه اللوحة.",
    "faces.dispo": "متاح",
    empty: "لا لوحة تطابق البحث.",
    "del.panel.title": "حذف هذه اللوحة؟",
    "del.panel.desc": "ستُحذف الأوجه تبعًا للوحة. الإجراء مُسجَّل.",
    "del.face.title": "حذف هذا الوجه؟",
    "del.face.desc": "سيُحذف الوجه من المرجع. الإجراء مُسجَّل.",
    "del.confirm": "حذف",
    "del.ok.panel": "تم حذف اللوحة",
    "del.ok.face": "تم حذف الوجه",
    "auth.none": "بدون ترخيص",
    "auth.expired": "منتهي",
    "detail.title": "بطاقة اللوحة",
    "detail.geo": "الإحداثيات",
    "detail.dim": "الأبعاد",
    "detail.owner": "المالك",
    "detail.auth": "الترخيص البلدي",
    "detail.faces": "أوجه اللوحة",
    "import.title": "استيراد لوحات (CSV)",
    "import.desc": "إنشاء اللوحات سطرًا بسطر — يجب أن يكون رمز المالك موجودًا.",
  },
}

const PANEL_STATUSES = ["ACTIF", "MAINTENANCE", "RETIRE"] as const

const CSV_COLUMNS: CsvColumn[] = [
  { key: "code", label: "code", kind: "text" },
  { key: "name", label: "name", kind: "text" },
  { key: "ownerCode", label: "ownerCode", kind: "text" },
  { key: "supportType", label: "supportType", kind: "text" },
  { key: "format", label: "format", kind: "text" },
  { key: "technology", label: "technology", kind: "text" },
  { key: "lat", label: "lat", kind: "number" },
  { key: "lng", label: "lng", kind: "number" },
  { key: "governorat", label: "governorat", kind: "text" },
  { key: "delegation", label: "delegation", kind: "text" },
  { key: "ville", label: "ville", kind: "text" },
  { key: "prixSemaine", label: "prixSemaine", kind: "number" },
  { key: "tmja", label: "tmja", kind: "number" },
]

const CSV_HEADER = ["code", "name", "ownercode", "supporttype", "format", "technology", "lat", "lng", "governorat", "delegation", "ville", "prixsemaine", "tmja"]

export function SaMediaPanels() {
  const { t } = useSaMediaT(DICT)
  const { data, error, loading, reload, setData } = useSaMediaGet<{ panels: SaMediaPanelDTO[] }>("/api/media/panels")
  const ownersQ = useSaMediaGet<{ owners: import("@/lib/media/shared").OwnerDTO[] }>("/api/media/owners")

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selectedFaces, setSelectedFaces] = useState<Set<string>>(new Set())

  const [formOpen, setFormOpen] = useState(false)
  const [editingPanel, setEditingPanel] = useState<SaMediaPanelDTO | null>(null)
  const [faceFormPanel, setFaceFormPanel] = useState<SaMediaPanelDTO | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [deletingPanel, setDeletingPanel] = useState<SaMediaPanelDTO | null>(null)
  const [deletingFace, setDeletingFace] = useState<{ face: SaMediaPanelDTO["faces"][number]; panel: SaMediaPanelDTO } | null>(null)
  const [delBusy, setDelBusy] = useState(false)

  const panels = useMemo(() => {
    const list = data?.panels ?? []
    const q = search.trim().toLowerCase()
    return list.filter(p => {
      if (statusFilter !== "all" && p.status !== statusFilter) return false
      if (q === "") return true
      return (
        p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q) ||
        p.ville.toLowerCase().includes(q) || p.owner.name.toLowerCase().includes(q) ||
        p.governorat.toLowerCase().includes(q)
      )
    })
  }, [data, search, statusFilter])

  const detailPanel = useMemo(
    () => (detailId ? panels.find(p => p.id === detailId) ?? null : null),
    [panels, detailId],
  )

  const allFaces = useMemo(() => (data?.panels ?? []).flatMap(p => p.faces), [data])
  const selectedFaceRows = useMemo(
    () => allFaces.filter(f => selectedFaces.has(f.id)).map(f => ({ id: f.id, code: f.code })),
    [allFaces, selectedFaces],
  )

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleFaceSel(id: string) {
    setSelectedFaces(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Mise à jour optimiste d'un champ de face (rollback géré par EditableCell). */
  function updateFaceLocal(faceId: string, field: string, value: unknown) {
    setData(d => d ? {
      panels: d.panels.map(p => ({
        ...p,
        faces: p.faces.map(f => (f.id === faceId ? { ...f, [field]: value } : f)),
      })),
    } : d)
  }

  async function deletePanel() {
    if (!deletingPanel || delBusy) return
    setDelBusy(true)
    try {
      await apiJson(`/api/media/panels/${deletingPanel.id}`, { method: "DELETE" })
      toast.success(t("del.ok.panel"), { description: `${deletingPanel.code} — ${deletingPanel.faces.length} face(s) en cascade` })
      setDeletingPanel(null)
      if (detailId === deletingPanel.id) setDetailId(null)
      reload()
    } catch (e) {
      toast.error("Échec de la suppression", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setDelBusy(false)
    }
  }

  async function deleteFace() {
    if (!deletingFace || delBusy) return
    setDelBusy(true)
    try {
      await apiJson(`/api/media/faces/${deletingFace.face.id}`, { method: "DELETE" })
      toast.success(t("del.ok.face"), { description: `${deletingFace.face.code} (${deletingFace.panel.code})` })
      const faceId = deletingFace.face.id
      setData(d => d ? {
        panels: d.panels.map(p => p.id === deletingFace.panel.id
          ? { ...p, faces: p.faces.filter(f => f.id !== faceId) }
          : p),
      } : d)
      setSelectedFaces(prev => { const n = new Set(prev); n.delete(faceId); return n })
      setDeletingFace(null)
    } catch (e) {
      toast.error("Échec de la suppression", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setDelBusy(false)
    }
  }

  if (error !== null) return <ErrorState message={error} retry={reload} />

  const totalPanels = data?.panels.length ?? 0
  const totalFaces = allFaces.length

  return (
    <div className="min-w-0 space-y-4">
      <ModuleHeader icon={PanelsTopLeft} title={t("header")} description={t("headerDesc")} />

      <Card>
        <CardHeader className="gap-3 pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {t("header")}
            <span className="text-sm font-normal text-muted-foreground">
              {numFr(totalPanels)} {t("count")} · {numFr(totalFaces)} {t("countFaces")}
            </span>
          </CardTitle>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t("search")}
                className="h-10 pl-8"
                aria-label={t("search")}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-10 w-36" aria-label={t("f.status")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("f.all")}</SelectItem>
                  {PANEL_STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{PANEL_STATUS_META[s]?.label ?? s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={reload} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
                <span className="sr-only sm:not-sr-only">{t("common.reload")}</span>
              </Button>
              <Button
                variant="outline" size="sm" className="h-10 gap-1.5"
                onClick={() => setImportOpen(true)}
              >
                <FileUp className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{t("import")}</span>
              </Button>
              {selectedFaceRows.length > 0 ? (
                <Button
                  variant="outline" size="sm"
                  className="h-10 gap-1.5 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  onClick={() => setBulkOpen(true)}
                >
                  <Rows3 className="h-4 w-4" aria-hidden /> {t("bulk")} ({selectedFaceRows.length})
                </Button>
              ) : null}
              <Button size="sm" className="h-10 gap-1.5" onClick={() => { setEditingPanel(null); setFormOpen(true) }}>
                <Plus className="h-4 w-4" aria-hidden /> {t("new")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && totalPanels === 0 ? (
            <div className="space-y-2" aria-busy="true" aria-label={t("common.loading")}>
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : panels.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <div className="min-w-[64rem]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-10" aria-label="Expansion" />
                      <TableHead className="w-28">{t("th.code")}</TableHead>
                      <TableHead className="min-w-44">{t("th.name")}</TableHead>
                      <TableHead className="min-w-32">{t("th.owner")}</TableHead>
                      <TableHead className="min-w-24">{t("th.ville")}</TableHead>
                      <TableHead>{t("th.format")}</TableHead>
                      <TableHead>{t("th.tech")}</TableHead>
                      <TableHead className="text-center">{t("th.faces")}</TableHead>
                      <TableHead className="text-right">{t("th.tmja")}</TableHead>
                      <TableHead className="text-right">{t("th.prix")}</TableHead>
                      <TableHead>{t("th.status")}</TableHead>
                      <TableHead className="min-w-36">{t("th.auth")}</TableHead>
                      <TableHead className="w-28 text-right">{t("th.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {panels.map(p => {
                      const isOpen = expanded.has(p.id)
                      const stMeta = PANEL_STATUS_META[p.status]
                      const dl = daysLeft(p.authorizationEnd)
                      const tmjaMax = p.faces.length > 0 ? Math.max(...p.faces.map(f => f.tmja)) : null
                      const prixMin = p.faces.length > 0 ? Math.min(...p.faces.map(f => f.prixSemaine)) : null
                      const prixMax = p.faces.length > 0 ? Math.max(...p.faces.map(f => f.prixSemaine)) : null
                      const dispo = p.faces.filter(f => f.status === "DISPONIBLE").length
                      return (
                        <PanelRowGroup
                          key={p.id}
                          panel={p}
                          isOpen={isOpen}
                          stMetaClass={stMeta?.className ?? ""}
                          stLabel={stMeta?.label ?? p.status}
                          dl={dl}
                          tmjaMax={tmjaMax}
                          prixMin={prixMin}
                          prixMax={prixMax}
                          dispo={dispo}
                          selectedFaces={selectedFaces}
                          onToggle={() => toggleExpanded(p.id)}
                          onToggleFace={toggleFaceSel}
                          onEdit={() => { setEditingPanel(p); setFormOpen(true) }}
                          onDelete={() => setDeletingPanel(p)}
                          onDetail={() => setDetailId(p.id)}
                          onAddFace={() => setFaceFormPanel(p)}
                          onDeleteFace={f => setDeletingFace({ face: f, panel: p })}
                          onUpdateFace={updateFaceLocal}
                          t={t}
                        />
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground md:hidden">
            Tableau large — faites défiler horizontalement.
          </p>
        </CardContent>
      </Card>

      {/* ---- Dialogues ---- */}
      <SaMediaPanelForm
        open={formOpen}
        onOpenChange={o => { setFormOpen(o); if (!o) setEditingPanel(null) }}
        owners={ownersQ.data?.owners ?? []}
        panel={editingPanel}
        onSaved={reload}
      />
      <SaMediaFaceForm
        open={faceFormPanel !== null}
        onOpenChange={o => { if (!o) setFaceFormPanel(null) }}
        panel={faceFormPanel}
        onSaved={reload}
      />
      <SaMediaBulkEdit
        open={bulkOpen}
        onOpenChange={o => { setBulkOpen(o); if (!o) setSelectedFaces(new Set()) }}
        faces={selectedFaceRows}
        onDone={reload}
      />
      <SaMediaCsvImport
        open={importOpen}
        onOpenChange={setImportOpen}
        title={t("import.title")}
        description={t("import.desc")}
        expectedHeader={CSV_HEADER}
        columns={CSV_COLUMNS}
        applyRow={async cells => {
          const owner = (ownersQ.data?.owners ?? []).find(o => o.code.toLowerCase() === cells.ownerCode.toLowerCase())
          if (!owner) throw new Error(`Propriétaire inconnu : ${cells.ownerCode}`)
          await apiJson("/api/media/panels", {
            method: "POST",
            body: JSON.stringify({
              code: cells.code,
              name: cells.name,
              ownerId: owner.id,
              supportType: cells.supportType,
              format: cells.format,
              technology: cells.technology,
              lat: Number(cells.lat.replace(",", ".")),
              lng: Number(cells.lng.replace(",", ".")),
              governorat: cells.governorat,
              delegation: cells.delegation,
              ville: cells.ville,
              faces: [{ prixSemaine: Number(cells.prixSemaine.replace(",", ".")), tmja: Number(cells.tmja.replace(",", ".")) }],
            }),
          })
        }}
        onDone={reload}
      />

      {/* ---- Suppressions ---- */}
      <AlertDialog open={deletingPanel !== null} onOpenChange={o => { if (!delBusy && !o) setDeletingPanel(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("del.panel.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingPanel ? `${deletingPanel.code} — ${deletingPanel.name} · ${deletingPanel.faces.length} face(s)` : ""}
              {" · "}
              {t("del.panel.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delBusy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={delBusy}
              className="gap-1.5 bg-red-600 text-white hover:bg-red-700"
              onClick={e => { e.preventDefault(); void deletePanel() }}
            >
              {delBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("del.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deletingFace !== null} onOpenChange={o => { if (!delBusy && !o) setDeletingFace(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("del.face.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingFace ? `${deletingFace.face.code} — ${deletingFace.panel.code}` : ""}
              {" · "}
              {t("del.face.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delBusy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={delBusy}
              className="gap-1.5 bg-red-600 text-white hover:bg-red-700"
              onClick={e => { e.preventDefault(); void deleteFace() }}
            >
              {delBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("del.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ---- Sheet détail panneau (fiche + photos) ---- */}
      <Sheet open={detailPanel !== null} onOpenChange={o => { if (!o) setDetailId(null) }}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="font-mono text-base">{detailPanel?.code}</SheetTitle>
            <SheetDescription>
              {detailPanel ? `${detailPanel.name} · ${detailPanel.ville} (${detailPanel.governorat})` : ""}
            </SheetDescription>
          </SheetHeader>
          {detailPanel ? (
            <div className="space-y-5 px-4 pb-6">
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <DetailItem label={t("th.owner")} value={detailPanel.owner.name} sub={detailPanel.owner.code} />
                <DetailItem label={t("th.format")} value={detailPanel.format} sub={detailPanel.supportType} />
                <DetailItem label={t("th.tech")} value={detailPanel.technology} sub={detailPanel.illumination} />
                <DetailItem
                  label={t("detail.dim")}
                  value={`${detailPanel.widthCm} × ${detailPanel.heightCm} cm`}
                  sub={`${detailPanel.heightAboveGroundM} m au sol`}
                />
                <DetailItem
                  label={t("detail.geo")}
                  value={`${detailPanel.lat.toFixed(5)}, ${detailPanel.lng.toFixed(5)}`}
                  sub={detailPanel.rue ?? detailPanel.delegation}
                />
                <DetailItem
                  label={t("detail.auth")}
                  value={detailPanel.authorizationRef ?? t("auth.none")}
                  sub={`${dateFr(detailPanel.authorizationStart)} → ${dateFr(detailPanel.authorizationEnd)}`}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={PANEL_STATUS_META[detailPanel.status]?.className ?? ""}>
                  {PANEL_STATUS_META[detailPanel.status]?.label ?? detailPanel.status}
                </Badge>
                <Badge variant="outline" className={dueBadgeClass(detailPanel.authorizationEnd)}>
                  {(() => { const d = daysLeft(detailPanel.authorizationEnd); return d === null ? t("auth.none") : d < 0 ? t("auth.expired") : `J-${d}` })()}
                </Badge>
                <Badge variant="outline" className="border-zinc-300 bg-zinc-50 text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                  {detailPanel.faces.length} {t("countFaces")}
                </Badge>
              </div>

              <Separator />

              {/* ---- Faces du panneau ---- */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">{t("detail.faces")}</p>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("faces.code")}</TableHead>
                        <TableHead className="text-right">{t("faces.tmja")}</TableHead>
                        <TableHead className="text-right">{t("faces.prix")}</TableHead>
                        <TableHead>{t("faces.status")}</TableHead>
                        <TableHead>{t("faces.vis")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detailPanel.faces.map(f => (
                        <TableRow key={f.id}>
                          <TableCell className="font-mono text-xs font-semibold">{f.code}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{numFr(f.tmja)}</TableCell>
                          <TableCell className="text-right text-sm tabular-nums">{dtFr(f.prixSemaine)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={FACE_STATUS_META[f.status]?.className ?? ""}>
                              {FACE_STATUS_META[f.status]?.label ?? f.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={VISIBILITY_MODE_META[f.visibilityMode]?.className ?? ""} title={VISIBILITY_MODE_META[f.visibilityMode]?.hint}>
                              {VISIBILITY_MODE_META[f.visibilityMode]?.label ?? f.visibilityMode}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <Separator />
              <SaMediaPhotos panel={detailPanel} onSaved={reload} />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => { setFaceFormPanel(detailPanel) }}>
                  <Plus className="h-4 w-4" aria-hidden /> {t("faces.add")}
                </Button>
                <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => { setEditingPanel(detailPanel); setFormOpen(true) }}>
                  <Pencil className="h-4 w-4" aria-hidden /> {t("common.edit")}
                </Button>
                <Button variant="outline" size="sm" className="h-9 gap-1.5 text-red-600 dark:text-red-400" onClick={() => setDeletingPanel(detailPanel)}>
                  <Trash2 className="h-4 w-4" aria-hidden /> {t("common.delete")}
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function DetailItem({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="min-w-0 rounded-lg border p-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold" title={value}>{value}</p>
      {sub ? <p className="truncate text-xs text-muted-foreground" title={sub}>{sub}</p> : null}
    </div>
  )
}

// ─────────────────── Ligne panneau + faces imbriquées ───────────────────

type TFn = (key: string) => string

interface PanelRowGroupProps {
  panel: SaMediaPanelDTO
  isOpen: boolean
  stMetaClass: string
  stLabel: string
  dl: number | null
  tmjaMax: number | null
  prixMin: number | null
  prixMax: number | null
  dispo: number
  selectedFaces: Set<string>
  onToggle: () => void
  onToggleFace: (id: string) => void
  onEdit: () => void
  onDelete: () => void
  onDetail: () => void
  onAddFace: () => void
  onDeleteFace: (face: SaMediaPanelDTO["faces"][number]) => void
  onUpdateFace: (faceId: string, field: string, value: unknown) => void
  t: TFn
}

function PanelRowGroup(p: PanelRowGroupProps) {
  const { panel, t } = p
  return (
    <>
      <TableRow className="cursor-pointer hover:bg-zinc-50/80 dark:hover:bg-zinc-900/60" onClick={p.onToggle}>
        <TableCell className="w-10">
          <button
            type="button"
            onClick={e => { e.stopPropagation(); p.onToggle() }}
            className="flex h-8 w-8 items-center justify-center rounded hover:bg-zinc-200 dark:hover:bg-zinc-800"
            aria-expanded={p.isOpen}
            aria-label={`${p.isOpen ? "Replier" : "Déplier"} ${panel.code}`}
          >
            {p.isOpen ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
          </button>
        </TableCell>
        <TableCell className="font-mono text-xs font-semibold">{panel.code}</TableCell>
        <TableCell className="max-w-44 truncate text-sm" title={panel.name}>{panel.name}</TableCell>
        <TableCell className="max-w-36 truncate text-sm text-muted-foreground" title={panel.owner.name}>{panel.owner.name}</TableCell>
        <TableCell className="text-sm">{panel.ville}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{panel.format}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{panel.technology}</TableCell>
        <TableCell className="text-center">
          <span className="inline-flex items-center gap-1.5">
            <Badge variant="outline" className="border-zinc-300 bg-zinc-50 tabular-nums dark:border-zinc-700 dark:bg-zinc-900">
              {panel.faces.length}
            </Badge>
            {p.dispo > 0 ? (
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 tabular-nums text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                {p.dispo} {t("faces.dispo")}
              </Badge>
            ) : null}
          </span>
        </TableCell>
        <TableCell className="text-right text-sm tabular-nums">{numFr(p.tmjaMax)}</TableCell>
        <TableCell className="text-right text-sm tabular-nums">
          {p.prixMin === null || p.prixMax === null
            ? "—"
            : p.prixMin === p.prixMax
              ? dtFr(p.prixMin)
              : `${numFr(p.prixMin)} – ${numFr(p.prixMax)}`}
        </TableCell>
        <TableCell><Badge variant="outline" className={p.stMetaClass}>{p.stLabel}</Badge></TableCell>
        <TableCell>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span className="text-xs tabular-nums text-muted-foreground">{dateFr(panel.authorizationEnd)}</span>
            <Badge variant="outline" className={dueBadgeClass(panel.authorizationEnd)}>
              {p.dl === null ? t("auth.none") : p.dl < 0 ? t("auth.expired") : `J-${p.dl}`}
            </Badge>
          </span>
        </TableCell>
        <TableCell onClick={e => e.stopPropagation()}>
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={p.onDetail} aria-label={`${t("detail.title")} ${panel.code}`} title={t("detail.title")}>
              <Eye className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={p.onEdit} aria-label={`${t("common.edit")} ${panel.code}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button
              variant="ghost" size="icon" className="h-8 w-8 text-red-600 dark:text-red-400"
              onClick={p.onDelete} aria-label={`${t("common.delete")} ${panel.code}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {p.isOpen ? (
        <TableRow className="bg-zinc-50/60 hover:bg-zinc-50/60 dark:bg-zinc-900/40 dark:hover:bg-zinc-900/40">
          <TableCell colSpan={13} className="px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                <SquareStack className="h-3.5 w-3.5" aria-hidden />
                {panel.code} — {panel.faces.length} {t("countFaces")}
                <span className="ml-1 font-normal">· édition en ligne : clic sur une cellule</span>
              </p>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950" onClick={p.onAddFace}>
                <Plus className="h-3.5 w-3.5" aria-hidden /> {t("faces.add")}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border bg-background">
              <div className="min-w-[58rem]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10" aria-label="Sélection" />
                      <TableHead className="w-32">{t("faces.code")}</TableHead>
                      <TableHead>{t("faces.orient")}</TableHead>
                      <TableHead className="text-right">{t("faces.tmja")}</TableHead>
                      <TableHead className="text-right">{t("faces.audience")}</TableHead>
                      <TableHead className="text-right">{t("faces.odv")}</TableHead>
                      <TableHead className="text-right">{t("faces.prix")}</TableHead>
                      <TableHead className="text-right">{t("faces.occ")}</TableHead>
                      <TableHead className="text-right">{t("faces.sov")}</TableHead>
                      <TableHead>{t("faces.status")}</TableHead>
                      <TableHead>{t("faces.vis")}</TableHead>
                      <TableHead className="w-12 text-right">{t("faces.actions")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {panel.faces.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="py-6 text-center text-sm text-muted-foreground">{t("faces.none")}</TableCell>
                      </TableRow>
                    ) : panel.faces.map(f => {
                      const vis = VISIBILITY_MODE_META[f.visibilityMode]
                      const stMeta = FACE_STATUS_META[f.status]
                      return (
                        <TableRow key={f.id}>
                          <TableCell>
                            <Checkbox
                              checked={p.selectedFaces.has(f.id)}
                              onCheckedChange={() => p.onToggleFace(f.id)}
                              aria-label={`Sélectionner ${f.code}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold">{f.code}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{f.orientation}</TableCell>
                          <TableCell className="text-right">
                            <EditableCell
                              faceId={f.id}
                              def={FIELD_BY_KEY.tmja}
                              value={f.tmja}
                              formatted={numFr(f.tmja)}
                              onCommit={v => p.onUpdateFace(f.id, "tmja", v)}
                              compact
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <EditableCell
                              faceId={f.id}
                              def={FIELD_BY_KEY.audienceJournaliere}
                              value={f.audienceJournaliere}
                              formatted={numFr(f.audienceJournaliere)}
                              onCommit={v => p.onUpdateFace(f.id, "audienceJournaliere", v)}
                              compact
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <EditableCell
                              faceId={f.id}
                              def={FIELD_BY_KEY.odvJournalieres}
                              value={f.odvJournalieres}
                              formatted={numFr(f.odvJournalieres)}
                              onCommit={v => p.onUpdateFace(f.id, "odvJournalieres", v)}
                              compact
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <EditableCell
                              faceId={f.id}
                              def={FIELD_BY_KEY.prixSemaine}
                              value={f.prixSemaine}
                              formatted={dtFr(f.prixSemaine)}
                              onCommit={v => p.onUpdateFace(f.id, "prixSemaine", v)}
                              compact
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <EditableCell
                              faceId={f.id}
                              def={FIELD_BY_KEY.tauxOccupation12m}
                              value={f.tauxOccupation12m}
                              formatted={pctFr(f.tauxOccupation12m)}
                              onCommit={v => p.onUpdateFace(f.id, "tauxOccupation12m", v)}
                              compact
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <EditableCell
                              faceId={f.id}
                              def={FIELD_BY_KEY.partDeVoix}
                              value={f.partDeVoix}
                              formatted={pctFr(f.partDeVoix)}
                              onCommit={() => undefined}
                              compact
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={stMeta?.className ?? ""}>{stMeta?.label ?? f.status}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={vis?.className ?? ""} title={vis?.hint}>{vis?.label ?? f.visibilityMode}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost" size="icon" className="h-8 w-8 text-red-600 dark:text-red-400"
                              onClick={() => p.onDeleteFace(f)}
                              aria-label={`${t("common.delete")} ${f.code}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              {panel.rue ?? panel.delegation} · {panel.lat.toFixed(5)}, {panel.lng.toFixed(5)}
            </p>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  )
}
