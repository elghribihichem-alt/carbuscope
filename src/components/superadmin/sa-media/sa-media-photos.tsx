'use client'

// CarbuScope — Module Média (T60-g) : galerie PHOTOS d'un panneau (volet SA
// panneaux, Sheet détail). V1 = gestion par URL (l'upload de fichier est
// reporté V2) : ajouter une photo (URL + angle FACE/3/4/PROFILE + mode
// JOUR/NUIT), supprimer, afficher en grand via Dialog. Persistance : PATCH
// /api/media/panels/[id] { photos } (tableau complet — validation json serveur).

import { useState } from "react"
import { toast } from "sonner"
import { Camera, ImagePlus, Loader2, Maximize2, Moon, Sun, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { apiJson } from "@/components/media/media-shared"
import type { PanelPhotoDTO } from "@/lib/media/shared"
import { useSaMediaT, PHOTO_ANGLES, PHOTO_MODES, type SaMediaPanelDTO } from "./sa-media-shared"

const DICT = {
  fr: {
    title: "Photos du panneau",
    desc: "Ajout par URL (l'envoi de fichier sera disponible en V2). Angles : face, trois-quarts, profil · mode jour ou nuit.",
    add: "Ajouter la photo",
    "f.url": "URL de la photo",
    "f.urlPh": "https://…/photo-panneau-face-jour.jpg",
    "f.angle": "Angle",
    "f.mode": "Mode",
    empty: "Aucune photo — ajoutez une vue de face, de trois-quarts ou de profil.",
    "err.url": "URL invalide (http/https requis).",
    saved: "Photos mises à jour",
    view: "Agrandir la photo",
    del: "Retirer la photo",
    v2: "V2 : envoi de fichier",
  },
  en: {
    title: "Panel photos",
    desc: "Add by URL (file upload will come in V2). Angles: front, three-quarter, profile · day or night mode.",
    add: "Add photo",
    "f.url": "Photo URL",
    "f.urlPh": "https://…/photo-panel-front-day.jpg",
    "f.angle": "Angle",
    "f.mode": "Mode",
    empty: "No photo — add a front, three-quarter or profile view.",
    "err.url": "Invalid URL (http/https required).",
    saved: "Photos updated",
    view: "Zoom photo",
    del: "Remove photo",
    v2: "V2: file upload",
  },
  ar: {
    title: "صور اللوحة",
    desc: "الإضافة عبر رابط (رفع الملفات في V2). الزوايا: أمامية، ثلاثة أرباع، جانبية · نهار أو ليل.",
    add: "إضافة صورة",
    "f.url": "رابط الصورة",
    "f.urlPh": "https://…/photo-panel-front-day.jpg",
    "f.angle": "الزاوية",
    "f.mode": "الوضع",
    empty: "لا صور — أضف صورة أمامية أو جانبية.",
    "err.url": "رابط غير صالح.",
    saved: "تم تحديث الصور",
    view: "تكبير الصورة",
    del: "حذف الصورة",
    v2: "V2: رفع ملف",
  },
}

const MODE_ICON = { JOUR: Sun, NUIT: Moon } as const

export function SaMediaPhotos({ panel, onSaved }: { panel: SaMediaPanelDTO; onSaved: () => void }) {
  const { t } = useSaMediaT(DICT)
  const [url, setUrl] = useState("")
  const [angle, setAngle] = useState<string>("FACE")
  const [mode, setMode] = useState<string>("JOUR")
  const [busy, setBusy] = useState(false)
  const [viewing, setViewing] = useState<PanelPhotoDTO | null>(null)

  async function persist(photos: PanelPhotoDTO[], doneMsg: string) {
    if (busy) return
    setBusy(true)
    try {
      await apiJson(`/api/media/panels/${panel.id}`, { method: "PATCH", body: JSON.stringify({ photos }) })
      toast.success(doneMsg, { description: `${photos.length} photo(s) sur ${panel.code}` })
      onSaved()
    } catch (e) {
      toast.error("Échec de la mise à jour", { description: e instanceof Error ? e.message : "Erreur inconnue." })
    } finally {
      setBusy(false)
    }
  }

  function addPhoto() {
    const u = url.trim()
    if (!/^https?:\/\/\S+$/i.test(u)) { toast.error(t("err.url")); return }
    void persist([...panel.photos, { url: u, angle, mode }], t("saved"))
    setUrl("")
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Camera className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <p className="text-sm font-semibold">{t("title")}</p>
        <Badge variant="outline" className="ml-auto text-[10px] text-muted-foreground">{t("v2")}</Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{t("desc")}</p>

      {/* ---- Formulaire d'ajout ---- */}
      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2.5">
        <div className="min-w-44 flex-1 space-y-1">
          <Label htmlFor="ph-url" className="text-[11px]">{t("f.url")}</Label>
          <Input
            id="ph-url" value={url} disabled={busy} placeholder={t("f.urlPh")}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addPhoto() } }}
            className="h-9 font-mono text-xs"
          />
        </div>
        <div className="w-28 space-y-1">
          <Label className="text-[11px]">{t("f.angle")}</Label>
          <Select value={angle} onValueChange={v => setAngle(v)} disabled={busy}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PHOTO_ANGLES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-28 space-y-1">
          <Label className="text-[11px]">{t("f.mode")}</Label>
          <Select value={mode} onValueChange={v => setMode(v)} disabled={busy}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PHOTO_MODES.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" size="sm" className="h-9 gap-1.5" disabled={busy} onClick={addPhoto}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
          {t("add")}
        </Button>
      </div>

      {/* ---- Galerie ---- */}
      {panel.photos.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {panel.photos.map((p, i) => {
            const ModeIcon = MODE_ICON[p.mode as keyof typeof MODE_ICON] ?? Sun
            return (
              <div key={`${p.url}-${i}`} className="group relative overflow-hidden rounded-lg border bg-zinc-100 dark:bg-zinc-800">
                <div className="aspect-[4/3] w-full overflow-hidden">
                  <img
                    src={p.url}
                    alt={`Photo ${p.angle} — ${p.mode} du panneau ${panel.code}`}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                    loading="lazy"
                  />
                </div>
                <div className="flex items-center justify-between gap-1 px-2 py-1.5">
                  <Badge variant="outline" className="gap-1 border-zinc-300 bg-zinc-50 px-1.5 text-[10px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    <ModeIcon className="h-3 w-3" aria-hidden /> {p.angle} · {p.mode}
                  </Badge>
                  <span className="flex gap-0.5">
                    <button
                      type="button" disabled={busy} onClick={() => setViewing(p)}
                      className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                      aria-label={t("view")}
                      title={t("view")}
                    >
                      <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button" disabled={busy}
                      onClick={() => void persist(panel.photos.filter((_, j) => j !== i), t("saved"))}
                      className="flex h-7 w-7 items-center justify-center rounded text-red-600 hover:bg-red-100 dark:text-red-400 dark:hover:bg-red-950"
                      aria-label={t("del")}
                      title={t("del")}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ---- Aperçu plein format ---- */}
      <Dialog open={viewing !== null} onOpenChange={o => { if (!o) setViewing(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-sm">{panel.code} — {viewing?.angle} · {viewing?.mode}</DialogTitle>
            <DialogDescription>{panel.name} · {panel.ville}</DialogDescription>
          </DialogHeader>
          {viewing ? (
            <img
              src={viewing.url}
              alt={`Photo ${viewing.angle} — ${viewing.mode} du panneau ${panel.code}`}
              className="max-h-[70vh] w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
