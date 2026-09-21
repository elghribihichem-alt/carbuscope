'use client'

// V7 — Menu utilisateur de l'en-tête : profil de session, sécurité (2FA TOTP
// réelle : QR → vérification → activation, ou désactivation), changeur de
// comptes de démonstration et déconnexion. Remplace les anciens sélecteurs
// libres de rôle/enseigne (l'accès dépend désormais du compte connecté).

import { useEffect, useState } from "react"
import {
  BadgeCheck, Bot, ChevronDown, Copy, KeyRound, Loader2, LogOut, QrCode, RefreshCw,
  ShieldCheck, ShieldOff, Smartphone, UserRound, Users,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { useAppStore, ROLE_LABELS, type Mode, type Role } from "@/store/app-store"
import type { DemoAccount, SessionUser } from "@/lib/types"
import { cn } from "@/lib/utils"

const roleLabel = (r: string) => ROLE_LABELS[r as Role] ?? r

/** Applique une session au store global (après login / switch / 2FA). */
export function applySession(user: SessionUser, keepMode = true) {
  const s = useAppStore.getState()
  s.setSession(user)
  s.setAuthStatus("auth")
  s.setRole(user.role as Role)
  if (user.brandSlug) s.setBrandSlug(user.brandSlug)
  if (!keepMode || !user.spaces.includes(s.mode)) {
    const accueil: Mode =
      user.role === "SUPER_ADMIN" && user.spaces.includes("superadmin") ? "superadmin"
        : user.brandSlug && user.spaces.includes("portail") ? "portail"
          : !user.brandSlug && user.role !== "SUPER_ADMIN" && user.spaces.includes("backoffice") ? "backoffice"
            : "observatoire"
    s.setMode(accueil)
  }
}

// ---------- Dialog sécurité 2FA ----------

function SecurityDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const session = useAppStore(s => s.session)
  const [etape, setEtape] = useState<"repos" | "qr" | "actif">("repos")
  const [qr, setQr] = useState<{ secret: string; qrDataUrl: string } | null>(null)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setEtape(session?.totpEnabled ? "actif" : "repos")
      setQr(null); setCode(""); setErreur(null)
    }
  }, [open, session?.totpEnabled])

  if (!session) return null

  const lancer = async () => {
    setBusy(true); setErreur(null)
    try {
      const r = await fetch("/api/auth/2fa", { method: "POST" })
      const body = (await r.json().catch(() => ({}))) as { secret?: string; qrDataUrl?: string; error?: string }
      if (r.ok && body.secret && body.qrDataUrl) {
        setQr({ secret: body.secret, qrDataUrl: body.qrDataUrl })
        setEtape("qr")
      } else {
        setErreur(body.error ?? "Génération impossible — réessayez.")
      }
    } catch {
      setErreur("Génération impossible — vérifiez votre réseau.")
    } finally { setBusy(false) }
  }

  const activer = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setErreur("Saisissez les 6 chiffres affichés par votre application."); return }
    setBusy(true); setErreur(null)
    try {
      const r = await fetch("/api/auth/2fa", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      })
      const body = (await r.json().catch(() => ({}))) as { user?: SessionUser; error?: string }
      if (r.ok && body.user) {
        applySession(body.user, true)
        setEtape("actif"); setCode("")
        toast.success("Double authentification activée", {
          description: "Votre connexion exigera désormais un code à 6 chiffres.",
        })
      } else {
        setErreur(body.error ?? "Code invalide — réessayez.")
      }
    } catch {
      setErreur("Validation impossible — vérifiez votre réseau.")
    } finally { setBusy(false) }
  }

  const desactiver = async () => {
    if (!/^\d{6}$/.test(code.trim())) { setErreur("Saisissez les 6 chiffres pour confirmer la désactivation."); return }
    setBusy(true); setErreur(null)
    try {
      const r = await fetch("/api/auth/2fa", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      })
      const body = (await r.json().catch(() => ({}))) as { user?: SessionUser; error?: string }
      if (r.ok && body.user) {
        applySession(body.user, true)
        setEtape("repos"); setCode("")
        toast.info("Double authentification désactivée", { description: "Le secret TOTP a été supprimé." })
      } else {
        setErreur(body.error ?? "Code invalide — la désactivation est refusée.")
      }
    } catch {
      setErreur("Demande impossible — vérifiez votre réseau.")
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" aria-hidden />
            Mon compte — sécurité
          </DialogTitle>
          <DialogDescription>
            {session.name} · {session.email}
          </DialogDescription>
        </DialogHeader>

        {etape === "repos" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-3.5">
              <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <div className="text-[13px] leading-relaxed text-muted-foreground">
                <p className="font-semibold text-foreground">Double authentification (TOTP)</p>
                <p className="mt-1">
                  Protégez votre compte avec un code à 6 chiffres généré par votre téléphone
                  (Google Authenticator, Authy, 1Password…), même si votre mot de passe fuit.
                </p>
              </div>
            </div>
            <Button onClick={lancer} disabled={busy} className="w-full gap-2 bg-emerald-600 font-semibold hover:bg-emerald-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <QrCode className="h-4 w-4" aria-hidden />}
              Activer la 2FA — générer le QR code
            </Button>
          </div>
        )}

        {etape === "qr" && qr && (
          <div className="space-y-4">
            <ol className="space-y-1.5 text-[13px] text-muted-foreground">
              <li>1. Ouvrez votre application d&apos;authentification.</li>
              <li>2. Scannez ce QR code (ou saisissez la clé manuellement).</li>
              <li>3. Saisissez le code à 6 chiffres proposé.</li>
            </ol>
            <div className="flex justify-center rounded-xl border bg-white p-3">
              <img src={qr.qrDataUrl} alt="QR code de configuration TOTP CarbuScope" className="h-52 w-52" />
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-2.5">
              <code className="min-w-0 flex-1 truncate font-mono text-[11px]">{qr.secret}</code>
              <Button
                type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0"
                aria-label="Copier la clé secrète"
                onClick={() => { navigator.clipboard?.writeText(qr.secret).then(() => toast.success("Clé copiée")).catch(() => {}) }}
              >
                <Copy className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sec-2fa-code">Code de vérification</Label>
              <Input
                id="sec-2fa-code" inputMode="numeric" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))} disabled={busy}
                placeholder="•• •• ••" className="h-11 text-center font-mono text-lg tracking-[0.3em]"
              />
            </div>
            <Button onClick={activer} disabled={busy} className="w-full gap-2 bg-emerald-600 font-semibold hover:bg-emerald-700">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <BadgeCheck className="h-4 w-4" aria-hidden />}
              Vérifier et activer
            </Button>
            <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
              Sans votre application d&apos;authentification, seule la Super Administration pourra
              réinitialiser votre accès (onglet Comptes).
            </p>
          </div>
        )}

        {etape === "actif" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-300 bg-emerald-50 p-3.5 dark:border-emerald-800 dark:bg-emerald-950/60">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <p className="text-[13px] leading-relaxed text-emerald-900 dark:text-emerald-200">
                <strong>2FA active.</strong> Chaque connexion exige un code à 6 chiffres — vos
                identifiants seuls ne suffisent plus.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sec-2fa-off">Désactiver la 2FA (code requis)</Label>
              <Input
                id="sec-2fa-off" inputMode="numeric" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))} disabled={busy}
                placeholder="•• •• ••" className="h-11 text-center font-mono text-lg tracking-[0.3em]"
              />
            </div>
            <Button onClick={desactiver} disabled={busy} variant="destructive" className="w-full gap-2 font-semibold">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ShieldOff className="h-4 w-4" aria-hidden />}
              Désactiver la double authentification
            </Button>
          </div>
        )}

        {erreur && (
          <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] font-medium text-destructive">
            {erreur}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------- Menu utilisateur (popover en-tête) ----------

export function UserMenu() {
  const session = useAppStore(s => s.session)
  const { setSession, setAuthStatus, setMode, setTab, setRole, setBrandSlug, stopImpersonating } = useAppStore()
  const [open, setOpen] = useState(false)
  const [secOpen, setSecOpen] = useState(false)
  const [comptes, setComptes] = useState<DemoAccount[]>([])
  const [switchBusy, setSwitchBusy] = useState<string | null>(null)
  const [switchError, setSwitchError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || comptes.length) return
    fetch("/api/auth/accounts")
      .then(r => r.json())
      .then((d: { comptes?: DemoAccount[] }) => { if (d.comptes) setComptes(d.comptes) })
      .catch(() => {})
  }, [open, comptes.length])

  if (!session) return null

  const initiales = session.name.split(" ").map(m => m[0]).slice(0, 2).join("")
  const estSA = session.role === "SUPER_ADMIN"

  const seDeconnecter = async () => {
    try { await fetch("/api/auth/logout", { method: "POST" }) } catch { /* la session locale est nettoyée quand même */ }
    setSession(null)
    setAuthStatus("anon")
    stopImpersonating()
    setRole("ADMIN")
    setBrandSlug("agil")
    setMode("observatoire")
    setTab("dashboard")
    setOpen(false)
    toast.info("Vous êtes déconnecté", { description: "À bientôt sur CarbuScope." })
  }

  const changer = async (c: DemoAccount) => {
    if (c.email === session.email) return
    setSwitchBusy(c.email)
    setSwitchError(null)
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: c.email, password: "carbuscope" }),
      })
      const body = (await r.json().catch(() => ({}))) as { user?: SessionUser; twoFactor?: boolean; error?: string }
      if (r.status === 200 && body.user) {
        applySession(body.user, false)
        stopImpersonating()
        setOpen(false)
        toast.success(`Connecté en tant que ${body.user.name}`, {
          description: `${roleLabel(body.user.role)}${body.user.brandName ? ` · ${body.user.brandName}` : ""}`,
        })
      } else if (r.status === 200 && body.twoFactor) {
        setSwitchError(`La 2FA est active sur ${c.email} — connectez-vous depuis l'écran de connexion pour saisir le code.`)
      } else {
        setSwitchError(body.error ?? "Changement de compte impossible.")
      }
    } catch {
      setSwitchError("Changement impossible — vérifiez votre réseau.")
    } finally {
      setSwitchBusy(null)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5 text-left transition-colors hover:bg-accent"
            aria-label="Menu utilisateur"
          >
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white",
                estSA ? "bg-violet-600" : session.brandSlug ? "bg-emerald-600" : "bg-slate-600",
              )}
              aria-hidden
            >
              {initiales}
            </span>
            <span className="hidden min-w-0 sm:block">
              <span className="block max-w-[140px] truncate text-[12.5px] font-semibold leading-tight">{session.name}</span>
              <span className="block max-w-[140px] truncate text-[10.5px] leading-tight text-muted-foreground">
                {session.brandName ?? roleLabel(session.role)}
              </span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          {/* En-tête : identité + statut 2FA */}
          <div className="border-b p-3.5">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white",
                  estSA ? "bg-violet-600" : session.brandSlug ? "bg-emerald-600" : "bg-slate-600",
                )}
                aria-hidden
              >
                {initiales}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{session.name}</p>
                <p className="truncate text-xs text-muted-foreground">{session.email}</p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="h-5 text-[10px] font-medium">{roleLabel(session.role)}</Badge>
              {session.brandName && (
                <Badge variant="outline" className="h-5 gap-1 text-[10px] font-medium">
                  <UserRound className="h-3 w-3" aria-hidden /> {session.brandName}
                </Badge>
              )}
              <Badge
                variant="outline"
                className={cn(
                  "h-5 gap-1 text-[10px] font-semibold",
                  session.totpEnabled
                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400"
                    : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400",
                )}
              >
                {session.totpEnabled ? <ShieldCheck className="h-3 w-3" aria-hidden /> : <ShieldOff className="h-3 w-3" aria-hidden />}
                {session.totpEnabled ? "2FA active" : "2FA inactive"}
              </Badge>
            </div>
          </div>

          {/* Sécurité */}
          <button
            className="flex w-full items-center gap-2.5 border-b px-3.5 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-accent"
            onClick={() => { setOpen(false); setSecOpen(true) }}
          >
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
            Sécurité — double authentification
            <ChevronDown className="ml-auto h-3.5 w-3.5 -rotate-90 text-muted-foreground" aria-hidden />
          </button>

          {/* Changeur de comptes (démo) */}
          <div className="border-b">
            <p className="flex items-center gap-1.5 px-3.5 pt-2.5 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
              <Users className="h-3 w-3" aria-hidden /> Changer de compte (démo)
            </p>
            <div className="max-h-64 overflow-y-auto p-1.5">
              {comptes.filter(c => c.email !== session.email).map(c => (
                <button
                  key={c.email}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent disabled:opacity-50"
                  onClick={() => changer(c)}
                  disabled={switchBusy !== null}
                  title={c.email}
                >
                  <span
                    className={cn(
                      "flex h-6.5 w-6.5 shrink-0 items-center justify-center rounded-full text-[9.5px] font-bold text-white",
                      c.role === "SUPER_ADMIN" ? "bg-violet-600" : c.brandSlug ? "bg-emerald-600" : "bg-slate-600",
                    )}
                    style={{ height: 26, width: 26 }}
                    aria-hidden
                  >
                    {c.name.split(" ").map(m => m[0]).slice(0, 2).join("")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium leading-tight">{c.name}</span>
                    <span className="block truncate text-[10.5px] leading-tight text-muted-foreground">
                      {c.brandName ?? roleLabel(c.role)}{c.totpEnabled ? " · 2FA" : ""}
                    </span>
                  </span>
                  {switchBusy === c.email
                    ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" aria-hidden />
                    : <Bot className="hidden" aria-hidden />}
                </button>
              ))}
              {comptes.length === 0 && (
                <p className="px-2 py-2 text-[12px] text-muted-foreground">Chargement des comptes…</p>
              )}
            </div>
            {switchError && (
              <p className="mx-2 mb-2 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-[11px] leading-snug text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                {switchError}
              </p>
            )}
          </div>

          {/* Déconnexion */}
          <div className="p-1.5">
            <button
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-[13px] font-medium text-destructive transition-colors hover:bg-destructive/10"
              onClick={seDeconnecter}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Se déconnecter
              <RefreshCw className="ml-auto hidden h-3 w-3" aria-hidden />
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <SecurityDialog open={secOpen} onOpenChange={setSecOpen} />
    </>
  )
}
