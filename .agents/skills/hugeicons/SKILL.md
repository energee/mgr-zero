---
name: hugeicons
description: Find and render Hugeicons icons in MGR (React, `@hugeicons/react` + `@hugeicons/core-free-icons`). Use whenever you need to add, render, or pick an icon.
---

# Hugeicons

MGR depends on `@hugeicons/react` (the renderer) and `@hugeicons/core-free-icons`
(the free icon set). Other frameworks' packages and the Flutter catalog were
removed from this vendored skill because MGR does not use them.

## In MGR product code: use `Icon`

Product UI never renders `HugeiconsIcon` directly. Import the glyph from
`@hugeicons/core-free-icons` and pass it to `Icon` from `components/mgr/icon.tsx`,
which fixes size (16/20/24), stroke, color, and `aria-hidden` for every
placement. shadcn's own chrome (chevrons, close marks) keeps Lucide inside
`components/ui`. Where icons may appear at all is decided in
`docs/plans/hugeicons.md`.

```tsx
import { Search01Icon } from "@hugeicons/core-free-icons";
import { Icon } from "@/components/mgr/icon";

<Icon icon={Search01Icon} />;
```

## Find an icon: grep, never read the list whole

`references/icon-list.md` lists 5,471 icons and runs tens of thousands of
tokens. Grep it for a keyword and copy the exact match:

```bash
grep -i search .agents/skills/hugeicons/references/icon-list.md
```

Do **not** rely on memory for icon names — a guessed name may not exist, or may
exist but be the wrong glyph (e.g. `LeftToRightBlockQuoteIcon` is quote marks,
not the bracket you wanted). Names are PascalCase named exports ending in `Icon`
(`Search01Icon`, `Home01Icon`). Number words are spelled out: `1st-bracket` →
`FirstBracketIcon`, `3d-view` → `ThreeDViewIcon`. Many icons have numbered
variants (`01`, `02`, `03`) — pick the one that best fits.

## The underlying React component

`Icon` wraps this. Reach for it directly only when changing `components/mgr/icon.tsx`.

> **Keep generated code minimal:** `icon` is the only required prop. Don't write props that just
> repeat the component's default value (e.g. `size={24}`, `color="currentColor"`,
> `strokeWidth={1.5}`) — pass a prop only when overriding a default. The defaults are listed in
> the props table below. Both packages are already in `package.json`.

```jsx
import { HugeiconsIcon } from '@hugeicons/react';
import { Search01Icon } from '@hugeicons/core-free-icons';

function App() {
  // Only `icon` is required; pass other props only to override a default.
  return <HugeiconsIcon icon={Search01Icon} />;
}
```

Props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `icon` | `IconSvgElement` | Required | The main icon to display (a named export from an icon package) |
| `altIcon` | `IconSvgElement` | - | Alternative icon for states, interactions, or dynamic swapping |
| `showAlt` | `boolean` | false | When true, displays `altIcon` instead of `icon` |
| `size` | `number \| string` | 24 | Icon size in pixels |
| `color` | `string` | currentColor | Icon color (any CSS color value) |
| `strokeWidth` | `number` | 1.5 | Width of the icon strokes |
| `absoluteStrokeWidth` | `boolean` | false | When true, stroke width is scaled relative to icon size |
| `primaryColor` | `string` | - | Primary color for multicolor Pro icons (Bulk, Duotone, Twotone) |
| `secondaryColor` | `string` | - | Secondary color for multicolor Pro icons |
| `disableSecondaryOpacity` | `boolean` | false | Disables default opacity applied to the secondary color |
| `className` | `string` | - | Additional CSS classes |

## Free vs Pro icons

- **Free** (default): `@hugeicons/core-free-icons` — the 5,471 stroke-rounded icons in `references/icon-list.md`. Suggest only these
  unless the user has a Pro license.
- **Pro** (license required, authenticated install): `@hugeicons-pro/core-stroke-rounded`, `@hugeicons-pro/core-stroke-sharp`, `@hugeicons-pro/core-stroke-standard`, `@hugeicons-pro/core-solid-rounded`, `@hugeicons-pro/core-solid-sharp`, `@hugeicons-pro/core-solid-standard`, `@hugeicons-pro/core-bulk-rounded`, `@hugeicons-pro/core-duotone-rounded`, `@hugeicons-pro/core-duotone-standard`, `@hugeicons-pro/core-twotone-rounded`.

Never suggest a Pro-only icon to a free user — the import will fail.

## Troubleshooting

- **Icon not rendering**: confirm `icon` is a valid export and not null.
- **Import fails**: the name is misspelled or Pro-only. Check the exact export in
  `references/icon-list.md`.
