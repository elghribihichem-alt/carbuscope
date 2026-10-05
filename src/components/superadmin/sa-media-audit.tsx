'use client'

// CarbuScope — Module Média (T60-g) — volet SA « Journal d'audit » : trace
// INALTÉRABLE (ajout seul) de toutes les actions du module Média — éditions
// de faces (ancienne → nouvelle valeur), permissions, créations/suppressions,
// imports, simulations, partages.
//   · filtres : acteur (email), action, champ (contient), période from/to ;
//   · table paginée serveur (50/page) : date+heure, acteur, action (badge
//     coloré), entité, champ, ancienne (zinc barré) → nouvelle (émeraude),
//     IP en tooltip ;
//   · bandeau « ajout seul — inaltérable par conception » (icône Lock).
// Données : GET /api/media/audit?actor=&field=&action=&from=&to=&p=

import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, Lock, RefreshCw, RotateCcw, ScrollText, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ErrorState } from "@/components/shell/loading"
import { ModuleHeader, numFr } from "@/components/media/media-shared"
import { useSaMediaGet, useSaMediaT, type SaAuditPageDTO } from "./sa-media/sa-media-shared"

const DICT = {
  fr: {
    header: "Journal d'audit du module Média",
    headerDesc: "Chaque écriture du référentiel (panneaux, faces, propriétaires, permissions, moteur) est tracée : acteur, champ, ancienne et nouvelle valeur, date, IP.",
    immutable: "Journal en ajout seul — inaltérable par conception",
    immutableDesc: "Aucune route de modification ou de suppression n'existe : les entrées ne peuvent qu'être ajoutées.",
    "f.actor": "Acteur (email)",
    "f.actorPh": "sonia.beiji@agil.tn",
    "f.action": "Action",
    "f.allActions": "Toutes",
    "f.field": "Champ (contient)",
    "f.fieldPh": "TMJA…",
    "f.from": "Du",
    "f.to": "Au",
    "f.reset": "Réinitialiser",
    "th.date": "Date",
    "th.actor": "Acteur",
    "th.action": "Action",
    "th.entity": "Entité",
    "th.field": "Champ",
    "th.change": "Ancienne → nouvelle",
    "th.ip": "IP",
    page: "page {p} / {pages} · {n} entrée(s)",
    prev: "Précédent",
    next: "Suivant",
    empty: "Aucune entrée d'audit ne correspond aux filtres.",
    "a.EDIT": "Édition",
    "a.CREATE": "Création",
    "a.DELETE": "Suppression",
    "a.IMPORT": "Import",
    "a.PERMISSION": "Permission",
    "a.SIMULATION": "Simulation",
    "a.SHARE": "Partage",
    "a.MEMBRE": "Membre",
  },
  en: {
    header: "Media module audit journal",
    headerDesc: "Every referential write (panels, faces, owners, permissions, engine) is traced: actor, field, old and new value, date, IP.",
    immutable: "Append-only journal — immutable by design",
    immutableDesc: "No edit or delete route exists: entries can only be added.",
    "f.actor": "Actor (email)",
    "f.actorPh": "sonia.beiji@agil.tn",
    "f.action": "Action",
    "f.allActions": "All",
    "f.field": "Field (contains)",
    "f.fieldPh": "TMJA…",
    "f.from": "From",
    "f.to": "To",
    "f.reset": "Reset",
    "th.date": "Date",
    "th.actor": "Actor",
    "th.action": "Action",
    "th.entity": "Entity",
    "th.field": "Field",
    "th.change": "Old → new",
    "th.ip": "IP",
    page: "page {p} / {pages} · {n} entr(ies)",
    prev: "Previous",
    next: "Next",
    empty: "No audit entry matches the filters.",
    "a.EDIT": "Edit",
    "a.CREATE": "Create",
    "a.DELETE": "Delete",
    "a.IMPORT": "Import",
    "a.PERMISSION": "Permission",
    "a.SIMULATION": "Simulation",
    "a.SHARE": "Share",
    "a.MEMBRE": "Member",
  },
  ar: {
    header: "سجل تدقيق وحدة الإعلام",
    headerDesc: "كل كتابة في المرجع مُتبَّعة: الفاعل والحقل والقيمتان والتاريخ وIP.",
    immutable: "سجل بالإضافة فقط — غير قابل للتغيير بحسب التصميم",
    immutableDesc: "لا توجد مسارات تعديل أو حذف.",
    "f.actor": "الفاعل (البريد)",
    "f.actorPh": "sonia.beiji@agil.tn",
    "f.action": "الإجراء",
    "f.allActions": "الكل",
    "f.field": "الحقل (يحتوي)",
    "f.fieldPh": "TMJA…",
    "f.from": "من",
    "f.to": "إلى",
    "f.reset": "إعادة تعيين",
    "th.date": "التاريخ",
    "th.actor": "الفاعل",
    "th.action": "الإجراء",
    "th.entity": "الكيان",
    "th.field": "الحقل",
    "th.change": "القديمة → الجديدة",
    "th.ip": "IP",
    page: "صفحة {p} / {pages} · {n} إدخال",
    prev: "السابق",
    next: "التالي",
    empty: "لا إدخالات تطابق التصفية.",
    "a.EDIT": "تعديل",
    "a.CREATE": "إنشاء",
    "a.DELETE": "حذف",
    "a.IMPORT": "استيراد",
    "a.PERMISSION": "صلاحية",
    "a.SIMULATION": "محاكاة",
    "a.SHARE": "مشاركة",
    "a.MEMBRE": "عضو",
  },
}

const ACTIONS = ["EDIT", "CREATE", "DELETE", "IMPORT", "PERMISSION", "SIMULATION", "SHARE", "MEMBRE"] as const

const ACTION_META: Record<string, { labelKey: string; className: string }> = {
  EDIT: { labelKey: "a.EDIT", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  CREATE: { labelKey: "a.CREATE", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  DELETE: { labelKey: "a.DELETE", className: "border-red-300 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400" },
  IMPORT: { labelKey: "a.IMPORT", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
  PERMISSION: { labelKey: "a.PERMISSION", className: "border-[#d8a08c] bg-[#fdeee8] text-[#b0563b] dark:border-[#7a3c2a] dark:bg-[#2a1a13] dark:text-[#e0957a]" },
  SIMULATION: { labelKey: "a.SIMULATION", className: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400" },
  SHARE: { labelKey: "a.SHARE", className: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400" },
  MEMBRE: { labelKey: "a.MEMBRE", className: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400" },
}

export function SaMediaAudit() {
  const { t } = useSaMediaT(DICT)
  const [actor, setActor] = useState("")
  const [appliedActor, setAppliedActor] = useState("")
  const [action, setAction] = useState("all")
  const [field, setField] = useState("")
  const [appliedField, setAppliedField] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [page, setPage] = useState(1)

  // Debounce des entrées texte (350 ms) — le setState vit dans le timer.
  useEffect(() => {
    const t1 = setTimeout(() => { setAppliedActor(actor.trim()); setPage(1) }, 350)
    return () => clearTimeout(t1)
  }, [actor])
  useEffect(() => {
    const t2 = setTimeout(() => { setAppliedField(field.trim()); setPage(1) }, 350)
    return () => clearTimeout(t2)
  }, [field])

  const url = useMemo(() => {
    const qs = new URLSearchParams()
    if (appliedActor) qs.set("actor", appliedActor)
    if (action !== "all") qs.set("action", action)
    if (appliedField) qs.set("field", appliedField)
    if (from) qs.set("from", new Date(from).toISOString())
    if (to) { const d = new Date(to); d.setHours(23, 59, 59, 999); qs.set("to", d.toISOString()) }
    qs.set("p", String(page))
    return `/api/media/audit?${qs.toString()}`
  }, [appliedActor, action, appliedField, from, to, page])

  const { data, error, loading, reload } = useSaMediaGet<SaAuditPageDTO>(url)

  function resetFilters() {
    setActor(""); setAppliedActor("")
    setAction("all")
    setField(""); setAppliedField("")
    setFrom(""); setTo("")
    setPage(1)
  }

  if (error !== null) return <ErrorState message={error} retry={reload} />

  const entries = data?.entries ?? []
  const total = data?.total ?? 0
  const pages = Math.max(1, data?.pages ?? 1)

  return (
    <div className="min-w-0 space-y-4">
      <ModuleHeader icon={ScrollText} title={t("header")} description={t("headerDesc")} />

      <Card className="border-emerald-300/70 bg-emerald-50/50 dark:border-emerald-800/70 dark:bg-emerald-950/30">
        <CardContent className="flex items-start gap-2.5 p-4">
          <Lock className="mt-0.5 h-4.5 w-4.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">{t("immutable")}</p>
            <p className="text-xs leading-relaxed text-emerald-700/80 dark:text-emerald-400/80">{t("immutableDesc")}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 pb-3">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {t("header")}
            <span className="text-sm font-normal text-muted-foreground">{numFr(total)} entrée(s)</span>
            <Button variant="ghost" size="sm" className="ml-auto h-8 gap-1.5 px-2 text-xs" onClick={reload} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden /> {t("common.reload")}
            </Button>
          </CardTitle>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1">
              <Label htmlFor="au-actor" className="text-[11px] font-medium">{t("f.actor")}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <Input id="au-actor" value={actor} onChange={e => setActor(e.target.value)} placeholder={t("f.actorPh")} className="h-9 pl-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] font-medium">{t("f.action")}</Label>
              <Select value={action} onValueChange={v => { setAction(v); setPage(1) }}>
                <SelectTrigger className="h-9 text-sm" aria-label={t("f.action")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("f.allActions")}</SelectItem>
                  {ACTIONS.map(a => <SelectItem key={a} value={a}>{t(`a.${a}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="au-field" className="text-[11px] font-medium">{t("f.field")}</Label>
              <Input id="au-field" value={field} onChange={e => setField(e.target.value)} placeholder={t("f.fieldPh")} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="au-from" className="text-[11px] font-medium">{t("f.from")}</Label>
              <Input id="au-from" type="date" value={from} onChange={e => { setFrom(e.target.value); setPage(1) }} className="h-9 text-sm tabular-nums" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="au-to" className="text-[11px] font-medium">{t("f.to")}</Label>
              <Input id="au-to" type="date" value={to} onChange={e => { setTo(e.target.value); setPage(1) }} className="h-9 text-sm tabular-nums" />
            </div>
          </div>
          <div>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={resetFilters}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> {t("f.reset")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && entries.length === 0 ? (
            <div className="space-y-2" aria-busy="true" aria-label={t("common.loading")}>
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : entries.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <div className="min-w-[56rem]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-background">
                    <TableRow>
                      <TableHead className="min-w-36">{t("th.date")}</TableHead>
                      <TableHead className="min-w-40">{t("th.actor")}</TableHead>
                      <TableHead>{t("th.action")}</TableHead>
                      <TableHead className="min-w-36">{t("th.entity")}</TableHead>
                      <TableHead className="min-w-28">{t("th.field")}</TableHead>
                      <TableHead className="min-w-52">{t("th.change")}</TableHead>
                      <TableHead className="w-24">{t("th.ip")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map(e => {
                      const meta = ACTION_META[e.action]
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                            {new Date(e.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                            {" · "}
                            {new Date(e.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium leading-tight">{e.actorName}</p>
                            <p className="text-[11px] text-muted-foreground">{e.actorEmail}</p>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={meta?.className ?? ""}>{t(meta?.labelKey ?? "a.EDIT")}</Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            <span className="font-mono text-[10px] uppercase text-muted-foreground">{e.entityType}</span>
                            {e.entityLabel ? <p className="max-w-36 truncate text-xs" title={e.entityLabel}>{e.entityLabel}</p> : null}
                          </TableCell>
                          <TableCell className="max-w-28 truncate text-sm text-muted-foreground" title={e.field ?? ""}>{e.field ?? "—"}</TableCell>
                          <TableCell>
                            {e.action === "EDIT" && (e.oldValue ?? "—") !== (e.newValue ?? "—") ? (
                              <span className="inline-flex items-center gap-1.5 text-sm tabular-nums">
                                <span className="max-w-40 truncate text-muted-foreground line-through decoration-zinc-400/60" title={e.oldValue ?? "—"}>{e.oldValue ?? "—"}</span>
                                <span aria-hidden>→</span>
                                <span className="max-w-40 truncate font-semibold text-emerald-700 dark:text-emerald-400" title={e.newValue ?? "—"}>{e.newValue ?? "—"}</span>
                              </span>
                            ) : (
                              <span className="block max-w-56 truncate text-sm text-muted-foreground" title={e.newValue ?? "—"}>{e.newValue ?? "—"}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="font-mono text-[10px] text-muted-foreground underline decoration-dotted underline-offset-2" aria-label={e.ip}>
                                    {e.ip.slice(0, 12)}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="font-mono text-xs">{e.ip}</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          {/* ---- Pagination ---- */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs tabular-nums text-muted-foreground">
              {t("page").replace("{p}", String(data?.page ?? page)).replace("{pages}", String(pages)).replace("{n}", numFr(total))}
            </p>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" className="h-9 gap-1" disabled={page <= 1 || loading} onClick={() => setPage(p => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" aria-hidden /> {t("prev")}
              </Button>
              <Button variant="outline" size="sm" className="h-9 gap-1" disabled={page >= pages || loading} onClick={() => setPage(p => Math.min(pages, p + 1))}>
                {t("next")} <ChevronRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
