'use client'

// CarbuScope — Module Média (T60-g) : dialogue « Ajouter une face » sur un
// panneau existant du référentiel (SA). POST /api/media/faces — code face
// (3-24 A-Z/chiffres/tirets, unique), orientation, valeurs initiales trafic &
// commercial. La face naît PUBLIQUE (permissions par défaut).

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, SquareStack } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiJson } from "@/components/media/media-shared"
import { useSaMediaT, ORIENTATIONS, type SaMediaPanelDTO } from "./sa-media-shared"

const DICT = {
  fr: {
    title: "Ajouter une face",
    desc: "Nouvelle face sur le panneau — code unique (3-24 caractères A-Z, chiffres, tirets). Visibilité publique par défaut.",
    "f.code": "Code face",
    "f.codePh": "PAN-TUN-001-C",
    "f.orientation": "Orientation",
    "f.status": "Statut",
    "f.tmja": "TMJA (véh./j)",
    "f.audience": "Audience journalière",
    "f.odv": "ODV journalières",
    "f.prix": "Prix / semaine (DT)",
    "err.code": "Code face requis (3-24 caractères A-Z, chiffres, tirets).",
    saved: "Face créée",
  },
  en: {
    title: "Add a face",
    desc: "New face on the panel — unique code (3-24 chars A-Z, digits, dashes). Public visibility by default.",
    "f.code": "Face code",
    "f.codePh": "PAN-TUN-001-C",
    "f.orientation": "Orientation",
    "f.status": "Status",
    "f.tmja": "TMJA (veh./day)",
    "f.audience": "Daily audience",
    "f.odv": "Daily ODV",
    "f.prix": "Price / week (DT)",
    "err.code": "Face code required (3-24 chars A-Z, digits, dashes).",
    saved: "Face created",
  },
  ar: {
    title: "إضافة وجه",
    desc: "وجه جديد على اللوحة — رمز فريد (3-24 حرفًا). الرؤية عامة افتراضيًا.",
    "f.code": "رمز الوجه",
    "f.codePh": "PAN-TUN-001-C",
    "f.orientation": "الاتجاه",
    "f.status": "الحالة",
    "f.tmja": "TMJA",
    "f.audience": "الجمهور اليومي",
    "f.odv": "ODV اليومية",
    "f.prix": "السعر / أسبوع",
    "err.code": "رمز الوجه مطلوب (3-24 حرفًا).",
    saved: "تم إنشاء الوجه",
  },
}

const FACE_STATUSES = ["DISPONIBLE", "OCCUPEE", "MAINTENANCE", "RETIREE"] as const

export interface SaMediaFaceFormProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  panel: SaMediaPanelDTO | null
  onSaved: () => void
}

export function SaMediaFaceForm({ open, onOpenChange, panel, onSaved }: SaMediaFaceFormProps) {
  const { t } = useSaMediaT(DICT)
  const [code, setCode] = useState("")
  const [orientation, setOrientation] = useState<string>("N")
  const [status, setStatus] = useState<string>("DISPONIBLE")
  const [tmja, setTmja] = useState("")
  const [audience, setAudience] = useState("")
  const [odv, setOdv] = useState("")
  const [prix, setPrix] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open && panel) {
      const nextLetter = String.fromCharCode(65 + Math.min(panel.faces.length, 25))
      setCode(`${panel.code}-${nextLetter}`)
      setOrientation("N")
      setStatus("DISPONIBLE")
      setTmja(String(Math.max(...panel.faces.map(f => f.tmja), 0)))
      setAudience(String(Math.max(...panel.faces.map(f => f.audienceJournaliere), 0)))
      setOdv(String(Math.max(...panel.faces.map(f => f.odvJournalieres), 0)))
      setPrix(panel.faces.length > 0 ? String(Math.max(...panel.faces.map(f => f.prixSemaine))) : "")
    }
  }, [open, panel])

  async function save() {
    if (!panel || busy) return
    if (!/^[A-Z0-9-]{3,24}$/.test(code.trim())) { toast.error(t("err.code")); return }
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        panelId: panel.id, code: code.trim(), orientation, status,
        tmja: tmja.trim() === "" ? undefined : Number(tmja),
        audienceJournaliere: audience.trim() === "" ? undefined : Number(audience),
        odvJournalieres: odv.trim() === "" ? undefined : Number(odv),
        prixSemaine: prix.trim() === "" ? undefined : Number(prix),
      }
      await apiJson("/api/media/faces", { method: "POST", body: JSON.stringify(body) })
      toast.success(t("saved"), { description: `${code} sur ${panel.code}` })
      onSaved()
      onOpenChange(false)
    } catch (e) {
      toast.error("Échec de la création", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SquareStack className="h-5 w-5 text-emerald-600 dark:text-emerald-400" aria-hidden /> {t("title")}
          </DialogTitle>
          <DialogDescription>
            {panel ? `${panel.code} — ${panel.name} · ${panel.ville}` : ""}
            {" · "}
            {t("desc")}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="ff-code">{t("f.code")}</Label>
            <Input
              id="ff-code" value={code} disabled={busy} placeholder={t("f.codePh")}
              onChange={e => setCode(e.target.value.toUpperCase())}
              className="h-10 font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("f.orientation")}</Label>
            <Select value={orientation} onValueChange={v => setOrientation(v)} disabled={busy}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ORIENTATIONS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("f.status")}</Label>
            <Select value={status} onValueChange={v => setStatus(v)} disabled={busy}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FACE_STATUSES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ff-tmja">{t("f.tmja")}</Label>
            <Input id="ff-tmja" inputMode="decimal" value={tmja} disabled={busy} onChange={e => setTmja(e.target.value)} className="h-10 tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ff-aud">{t("f.audience")}</Label>
            <Input id="ff-aud" inputMode="decimal" value={audience} disabled={busy} onChange={e => setAudience(e.target.value)} className="h-10 tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ff-odv">{t("f.odv")}</Label>
            <Input id="ff-odv" inputMode="decimal" value={odv} disabled={busy} onChange={e => setOdv(e.target.value)} className="h-10 tabular-nums" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ff-prix">{t("f.prix")}</Label>
            <Input id="ff-prix" inputMode="decimal" value={prix} disabled={busy} onChange={e => setPrix(e.target.value)} className="h-10 tabular-nums" />
          </div>
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
