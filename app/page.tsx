// This page is overridden by app/(app)/page.tsx in the authenticated route group
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/login");
}
