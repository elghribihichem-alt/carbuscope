'use client'

// CarbuScope — Écran de connexion (simulation d'authentification démo)
// Premier écran visible : l'utilisateur choisit un compte de démonstration
// (clic = pré-remplissage, éclair = connexion express) ou saisit ses identifiants.

import { useRef, useState } from "react"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Mail, Lock, Eye, EyeOff, LogIn, Loader2, Zap, AlertCircle,
  LineChart, Building2, Smartphone, ShieldCheck, Fuel, MapPin, Lightbulb, Crown,
} from "lucide-react"
import { useAppStore, ROLE_LABELS } from "@/store/app-store"
import { CarbuscopeLogo } from "@/components/shell/carbuscope-logo"
import { DEMO_ACCOUNTS, findAccountByEmail, type DemoAccount } from "@/lib/demo-accounts"

const MODE_ICON: Record<DemoAccount["mode"], React.ComponentType<{ className?: string }>> = {
  observatoire: LineChart,
  portail: Building2,
  mobile: Smartphone,
  backoffice: ShieldCheck,
  superadmin: Crown,
}

const MODE_LABEL: Record<DemoAccount["mode"], string> = {
  observatoire: "Observatoire B2B",
  portail: "Portail enseigne",
  mobile: "Mobile B2C",
  backoffice: "Back-office",
  superadmin: "Super Administration",
}

export function LoginScreen() {
  const login = useAppStore(s => s.login)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [forgotHint, setForgotHint] = useState(false)
  const submitRef = useRef<HTMLButtonElement>(null)

  /** Connexion validée : applique le compte après un court délai réaliste. */
  function connect(acc: DemoAccount) {
    setLoading(true)
    setError(null)
    window.setTimeout(() => {
      login(acc.id)
      toast.success(`Bienvenue, ${acc.name.split(" ")[0]} !`, {
        description: `Connecté en tant que ${acc.jobTitle} — ${acc.brandName} · ${MODE_LABEL[acc.mode]}.`,
      })
      setLoading(false)
    }, 650)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setForgotHint(false)
    if (!email.trim() || !password) {
      setError("Veuillez renseigner votre e-mail et votre mot de passe.")
      return
    }
    const acc = findAccountByEmail(email)
    if (!acc) {
      setError("Aucun compte ne correspond à cet e-mail. Choisissez un compte de démonstration ci-dessous.")
      return
    }
    if (password !== acc.password) {
      setError("Mot de passe incorrect. (Indice démo : carbu2025)")
      return
    }
    connect(acc)
  }

  /** Clic sur un compte démo : pré-remplit le formulaire puis pointe le bouton. */
  function prefill(acc: DemoAccount) {
    setSelectedId(acc.id)
    setEmail(acc.email)
    setPassword(acc.password)
    setError(null)
    setForgotHint(false)
    submitRef.current?.focus()
  }

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Panneau d'identité (desktop) */}
      <aside
        className="relative hidden overflow-hidden bg-zinc-900 text-white lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:p-10"
        aria-hidden
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-emerald-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-emerald-600/10 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <CarbuscopeLogo size={44} />
          <div className="leading-tight">
            <p className="text-xl font-bold tracking-tight">
              Carbu<span className="text-emerald-400">Scope</span>
            </p>
            <p className="text-xs text-zinc-400">L&apos;observatoire du carburant — Tunisie</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-3xl font-bold leading-tight">
            Le Waze du carburant, <span className="text-emerald-400">au service des réseaux.</span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-zinc-300">
            Observatoire B2B, application mobile B2C et portail enseigne réunis sur une même
            infrastructure de données : prix, services, concurrence et terrain, en temps réel.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <Fuel className="h-4 w-4 text-emerald-400" />
              <p className="mt-2 text-lg font-bold leading-none">1 814</p>
              <p className="mt-1 text-[11px] text-zinc-400">stations référencées</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <MapPin className="h-4 w-4 text-emerald-400" />
              <p className="mt-2 text-lg font-bold leading-none">24</p>
              <p className="mt-1 text-[11px] text-zinc-400">gouvernorats couverts</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-3">
              <Building2 className="h-4 w-4 text-emerald-400" />
              <p className="mt-2 text-lg font-bold leading-none">6</p>
              <p className="mt-1 text-[11px] text-zinc-400">enseignes suivies</p>
            </div>
          </div>
        </div>

        <p className="relative text-[11px] text-zinc-500">
          Environnement de démonstration — données à valeur d&apos;illustration · © 2025 CarbuScope
        </p>
      </aside>

      {/* Formulaire de connexion */}
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-10 sm:px-8" id="contenu">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {/* Identité mobile */}
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <CarbuscopeLogo size={36} />
            <p className="text-lg font-bold tracking-tight">
              Carbu<span className="text-emerald-600">Scope</span>
            </p>
          </div>

          <Card className="border shadow-sm">
            <CardContent className="p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                  <LogIn className="h-5 w-5" aria-hidden />
                </div>
                <div>
                  <h2 className="text-lg font-bold leading-tight">Connexion</h2>
                  <p className="text-sm text-muted-foreground">Accédez à votre espace CarbuScope</p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4" aria-label="Formulaire de connexion">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Adresse e-mail</Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="login-email"
                      type="email"
                      autoComplete="username"
                      placeholder="prénom.nom@enseigne.tn"
                      className="pl-9"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError(null) }}
                      aria-invalid={!!error}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Mot de passe</Label>
                    <button
                      type="button"
                      className="text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
                      onClick={() => setForgotHint(h => !h)}
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      className="pl-9 pr-10"
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError(null) }}
                      aria-invalid={!!error}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(s => !s)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {forgotHint && (
                    <p className="flex items-start gap-1.5 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-300" role="note">
                      <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                      Mode démonstration : tous les comptes utilisent le mot de passe&nbsp;
                      <code className="font-mono font-semibold">carbu2025</code>.
                    </p>
                  )}
                </div>

                {error && (
                  <p
                    className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                    role="alert"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                    {error}
                  </p>
                )}

                <Button
                  ref={submitRef}
                  type="submit"
                  className="w-full bg-emerald-600 hover:bg-emerald-700"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Connexion en cours…
                    </>
                  ) : (
                    <>
                      <LogIn className="h-4 w-4" aria-hidden />
                      Se connecter
                    </>
                  )}
                </Button>
              </form>

              <div className="my-6 flex items-center gap-3">
                <Separator className="flex-1" />
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Comptes de démonstration
                </span>
                <Separator className="flex-1" />
              </div>

              <p className="mb-3 text-xs text-muted-foreground">
                Cliquez sur un profil pour pré-remplir le formulaire, ou sur l&apos;éclair pour une connexion express.
              </p>

              <ul className="space-y-2">
                {DEMO_ACCOUNTS.map(acc => {
                  const Icon = MODE_ICON[acc.mode]
                  const selected = selectedId === acc.id
                  return (
                    <li key={acc.id}>
                      <div
                        className={`flex items-stretch overflow-hidden rounded-lg border transition-shadow ${
                          selected ? "border-emerald-500 ring-1 ring-emerald-500/40" : "border-border hover:border-emerald-300 dark:hover:border-emerald-800"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => prefill(acc)}
                          className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                          aria-pressed={selected}
                          title={`${acc.name} — ${acc.jobTitle} (${acc.email})`}
                        >
                          <span
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                            style={{ backgroundColor: acc.color }}
                            aria-hidden
                          >
                            {acc.initials}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-semibold leading-tight">{acc.name}</span>
                              <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                            </span>
                            <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                              {acc.jobTitle} · {acc.brandName} · {ROLE_LABELS[acc.role]}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => connect(acc)}
                          disabled={loading}
                          className="flex w-10 shrink-0 items-center justify-center border-l border-border text-muted-foreground transition-colors hover:bg-emerald-600 hover:text-white focus-visible:outline-none focus-visible:bg-emerald-600 focus-visible:text-white disabled:opacity-50"
                          aria-label={`Connexion express : ${acc.name}`}
                          title={`Connexion express — ${MODE_LABEL[acc.mode]}`}
                        >
                          <Zap className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            Plateforme de démonstration — aucune donnée réelle n&apos;est collectée.
          </p>
        </motion.div>
      </main>
    </div>
  )
}

/** Écran transitoire pendant l'hydratation de la session persistée. */
export function AuthSplash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background" role="status" aria-live="polite">
      <CarbuscopeLogo size={44} />
      <p className="animate-pulse text-sm text-muted-foreground">Chargement de votre espace…</p>
    </div>
  )
}
