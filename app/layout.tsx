// app/layout.tsx — root document: plan §5 fonts (Instrument Sans body, Familjen
// Grotesk display, JetBrains Mono data) exposed as CSS variables that
// app/globals.css maps onto --font-sans/--font-heading/--font-mono, plus
// viewport-fit=cover so the shells can pad for the safe area. THEME_BOOT is an
// inline, parser-blocking <head> script that applies the `.dark` class from
// localStorage.theme or the OS preference before first paint (next/script's
// beforeInteractive runs from the client bundle, i.e. after paint, so it is
// not used). React then hydrates <html> against a class list the script
// already changed, hence suppressHydrationWarning. components/mgr/theme-toggle.tsx
// flips the class and writes the preference. Fumadocs' RootProvider (docs
// shell, search) is mounted here with its own theme handling disabled.
import type { Metadata, Viewport } from "next";
import { Familjen_Grotesk, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";

const instrumentSans = Instrument_Sans({ variable: "--font-instrument-sans", subsets: ["latin"] });
const familjenGrotesk = Familjen_Grotesk({ variable: "--font-familjen-grotesk", subsets: ["latin"], preload: false });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], preload: false });

// ponytail: static boot script; a theme provider dependency would be more code for the same result
const THEME_BOOT =
  "(function(){try{var t=localStorage.theme;if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}})()";

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
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {/* theme disabled: THEME_BOOT and components/mgr/theme-toggle.tsx own the .dark class */}
        <RootProvider theme={{ enabled: false }}>{children}</RootProvider>
      </body>
    </html>
  );
}
