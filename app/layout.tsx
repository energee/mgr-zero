// app/layout.tsx — root document: plan §5 fonts (Instrument Sans body, Familjen
// Grotesk display, JetBrains Mono data) exposed as CSS variables that
// app/globals.css maps onto --font-sans/--font-heading/--font-mono, plus
// viewport-fit=cover so the shells can pad for the safe area. THEME_BOOT is an
// inline, parser-blocking <head> script that applies the `.dark` class from
// localStorage.theme or the OS preference before first paint. React then
// hydrates <html> against a class list the script already changed, hence
// suppressHydrationWarning. When Next renders this layout on the client (its
// bare error document after a notFound() or a throw, #986), the script is
// inert and ThemeBoot applies the same rule (lib/mgr/theme.ts) on mount.
// components/mgr/theme-toggle.tsx flips the class and writes the preference.
import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeBoot } from "@/components/mgr/theme-toggle";
import { THEME_BOOT } from "@/lib/mgr/theme";
import "./globals.css";

const instrumentSans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"] });
const familjenGrotesk = Familjen_Grotesk({ variable: "--font-familjen-grotesk", subsets: ["latin"], preload: false });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], preload: false });

export const metadata: Metadata = {
  title: "MGR",
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
        <script
          type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: THEME_BOOT }}
        />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeBoot />
        {children}
      </body>
    </html>
  );
}
