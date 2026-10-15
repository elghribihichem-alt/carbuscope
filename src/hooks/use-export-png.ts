"use client"

// CarbuScope — T60 : export PNG d'un bloc de page (graphique, tableau…).
// html2canvas-pro est le SEUL html2canvas compatible avec les couleurs oklch
// de Tailwind 4 (pattern validé T55 sur le Tableau de bord) : import dynamique
// (bundle chargé à la demande), fond explicite lu au style calculé pour une
// capture fidèle en clair comme en sombre, échelle ×2.
//
// Le ref est créé PAR L'APPELANT et passé en paramètre : le rendu n'accède
// jamais à un objet contenant la ref (règle react-hooks/refs du compilateur
// React — le hook ne retourne que l'état `exporting` et la fonction).

import { useState, type RefObject } from "react"
import { toast } from "sonner"

/**
 * Export PNG d'un bloc — attachez le ref à l'élément capturé (Card…) et branchez
 * `exportPng` sur un bouton ; `exporting` pilote le spinner + disabled.
 * @param slug slug du fichier (ex. « veille-mouvements-12mois »).
 * @param objet libellé de l'objet exporté (toast : « Graphique exporté en image »).
 */
export function useExportPng(
  ref: RefObject<HTMLDivElement | null>,
  slug: string,
  objet = "Graphique",
) {
  const [exporting, setExporting] = useState(false)
  const exportPng = async () => {
    const el = ref.current
    if (!el || exporting) return
    setExporting(true)
    try {
      const { default: html2canvas } = await import("html2canvas-pro")
      // Fond explicite : capture fidèle en clair comme en sombre (oklch parsé
      // par html2canvas-pro, contrairement au html2canvas historique).
      const bg = getComputedStyle(el).backgroundColor || "#ffffff"
      const canvas = await html2canvas(el, { backgroundColor: bg, scale: 2, useCORS: true })
      const stamp = new Date().toISOString().slice(0, 10)
      const filename = `carbuscope-${slug}-${stamp}.png`
      const link = document.createElement("a")
      link.download = filename
      link.href = canvas.toDataURL("image/png")
      link.click()
      toast.success(`${objet} exporté en image`, { description: filename })
    } catch (e) {
      console.error("Export PNG échoué", e)
      toast.error(`Impossible d'exporter ce ${objet.toLowerCase()}`, {
        description: "La capture d'image a échoué dans le navigateur. Réessayez.",
      })
    } finally {
      setExporting(false)
    }
  }
  return { exporting, exportPng }
}
