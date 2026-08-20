import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/providers/theme-provider";
import { Toaster } from "./components/ui/sonner";
import { AppThemeSync } from "./components/providers/app-theme-sync";
import { AuthProvider } from "./components/providers/auth-provider";
import { MobileTabBar } from "./components/layout/MobileTabBar";
import { PwaProvider } from "./components/providers/pwa-provider";
import { resolvePwaBranding } from "@/lib/pwa/branding";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const branding = await resolvePwaBranding();
  const iconUrl = `/api/pwa/icon?clubId=${encodeURIComponent(branding.clubId)}&size=192&v=${branding.iconVersion}`;

  return {
    title: branding.name,
    description: branding.description,
    applicationName: branding.shortName,
    icons: {
      apple: [{ url: iconUrl, sizes: "192x192", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: branding.shortName,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <AppThemeSync />
          <AuthProvider>
            <PwaProvider>
              {children}
              <MobileTabBar />
            </PwaProvider>
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
