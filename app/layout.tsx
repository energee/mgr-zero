// app/layout.tsx — root document: plan §5 fonts (Instrument Sans body, Familjen
// Grotesk display, JetBrains Mono data) exposed as CSS variables that
// app/globals.css maps onto --font-sans/--font-heading/--font-mono, plus
// viewport-fit=cover so the shells can pad for the safe area. public/theme-boot.js
// (next/script beforeInteractive) applies the `.dark` class before paint;
// components/mgr/theme-toggle.tsx flips it.
import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import Script from "next/script";
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
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* ponytail: 10-line static boot script; a theme provider dependency would be more code for the same result */}
        <Script src="/theme-boot.js" strategy="beforeInteractive" />
      </body>
    </html>
  );
}
