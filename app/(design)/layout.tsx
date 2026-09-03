// app/(design)/layout.tsx — gates the whole design gallery route group:
// every route beneath it (the gallery, its per-screen frames, anything added
// later) 404s outside development, so no page has to remember the check.
import { notFound } from "next/navigation";

export default function DesignLayout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV !== "development") notFound();
  return children;
}
