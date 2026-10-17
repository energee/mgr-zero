# Lean order and invoice detail revisions

Owner-approved refinement of issues #976 and #977 under #909: visual containers must earn their place. These static concepts replace the boxed detail mockups as the current direction; earlier files remain historical designs, not a requirement to retain cards.

| Surface | Editable source | Desktop | Phone | Full board |
| --- | --- | --- | --- | --- |
| Order detail | [HTML](detail-order-lean.html) | [Image](detail-order-lean-desktop.png) | [Image](detail-order-lean-mobile.png) | [Board](detail-order-lean.png) |
| Invoice detail | [HTML](detail-invoice-lean.html) | [Image](detail-invoice-lean-desktop.png) | [Image](detail-invoice-lean-mobile.png) | [Board](detail-invoice-lean.png) |

## What changed

- Removed decorative borders, rounded containers, tinted price-summary backgrounds and the padding that only existed to support those containers.
- Order facts and price summary use ordinary document sections. Phone order lines use spacing and thin separators, not individual cards.
- Invoice accounting and correction sections no longer sit inside nested boxes. Summary labels use ordinary heading typography rather than a colored uppercase label.
- Annotation/state examples outside the screen panels are unboxed as well. A restrained warning treatment remains for genuine failed/uncertain-result examples.
- Alignment, section headings, whitespace and useful rules establish hierarchy. Primary action, visible status, readable totals, separate balance, financial meaning and all document facts remain unchanged.

Keep boundaries that have a concrete job: buttons/inputs and focus affordances, data-row separators, real warnings, and the illustrative outer viewport frames. No fields/actions are hidden, no new accordion/menu is introduced, and no financial facts or amount calculations are changed.

Serve with the existing sibling `style.css`. Each HTML revision contains its own parsed, scoped detail styles. Desktop/phone panels are 962px/390px; full phone content scrolls naturally. Values are fictional and controls inactive. These images do not prove live functionality, accessibility or architectural parity.

The tag is isolated design-only history. No application implementation, dependency, database/provider action or deployment is included.
