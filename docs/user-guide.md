# MGR user guide

MGR helps brewery staff define sellable beer, track finished-goods inventory by
location, and see who has staff access.

This guide covers every action currently available in MGR. If a control described
here is not visible or an action is denied, your assigned role may not permit it.
Ask a brewery administrator for help.

## Contents

1. [Sign in](#sign-in)
2. [Navigate MGR](#navigate-mgr)
3. [Dashboard](#dashboard)
4. [Understand products and SKUs](#understand-products-and-skus)
5. [Create a product](#create-a-product)
6. [Create a SKU](#create-a-sku)
7. [Understand inventory](#understand-inventory)
8. [Record an inventory movement](#record-an-inventory-movement)
9. [View the team](#view-the-team)
10. [Roles and access](#roles-and-access)
11. [Errors and corrections](#errors-and-corrections)

## Sign in

Accounts are created by invitation. There is no public sign-up form.

1. Open the MGR sign-in page.
2. Enter the email address associated with your invitation.
3. Enter your password.
4. Select **Sign in**.

After a successful sign-in, MGR opens the brewery associated with your account.
If your account belongs to more than one brewery, MGR uses your previously selected
brewery when available; otherwise it opens the first brewery assigned to you.

If sign-in fails, verify the email and password and try again. If MGR says your
account has no brewery membership, contact a brewery administrator.

## Navigate MGR

The brewery name appears at the top of the navigation rail. All information shown
in the app belongs to that brewery.

- **Dashboard** — the application landing page.
- **Inventory** — on-hand stock, available-to-promise quantities, recent movements,
  and the **Record Movement** action.
- **Catalog** — products and their sellable package formats.
- **Team** — staff memberships (read-only).

MGR prevents one brewery from seeing another brewery's records. If you expected a
record but cannot find it, first confirm that the brewery name in the navigation is
correct.

### How forms behave

Actions such as **New Product**, **New SKU**, and **Record Movement**
open a form over the current page. A successful action closes the form and refreshes the
page. A validation or permission error appears inside the open form and preserves the
values so you can correct them. Closing a form without submitting clears its entered
values.

## Dashboard

Available to any signed-in staff member whose role allows access to the brewery.

1. Select **Dashboard** in the navigation rail, or sign in successfully.
2. The page displays the **Dashboard** heading.

The current Dashboard is only a landing page. It does not show metrics, shortcuts,
or controls yet. Nothing is recorded or changed when you view it.

## Understand products and SKUs

A **product** is the beer itself, such as “Hazy IPA.” A **SKU** is one sellable
package of that product, such as “Hazy IPA — 1/2 bbl keg” or “Hazy IPA — 24 × 16 oz
case.” Inventory is counted in SKU units.

Each SKU stores **BBL per unit**, the exact number of US beer barrels represented by
one SKU unit. MGR uses this value to convert every inventory movement into barrels.
One US beer barrel is 31 gallons, or 3,968 US fluid ounces.

Examples:

- one half-barrel keg: `0.5` BBL per unit;
- one sixth-barrel keg: approximately `0.16666667` BBL per unit;
- one case containing 24 cans of 16 oz each: `384 ÷ 3968`, approximately
  `0.09677419` BBL per case.

Use enough decimal places to preserve an accurate conversion. Changing package
meaning after inventory has been recorded can make later totals inconsistent with
historical records, so verify this value before creating the SKU.

## Create a product

Available to administrators and sales staff.

1. Open **Catalog**.
2. Select **New Product**.
3. Complete the fields:
   - **Name** — required; the beer's customer-facing name.
   - **Style** — optional, such as IPA, lager, or stout.
   - **ABV** — optional alcohol by volume percentage. Enter `6.5` for 6.5%.
4. Select **Create**.

The product appears in the catalog. You can then add one or more SKUs to it.
Product names must be unique within the brewery.

## Create a SKU

Available to administrators and sales staff.

1. Open **Catalog**.
2. Find the product that owns the package.
3. Select **New SKU** on that product.
4. Complete the fields:
   - **Name** — required; identify the sellable package clearly.
   - **Package type** — required; choose **keg**, **can**, or **bottle**. The form
     opens with **keg** selected.
   - **Units per case** — optional; enter a whole number when the SKU is a case.
   - **BBL per unit** — required; the barrel volume of one SKU unit. The placeholder
     example is `0.5`.
5. Select **Create**.

The SKU appears beneath its product and becomes available in inventory forms. A SKU name must be unique within its product.

## Understand inventory

Open **Inventory** to see two sections.

### On hand

The on-hand table shows:

- **SKU** — product and package;
- **Location** — the warehouse or taproom holding it;
- **On hand** — the sum of all recorded movements for that SKU and location;
- **ATP** — available to promise, calculated as total on hand minus open
  allocations for that SKU.

ATP is shown at the SKU level, so the same ATP value may appear beside more than one
location. A negative ATP means more stock has been promised than is currently
available; it does not prevent an authorized user from recording inventory.

### Movement log

The movement log shows the 50 most recent inventory entries with their date and
time, type, SKU, location, signed quantity, and note. Positive quantities add stock;
negative quantities remove stock.

Inventory entries form a permanent audit trail. They cannot be edited or deleted.

## Record an inventory movement

Available to administrators and warehouse staff.

Before recording a movement, the product, SKU, and location must already exist.
If there are no SKUs or locations to choose from, the **Record** button stays
unavailable until both are selected.

1. Open **Inventory**.
2. Select **Record Movement**.
3. Choose the **SKU** and **Location**.
4. Choose a movement **Type**. The form opens with **opening_balance** selected.
5. Enter **Qty** in SKU units:
   - use a positive number to add stock;
   - use a negative number to remove stock.
6. For a depletion, **Channel** appears and opens with **taproom** selected. Although
   the selector also lists wholesale, DTC, and export, those choices are not valid for
   a depletion and will be rejected. For all other movement types, the Channel field is
   hidden and no channel is recorded.
7. Add a **Note** when it will help another user understand the event or correction.
8. Select **Record**.

The movement immediately changes on-hand inventory and appears in the movement log.
MGR calculates barrel volume from the SKU's BBL-per-unit value.

### Movement type reference

| Type | Use it for | Normal quantity |
| --- | --- | --- |
| `opening_balance` | Initial stock loaded when beginning to use MGR | Positive |
| `production_in` | Finished goods produced and added to a location | Positive |
| `adjustment` | Reconcile stock to a verified physical quantity difference | Positive or negative |
| `depletion` | Beer sold or consumed from taproom stock | Negative |
| `destruction` | Beer intentionally destroyed | Negative |
| `loss` | Unrecoverable finished-goods loss | Negative |
| `sample` | Beer removed as a sample | Negative |
| `festival_removal` | Beer removed for festival use | Negative |
| `return_in` | Sellable beer returned into inventory | Positive |

Choose the type that describes what physically happened. Samples, losses,
destruction, festival removals, and taproom sales have different reporting meaning;
do not substitute one for another. Sample and festival entries require a destination
state, but the current movement form does not provide that field; those two actions
cannot be completed from this screen. Ask an administrator to use the brewery's approved
recording procedure rather than substituting another type.

### Correct an inventory mistake

Because movements cannot be edited or deleted, do not try to “fix” a classified
removal by entering an unrelated adjustment. Record only a correction that preserves
what physically and legally happened, and include a note identifying the mistake. If
you are unsure which correction is appropriate, stop and ask a brewery administrator
before adding another movement.

## View the team

Administrators, sales staff, and warehouse staff can open **Team** to see current
memberships. The table shows each member's user ID and role. Email addresses are not
shown on this screen.

## Invitations and CSV import

Inviting staff, inviting customer portal users, and importing CSV files are not
available in this release. The **Team** screen and customer pages show no invite
action, and there is no **Import** screen. Adding people or bulk data is handled by the
person who configured your brewery.

## Roles and access

| Role | Available actions in this version |
| --- | --- |
| **Admin** | Create products and SKUs, read and record inventory, and view the team. |
| **Sales** | Create products and SKUs, read inventory, and view the team. |
| **Warehouse** | Read the catalog, read and record inventory, and view the team. |
| **Brewer** | Reserved for brewery-production workflows; access to the currently available administrative screens may be limited. |

Buttons may still be visible when your role cannot complete the action. If submission
returns a permission error, ask an administrator rather than retrying repeatedly.

## Errors and corrections

- **A record is missing:** confirm the brewery, exact product/SKU name, and location.
- **A form reports a permission error:** your assigned role does not permit the action.
- **A product or SKU already exists:** use a unique name; MGR does not currently provide
  an edit action on the Catalog screen.
- **Inventory is wrong:** perform a physical check, identify the event that caused the
  difference, and use the correct movement type. Inventory history cannot be deleted.
- **A page fails to load:** select **Try again** once. If the problem continues, provide
  the brewery name, page, approximate time, and action attempted to your administrator.

Features not described in this guide are not available as customer actions in the
current application.
