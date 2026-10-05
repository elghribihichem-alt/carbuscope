'use client'

// CarbuScope — T60-e — galerie photos d'un panneau (face en accès complet
// uniquement : photos[] de PanelNestedDTO, absentes sinon côté serveur).
// Vignettes 4 colonnes → Dialog plein cadre avec badges angle (FACE / 3/4 /
// PROFILE) et mode (JOUR / NUIT). Dictionnaire local fr/en/ar du fichier.

import { useState } from "react"
import { Camera, ImageIcon } from "lucide-react"
import { useLocalT, type LocalDict } from "@/components/media/media-shared"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const P_DICT: LocalDict = {
  fr: { "p.title": "Photos du panneau", "p.empty": "Aucune photo disponible.", "p.photo": "Photo" },
  en: { "p.title": "Panel photos", "p.empty": "No photo available.", "p.photo": "Photo" },
  ar: { "p.title": "صور اللوحة", "p.empty": "لا توجد صور.", "p.photo": "صورة" },
}

const ANGLE_LABELS: Record<string, string> = { FACE: "Face", "3/4": "3/4", PROFILE: "Profil" }
const MODE_LABELS: Record<string, string> = { JOUR: "Jour", NUIT: "Nuit" }

export interface ExplorerPhotosProps {
  photos: { url: string; angle: string; mode: string }[]
}

export function ExplorerPhotos({ photos }: ExplorerPhotosProps) {
  const { t } = useLocalT(P_DICT)
  const [openIdx, setOpenIdx] = useState<number | null>(null)
  const open = openIdx !== null ? photos[openIdx] : null

  if (photos.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
        {t("p.empty")}
      </p>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="list" aria-label={t("p.title")}>
        {photos.map((p, i) => (
          <button
            key={p.url}
            type="button"
            role="listitem"
            className="group relative aspect-4/3 overflow-hidden rounded-lg border bg-muted transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setOpenIdx(i)}
            aria-label={`${t("p.photo")} — ${ANGLE_LABELS[p.angle] ?? p.angle} · ${MODE_LABELS[p.mode] ?? p.mode}`}
          >
            {/* Photos externes (seed picsum) — règle no-img-element désactivée au niveau projet. */}
            <img src={p.url} alt={`${t("p.photo")} ${ANGLE_LABELS[p.angle] ?? p.angle} ${MODE_LABELS[p.mode] ?? p.mode}`} className="h-full w-full object-cover" loading="lazy" />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/45 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-3 w-3" aria-hidden /> {ANGLE_LABELS[p.angle] ?? p.angle}
            </span>
          </button>
        ))}
      </div>

      <Dialog open={openIdx !== null} onOpenChange={o => { if (!o) setOpenIdx(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
              <ImageIcon className="h-4 w-4 text-[#b0563b]" aria-hidden />
              {t("p.title")}
              {open && (
                <>
                  <Badge variant="outline" className="text-[10px]">{ANGLE_LABELS[open.angle] ?? open.angle}</Badge>
                  <Badge variant="outline" className="text-[10px]">{MODE_LABELS[open.mode] ?? open.mode}</Badge>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">{t("p.title")}</DialogDescription>
          </DialogHeader>
          {open && (
            <img src={open.url} alt={`${t("p.photo")} — ${ANGLE_LABELS[open.angle] ?? open.angle} ${MODE_LABELS[open.mode] ?? open.mode}`} className="max-h-[70vh] w-full rounded-lg border object-contain" />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
