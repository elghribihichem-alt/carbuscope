'use client'

// Super Administration — dialogue de confirmation partagé (T52-R2) : encadre
// les actions sensibles (suspension/réactivation d'un contrat, relance groupée
// des factures impayées…). Patron des dialogues T30 (shadcn) : conséquences
// explicites, bouton Annuler toujours disponible, état « occupé » pendant la
// requête — le dialogue ne se referme pas tant que l'action n'est pas terminée.

import type { LucideIcon } from "lucide-react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

export type SaConfirmTone = "amber" | "emerald" | "destructive"

const TONE_ICON: Record<SaConfirmTone, string> = {
  amber: "text-amber-600 dark:text-amber-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  destructive: "text-red-600 dark:text-red-400",
}

const TONE_BTN: Record<SaConfirmTone, string> = {
  amber: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-900",
  emerald: "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 dark:hover:bg-emerald-900",
  destructive: "bg-destructive text-white hover:bg-destructive/90",
}

export interface SaConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Lancé au clic sur « Confirmer » — le dialogue reste ouvert (busy) tant
   *  que la promesse n'est pas résolue, puis l'appelant ferme. */
  onConfirm: () => void | Promise<void>
  busy: boolean
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel: React.ReactNode
  cancelLabel?: string
  icon?: LucideIcon
  tone?: SaConfirmTone
  /** Contenu additionnel (compteurs, liste des conséquences…). */
  children?: React.ReactNode
}

export function SaConfirmDialog({
  open, onOpenChange, onConfirm, busy, title, description, confirmLabel,
  cancelLabel = "Annuler", icon: Icon, tone = "amber", children,
}: SaConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className={cn("h-5 w-5 shrink-0", TONE_ICON[tone])} aria-hidden />}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button size="sm" className={cn("gap-1.5", TONE_BTN[tone])} disabled={busy} onClick={() => void onConfirm()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
