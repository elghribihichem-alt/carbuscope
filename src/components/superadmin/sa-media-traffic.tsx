'use client'

// CarbuScope — Module Média (T60-g) — volet SA « Trafic & audience » :
// gestion des flux routiers et de l'audience des faces.
//   · liste aplatie des faces (GET /api/media/faces — le résolveur sert TOUT
//     le référentiel en accès FULL à la SA, y compris les champs trafic
//     détaillés : heure de pointe, parts modales, vitesses, congestion) avec
//     colonnes ÉDITABLES EN LIGNE — PATCH /api/media/faces/[id] {field,
//     value}, optimiste + rollback ;
//   · édition en masse avec prévisualisation (POST /api/media/faces/bulk) ;
//   · import CSV (code;tmja;audienceJournaliere;odvJournalieres) appliqué
//     ligne à ligne (3 PATCH par ligne) ;
//   · historique des révisions : dernières entrées d'audit entityType=FACE.

import { useMemo, useState } from "react"
import { Activity, FileUp, History, Info, RefreshCw, Rows3, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { ErrorState } from "@/components/shell/loading"
import {
  ModuleHeader, FACE_STATUS_META, apiJson, numFr, pctFr,
} from "@/components/media/media-shared"
import {
  FIELD_BY_KEY, type FaceFullDTO, type FacesListResponse, type MediaAuditDTO,
} from "@/lib/media/shared"
import {
  useSaMediaGet, useSaMediaT, EditableCell, type SaAuditPageDTO,
} from "./sa-media/sa-media-shared"
import { SaMediaBulkEdit } from "./sa-media/sa-media-bulk-edit"
import { SaMediaCsvImport, type CsvColumn } from "./sa-media/sa-media-import"

const DICT = {
  fr: {
    header: "Trafic & audience des faces",
    headerDesc: "Volumes routiers, répartition modale, vitesses et audience journalière. Champs maintenus à jour par le terrain — toute modification est journalisée.",
    note: "Les informations de trafic sont éditables par les enseignes sur leurs faces visibles — toute modification est journalisée dans l'audit (ancienne → nouvelle valeur, auteur, IP).",
    count: "face(s)",
    search: "Rechercher (code, panneau, ville…)",
    bulk: "Édition en masse",
    import: "Importer",
    "th.code": "Code",
    "th.panel": "Panneau",
    "th.ville": "Ville",
    "th.tmja": "TMJA",
    "th.pointe": "Heure pointe",
    "th.p2r": "2-roues",
    "th.pvl": "VL",
    "th.ppl": "PL",
    "th.ptx": "Taxis",
    "th.vreg": "V. rég.",
    "th.vreel": "V. réelle",
    "th.cong": "Congestion",
    "th.aud": "Audience/j",
    "th.odv": "ODV/j",
    "th.status": "Statut",
    empty: "Aucune face ne correspond à la recherche.",
    "import.title": "Importer trafic & audience (CSV)",
    "import.desc": "Mise à jour ligne à ligne : TMJA, audience et ODV journalières. La face doit exister (code exact). Chaque changement est journalisé.",
    "hist.title": "Historique des révisions",
    "hist.desc": "Dernières modifications de faces (champs trafic/audience) — extrait du journal d'audit.",
    "hist.actor": "Acteur",
    "hist.date": "Date",
    "hist.field": "Champ",
    "hist.change": "Ancienne → nouvelle",
    "hist.empty": "Aucune révision enregistrée pour le moment.",
  },
  en: {
    header: "Face traffic & audience",
    headerDesc: "Road volumes, modal split, speeds and daily audience. Field-maintained data — every change is logged.",
    note: "Traffic data can be edited by brands on their visible faces — every change is logged in the audit journal (old → new value, author, IP).",
    count: "face(s)",
    search: "Search (code, panel, city…)",
    bulk: "Bulk edit",
    import: "Import",
    "th.code": "Code",
    "th.panel": "Panel",
    "th.ville": "City",
    "th.tmja": "TMJA",
    "th.pointe": "Peak hour",
    "th.p2r": "2-wheel",
    "th.pvl": "LV",
    "th.ppl": "HGV",
    "th.ptx": "Taxis",
    "th.vreg": "Reg. speed",
    "th.vreel": "Real speed",
    "th.cong": "Congestion",
    "th.aud": "Audience/d",
    "th.odv": "ODV/d",
    "th.status": "Status",
    empty: "No face matches the search.",
    "import.title": "Import traffic & audience (CSV)",
    "import.desc": "Line-by-line update: TMJA, audience and daily ODV. The face must exist (exact code). Each change is logged.",
    "hist.title": "Revision history",
    "hist.desc": "Latest face edits (traffic/audience fields) — extract from the audit journal.",
    "hist.actor": "Actor",
    "hist.date": "Date",
    "hist.field": "Field",
    "hist.change": "Old → new",
    "hist.empty": "No revision recorded yet.",
  },
  ar: {
    header: "المرور والجمهور للأوجه",
    headerDesc: "أحجام المرور وتوزيع المركبات والسرعات والجمهور اليومي — كل تعديل مُسجَّل.",
    note: "يمكن للعلامات تعديل معلومات المرور على أوجهها المرئية — وكل تعديل يُسجَّل في التدقيق.",
    count: "وجه",
    search: "بحث (الرمز، اللوحة، المدينة…)",
    bulk: "تعديل جماعي",
    import: "استيراد",
    "th.code": "الرمز",
    "th.panel": "اللوحة",
    "th.ville": "المدينة",
    "th.tmja": "TMJA",
    "th.pointe": "ذروة الساعة",
    "th.p2r": "دراجات",
    "th.pvl": "سيارات",
    "th.ppl": "شاحنات",
    "th.ptx": "سيارات أجرة",
    "th.vreg": "السرعة النظامية",
    "th.vreel": "السرعة الفعلية",
    "th.cong": "الازدحام",
    "th.aud": "الجمهور/يوم",
    "th.odv": "ODV/يوم",
    "th.status": "الحالة",
    empty: "لا وجه يطابق البحث.",
    "import.title": "استيراد المرور والجمهور (CSV)",
    "import.desc": "تحديث سطرًا بسطر: TMJA والجمهور وODV.",
    "hist.title": "سجل المراجعات",
    "hist.desc": "آخر تعديلات الأوجه — مقتطف من سجل التدقيق.",
    "hist.actor": "الفاعل",
    "hist.date": "التاريخ",
    "hist.field": "الحقل",
    "hist.change": "القديمة → الجديدة",
    "hist.empty": "لا مراجعات بعد.",
  },
}

const CSV_COLUMNS: CsvColumn[] = [
  { key: "code", label: "code", kind: "text" },
  { key: "tmja", label: "tmja", kind: "number" },
  { key: "audienceJournaliere", label: "audienceJournaliere", kind: "number" },
  { key: "odvJournalieres", label: "odvJournalieres", kind: "number" },
]
const CSV_HEADER = ["code", "tmja", "audiencejournaliere", "odvjournalieres"]

interface FlatFace {
  face: FaceFullDTO
  panelCode: string
  panelName: string
  ville: string
}

type TrafficKey =
  | "tmja" | "traficHeurePointe" | "partDeuxRoues" | "partVL" | "partPL" | "partTaxis"
  | "vitesseReglementaire" | "vitesseReelle" | "indiceCongestion"
  | "audienceJournaliere" | "odvJournalieres"

const isFull = (f: FacesListResponse["panels"][number]["faces"][number]): f is FaceFullDTO => f.access === "FULL"

export function SaMediaTraffic() {
  const { t } = useSaMediaT(DICT)
  const { data, error, loading, reload, setData } = useSaMediaGet<FacesListResponse>("/api/media/faces")
  const auditQ = useSaMediaGet<SaAuditPageDTO>("/api/media/audit?p=1")

  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importOpen, setImportOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)

  const faces = useMemo<FlatFace[]>(() => {
    const list: FlatFace[] = []
    for (const p of data?.panels ?? []) {
      for (const f of p.faces) {
        if (isFull(f)) list.push({ face: f, panelCode: p.code, panelName: p.name, ville: p.ville })
      }
    }
    const q = search.trim().toLowerCase()
    if (q === "") return list
    return list.filter(x =>
      x.face.code.toLowerCase().includes(q) || x.panelName.toLowerCase().includes(q) || x.ville.toLowerCase().includes(q),
    )
  }, [data, search])

  /** Historique : entrées FACE de la dernière page d'audit (filtrage client). */
  const history = useMemo<MediaAuditDTO[]>(
    () => (auditQ.data?.entries ?? []).filter(e => e.entityType === "FACE" && e.action === "EDIT").slice(0, 12),
    [auditQ.data],
  )

  function toggleSel(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function updateFaceLocal(faceId: string, field: string, value: unknown) {
    setData(d => {
      if (!d) return d
      return {
        panels: d.panels.map(p => ({
          ...p,
          faces: p.faces.map(f => (f.id === faceId ? { ...f, [field]: value } : f)),
        })),
      } as FacesListResponse
    })
  }

  if (error !== null) return <ErrorState message={error} retry={reload} />

  const selectedRows = faces.filter(x => selected.has(x.face.id)).map(x => ({ id: x.face.id, code: x.face.code }))

  const cell = (f: FaceFullDTO, key: TrafficKey, formatted: string) => (
    <EditableCell
      faceId={f.id}
      def={FIELD_BY_KEY[key]}
      value={f[key]}
      formatted={formatted}
      onCommit={v => updateFaceLocal(f.id, key, v)}
      compact
    />
  )

  return (
    <div className="min-w-0 space-y-4">
      <ModuleHeader icon={Activity} title={t("header")} description={t("headerDesc")} />

      <Card className="border-amber-300/70 bg-amber-50/50 dark:border-amber-800/70 dark:bg-amber-950/30">
        <CardContent className="flex items-start gap-2.5 p-4">
          <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
          <p className="text-sm leading-relaxed text-amber-800 dark:text-amber-300">{t("note")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {t("header")}
            <span className="text-sm font-normal text-muted-foreground">{numFr(faces.length)} {t("count")}</span>
          </CardTitle>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder={t("search")} className="h-10 pl-8"
                aria-label={t("search")}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={() => { reload(); auditQ.reload() }} disabled={loading}>
                <RefreshCw className="h-4 w-4" aria-hidden /> <span className="sr-only sm:not-sr-only">{t("common.reload")}</span>
              </Button>
              <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={() => setImportOpen(true)}>
                <FileUp className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">{t("import")}</span>
              </Button>
              {selectedRows.length > 0 ? (
                <Button
                  variant="outline" size="sm"
                  className="h-10 gap-1.5 border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  onClick={() => setBulkOpen(true)}
                >
                  <Rows3 className="h-4 w-4" aria-hidden /> {t("bulk")} ({selectedRows.length})
                </Button>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && faces.length === 0 ? (
            <div className="space-y-2" aria-busy="true" aria-label={t("common.loading")}>
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : faces.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <div className="min-w-[70rem]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="w-10" aria-label="Sélection" />
                      <TableHead className="w-32">{t("th.code")}</TableHead>
                      <TableHead className="min-w-32">{t("th.panel")}</TableHead>
                      <TableHead className="min-w-24">{t("th.ville")}</TableHead>
                      <TableHead className="text-right">{t("th.tmja")}</TableHead>
                      <TableHead className="text-right">{t("th.pointe")}</TableHead>
                      <TableHead className="text-right">{t("th.p2r")}</TableHead>
                      <TableHead className="text-right">{t("th.pvl")}</TableHead>
                      <TableHead className="text-right">{t("th.ppl")}</TableHead>
                      <TableHead className="text-right">{t("th.ptx")}</TableHead>
                      <TableHead className="text-right">{t("th.vreg")}</TableHead>
                      <TableHead className="text-right">{t("th.vreel")}</TableHead>
                      <TableHead className="text-right">{t("th.cong")}</TableHead>
                      <TableHead className="text-right">{t("th.aud")}</TableHead>
                      <TableHead className="text-right">{t("th.odv")}</TableHead>
                      <TableHead>{t("th.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {faces.map(({ face: f, panelCode, ville }) => {
                      const stMeta = FACE_STATUS_META[f.status]
                      return (
                        <TableRow key={f.id}>
                          <TableCell>
                            <Checkbox
                              checked={selected.has(f.id)}
                              onCheckedChange={() => toggleSel(f.id)}
                              aria-label={`Sélectionner ${f.code}`}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold">{f.code}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{panelCode}</TableCell>
                          <TableCell className="text-sm">{ville}</TableCell>
                          <TableCell className="text-right">{cell(f, "tmja", numFr(f.tmja))}</TableCell>
                          <TableCell className="text-right">{cell(f, "traficHeurePointe", numFr(f.traficHeurePointe))}</TableCell>
                          <TableCell className="text-right">{cell(f, "partDeuxRoues", pctFr(f.partDeuxRoues))}</TableCell>
                          <TableCell className="text-right">{cell(f, "partVL", pctFr(f.partVL))}</TableCell>
                          <TableCell className="text-right">{cell(f, "partPL", pctFr(f.partPL))}</TableCell>
                          <TableCell className="text-right">{cell(f, "partTaxis", pctFr(f.partTaxis))}</TableCell>
                          <TableCell className="text-right">{cell(f, "vitesseReglementaire", numFr(f.vitesseReglementaire))}</TableCell>
                          <TableCell className="text-right">{cell(f, "vitesseReelle", numFr(f.vitesseReelle))}</TableCell>
                          <TableCell className="text-right">{cell(f, "indiceCongestion", numFr(f.indiceCongestion))}</TableCell>
                          <TableCell className="text-right">{cell(f, "audienceJournaliere", numFr(f.audienceJournaliere))}</TableCell>
                          <TableCell className="text-right">{cell(f, "odvJournalieres", numFr(f.odvJournalieres))}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={stMeta?.className ?? ""}>{stMeta?.label ?? f.status}</Badge>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Historique des révisions ---- */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" aria-hidden /> {t("hist.title")}
          </CardTitle>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("hist.desc")}</p>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("hist.empty")}</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="min-w-36">{t("hist.actor")}</TableHead>
                    <TableHead className="min-w-36">{t("hist.date")}</TableHead>
                    <TableHead className="min-w-28">{t("hist.field")}</TableHead>
                    <TableHead className="min-w-44">{t("hist.change")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map(e => (
                    <TableRow key={e.id}>
                      <TableCell>
                        <p className="text-sm font-medium leading-tight">{e.actorName}</p>
                        <p className="text-[11px] text-muted-foreground">{e.actorEmail}</p>
                      </TableCell>
                      <TableCell className="text-xs tabular-nums text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </TableCell>
                      <TableCell className="text-sm">{e.field ?? "—"}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
                          <span className="text-muted-foreground line-through decoration-zinc-400/60">{e.oldValue ?? "—"}</span>
                          <span aria-hidden>→</span>
                          <span className="font-semibold text-emerald-700 dark:text-emerald-400">{e.newValue ?? "—"}</span>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Dialogues ---- */}
      <SaMediaBulkEdit
        open={bulkOpen}
        onOpenChange={o => { setBulkOpen(o); if (!o) setSelected(new Set()) }}
        faces={selectedRows}
        onDone={() => { reload(); auditQ.reload() }}
      />
      <SaMediaCsvImport
        open={importOpen}
        onOpenChange={setImportOpen}
        title={t("import.title")}
        description={t("import.desc")}
        expectedHeader={CSV_HEADER}
        columns={CSV_COLUMNS}
        applyRow={async cells => {
          const all: FaceFullDTO[] = []
          for (const p of data?.panels ?? []) for (const f of p.faces) if (isFull(f)) all.push(f)
          const found = all.find(f => f.code.toLowerCase() === cells.code.toLowerCase())
          if (!found) throw new Error(`Face inconnue : ${cells.code}`)
          const num = (v: string) => Number(v.replace(",", "."))
          await apiJson(`/api/media/faces/${found.id}`, { method: "PATCH", body: JSON.stringify({ field: "tmja", value: num(cells.tmja) }) })
          await apiJson(`/api/media/faces/${found.id}`, { method: "PATCH", body: JSON.stringify({ field: "audienceJournaliere", value: num(cells.audienceJournaliere) }) })
          await apiJson(`/api/media/faces/${found.id}`, { method: "PATCH", body: JSON.stringify({ field: "odvJournalieres", value: num(cells.odvJournalieres) }) })
        }}
        onDone={() => { reload(); auditQ.reload() }}
      />
    </div>
  )
}
