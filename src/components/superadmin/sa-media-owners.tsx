'use client'

// CarbuScope — Module Média (T60-g) — volet SA « Propriétaires » : régies,
// communes et privés (personnes physiques/morales) propriétaires des panneaux.
//   · table : code, nom, type (badge REGIE émeraude / COMMUNE zinc / PRIVE
//     ambre), contact, téléphone, email, enseigne rattachée, panneaux (count) ;
//   · Dialog création / modification (POST/PATCH) ;
//   · AlertDialog suppression (400 serveur si panneaux rattachés — message FR).
// Données : GET/POST /api/media/owners, PATCH/DELETE /api/media/owners/[id].

import { useState } from "react"
import { toast } from "sonner"
import { Building2, Loader2, Pencil, Plus, Trash2, Users } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import type { OwnerDTO } from "@/lib/media/shared"
import { useSaMediaGet, useSaMediaT } from "./sa-media/sa-media-shared"

const DICT = {
  fr: {
    header: "Propriétaires physiques du référentiel",
    headerDesc: "Régies publicitaires, services communaux et propriétaires privés auxquels les panneaux sont rattachés. La suppression est bloquée tant qu'un panneau y est rattaché.",
    new: "Nouveau propriétaire",
    edit: "Modifier le propriétaire",
    "th.code": "Code",
    "th.name": "Nom",
    "th.type": "Type",
    "th.contact": "Contact",
    "th.phone": "Téléphone",
    "th.email": "Email",
    "th.brand": "Enseigne rattachée",
    "th.panels": "Panneaux",
    "th.actions": "Actions",
    "type.REGIE": "Régie",
    "type.COMMUNE": "Commune",
    "type.PRIVE": "Privé",
    "f.code": "Code",
    "f.codePh": "OWN-REG-02",
    "f.codeHint": "3-20 caractères A-Z, chiffres, tirets",
    "f.name": "Nom",
    "f.namePh": "Régie Média Sfax",
    "f.type": "Type",
    "f.contact": "Contact",
    "f.phone": "Téléphone",
    "f.email": "Email",
    "f.brand": "Enseigne rattachée (optionnel)",
    "f.brandNone": "Aucune",
    "del.title": "Supprimer ce propriétaire ?",
    "del.desc": "Le propriétaire sera retiré du référentiel. Cette action est journalisée.",
    "del.confirm": "Supprimer",
    "del.hasPanels": "Impossible de supprimer : des panneaux sont rattachés à ce propriétaire.",
    created: "Propriétaire créé",
    updated: "Propriétaire mis à jour",
    deleted: "Propriétaire supprimé",
    empty: "Aucun propriétaire enregistré.",
    count: "propriétaire(s)",
    "err.save": "Échec de l'enregistrement",
  },
  en: {
    header: "Physical owners of the referential",
    headerDesc: "Advertising agencies, municipal services and private owners attached to panels. Deletion is blocked while a panel is attached.",
    new: "New owner",
    edit: "Edit owner",
    "th.code": "Code",
    "th.name": "Name",
    "th.type": "Type",
    "th.contact": "Contact",
    "th.phone": "Phone",
    "th.email": "Email",
    "th.brand": "Attached brand",
    "th.panels": "Panels",
    "th.actions": "Actions",
    "type.REGIE": "Agency",
    "type.COMMUNE": "Municipality",
    "type.PRIVE": "Private",
    "f.code": "Code",
    "f.codePh": "OWN-REG-02",
    "f.codeHint": "3-20 chars A-Z, digits, dashes",
    "f.name": "Name",
    "f.namePh": "Régie Média Sfax",
    "f.type": "Type",
    "f.contact": "Contact",
    "f.phone": "Phone",
    "f.email": "Email",
    "f.brand": "Attached brand (optional)",
    "f.brandNone": "None",
    "del.title": "Delete this owner?",
    "del.desc": "The owner will be removed from the referential. This action is logged.",
    "del.confirm": "Delete",
    "del.hasPanels": "Cannot delete: panels are attached to this owner.",
    created: "Owner created",
    updated: "Owner updated",
    deleted: "Owner deleted",
    empty: "No owner registered.",
    count: "owner(s)",
    "err.save": "Save failed",
  },
  ar: {
    header: "المالكون الماديون في المرجع",
    headerDesc: "وكالات الإعلان والخدمات البلدية والمالكون الخاصون المرتبطون باللوحات. يُمنع الحذف ما دامت لوحة مرتبطة.",
    new: "مالك جديد",
    edit: "تعديل المالك",
    "th.code": "الرمز",
    "th.name": "الاسم",
    "th.type": "النوع",
    "th.contact": "جهة الاتصال",
    "th.phone": "الهاتف",
    "th.email": "البريد",
    "th.brand": "العلامة المرتبطة",
    "th.panels": "اللوحات",
    "th.actions": "إجراءات",
    "type.REGIE": "وكالة",
    "type.COMMUNE": "بلدية",
    "type.PRIVE": "خاص",
    "f.code": "الرمز",
    "f.codePh": "OWN-REG-02",
    "f.codeHint": "3-20 حرفًا A-Z وأرقامًا وشرطات",
    "f.name": "الاسم",
    "f.namePh": "Régie Média Sfax",
    "f.type": "النوع",
    "f.contact": "جهة الاتصال",
    "f.phone": "الهاتف",
    "f.email": "البريد",
    "f.brand": "العلامة المرتبطة (اختياري)",
    "f.brandNone": "بدون",
    "del.title": "حذف هذا المالك؟",
    "del.desc": "سيُحذف المالك من المرجع. هذا الإجراء مُسجَّل.",
    "del.confirm": "حذف",
    "del.hasPanels": "لا يمكن الحذف: توجد لوحات مرتبطة بهذا المالك.",
    created: "تم إنشاء المالك",
    updated: "تم تحديث المالك",
    deleted: "تم حذف المالك",
    empty: "لا مالكين مسجلين.",
    count: "مالك(ًا)",
    "err.save": "فشل الحفظ",
  },
}

const TYPE_META: Record<string, { labelKey: string; className: string }> = {
  REGIE: { labelKey: "type.REGIE", className: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400" },
  COMMUNE: { labelKey: "type.COMMUNE", className: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400" },
  PRIVE: { labelKey: "type.PRIVE", className: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400" },
}

interface OwnerForm {
  code: string
  name: string
  type: string
  contact: string
  phone: string
  email: string
  brandSlug: string
}

const EMPTY_FORM: OwnerForm = { code: "", name: "", type: "REGIE", contact: "", phone: "", email: "", brandSlug: "" }

export function SaMediaOwners() {
  const { t } = useSaMediaT(DICT)
  const { data, error, loading, reload, setData } = useSaMediaGet<{ owners: OwnerDTO[] }>("/api/media/owners")

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<OwnerDTO | null>(null)
  const [form, setForm] = useState<OwnerForm>(EMPTY_FORM)
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState<OwnerDTO | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [delError, setDelError] = useState<string | null>(null)

  const owners = data?.owners ?? []

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(o: OwnerDTO) {
    setEditing(o)
    setForm({
      code: o.code,
      name: o.name,
      type: o.type,
      contact: o.contact ?? "",
      phone: o.phone ?? "",
      email: o.email ?? "",
      brandSlug: o.brandSlug ?? "",
    })
    setDialogOpen(true)
  }

  async function save() {
    if (busy) return
    if (!/^[A-Z0-9-]{3,20}$/.test(form.code.trim())) {
      toast.error("Code requis", { description: t("f.codeHint") })
      return
    }
    if (form.name.trim().length < 2) {
      toast.error("Nom requis (2 caractères minimum).")
      return
    }
    setBusy(true)
    try {
      const body = {
        code: form.code.trim(), name: form.name.trim(), type: form.type,
        contact: form.contact.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        brandSlug: form.brandSlug || undefined,
      }
      if (editing) {
        await apiJson(`/api/media/owners/${editing.id}`, { method: "PATCH", body: JSON.stringify(body) })
        toast.success(t("updated"), { description: `${form.code} · ${form.name}` })
      } else {
        await apiJson("/api/media/owners", { method: "POST", body: JSON.stringify(body) })
        toast.success(t("created"), { description: `${form.code} · ${form.name}` })
      }
      setDialogOpen(false)
      reload()
    } catch (e) {
      toast.error(t("err.save"), { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDelBusy(true)
    setDelError(null)
    try {
      await apiJson(`/api/media/owners/${deleting.id}`, { method: "DELETE" })
      toast.success(t("deleted"), { description: `${deleting.code} — ${deleting.name}` })
      setDeleting(null)
      setData(d => (d ? { owners: d.owners.filter(o => o.id !== deleting.id) } : d))
    } catch (e) {
      setDelError(e instanceof Error ? e.message : "Erreur inconnue.")
    } finally {
      setDelBusy(false)
    }
  }

  if (error !== null) return <ErrorState message={error} retry={reload} />

  return (
    <div className="min-w-0 space-y-4">
      <ModuleHeader icon={Users} title={t("header")} description={t("headerDesc")} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-3">
          <CardTitle className="text-base">
            {t("th.name")}s
            <span className="ml-2 text-sm font-normal text-muted-foreground">{numFr(owners.length)} {t("count")}</span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={reload} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Building2 className="h-4 w-4" aria-hidden />}
              {t("common.reload")}
            </Button>
            <Button size="sm" className="h-9 gap-1.5" onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden /> {t("new")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && owners.length === 0 ? (
            <div className="space-y-2" aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
            </div>
          ) : owners.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-background">
                  <TableRow>
                    <TableHead className="w-28">{t("th.code")}</TableHead>
                    <TableHead className="min-w-44">{t("th.name")}</TableHead>
                    <TableHead>{t("th.type")}</TableHead>
                    <TableHead className="min-w-32">{t("th.contact")}</TableHead>
                    <TableHead className="min-w-32">{t("th.phone")}</TableHead>
                    <TableHead className="min-w-48">{t("th.email")}</TableHead>
                    <TableHead>{t("th.brand")}</TableHead>
                    <TableHead className="text-right">{t("th.panels")}</TableHead>
                    <TableHead className="w-24 text-right">{t("th.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {owners.map(o => {
                    const meta = TYPE_META[o.type] ?? TYPE_META.PRIVE
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-mono text-xs font-semibold">{o.code}</TableCell>
                        <TableCell className="text-sm">{o.name}</TableCell>
                        <TableCell><Badge variant="outline" className={meta.className}>{t(meta.labelKey)}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{o.contact ?? "—"}</TableCell>
                        <TableCell className="text-sm tabular-nums text-muted-foreground">{o.phone ?? "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{o.email ?? "—"}</TableCell>
                        <TableCell>
                          {o.brandSlug
                            ? <Badge variant="outline" className="border-zinc-300 bg-zinc-50 font-mono text-[11px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">{o.brandSlug}</Badge>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right text-sm font-semibold tabular-nums">{numFr(o.panelsCount)}</TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(o)} aria-label={`${t("common.edit")} ${o.code}`}>
                              <Pencil className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 dark:text-red-400"
                              onClick={() => { setDeleting(o); setDelError(null) }}
                              aria-label={`${t("common.delete")} ${o.code}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Dialog création / modification ---- */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!busy) setDialogOpen(o) }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? t("edit") : t("new")}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Le code est immuable après création — les autres champs restent modifiables."
                : "Régie, commune ou propriétaire privé. Le code doit être unique (A-Z, chiffres, tirets)."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ow-code">{t("f.code")}</Label>
              <Input
                id="ow-code" value={form.code} disabled={busy || editing !== null}
                placeholder={t("f.codePh")} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))}
                className="h-10 font-mono"
              />
              <p className="text-[11px] text-muted-foreground">{t("f.codeHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ow-name">{t("f.name")}</Label>
              <Input id="ow-name" value={form.name} disabled={busy} placeholder={t("f.namePh")} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("f.type")}</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v }))} disabled={busy}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.keys(TYPE_META).map(k => (
                    <SelectItem key={k} value={k}>{t(TYPE_META[k].labelKey)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ow-contact">{t("f.contact")}</Label>
              <Input id="ow-contact" value={form.contact} disabled={busy} onChange={e => setForm(f => ({ ...f, contact: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ow-phone">{t("f.phone")}</Label>
              <Input id="ow-phone" value={form.phone} disabled={busy} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ow-email">{t("f.email")}</Label>
              <Input id="ow-email" type="email" value={form.email} disabled={busy} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="h-10" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ow-brand">{t("f.brand")}</Label>
              <Input
                id="ow-brand" value={form.brandSlug} disabled={busy} placeholder="agil / totalenergies…"
                onChange={e => setForm(f => ({ ...f, brandSlug: e.target.value.trim().toLowerCase() }))}
                className="h-10 font-mono"
              />
              <p className="text-[11px] text-muted-foreground">Réseau enseigne : rattache ce propriétaire à une enseigne de la plateforme.</p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setDialogOpen(false)}>{t("common.cancel")}</Button>
            <Button disabled={busy} onClick={() => void save()} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---- AlertDialog suppression ---- */}
      <AlertDialog open={deleting !== null} onOpenChange={o => { if (!delBusy && !o) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("del.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? `${deleting.code} — ${deleting.name}` : ""}
              {" · "}
              {t("del.desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleting && deleting.panelsCount > 0 ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {t("del.hasPanels")} ({deleting.panelsCount})
            </p>
          ) : null}
          {delError ? (
            <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">{delError}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={delBusy}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={delBusy || (deleting !== null && deleting.panelsCount > 0)}
              className="gap-1.5 bg-red-600 text-white hover:bg-red-700"
              onClick={e => { e.preventDefault(); void confirmDelete() }}
            >
              {delBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {t("del.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
