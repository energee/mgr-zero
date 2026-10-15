# Work filter tabs: screen-reader check (#727)

#789 made each Work filter tab control a real, labelled tab panel.
Its regression test and an accessibility-tree check prove the DOM relationship.
They cannot prove what a screen reader announces, so #727 stays open until a person runs this check.

## Setup

1. Run the app locally (`bun run dev`) and sign in as a staff user who can see Work.
2. Open `/work` in Safari on macOS.
3. Turn on VoiceOver (Cmd+F5).

## Steps and expected result

| # | Do | Expect VoiceOver to say |
| --- | --- | --- |
| 1 | Tab to the filter bar | The tablist's name, then the selected tab, e.g. "All, selected, tab, 1 of 7" |
| 2 | Press Right Arrow | The next tab name, "selected", and its position |
| 3 | Press Tab once | Focus moves into the selected tab's panel, announced as a tab panel named after that tab |
| 4 | VO+Right through the panel | Only the rows for the selected filter, not rows from other filters |
| 5 | Shift+Tab back, pick a filter with no rows | The panel is reachable and its empty state is read |

## Record

| Date | Revision (`git rev-parse --short HEAD`) | Browser + reader | Steps passed | Notes |
| --- | --- | --- | --- | --- |
| | | | | |

All steps pass: close #727 with this row.
Any step fails: comment on #727 with what VoiceOver said; that is a new defect against the shared `TabBar` in `components/mgr/qty.tsx`.
