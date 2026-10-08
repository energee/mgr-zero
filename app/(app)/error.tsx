// app/(app)/error.tsx — the error surface for authenticated pages, inside the
// staff shell. The body is shared (components/mgr/route-error.tsx). A missing
// record is not an error — it renders not-found.tsx instead.
"use client";

export { RouteError as default } from "@/components/mgr/route-error";
