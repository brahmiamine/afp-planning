import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "./components/providers/theme-provider";
import { Toaster } from "./components/ui/sonner";
import { AppThemeSync } from "./components/providers/app-theme-sync";
import { AuthProvider } from "./components/providers/auth-provider";
import { MobileTabBar } from "./components/layout/MobileTabBar";
import { PwaProvider } from "./components/providers/pwa-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AFP Planning - Academie Football Paris 18",
  description: "Planning des matchs de l'Academie Football Paris 18",
  applicationName: "AFP Planning",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "AFP Planning",
  },
};

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
