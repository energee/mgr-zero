// app/api/search/route.ts — full-text search over the guides for the Fumadocs
// search dialog (⌘K in the docs shell). Public; the guides are public.
import { createFromSource } from "fumadocs-core/search/server";
import { source } from "@/lib/source";

export const { GET } = createFromSource(source, { language: "english" });
