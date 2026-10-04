'use client'

// CarbuScope — T60-f — Volet « Membres » du module Média : rôles & périmètres
// géographiques (réservé ADMIN/GD enseigne — écran explicite 403 sinon).
// Le périmètre (couche 3) filtre CÔTÉ SERVEUR ce que le membre voit, même si
// les autres couches (publique/granulaire/exclusive) l'autorisent.

import { useCallback, useEffect, useMemo, useState } from "react"
import { CircleAlert, Info, Loader2, Lock, MapPin, Pencil, ShieldCheck } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { MEDIA_CAPS, MEDIA_ROLE_LABELS, toMediaRole, type MemberMediaDTO } from "@/lib/media/shared"
import { useAppStore } from "@/store/app-store"
import { apiJson, useLocalT } from "./media-shared"

const DICT = {
  fr: {
    title: "Membres & périmètres média",
    desc: "Chaque membre de votre enseigne voit le catalogue média filtré par son périmètre géographique — appliqué côté serveur.",
    forbidden: "Espace réservé à l'administrateur enseigne",
    forbiddenDesc: "La gestion des membres et de leurs périmètres média est réservée au rôle « Administrateur enseigne » (ou DG). Votre compte permet la consultation du catalogue, mais pas cette administration.",
    "col.name": "Membre",
    "col.email": "Email",
    "col.role": "Rôle",
    "col.perimeter": "Périmètre",
    "col.actions": "Actions",
    "act.edit": "Modifier le périmètre",
    "err.load": "Chargement des membres impossible",
    retry: "Réessayer",
    empty: "Aucun membre actif sur cette enseigne.",
    "dlg.title": "Périmètre géographique",
    "dlg.desc": "Définit ce que ce membre voit du catalogue média — le filtre est appliqué côté serveur.",
    "dlg.member": "Membre",
    "dlg.save": "Enregistrer",
    "dlg.saving": "Enregistrement…",
    "dlg.saved": "Périmètre enregistré",
    cancel: "Annuler",
    "dlg.err": "Enregistrement impossible",
    "dlg.err.gov": "Sélectionnez au moins un gouvernorat.",
    "dlg.err.rayon": "Centre (lat, lng) et rayon en km requis (rayon 1-500).",
    "dlg.err.poly": "Au moins 3 points « lat, lng » valides sont requis (un par ligne).",
    "dlg.err.polyNum": "Certaines lignes ne sont pas des nombres valides.",
    "p.TOUT": "Territoire entier",
    "p.TOUT.desc": "Aucune restriction géographique.",
    "p.GOUVERNORATS": "Liste de gouvernorats",
    "p.GOUVERNORATS.desc": "Le membre ne voit que les panneaux des gouvernorats cochés.",
    "p.RAYON": "Rayon autour d'un centre",
    "p.RAYON.desc": "Le membre ne voit que les panneaux dans le rayon (distance haversine).",
    "p.POLYGONE": "Polygone personnalisé",
    "p.POLYGONE.desc": "Le membre ne voit que les panneaux à l'intérieur du polygone (au moins 3 points).",
    "p.undefined": "Non défini",
    "summary.TOUT": "Territoire entier",
    "summary.govs": "Gouvernorats : {list}",
    "summary.rayon": "Rayon {km} km",
    "summary.poly": "Polygone ({n} points)",
    "dlg.lat": "Latitude",
    "dlg.lng": "Longitude",
    "dlg.km": "Rayon (km)",
    "dlg.points": "Points du polygone — un par ligne « lat, lng »",
    "dlg.pointsHint": "Exemple : 36.8065, 10.1815",
    note: "Le périmètre filtre côté serveur ce que le membre voit — même si les autres couches d'autorisation l'autorisent.",
  },
  en: {
    title: "Media members & perimeters",
    desc: "Each member of your brand sees the media catalogue filtered by their geographic perimeter — applied server-side.",
    forbidden: "Area restricted to the brand administrator",
    forbiddenDesc: "Managing members and their media perimeters is reserved for the “Brand administrator” (or CEO) role. Your account can browse the catalogue but not administer it.",
    "col.name": "Member",
    "col.email": "Email",
    "col.role": "Role",
    "col.perimeter": "Perimeter",
    "col.actions": "Actions",
    "act.edit": "Edit perimeter",
    "err.load": "Failed to load members",
    retry: "Retry",
    empty: "No active member on this brand.",
    "dlg.title": "Geographic perimeter",
    "dlg.desc": "Defines what this member sees of the media catalogue — the filter is applied server-side.",
    "dlg.member": "Member",
    "dlg.save": "Save",
    "dlg.saving": "Saving…",
    "dlg.saved": "Perimeter saved",
    cancel: "Cancel",
    "dlg.err": "Save failed",
    "dlg.err.gov": "Select at least one governorate.",
    "dlg.err.rayon": "Center (lat, lng) and radius in km required (radius 1-500).",
    "dlg.err.poly": "At least 3 valid “lat, lng” points are required (one per line).",
    "dlg.err.polyNum": "Some lines are not valid numbers.",
    "p.TOUT": "Whole territory",
    "p.TOUT.desc": "No geographic restriction.",
    "p.GOUVERNORATS": "Governorate list",
    "p.GOUVERNORATS.desc": "The member only sees panels in the checked governorates.",
    "p.RAYON": "Radius around a center",
    "p.RAYON.desc": "The member only sees panels within the radius (haversine distance).",
    "p.POLYGONE": "Custom polygon",
    "p.POLYGONE.desc": "The member only sees panels inside the polygon (at least 3 points).",
    "p.undefined": "Not defined",
    "summary.TOUT": "Whole territory",
    "summary.govs": "Governorates: {list}",
    "summary.rayon": "{km} km radius",
    "summary.poly": "Polygon ({n} points)",
    "dlg.lat": "Latitude",
    "dlg.lng": "Longitude",
    "dlg.km": "Radius (km)",
    "dlg.points": "Polygon points — one per line “lat, lng”",
    "dlg.pointsHint": "Example: 36.8065, 10.1815",
    note: "The perimeter filters server-side what the member sees — even if the other authorization layers allow it.",
  },
  ar: {
    title: "الأعضاء والنطاقات",
    forbidden: "مساحة مخصصة لمسؤول العلامة",
    "col.name": "العضو",
    "col.email": "البريد",
    "col.role": "الدور",
    "col.perimeter": "النطاق",
    "act.edit": "تعديل النطاق",
    retry: "إعادة المحاولة",
    "dlg.title": "النطاق الجغرافي",
    "dlg.save": "حفظ",
    "dlg.saved": "تم حفظ النطاق",
    cancel: "إلغاء",
    "p.TOUT": "كل الأراضي",
    note: "النطاق يصفّي من جهة الخادم ما يراه العضو حتى لو سمحت الطبقات الأخرى.",
  },
}

/** Gouvernorats tunisiens (liste de référence). */
const GOUVERNORATS: readonly string[] = [
  "Ariana", "Béja", "Ben Arous", "Bizerte", "Gabès", "Gafsa", "Jendouba", "Kairouan",
  "Kasserine", "Kébili", "Le Kef", "Mahdia", "Manouba", "Médenine", "Monastir", "Nabeul",
  "Sfax", "Sidi Bouzid", "Siliana", "Sousse", "Tataouine", "Tozeur", "Tunis", "Zaghouan",
]

const ROLE_BADGE: Record<string, string> = {
  SA: "border-zinc-300 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
  ADMIN: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400",
  GESTIONNAIRE: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
  ANALYSTE: "border-[#e1b7a5] bg-[#fdeee8] text-[#b0563b] dark:border-[#7a3c2a] dark:bg-[#2a1a13] dark:text-[#e0957a]",
  LECTEUR: "border-zinc-300 bg-zinc-50 text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400",
}

/** Résumé FR du périmètre courant. */
function perimeterSummary(type: string, value: MemberMediaDTO["perimeterValue"], t: (k: string) => string): string {
  switch (type) {
    case "TOUT":
      return t("summary.TOUT")
    case "GOUVERNORATS": {
      const list = value?.gouvernorats ?? []
      return list.length === 0 ? t("p.undefined") : t("summary.govs").replace("{list}", list.join(", "))
    }
    case "RAYON":
      return typeof value?.rayonKm === "number" ? t("summary.rayon").replace("{km}", value.rayonKm.toLocaleString("fr-FR")) : t("p.undefined")
    case "POLYGONE":
      return Array.isArray(value?.polygon) ? t("summary.poly").replace("{n}", String(value.polygon.length)) : t("p.undefined")
    default:
      return t("p.undefined")
  }
}

export function MediaMembers({ brandSlug: _brandSlug }: { brandSlug: string }) {
  const { t } = useLocalT(DICT)
  const session = useAppStore(s => s.session)
  const caps = MEDIA_CAPS[toMediaRole(session?.role ?? "VIEWER")]

  const [members, setMembers] = useState<MemberMediaDTO[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [forbidden, setForbidden] = useState(false)
  const [editing, setEditing] = useState<MemberMediaDTO | null>(null)

  const refresh = useCallback(async () => {
    try {
      const r = await apiJson<{ members: MemberMediaDTO[] }>("/api/media/members")
      setMembers(r.members)
      setForbidden(false)
      setError(null)
    } catch (e) {
      const msg = e instanceof Error ? e.message : "error"
      if (msg.includes("réservée") || msg.includes("403")) setForbidden(true)
      else setError(msg)
    }
  }, [])

  useEffect(() => {
    if (!caps.manageMembers) return
    void (async () => {
      await refresh()
    })()
  }, [caps.manageMembers, refresh])

  // ─────────── Écran « réservé à l'administrateur enseigne » ───────────
  if (!caps.manageMembers || forbidden) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-[#fdeee8] text-[#b0563b] dark:bg-[#2a1a13] dark:text-[#e0957a]">
            <Lock className="h-5 w-5" aria-hidden />
          </div>
          <p className="text-base font-bold">{t("forbidden")}</p>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">{t("forbiddenDesc")}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 sm:p-6">
          <h2 className="text-base font-bold leading-tight">{t("title")}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("desc")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="h-4 w-4 text-[#059669] dark:text-emerald-500" aria-hidden />
            {t("col.perimeter")}
          </CardTitle>
          <CardDescription className="flex items-start gap-1.5">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            {t("note")}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 pb-4">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <CircleAlert className="h-6 w-6 text-[#b0563b]" aria-hidden />
              <p className="text-sm text-muted-foreground">{t("err.load")}</p>
              <Button type="button" variant="outline" className="h-10" onClick={() => void refresh()}>
                {t("retry")}
              </Button>
            </div>
          ) : members === null ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 rounded-md" />
              ))}
            </div>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("col.name")}</TableHead>
                    <TableHead className="hidden sm:table-cell">{t("col.email")}</TableHead>
                    <TableHead>{t("col.role")}</TableHead>
                    <TableHead className="hidden md:table-cell">{t("col.perimeter")}</TableHead>
                    <TableHead className="text-right">{t("col.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map(m => {
                    const role = toMediaRole(m.role)
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="max-w-40 truncate text-sm font-medium">{m.name}</TableCell>
                        <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">{m.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("whitespace-nowrap", ROLE_BADGE[role] ?? ROLE_BADGE.LECTEUR)}>
                            {MEDIA_ROLE_LABELS[role]}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden max-w-56 truncate text-xs text-muted-foreground md:table-cell">
                          {perimeterSummary(m.perimeterType, m.perimeterValue, t)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditing(m)}
                            className="h-9 gap-1.5 border-[#059669] text-[#059669] hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden />
                            <span className="hidden sm:inline">{t("act.edit")}</span>
                          </Button>
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

      {editing ? (
        <PerimeterDialog
          member={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null)
            await refresh()
          }}
        />
      ) : null}
    </div>
  )
}

// ─────────────────── Éditeur de périmètre (Dialog) ───────────────────

type PerimeterType = "TOUT" | "GOUVERNORATS" | "RAYON" | "POLYGONE"

function PerimeterDialog({ member, onClose, onSaved }: {
  member: MemberMediaDTO
  onClose: () => void
  onSaved: () => Promise<void>
}) {
  const { t } = useLocalT(DICT)
  const [type, setType] = useState<PerimeterType>(
    (["TOUT", "GOUVERNORATS", "RAYON", "POLYGONE"] as const).includes(member.perimeterType as PerimeterType)
      ? (member.perimeterType as PerimeterType)
      : "TOUT",
  )
  const [govs, setGovs] = useState<Set<string>>(new Set(member.perimeterValue?.gouvernorats ?? []))
  const [lat, setLat] = useState(String(member.perimeterValue?.lat ?? ""))
  const [lng, setLng] = useState(String(member.perimeterValue?.lng ?? ""))
  const [km, setKm] = useState(String(member.perimeterValue?.rayonKm ?? ""))
  const [points, setPoints] = useState<string>(
    Array.isArray(member.perimeterValue?.polygon)
      ? (member.perimeterValue.polygon.map(p => `${p[0]}, ${p[1]}`).join("\n"))
      : "",
  )
  const [saving, setSaving] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)

  const govOptions = useMemo(() => {
    // gouvernorats du catalogue d'abord, puis liste de référence complète
    const extra = member.perimeterValue?.gouvernorats ?? []
    return Array.from(new Set([...extra, ...GOUVERNORATS])).sort((a, b) => a.localeCompare(b))
  }, [member.perimeterValue])

  function toggleGov(g: string, checked: boolean) {
    setGovs(prev => {
      const n = new Set(prev)
      if (checked) n.add(g)
      else n.delete(g)
      return n
    })
  }

  async function save() {
    setLocalError(null)
    let value: MemberMediaDTO["perimeterValue"] = {}
    if (type === "GOUVERNORATS") {
      if (govs.size === 0) {
        setLocalError(t("dlg.err.gov"))
        return
      }
      value = { gouvernorats: Array.from(govs) }
    } else if (type === "RAYON") {
      const la = Number(lat.replace(",", ".")), ln = Number(lng.replace(",", ".")), r = Number(km.replace(",", "."))
      if (!Number.isFinite(la) || !Number.isFinite(ln) || !Number.isFinite(r) || r <= 0 || r > 500) {
        setLocalError(t("dlg.err.rayon"))
        return
      }
      value = { lat: la, lng: ln, rayonKm: r }
    } else if (type === "POLYGONE") {
      const lines = points.split("\n").map(l => l.trim()).filter(l => l.length > 0)
      if (lines.length < 3) {
        setLocalError(t("dlg.err.poly"))
        return
      }
      const poly: [number, number][] = []
      for (const line of lines) {
        const parts = line.split(",").map(p => Number(p.trim().replace(",", ".")))
        if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
          setLocalError(t("dlg.err.polyNum"))
          return
        }
        poly.push([parts[0], parts[1]])
      }
      value = { polygon: poly }
    }
    setSaving(true)
    try {
      await apiJson(`/api/media/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify({ perimeterType: type, perimeterValue: value }),
      })
      toast.success(t("dlg.saved"))
      await onSaved()
    } catch (e) {
      toast.error(t("dlg.err"), { description: e instanceof Error ? e.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={open => { if (!open) onClose() }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-[#059669] dark:text-emerald-500" aria-hidden />
            {t("dlg.title")}
          </DialogTitle>
          <DialogDescription>
            {t("dlg.member")} : <strong className="text-foreground">{member.name}</strong>
            {" "}({member.email}) · {t("dlg.desc")}
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={type} onValueChange={v => setType(v as PerimeterType)} className="gap-3">
          {(["TOUT", "GOUVERNORATS", "RAYON", "POLYGONE"] as const).map(p => (
            <label
              key={p}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                type === p
                  ? "border-[#059669] bg-emerald-50/60 dark:border-emerald-700 dark:bg-emerald-950/40"
                  : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700",
              )}
            >
              <RadioGroupItem value={p} className="mt-0.5" aria-label={t(`p.${p}`)} />
              <span className="min-w-0 space-y-0.5">
                <span className="block text-sm font-medium">{t(`p.${p}`)}</span>
                <span className="block text-xs leading-snug text-muted-foreground">{t(`p.${p}.desc`)}</span>
                {p !== "TOUT" && member.perimeterType === p ? (
                  <span className="block text-[11px] text-muted-foreground">
                    {t("dlg.member")} : {perimeterSummary(p, member.perimeterValue, t)}
                  </span>
                ) : null}
              </span>
            </label>
          ))}
        </RadioGroup>

        <Separator />

        {type === "GOUVERNORATS" ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">{t("p.GOUVERNORATS.desc")}</p>
            <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto rounded-lg border border-zinc-200 p-3 dark:border-zinc-800 sm:grid-cols-3">
              {govOptions.map(g => (
                <label key={g} className="flex min-h-11 cursor-pointer items-center gap-2 text-xs">
                  <Checkbox
                    checked={govs.has(g)}
                    onCheckedChange={v => toggleGov(g, v === true)}
                    aria-label={g}
                    className="data-[state=checked]:border-[#059669] data-[state=checked]:bg-[#059669]"
                  />
                  <span className="truncate">{g}</span>
                </label>
              ))}
            </div>
          </div>
        ) : null}

        {type === "RAYON" ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pm-lat" className="text-xs">{t("dlg.lat")}</Label>
              <Input id="pm-lat" type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} placeholder="36.8065" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-lng" className="text-xs">{t("dlg.lng")}</Label>
              <Input id="pm-lng" type="number" step="any" value={lng} onChange={e => setLng(e.target.value)} placeholder="10.1815" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-km" className="text-xs">{t("dlg.km")}</Label>
              <Input id="pm-km" type="number" step="any" min={1} max={500} value={km} onChange={e => setKm(e.target.value)} placeholder="6" className="h-10" />
            </div>
          </div>
        ) : null}

        {type === "POLYGONE" ? (
          <div className="space-y-1.5">
            <Label htmlFor="pm-points" className="text-xs">{t("dlg.points")}</Label>
            <Textarea
              id="pm-points"
              value={points}
              onChange={e => setPoints(e.target.value)}
              placeholder={`${t("dlg.pointsHint")}\n36.8500, 10.2000\n36.7600, 10.2600\n36.7800, 10.1200`}
              className="min-h-32 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">{t("dlg.pointsHint")}</p>
          </div>
        ) : null}

        {localError ? (
          <p className="flex items-center gap-1.5 text-xs text-[#b0563b] dark:text-[#e0957a]">
            <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {localError}
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="h-10">
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="h-10 gap-2 bg-[#059669] text-white hover:bg-[#047857] dark:bg-emerald-700 dark:hover:bg-emerald-600"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {saving ? t("dlg.saving") : t("dlg.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
