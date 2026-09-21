import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "next-themes";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CarbuScope — Le Waze du carburant | Tunisie",
  description:
    "Observatoire B2B, application mobile B2C et portail enseigne pour le marché tunisien des stations-service : 1 814 stations, carte interactive, veille concurrentielle et calculateurs d'implantation.",
  keywords: ["stations-service", "Tunisie", "carburant", "observatoire", "carte", "veille concurrentielle", "Agil", "TotalEnergies", "Shell"],
  authors: [{ name: "CarbuScope" }],
  openGraph: {
    title: "CarbuScope — L'observatoire du carburant en Tunisie",
    description: "L'infrastructure de données de référence du secteur des stations-service en Tunisie.",
    siteName: "CarbuScope",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
          {children}
          <Toaster />
          <SonnerToaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
