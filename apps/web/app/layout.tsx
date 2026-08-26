import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import "./globals.css";
import { ServiceWorkerRegistration } from "../components/ServiceWorkerRegistration";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const THEME_LIGHT = "#f3f0e8";
const THEME_DARK = "#0b1020";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("ui");
  return {
    title: "Odovi",
    description: t("meta.description"),
    applicationName: "Odovi",
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      title: "Odovi",
      statusBarStyle: "default",
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      ],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Kein maximumScale/userScalable=false — Zoom bleibt aus A11y-Gründen erlaubt.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: THEME_DARK },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const theme =
    cookieStore.get("odovi_theme")?.value ??
    cookieStore.get("tripatlas_theme")?.value;
  const explicitDark = theme === "dark";
  // 'system' oder kein Cookie: die Klasse setzt vor dem Paint das Inline-Script.
  const isSystem = theme !== "dark" && theme !== "light";

  // Sprache + Messages aus der next-intl Request-Config (Cookie-basiert).
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={explicitDark ? "dark" : undefined}
      suppressHydrationWarning
    >
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ServiceWorkerRegistration />
        {isSystem && (
          <script
            // Läuft nur im System-Modus und setzt die .dark-Klasse vor dem
            // ersten Paint anhand von prefers-color-scheme (kein FOUC).
            // Bei expliziter Wahl rendert der Server die Klasse bereits korrekt.
            dangerouslySetInnerHTML={{
              __html:
                "(function(){try{if(window.matchMedia('(prefers-color-scheme: dark)').matches){document.documentElement.classList.add('dark')}}catch(e){}})()",
            }}
          />
        )}
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
