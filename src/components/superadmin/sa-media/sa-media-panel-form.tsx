'use client'

// CarbuScope — Module Média (T60-g) : formulaire panneau SA (création /
// modification) — Dialog à sections : identité & propriétaire, support &
// technique, localisation (avec mini-carte Leaflet cliquable pour choisir
// lat/lng), autorisation municipale, faces initiales (création uniquement).
// POST /api/media/panels (faces initiales incluses) ou PATCH
// /api/media/panels/[id] (champs modifiables uniquement).

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { apiJson } from "@/components/media/media-shared"
import type { OwnerDTO } from "@/lib/media/shared"
import { useSaMediaT } from "./sa-media-shared"
import {
  FORMATS, GOVERNORATS, ILLUMINATIONS, MEDIA_TYPES, ORIENTATIONS, SUPPORT_TYPES, TECHNOLOGIES,
  type SaMediaPanelDTO,
} from "./sa-media-shared"

const SaMediaMapPicker = dynamic(() => import("./sa-media-map-picker").then(m => m.SaMediaMapPicker), {
  ssr: false,
  loading: () => <div className="h-56 w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />,
})

const DICT = {
  fr: {
    new: "Nouveau panneau",
    edit: "Modifier le panneau",
    newDesc: "Le code panneau est immuable (3-20 caractères A-Z, chiffres, tirets). Les faces initiales sont optionnelles.",
    editDesc: "Le code et le propriétaire sont immuables après création — le reste est modifiable.",
    "sec.identity": "Identité",
    "f.code": "Code",
    "f.codePh": "PAN-TUN-005",
    "f.name": "Nom",
    "f.namePh": "Avenue Mohamed V — Face station",
    "f.owner": "Propriétaire",
    "f.ownerPh": "Sélectionner…",
    "f.mediaType": "Type de média",
    "f.status": "Statut",
    "sec.support": "Support & technique",
    "f.supportType": "Type de support",
    "f.format": "Format",
    "f.technology": "Technologie",
    "f.widthCm": "Largeur (cm)",
    "f.heightCm": "Hauteur (cm)",
    "f.heightGround": "Hauteur au sol (m)",
    "f.illumination": "Éclairage",
    "sec.geo": "Localisation",
    "f.lat": "Latitude",
    "f.lng": "Longitude",
    "f.governorat": "Gouvernorat",
    "f.delegation": "Délégation",
    "f.ville": "Ville",
    "f.rue": "Rue / axe",
    geoHint: "Cliquez sur la carte ou saisissez les coordonnées — le marqueur suit les champs.",
    "sec.auth": "Autorisation municipale",
    "f.authRef": "Référence",
    "f.authRefPh": "AUT-TUN-2026-042",
    "f.authStart": "Début",
    "f.authEnd": "Fin",
    "sec.faces": "Faces initiales (optionnel)",
    facesHint: "Jusqu'à 6 faces créées avec le panneau — code, TMJA, audience, ODV et prix/semaine.",
    "f.faceCode": "Code face",
    "f.faceTmja": "TMJA",
    "f.faceAudience": "Audience/j",
    "f.faceOdv": "ODV/j",
    "f.facePrix": "Prix/sem. (DT)",
    "face.remove": "Retirer cette face",
    "face.add": "Ajouter une face",
    "err.code": "Code requis (3-20 caractères A-Z, chiffres, tirets).",
    "err.name": "Nom requis (2 caractères minimum).",
    "err.owner": "Propriétaire requis.",
    "err.geo": "Gouvernorat, délégation et ville requis.",
    "err.coords": "Coordonnées invalides (lat ±90, lng ±180).",
    "saved.new": "Panneau créé",
    "saved.edit": "Panneau mis à jour",
  },
  en: {
    new: "New panel",
    edit: "Edit panel",
    newDesc: "The panel code is immutable (3-20 chars A-Z, digits, dashes). Initial faces are optional.",
    editDesc: "Code and owner are immutable after creation — everything else is editable.",
    "sec.identity": "Identity",
    "f.code": "Code",
    "f.codePh": "PAN-TUN-005",
    "f.name": "Name",
    "f.namePh": "Avenue Mohamed V — Face station",
    "f.owner": "Owner",
    "f.ownerPh": "Select…",
    "f.mediaType": "Media type",
    "f.status": "Status",
    "sec.support": "Support & technique",
    "f.supportType": "Support type",
    "f.format": "Format",
    "f.technology": "Technology",
    "f.widthCm": "Width (cm)",
    "f.heightCm": "Height (cm)",
    "f.heightGround": "Height above ground (m)",
    "f.illumination": "Illumination",
    "sec.geo": "Location",
    "f.lat": "Latitude",
    "f.lng": "Longitude",
    "f.governorat": "Governorate",
    "f.delegation": "Delegation",
    "f.ville": "City",
    "f.rue": "Street / axis",
    geoHint: "Click the map or type the coordinates — the marker follows the fields.",
    "sec.auth": "Municipal authorization",
    "f.authRef": "Reference",
    "f.authRefPh": "AUT-TUN-2026-042",
    "f.authStart": "Start",
    "f.authEnd": "End",
    "sec.faces": "Initial faces (optional)",
    facesHint: "Up to 6 faces created with the panel — code, TMJA, audience, ODV and weekly price.",
    "f.faceCode": "Face code",
    "f.faceTmja": "TMJA",
    "f.faceAudience": "Audience/day",
    "f.faceOdv": "ODV/day",
    "f.facePrix": "Price/wk (DT)",
    "face.remove": "Remove this face",
    "face.add": "Add a face",
    "err.code": "Code required (3-20 chars A-Z, digits, dashes).",
    "err.name": "Name required (2 characters min).",
    "err.owner": "Owner required.",
    "err.geo": "Governorate, delegation and city required.",
    "err.coords": "Invalid coordinates (lat ±90, lng ±180).",
    "saved.new": "Panel created",
    "saved.edit": "Panel updated",
  },
  ar: {
    new: "لوحة جديدة",
    edit: "تعديل اللوحة",
    newDesc: "رمز اللوحة ثابت (3-20 حرفًا A-Z وأرقامًا وشرطات). الأوجه الأولية اختيارية.",
    editDesc: "الرمز والمالك ثابتان بعد الإنشاء — والباقي قابل للتعديل.",
    "sec.identity": "الهوية",
    "f.code": "الرمز",
    "f.codePh": "PAN-TUN-005",
    "f.name": "الاسم",
    "f.namePh": "Avenue Mohamed V — Face station",
    "f.owner": "المالك",
    "f.ownerPh": "اختر…",
    "f.mediaType": "نوع الوسيط",
    "f.status": "الحالة",
    "sec.support": "الحامل والتقنية",
    "f.supportType": "نوع الحامل",
    "f.format": "الصيغة",
    "f.technology": "التقنية",
    "f.widthCm": "العرض (سم)",
    "f.heightCm": "الارتفاع (سم)",
    "f.heightGround": "الارتفاع عن الأرض (م)",
    "f.illumination": "الإضاءة",
    "sec.geo": "الموقع",
    "f.lat": "خط العرض",
    "f.lng": "خط الطول",
    "f.governorat": "الولاية",
    "f.delegation": "المعتمدية",
    "f.ville": "المدينة",
    "f.rue": "الشارع / المحور",
    geoHint: "انقر على الخريطة أو أدخل الإحداثيات.",
    "sec.auth": "الترخيص البلدي",
    "f.authRef": "المرجع",
    "f.authRefPh": "AUT-TUN-2026-042",
    "f.authStart": "البداية",
    "f.authEnd": "النهاية",
    "sec.faces": "الأوجه الأولية (اختياري)",
    facesHint: "حتى 6 أوجه مع اللوحة.",
    "f.faceCode": "رمز الوجه",
    "f.faceTmja": "TMJA",
    "f.faceAudience": "الجمهور/يوم",
    "f.faceOdv": "ODV/يوم",
    "f.facePrix": "السعر/أسبوع",
    "face.remove": "إزالة هذا الوجه",
    "face.add": "إضافة وجه",
    "err.code": "الرمز مطلوب (3-20 حرفًا).",
    "err.name": "الاسم مطلوب (حرفان على الأقل).",
    "err.owner": "المالك مطلوب.",
    "err.geo": "الولاية والمعتمدية والمدينة مطلوبة.",
    "err.coords": "إحداثيات غير صالحة.",
    "saved.new": "تم إنشاء اللوحة",
    "saved.edit": "تم تحديث اللوحة",
  },
}

const PANEL_STATUSES = ["ACTIF", "MAINTENANCE", "RETIRE"] as const
const PANEL_STATUS_LABELS: Record<string, string> = { ACTIF: "Actif", MAINTENANCE: "Maintenance", RETIRE: "Retiré" }

interface FaceSeed {
  code: string; tmja: string; audienceJournaliere: string; odvJournalieres: string; prixSemaine: string
}

interface PanelFormState {
  code: string; name: string; ownerId: string; mediaType: string; status: string
  supportType: string; format: string; technology: string
  widthCm: string; heightCm: string; heightAboveGroundM: string; illumination: string
  lat: string; lng: string; governorat: string; delegation: string; ville: string; rue: string
  authorizationRef: string; authorizationStart: string; authorizationEnd: string
}

const toNum = (v: string): number | undefined => {
  const n = Number(v.replace(",", "."))
  return v.trim() !== "" && Number.isFinite(n) ? n : undefined
}

export interface SaMediaPanelFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  owners: OwnerDTO[]
  /** null = création. */
  panel: SaMediaPanelDTO | null
  onSaved: () => void
}

export function SaMediaPanelForm({ open, onOpenChange, owners, panel, onSaved }: SaMediaPanelFormProps) {
  const { t } = useSaMediaT(DICT)
  const [form, setForm] = useState<PanelFormState>({
    code: "", name: "", ownerId: "", mediaType: "URBAIN", status: "ACTIF",
    supportType: "GRAND_FORMAT", format: "4x3", technology: "PAPIER",
    widthCm: "", heightCm: "", heightAboveGroundM: "", illumination: "AUCUNE",
    lat: "", lng: "", governorat: "", delegation: "", ville: "", rue: "",
    authorizationRef: "", authorizationStart: "", authorizationEnd: "",
  })
  const [faces, setFaces] = useState<FaceSeed[]>([])
  const [busy, setBusy] = useState(false)

  // Préremplissage à l'ouverture (édition : valeurs du panneau).
  useEffect(() => {
    if (!open) return
    if (panel) {
      setForm({
        code: panel.code, name: panel.name, ownerId: panel.owner.id,
        mediaType: panel.mediaType, status: panel.status,
        supportType: panel.supportType, format: panel.format, technology: panel.technology,
        widthCm: String(panel.widthCm), heightCm: String(panel.heightCm),
        heightAboveGroundM: String(panel.heightAboveGroundM), illumination: panel.illumination,
        lat: String(panel.lat), lng: String(panel.lng),
        governorat: panel.governorat, delegation: panel.delegation, ville: panel.ville, rue: panel.rue ?? "",
        authorizationRef: panel.authorizationRef ?? "",
        authorizationStart: panel.authorizationStart ? panel.authorizationStart.slice(0, 10) : "",
        authorizationEnd: panel.authorizationEnd ? panel.authorizationEnd.slice(0, 10) : "",
      })
      setFaces([])
    } else {
      setForm({
        code: "", name: "", ownerId: "", mediaType: "URBAIN", status: "ACTIF",
        supportType: "GRAND_FORMAT", format: "4x3", technology: "PAPIER",
        widthCm: "", heightCm: "", heightAboveGroundM: "", illumination: "AUCUNE",
        lat: "", lng: "", governorat: "", delegation: "", ville: "", rue: "",
        authorizationRef: "", authorizationStart: "", authorizationEnd: "",
      })
      setFaces([])
    }
  }, [open, panel])

  const latNum = toNum(form.lat)
  const lngNum = toNum(form.lng)

  async function save() {
    if (busy) return
    if (!/^[A-Z0-9-]{3,20}$/.test(form.code.trim())) { toast.error(t("err.code")); return }
    if (form.name.trim().length < 2) { toast.error(t("err.name")); return }
    if (!panel && !form.ownerId) { toast.error(t("err.owner")); return }
    if (!form.governorat.trim() || !form.delegation.trim() || !form.ville.trim()) { toast.error(t("err.geo")); return }
    if (latNum === undefined || lngNum === undefined || Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) { toast.error(t("err.coords")); return }

    setBusy(true)
    try {
      if (panel) {
        // PATCH — champs modifiables uniquement (code/owner immuables serveur).
        const body: Record<string, unknown> = {
          name: form.name.trim(),
          mediaType: form.mediaType, supportType: form.supportType, format: form.format,
          technology: form.technology, illumination: form.illumination, status: form.status,
          lat: latNum, lng: lngNum,
          governorat: form.governorat.trim(), delegation: form.delegation.trim(), ville: form.ville.trim(),
          rue: form.rue.trim() || undefined,
          authorizationRef: form.authorizationRef.trim() || undefined,
          authorizationStart: form.authorizationStart || null,
          authorizationEnd: form.authorizationEnd || null,
        }
        if (toNum(form.widthCm) !== undefined) body.widthCm = toNum(form.widthCm)
        if (toNum(form.heightCm) !== undefined) body.heightCm = toNum(form.heightCm)
        if (toNum(form.heightAboveGroundM) !== undefined) body.heightAboveGroundM = toNum(form.heightAboveGroundM)
        await apiJson(`/api/media/panels/${panel.id}`, { method: "PATCH", body: JSON.stringify(body) })
        toast.success(t("saved.edit"), { description: `${form.code} — ${form.name}` })
      } else {
        const body: Record<string, unknown> = {
          code: form.code.trim(), name: form.name.trim(), ownerId: form.ownerId,
          mediaType: form.mediaType, supportType: form.supportType, format: form.format,
          technology: form.technology, illumination: form.illumination, status: form.status,
          lat: latNum, lng: lngNum,
          governorat: form.governorat.trim(), delegation: form.delegation.trim(), ville: form.ville.trim(),
          rue: form.rue.trim() || undefined,
          authorizationRef: form.authorizationRef.trim() || undefined,
          authorizationStart: form.authorizationStart || undefined,
          authorizationEnd: form.authorizationEnd || undefined,
          faces: faces.slice(0, 6).map(f => ({
            code: f.code.trim() || undefined,
            tmja: toNum(f.tmja), audienceJournaliere: toNum(f.audienceJournaliere),
            odvJournalieres: toNum(f.odvJournalieres), prixSemaine: toNum(f.prixSemaine),
          })),
        }
        if (toNum(form.widthCm) !== undefined) body.widthCm = toNum(form.widthCm)
        if (toNum(form.heightCm) !== undefined) body.heightCm = toNum(form.heightCm)
        if (toNum(form.heightAboveGroundM) !== undefined) body.heightAboveGroundM = toNum(form.heightAboveGroundM)
        await apiJson("/api/media/panels", { method: "POST", body: JSON.stringify(body) })
        toast.success(t("saved.new"), { description: `${form.code} — ${form.name} · ${faces.length} face(s)` })
      }
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error("Échec de l'enregistrement", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setBusy(false)
    }
  }

  const set = <K extends keyof PanelFormState>(k: K, v: PanelFormState[K]) => setForm(f => ({ ...f, [k]: v }))

  const sectionTitle = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"

  return (
    <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o) }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{panel ? t("edit") : t("new")}</DialogTitle>
          <DialogDescription>{panel ? t("editDesc") : t("newDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* ---- Identité ---- */}
          <div className="space-y-3">
            <p className={sectionTitle}>{t("sec.identity")}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-code">{t("f.code")}</Label>
                <Input
                  id="pf-code" value={form.code} disabled={busy || panel !== null}
                  placeholder={t("f.codePh")} onChange={e => set("code", e.target.value.toUpperCase())}
                  className="h-10 font-mono"
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pf-name">{t("f.name")}</Label>
                <Input id="pf-name" value={form.name} disabled={busy} placeholder={t("f.namePh")} onChange={e => set("name", e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label>{t("f.owner")}</Label>
                <Select value={form.ownerId} onValueChange={v => set("ownerId", v)} disabled={busy || panel !== null}>
                  <SelectTrigger className="h-10"><SelectValue placeholder={t("f.ownerPh")} /></SelectTrigger>
                  <SelectContent>
                    {owners.map(o => (
                      <SelectItem key={o.id} value={o.id}>
                        <span className="font-mono text-xs">{o.code}</span> · {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("f.mediaType")}</Label>
                <Select value={form.mediaType} onValueChange={v => set("mediaType", v)} disabled={busy}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MEDIA_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("f.status")}</Label>
                <Select value={form.status} onValueChange={v => set("status", v)} disabled={busy}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PANEL_STATUSES.map(v => <SelectItem key={v} value={v}>{PANEL_STATUS_LABELS[v]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* ---- Support & technique ---- */}
          <div className="space-y-3">
            <p className={sectionTitle}>{t("sec.support")}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label>{t("f.supportType")}</Label>
                <Select value={form.supportType} onValueChange={v => set("supportType", v)} disabled={busy}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SUPPORT_TYPES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("f.format")}</Label>
                <Select value={form.format} onValueChange={v => set("format", v)} disabled={busy}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {FORMATS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("f.technology")}</Label>
                <Select value={form.technology} onValueChange={v => set("technology", v)} disabled={busy}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TECHNOLOGIES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("f.illumination")}</Label>
                <Select value={form.illumination} onValueChange={v => set("illumination", v)} disabled={busy}>
                  <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ILLUMINATIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-w">{t("f.widthCm")}</Label>
                <Input id="pf-w" inputMode="decimal" value={form.widthCm} disabled={busy} onChange={e => set("widthCm", e.target.value)} className="h-10 tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-h">{t("f.heightCm")}</Label>
                <Input id="pf-h" inputMode="decimal" value={form.heightCm} disabled={busy} onChange={e => set("heightCm", e.target.value)} className="h-10 tabular-nums" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="pf-hg">{t("f.heightGround")}</Label>
                <Input id="pf-hg" inputMode="decimal" value={form.heightAboveGroundM} disabled={busy} onChange={e => set("heightAboveGroundM", e.target.value)} className="h-10 tabular-nums" />
              </div>
            </div>
          </div>

          <Separator />

          {/* ---- Localisation + carte ---- */}
          <div className="space-y-3">
            <p className={sectionTitle}>{t("sec.geo")}</p>
            <SaMediaMapPicker
              lat={latNum ?? 0}
              lng={lngNum ?? 0}
              onPick={(la, ln) => setForm(f => ({ ...f, lat: String(la), lng: String(ln) }))}
            />
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden /> {t("geoHint")}
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="pf-lat">{t("f.lat")}</Label>
                <Input id="pf-lat" inputMode="decimal" value={form.lat} disabled={busy} onChange={e => set("lat", e.target.value)} className="h-10 tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-lng">{t("f.lng")}</Label>
                <Input id="pf-lng" inputMode="decimal" value={form.lng} disabled={busy} onChange={e => set("lng", e.target.value)} className="h-10 tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-gov">{t("f.governorat")}</Label>
                <Input id="pf-gov" value={form.governorat} disabled={busy} onChange={e => set("governorat", e.target.value)} className="h-10" list="pf-govs" />
                <datalist id="pf-govs">
                  {GOVERNORATS.map(g => <option key={g} value={g} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-del">{t("f.delegation")}</Label>
                <Input id="pf-del" value={form.delegation} disabled={busy} onChange={e => set("delegation", e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-ville">{t("f.ville")}</Label>
                <Input id="pf-ville" value={form.ville} disabled={busy} onChange={e => set("ville", e.target.value)} className="h-10" />
              </div>
              <div className="space-y-1.5 sm:col-span-3">
                <Label htmlFor="pf-rue">{t("f.rue")}</Label>
                <Input id="pf-rue" value={form.rue} disabled={busy} onChange={e => set("rue", e.target.value)} className="h-10" />
              </div>
            </div>
          </div>

          <Separator />

          {/* ---- Autorisation ---- */}
          <div className="space-y-3">
            <p className={sectionTitle}>{t("sec.auth")}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="pf-ref">{t("f.authRef")}</Label>
                <Input id="pf-ref" value={form.authorizationRef} disabled={busy} placeholder={t("f.authRefPh")} onChange={e => set("authorizationRef", e.target.value)} className="h-10 font-mono" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-start">{t("f.authStart")}</Label>
                <Input id="pf-start" type="date" value={form.authorizationStart} disabled={busy} onChange={e => set("authorizationStart", e.target.value)} className="h-10 tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pf-end">{t("f.authEnd")}</Label>
                <Input id="pf-end" type="date" value={form.authorizationEnd} disabled={busy} onChange={e => set("authorizationEnd", e.target.value)} className="h-10 tabular-nums" />
              </div>
            </div>
          </div>

          {/* ---- Faces initiales (création) ---- */}
          {panel === null ? (
            <>
              <Separator />
              <div className="space-y-3">
                <p className={sectionTitle}>{t("sec.faces")}</p>
                <p className="text-xs text-muted-foreground">{t("facesHint")}</p>
                <div className="space-y-2">
                  {faces.map((f, i) => (
                    <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-2.5">
                      <div className="min-w-32 flex-1 space-y-1">
                        <Label className="text-[11px]">{t("f.faceCode")}</Label>
                        <Input
                          value={f.code} disabled={busy} placeholder={`${form.code || "PAN"}-A`}
                          onChange={e => setFaces(fs => fs.map((x, j) => j === i ? { ...x, code: e.target.value.toUpperCase() } : x))}
                          className="h-9 font-mono"
                        />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-[11px]">{t("f.faceTmja")}</Label>
                        <Input inputMode="decimal" value={f.tmja} disabled={busy} onChange={e => setFaces(fs => fs.map((x, j) => j === i ? { ...x, tmja: e.target.value } : x))} className="h-9 tabular-nums" />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-[11px]">{t("f.faceAudience")}</Label>
                        <Input inputMode="decimal" value={f.audienceJournaliere} disabled={busy} onChange={e => setFaces(fs => fs.map((x, j) => j === i ? { ...x, audienceJournaliere: e.target.value } : x))} className="h-9 tabular-nums" />
                      </div>
                      <div className="w-24 space-y-1">
                        <Label className="text-[11px]">{t("f.faceOdv")}</Label>
                        <Input inputMode="decimal" value={f.odvJournalieres} disabled={busy} onChange={e => setFaces(fs => fs.map((x, j) => j === i ? { ...x, odvJournalieres: e.target.value } : x))} className="h-9 tabular-nums" />
                      </div>
                      <div className="w-28 space-y-1">
                        <Label className="text-[11px]">{t("f.facePrix")}</Label>
                        <Input inputMode="decimal" value={f.prixSemaine} disabled={busy} onChange={e => setFaces(fs => fs.map((x, j) => j === i ? { ...x, prixSemaine: e.target.value } : x))} className="h-9 tabular-nums" />
                      </div>
                      <Button
                        type="button" variant="ghost" size="icon" className="h-9 w-9 text-red-600" disabled={busy}
                        onClick={() => setFaces(fs => fs.filter((_, j) => j !== i))}
                        aria-label={t("face.remove")}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    </div>
                  ))}
                  {faces.length < 6 && (
                    <Button
                      type="button" variant="outline" size="sm" className="h-9 gap-1.5" disabled={busy}
                      onClick={() => setFaces(fs => [...fs, { code: "", tmja: "", audienceJournaliere: "", odvJournalieres: "", prixSemaine: "" }])}
                    >
                      <Plus className="h-4 w-4" aria-hidden /> {t("face.add")}
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Orientation par défaut : {ORIENTATIONS[0]} — modifiable ensuite depuis la matrice des faces.
                </p>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button disabled={busy} onClick={() => void save()} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
