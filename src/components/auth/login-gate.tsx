'use client'

// V7 — Écran de connexion (authentification réelle) : bcrypt côté serveur,
// défi 2FA TOTP en deux étapes, comptes de démonstration pré-remplissables.
// Identité émeraude CarbuScope, 100 % FR, responsive dès 390 px.

import { useEffect, useRef, useState } from "react"
import { Fuel, Loader2, LockKeyhole, LogIn, ShieldCheck, Eye, EyeOff, ArrowLeft, KeyRound, Bot, LineChart, Smartphone, Building2, UserRound, Info, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { useAppStore, ROLE_LABELS, type Role, type Mode } from "@/store/app-store"
import { CarbuscopeLogo } from "@/components/shell/carbuscope-logo"
import type { DemoAccount, SessionUser } from "@/lib/types"
import { cn } from "@/lib/utils"

const ATOUTS = [
  { icon: LineChart, text: "Observatoire B2B : prix, parts de marché, concurrence et implantation." },
  { icon: Building2, text: "Portail enseigne : votre réseau, vos avis, votre abonnement SaaS." },
  { icon: Smartphone, text: "Mobile B2C : le Waze du carburant pour les automobilistes tunisiens." },
  { icon: Bot, text: "Assistants IA sur mesure — éditeur, enseignes et conducteurs." },
]

const roleLabel = (r: string) => ROLE_LABELS[r as Role] ?? r

export function LoginGate() {
  const { setSession, setAuthStatus, setRole, setBrandSlug, setMode, setTab, stopImpersonating } = useAppStore()

  const [comptes, setComptes] = useState<DemoAccount[]>([])
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [code, setCode] = useState("")
  const [etape, setEtape] = useState<"identifiants" | "code">("identifiants")
  const [busy, setBusy] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  // Comptes de démonstration (quick-fill) — le mot de passe démo est public
  useEffect(() => {
    let alive = true
    fetch("/api/auth/accounts")
      .then(r => r.json())
      .then((d: { comptes?: DemoAccount[] }) => { if (alive && d.comptes) setComptes(d.comptes) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (etape === "code") codeRef.current?.focus()
  }, [etape])

  const adopte = (user: SessionUser) => {
    setSession(user)
    setAuthStatus("auth")
    // Rôle « métier » pour les onglets de l'observatoire : la racine Super Admin
    // navigue comme un administrateur complet (convention démo TAB_ACCESS).
    setRole(user.role === "SUPER_ADMIN" ? "ADMIN" : (user.role as Role))
    if (user.brandSlug) setBrandSlug(user.brandSlug)
    stopImpersonating()
    setTab("dashboard")
    const accueil: Mode =
      user.role === "SUPER_ADMIN" && user.spaces.includes("superadmin") ? "superadmin"
        : "portail"
    setMode(accueil)
    toast.success(`Bienvenue, ${user.name.split(" ")[0]} !`, {
      description: `${roleLabel(user.role)}${user.brandName ? ` · ${user.brandName}` : ""} — session sécurisée de 12 h.`,
    })
  }

  const connecter = async (creds: { email: string; password: string; code?: string }) => {
    setBusy(true)
    setErreur(null)
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(creds),
      })
      const body = (await r.json().catch(() => ({}))) as { user?: SessionUser; twoFactor?: boolean; error?: string }
      if (r.status === 200 && body.twoFactor) {
        setEtape("code")
        setCode("")
        return
      }
      if (r.status === 200 && body.user) {
        adopte(body.user)
        return
      }
      setErreur(body.error ?? "Connexion impossible — réessayez.")
    } catch {
      setErreur("Connexion impossible — vérifiez votre réseau.")
    } finally {
      setBusy(false)
    }
  }

  const soumettre = (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    if (etape === "code") {
      if (!/^\d{6}$/.test(code.trim())) { setErreur("Saisissez les 6 chiffres de votre application d'authentification."); return }
      connecter({ email: email.trim().toLowerCase(), password, code: code.trim() })
    } else {
      connecter({ email: email.trim().toLowerCase(), password })
    }
  }

  const preRemplir = (c: DemoAccount) => {
    setEmail(c.email)
    setPassword("carbuscope")
    setEtape("identifiants")
    setErreur(null)
  }

  /** Connexion express : un clic sur une persona = connexion immédiate avec le
   * mot de passe démo public (le défi 2FA s'affiche si le compte l'a activée). */
  const connexionExpress = (c: DemoAccount) => {
    preRemplir(c)
    connecter({ email: c.email, password: "carbuscope" })
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-emerald-50 via-background to-emerald-100/60 dark:from-emerald-950/30 dark:via-background dark:to-background">
      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:py-0">

        {/* ---- Panneau produit (lg+) ---- */}
        <section className="hidden min-w-0 lg:block" aria-label="Présentation de la plateforme">
          <div className="flex items-center gap-3">
            <CarbuscopeLogo size={56} />
            <div>
              <p className="text-3xl font-extrabold tracking-tight">Carbu<span className="text-emerald-600">Scope</span></p>
              <p className="text-sm text-muted-foreground">L&apos;observatoire du carburant — Tunisie</p>
            </div>
          </div>
          <h1 className="mt-8 text-2xl font-bold leading-snug tracking-tight xl:text-[28px]">
            La plateforme SaaS du carburant tunisien,
            <br />
            <span className="text-emerald-700 dark:text-emerald-400">une seule session pour vos 3 espaces.</span>
          </h1>
          <ul className="mt-7 space-y-3.5">
            {ATOUTS.map(a => {
              const Icon = a.icon
              return (
                <li key={a.text} className="flex items-start gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                    <Icon className="h-[18px] w-[18px]" aria-hidden />
                  </span>
                  <p className="text-sm leading-snug text-muted-foreground">{a.text}</p>
                </li>
              )
            })}
          </ul>
          <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden />
            Sessions chiffrées, mots de passe bcrypt, double authentification TOTP optionnelle.
          </p>
        </section>

        {/* ---- Carte de connexion ---- */}
        <section aria-labelledby="connexion-titre" className="mx-auto w-full min-w-0 max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <CarbuscopeLogo size={44} />
            <div>
              <p className="text-xl font-extrabold tracking-tight">Carbu<span className="text-emerald-600">Scope</span></p>
              <p className="text-xs text-muted-foreground">L&apos;observatoire du carburant — Tunisie</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-lg sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
                <LockKeyhole className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h2 id="connexion-titre" className="text-lg font-bold tracking-tight">
                  {etape === "identifiants" ? "Connexion à la plateforme" : "Vérification en deux étapes"}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {etape === "identifiants"
                    ? "Accédez à vos espaces selon votre profil."
                    : `Un code à 6 chiffres est requis pour ${email}.`}
                </p>
              </div>
            </div>

            <form onSubmit={soumettre} className="mt-6 space-y-4" noValidate>
              {etape === "identifiants" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Adresse e-mail</Label>
                    <Input
                      id="login-email" type="email" autoComplete="email" inputMode="email"
                      placeholder="prenom.nom@enseigne.tn" value={email}
                      onChange={e => setEmail(e.target.value)} required disabled={busy}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Mot de passe</Label>
                    <div className="relative">
                      <Input
                        id="login-password" type={showPassword ? "text" : "password"}
                        autoComplete="current-password" placeholder="••••••••••" value={password}
                        onChange={e => setPassword(e.target.value)} required disabled={busy}
                        className="h-10 pr-10"
                      />
                      <button
                        type="button" onClick={() => setShowPassword(v => !v)}
                        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                        aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[13px] leading-snug text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200">
                    <KeyRound className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    <p>
                      Ouvrez votre application d&apos;authentification (Google Authenticator, Authy…) et
                      saisissez le code <strong>à 6 chiffres</strong> du compte <strong>{email}</strong>.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-code">Code de vérification</Label>
                    <Input
                      id="login-code" ref={codeRef} inputMode="numeric" autoComplete="one-time-code"
                      placeholder="•• •• ••" maxLength={6} value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, ""))} disabled={busy}
                      className="h-12 text-center font-mono text-xl tracking-[0.3em]"
                    />
                  </div>
                  <button
                    type="button" onClick={() => { setEtape("identifiants"); setErreur(null); setCode("") }}
                    className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Revenir aux identifiants
                  </button>
                </>
              )}

              {erreur && (
                <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[13px] font-medium text-destructive">
                  {erreur}
                </p>
              )}

              <Button
                type="submit" disabled={busy || (etape === "identifiants" && (!email || !password))}
                className="h-11 w-full gap-2 bg-emerald-600 text-[15px] font-semibold shadow-sm hover:bg-emerald-700"
              >
                {busy
                  ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Connexion en cours…</>
                  : <><LogIn className="h-4 w-4" aria-hidden /> {etape === "code" ? "Valider et se connecter" : "Se connecter"}</>}
              </Button>
            </form>

            {/* ---- Comptes de démonstration ---- */}
            <div className="mt-6">
              <Separator className="mb-5" />
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <UserRound className="h-3.5 w-3.5" aria-hidden /> Comptes de démonstration
                </p>
                <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-[10px] font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  <Info className="h-3 w-3" aria-hidden /> mot de passe&nbsp;: carbuscope
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {comptes.slice(0, 8).map(c => (
                  <button
                    key={c.email} type="button" onClick={() => connexionExpress(c)}
                    disabled={busy}
                    className={cn(
                      "group flex items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 text-left transition-colors hover:border-emerald-400 hover:bg-emerald-50/60 disabled:opacity-50 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40",
                      email === c.email && "border-emerald-500 bg-emerald-50/70 dark:border-emerald-600 dark:bg-emerald-950/50",
                    )}
                    title={`Connexion express : ${c.email} (rôle ${roleLabel(c.role)})`}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white",
                        c.role === "SUPER_ADMIN" ? "bg-violet-600" : c.brandSlug ? "bg-emerald-600" : "bg-slate-600",
                      )}
                      aria-hidden
                    >
                      {c.name.split(" ").map(m => m[0]).slice(0, 2).join("")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold leading-tight">{c.name}</span>
                      <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                        {c.brandName ?? roleLabel(c.role)}{c.totpEnabled ? " · 2FA" : ""}
                      </span>
                    </span>
                    <Zap className="h-3.5 w-3.5 shrink-0 text-amber-500 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </button>
                ))}
              </div>
              {comptes.length > 8 && (
                <p className="mt-2.5 text-[11px] text-muted-foreground">
                  {comptes.length - 8} autres comptes disponibles depuis le menu utilisateur, une fois connecté.
                </p>
              )}
            </div>
          </div>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-muted-foreground">
            CarbuScope SAS — démonstration : les comptes pré-remplissables utilisent le mot de passe
            public <span className="font-mono">carbuscope</span>. Activez la 2FA depuis votre menu
            utilisateur pour la tester en conditions réelles.
          </p>
        </section>
      </div>

      <footer className="border-t bg-background/70 py-3">
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <Fuel className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
          CarbuScope © 2026 — « Le Waze du carburant » · 3 espaces, une seule plateforme
        </p>
      </footer>
    </div>
  )
}
