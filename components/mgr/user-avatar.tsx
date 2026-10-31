// Design-inventory avatars only; the live app has no avatar column and keeps
// its UserCircle icon. public/mock/*.jpg are generated geometric portraits,
// not photographs of staff or customers.
//
// Initials sit under the image so a missing asset needs no client-side fallback.
// Decorative throughout: every caller names the person beside it.
import { cn } from "@/lib/utils";

/** The signed-in staff fixture's generated avatar. */
export const MARIA = "/mock/maria.jpg";

/** "Maria Alvarez" is MA, one name is its first letter, an address uses the local part,
 *  and a `Name <email>` identity label uses the name. */
export function initialsOf(name: string) {
  const words = name.replace(/\s*<[^>]*>$/, "").split("@")[0].split(/[\s._-]+/).filter(Boolean);
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
