// components/mgr/user-avatar.tsx — a person's photo, for the design inventory
// only. There is no avatar column in the schema (see
// .agents/superpowers/specs/2026-08-31-mgr-schema-design.md), so the real app
// header keeps the UserCircle icon; the published inventory passes this in so a screen shows a face where a face will go.
// public/mock/*.jpg are fixtures named for the person, not product assets:
// a new face is a file plus a `src`, never another component.
//
// No photo falls back to initials. They sit *under* the image rather than
// swapping for it on error, so the fallback costs no client JS and the
// pre-rendered inventory keeps a real src in its markup: shadcn's Avatar wraps
// Radix, which resolves the image after hydration and server-renders the
// fallback alone. Decorative throughout: every caller names the person beside it.
import { cn } from "@/lib/utils";

/** The signed-in staff fixture. The one place the gallery's default face is named. */
export const MARIA = "/mock/maria.jpg";

/** "Maria Alvarez" is MA, one name is its first letter, an address uses the local part. */
export function initialsOf(name: string) {
  const words = name.split("@")[0].split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "";
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0][0];
  return letters.toUpperCase();
}

export function UserAvatar({ src, name, className }: { src?: string; name?: string; className?: string }) {
  return (
    <span
      data-mock-avatar
      aria-hidden
      className={cn(
        "relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-medium text-muted-foreground",
        className,
      )}
    >
      {name ? initialsOf(name) : null}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a 128px fixture; next/image adds a loader and does not render under renderToStaticMarkup in tests
        <img src={src} alt="" width={128} height={128} className="absolute inset-0 size-full object-cover" />
      ) : null}
    </span>
  );
}
