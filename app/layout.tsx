// app/layout.tsx — root document: plan §5 fonts (Instrument Sans body, Familjen
// Grotesk display, JetBrains Mono data) exposed as CSS variables that
// app/globals.css maps onto --font-sans/--font-heading/--font-mono, plus
// viewport-fit=cover so the shells can pad for the safe area. ThemeBoot
// (components/mgr/theme-boot.tsx) applies the `.dark` class from
// localStorage.theme or the OS preference before first paint. React then
// hydrates <html> against a class list it already changed, hence
// suppressHydrationWarning. SpeedInsights reports real users' Core Web Vitals
// to Vercel (enabled per project in the Vercel dashboard); under `next dev` it
// only logs them to the console.
import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeBoot } from "@/components/mgr/theme-boot";
import "./globals.css";

const instrumentSans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"] });
const familjenGrotesk = Familjen_Grotesk({ variable: "--font-familjen-grotesk", subsets: ["latin"], preload: false });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], preload: false });

// A page's own title reads "<title> · MGR" (staff pages name it with
// navTitle in lib/mgr/nav.ts); a page without one falls back to plain "MGR".
export const metadata: Metadata = {
  title: { default: "MGR", template: "%s · MGR" },
  description: "Brewery operations management",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${familjenGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeBoot />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
