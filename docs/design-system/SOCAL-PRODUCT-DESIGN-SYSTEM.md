# SoCal Product Design System — Shared Design Contract
**Version:** 0.1.0 · **Status:** Working baseline pending visual approval · **Owner:** SoCal Autoworks product family
**Canonical home:** `jonasmusson/SoCal-Autoworks-Website/docs/design-system/SOCAL-PRODUCT-DESIGN-SYSTEM.md`
This file is mirrored to the Inspection App, HUB, and SoCal Classic Cars repositories. Copies must match the canonical version when updated.

## Why this exists
People should immediately recognize that the SoCal Autoworks site, SoCal HUB, Inspection App, Planner/Builder and associated SoCal Classic Cars experiences come from one product/design family. A page must never look like a new company simply because a different tool or coding assistant made it.

This is a **cross-product contract, not a command to restyle production immediately**. Preserve working and approved designs; propose and review any visual migration separately. The user has explicitly rejected playful icon-style branding, a lollipop-like `S/` emblem, and dominant dark-green application chrome.

## Family identity and brand architecture
- Parent identity: **SoCal Autoworks**. Software names: **SoCal HUB** and **SoCal Inspect / Inspection App**. Maintain a consistent parent-wordmark relationship, naming/case, footer treatment and product sign-in identity.
- SoCal Classic Cars is a **related but distinct customer-facing business**. Preserve its own name, buyer-focused voice and approved identity; reuse interaction quality, field patterns, rhythm and professionalism so the family resemblance is apparent.
- Never invent a replacement automotive logo or arbitrary car glyph. Reuse a verified existing official brand asset, or use a restrained typography-led lockup. All final logo/wordmark changes are reviewable, not silently approved.
- Guiding references: **Linear** for information hierarchy, speed and clarity; **Porsche Design** for precision, restraint and craftsmanship. Inspiration only—do not copy their trade dress, marks or layouts.

## Product UI baseline (HUB, Inspection App, Studio, operational tools)
Use a coherent **Graphite & Warm White** direction unless a visual variant is explicitly reviewed:
- Canvas `#FAF9F7`; raised surface `#FFFFFF`; graphite navigation `#1C1C1E`; primary text `#1A1A1A`; secondary text `#64666B`; divider `#E4E1DC`.
- Product primary action: graphite with high-contrast light text; subdued hover/focus treatment. Avoid green primary buttons or green sidebars.
- Operational status colors convey meaning, not branding: success/good green; attention/awaiting amber; immediate/problem red; inactive/unknown neutral gray. Status words always accompany color.
- Warm-metal accents may be used *sparingly* when compatible with existing approved branding; never override semantic status color. No gradients or novelty badges for decoration.
- Internal app typography: **Inter** or compatible clean sans-serif, with consistent sizes/weights/line heights. Do not introduce a different display font per screen.
- Radius and elevation: subtle/functional (typically 6–10px), restrained borders and shadows; no oversized bubbly cards, playful icon tiles or excessive whitespace.

These values are **provisional design tokens**, not evidence that every existing application has implemented them. Tokens become final only after representative screens are reviewed.

## Website/editorial exception: consistent identity without forced sameness
- The current SoCal Autoworks public site deliberately uses Georgia/Arial, editorial photography, and existing gold/green project-page details; its automated typography standards are established. **Do not silently replace those production styles** to match software dashboards.
- The current SoCal Classic Cars public site uses a separate editorial design system (including DM Sans/Anton and gold accents). **Do not silently rebrand it**.
- A later dedicated visual harmonization project may reconcile the sites with the product system. Until approved, maintain each site's own existing production baseline while aligning high-level brand signatures, quality, buttons, accessibility, navigation semantics and form behavior.
- Shared family identity does not require identical page layouts or identical typefaces across marketing/editorial and operational software. It does require intentional, documented variations.

## Shared user experience rules
1. **Navigation:** recognizable brand/location on every screen, stable nav placement and active states, clear back paths and unambiguous breadcrumbs when needed.
2. **Forms:** always labeled, visible focus/error/success, helpful validation, 44px+ practical touch targets on handhelds; no tiny icon-only primary actions.
3. **Actions:** one clear primary action per context; secondary actions distinct. Destructive actions require deliberate confirmation and role checks.
4. **Save states:** distinguish Unsaved / Saving / Saved / Failed; persist real work reliably; never imply a server save when only browser memory is updated.
5. **Records:** common vehicle identity language, dates, tasks, status labels, technician roles, customer fields and system names across tools. Underlying data linkage must be verified before promising one-step flow.
6. **Evidence:** real technician notes and media have priority over graphic ornamentation. Inspection reports must display all findings/photos with their systems; printed reports remain clear and complete.
7. **Accessibility:** keyboard focus, readable contrast, text+color status, reduced-motion friendliness, device-sized controls; test phone and tablet plus desktop.
8. **States:** loading, empty, error, offline, success, pending approval, deactivated and archived screens are part of the design system, not ad hoc exceptions.
9. **Density:** more information for manager/desktop, fewer taps for technician/mobile; same visual vocabulary and semantics, different task-centered layouts.

## Core component families to standardize
App shell/header, product lockup, primary/secondary/danger buttons, navigation items, tabs, search/filter, text/number/date inputs, form sections, status pills, save indicator, alerts/toasts, dialogs, table/list/card rows, media gallery, task row, inspection finding, invoice review row, empty/loading/error states, and login/request-access/reset screens.

Use existing implementation patterns where practical. Separate React/Next.js and static JS apps may have different code implementations; the *design contract* and token meanings should remain consistent. A shared reusable component library can be introduced later only where technically sensible.

## Change-control rule (applies to ChatGPT, Bolt, and human contributors)
Before **any** UI/UX modification:
1. Read this document and the target repository's existing design/UX guidance.
2. Identify the affected component family and check parallel examples in the other SoCal products.
3. Reuse the established pattern instead of inventing a new one.
4. If introducing a new token, component or interaction, propose it as a **shared system change**, update the canonical document and mirrored copies, and list which products require adoption.
5. For a purposeful difference (brand/editorial vs. operational, accessibility or task need), record it as an explicit design exception. Never treat accidental drift as creative license.
6. Produce before/after **rendered** screenshots where supported and verify actual user workflows at desktop, iPhone and iPad sizes. Code builds and mock tests do not prove visual QA.
7. Review at least authentication, dashboard/list, detail/work-entry and error/success states for consistency when making broad styling changes.
8. Preserve working behavior, security boundaries, media, data and role separation. Do not deploy, migrate databases or alter production merely to implement design.

## Acceptance gate
No product redesign is 'done' merely because it is attractive or builds. Acceptance includes: identifiable SoCal family identity, adherence to tokens/patterns or documented exception, no competing logo inventions, comparable nav/forms/status handling, functional regression checks, responsive screenshots/preview, and a list of remaining drift. The owner reviews visual direction before treating it as final.

## Ownership, synchronization and future enforcement
Canonical design changes live in the Autoworks Website repo. Mirror this same version into:
- `jonasmusson/SoCal-Inspection-App/docs/design-system/SOCAL-PRODUCT-DESIGN-SYSTEM.md`
- `jonasmusson/SoCal-HUB/docs/design-system/SOCAL-PRODUCT-DESIGN-SYSTEM.md`
- `jonasmusson/socal-classic-cars/docs/design-system/SOCAL-PRODUCT-DESIGN-SYSTEM.md`

Use `docs/design-system/tokens.json` as a portable token reference, not a claim the application already consumes those values. Add repository-specific token adapters/components and design-regression checks incrementally. Do not enable automatic releases based solely on a documentation change.
