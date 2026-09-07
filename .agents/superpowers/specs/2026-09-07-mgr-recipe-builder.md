# Recipe builder: a version you can brew from

Date: 2026-09-07
Status: design, approved

## Problem

A recipe version holds three fields — mash temp, brewhouse efficiency, yeast
attenuation — and all three exist to feed the prediction formula. Nothing on the
version says how to brew the beer.

`Brew day` confirms it. That screen records *actuals*: which lots were consumed
and the knockout baseline. Nothing anywhere tells the brewer 152 °F for 60
minutes, then a 20-minute whirlpool at 180 °F, then 68 °F for four days. There
is no brew sheet in the product.

v1 (`~/Repos/mgr`) had the executable half across six editor sections and a
separate additions page: volumes, boil and whirlpool times, a mash step
schedule, a fermentation stage schedule, water profiles with salt and acid
additions, and per-row hop timing. This design brings that half over, minus
v1's redundancies.

Calculations are explicitly not in scope. Input is.

## Decisions

**D1 — A version is the executable process spec.** Everything a brewer follows
on the day lives on the version, and `Brew day` reads it. Considered and
rejected: keeping the version minimal and adding only what another screen
demands, which leaves the screen unable to do the job its own name claims; and
full v1 parity, which bundles decisions invisibly.

**D2 — Repetition earns a surface; field count does not.** Mash steps and
fermentation stages are ordered lists with add, remove and reorder verbs, so
each gets its own screen. Whirlpool is three fields for one operation that
happens once, so it stays inline. This follows the inventory's existing habit —
Product links to SKU list, Format links to Package BOM, Schedule packaging run
was pulled out of Close packaging run "so this page has one primary".

A second reason arrives from immutability: a draft version's schedule is an
editor and a cut version's is a read-out. A separate screen flips whole between
those two modes with one `states` entry; the same toggle inlined into a long
Recipe page would change half the page and leave the other half alone.

**D3 — The scale chips already state the batch size.** v1 stored
`batch_size_bbl`, `volume_bbl` and `target_ko_volume_bbl` — three numbers
restating each other. v2 draws `per bbl / 15 bbl / 30 bbl` chips, and `Brew day`
already records knockout volume as its baseline. Only **pre-boil volume**
survives, because it differs from the batch size by a knowable amount and drives
boil-off. The chips did not display the field; they replaced it.

**D4 — `Mash temp` leaves the Recipe screen.** Once every mash step carries a
temp, a separate scalar is a second answer to one question, and the failure is
two fields disagreeing with nobody knowing which the prediction used. The
prediction reads the saccharification rest from the schedule; the Mash schedule
footer names which rest that is, so the number is not hidden.

**D5 — The schedules replace their scalar totals.** v1 kept
`fermentation_days` and `conditioning_days` beside the stage array that sums to
them. Same cut as D3: the list is the source, the footer shows the total.

**D6 — Step type and step name both stay.** They look redundant until a recipe
has two infusion steps: the type says what the brewer does, the name says which
one it is.

**D7 — One stage axis for water additions, not two.** v1 gave each addition a
`timing` (mash / sparge / boil / whirlpool / fermentation / packaging) *and* a
`target` (mash water / sparge water / kettle). For water chemistry those are one
axis wearing two hats: a salt added at mash time goes into the mash water by
definition. One **stage** field (mash / sparge / kettle) loses nothing and
removes a pair that can contradict each other.

**D8 — The source water profile belongs to the brewery.** Source water is what
comes out of the tap; it does not change because the brew is a pils. It is a
Settings value, which a recipe may override for the case that genuinely varies —
an RO blend, a second source. v1 stored it per recipe, so every recipe repeated
the same municipal profile and a new water report meant editing all of them.
This is the same shape as a price group's default: the fact lives where it is
true, with an override where it occasionally is not.

**D9 — One `Notes` field, not three.** v1 had `brew_day_notes`, `tasting_notes`
and `development_notes` with no rule about which gets what, which fills one and
leaves two empty. Notes is a field on Recipe, not a linked surface: a link row
and an edit row cost the same one row, so the link buys nothing and costs a
screen.

**D10 — No new capture on `Brew day`.** It gains one read-only row linking to
the brew sheet. Deviations are already recorded by the actual lots and knockout
baseline it takes today, and fermentation reality arrives through
`Fermentation reading`. A "what actually happened in the mash" form is a
different feature.

## Screens

`components/mgr/screens.tsx`. Every new field and screen is drawn behind
`SCHEMA-GATE`, per the current screens focus.

### Recipe (modified)

Keeps: back row, parent row, scale chips, ingredient rows, predictions line,
outcomes tape, actuals note, gated `Create recipe version`.

Gains, paired two-up with `E.cols` as the Brand screen already does:

| Group | Fields |
| --- | --- |
| Volumes | Pre-boil volume (bbl) |
| Boil | Boil time (min) |
| Whirlpool | Time (min), Temp (°F), Rest (min) |
| Knockout | Target temp (°F) |
| Assumptions | Brewhouse efficiency (%), Yeast attenuation (% · strain) |

Whirlpool keeps both time and rest: stir time and stand time are a real
distinction for breweries that run both.

Gains three link rows and one field:

    Mash schedule · 3 steps · 152 °F sacc            ->
    Fermentation schedule · 4 stages · 18 days       ->
    Water · Municipal Denver -> Hazy target · 4 salts ->
    Notes   Whirlpool hard, knock out cold.

Loses `Mash temp` (D4).

Ingredient rows keep their drawn text; the fields beneath become structured —
`stage` (mash / boil / whirlpool / dry hop / packaging) and `timing` (minutes
for boil, day number for dry hop) rather than a free-text subtitle. The row
already promises `material · stage · timing`.

### Mash schedule (new)

A full screen, not a sheet: it has add, remove and reorder verbs.

    <- Hazy IPA v4 · Mash schedule                 [Add step]
    Mash-in           infusion · 104 °F · 15 min
    Saccharification  infusion · 152 °F · 60 min
    Mash-out          direct heat · 168 °F · 10 min
    Total 85 min · sacc rest 152 °F feeds the prediction

Per step: name, type (infusion / decoction / direct heat / rest), temp °F,
duration min, notes, position from list order.

### Fermentation schedule (new)

    <- Hazy IPA v4 · Fermentation                  [Add stage]
    Primary        68 °F · 4 days
    Diacetyl rest  72 °F · 2 days
    Cold crash     34 °F · 2 days
    Conditioning   34 °F · 10 days
    Total 18 days · dry hop day 4 falls in Primary

Per stage: name, stage type (primary / secondary / diacetyl rest / cold crash /
conditioning / lagering / custom), temp °F, duration days, notes, position.

The footer places the dry hop because the Recipe screen draws
`Citra · dry hop · day 4`, and a day number means nothing without the stage
list — day 4 is the last day of Primary, which is why a brewer chose it.

### Water (new)

    <- Hazy IPA v4 · Water
    Source profile   Municipal · Denver   (brewery default)
    Target profile   Hazy target
    Mash water  9.5 gal   |  Sparge water  12.0 gal
    Target mash pH  5.35
    Salts and acids                                    [Add]
    Gypsum            4.0 g · mash
    Calcium chloride  6.0 g · mash
    Gypsum            2.0 g · sparge
    Lactic acid       3.0 mL · sparge
    SO4:Cl 0.9 · chloride-forward, as the target says

Per addition: material (from the existing materials catalog), amount, unit,
stage (D7).

The SO4:Cl line is drawn as a static example. If it becomes computed it goes
through the shared-formula rule the Recipe screen already sets for OG/FG/ABV:
one registry-layer function, called by both the editor preview and server reads,
never stored.

### Water profiles / Water profile (new)

A catalog entity under Catalog, beside Formats and Price groups. A profile is a
name and six ion values.

    <- Catalog · Water profiles                 [Add profile]
    Municipal · Denver  Ca 42 · Mg 8 · Na 22 · SO4 65 · Cl 30 · HCO3 110
    Burton              Ca 275 · Mg 40 · Na 25 · SO4 610 · Cl 35 · HCO3 270
    Hazy target         Ca 110 · Mg 10 · Na 15 · SO4 90 · Cl 180 · HCO3 40

No quick-create dialog. v1 needed one because profiles were buried inside the
recipe form; reached from Catalog, `Add profile` is already one tap away.

### Brew day (modified)

Gains one read-only row (D10):

    Brew sheet · Hazy IPA v4 · mash 3 steps · WP 20 min   ->

It opens `Mash schedule` in frozen mode.

### Settings

Gains the brewery's source water profile (D8).

## Out of scope

Ion-delta arithmetic between source and target, salt-to-ion contribution, and pH
prediction: input, not calculations. Migrations and columns: every field is
drawn gated. A mash-actuals capture form (D10).

## Schema gates this opens

Named, not designed:

- `mash_schedule` and `fermentation_schedule` as JSONB arrays on the version, as
  v1 stored them. They are never queried independently, always read as a unit
  with their recipe, and a version is immutable, so there is no partial-update
  problem and no child table is earned.
- A `water_profiles` table: name plus six ion values.
- Water columns on the version: target profile, source profile override, mash
  and sparge water volumes, target mash pH.
- Recipe additions scoped to water chemistry, carrying one stage field (D7).
- A brewery-level source water profile in settings (D8).
- Structured `stage` and `timing` on recipe ingredient rows.

## Testing

- `lib/mgr/recipe-schedule.ts`, pure and TDD first: total duration of a step
  list, and which step is the saccharification rest (the one the Recipe and Mash
  schedule footers name). This is the only logic; everything else is drawing.
- Each new screen needs a `lib/mgr/screen-links.ts` entry so the explorer can
  walk in and back out; `tests/tap-coverage.test.ts` fails on an orphan.
- `tests/mgr-screens.test.ts` for the drawn fields and the removals.
- Rendered check at `/docs/screens` per AGENTS.md step 4.
