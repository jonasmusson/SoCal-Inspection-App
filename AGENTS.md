# SoCal product-family working instructions

**Before editing ANY page or interface:** read `docs/design-system/SOCAL-PRODUCT-DESIGN-SYSTEM.md` and `docs/design-system/tokens.json` and any repository-specific design standards.

**HUB and Inspection App must look and behave like the same software family** — same product typography/lockup, graphite header, warm-white canvas, forms, buttons, navigation conventions, status/save treatments and responsive quality. Different workflows are allowed; random stylistic reinvention is not. The HUB's Graphite & Warm White approach is the current software baseline. No car-icon logo tiles, dark-green application chrome, unnecessary promotional sign-in panels, playful ornament or unrelated fonts.

Marketing sites may retain approved editorial typography and distinctive commerce branding; don't rebrand them without a separate approved review.

This applies to Bolt, ChatGPT, and human contributors. Cross-check corresponding screens in other SoCal products, use the established style, and record any documented exceptions. Update the canonical design document in `jonasmusson/SoCal-Autoworks-Website` and mirrored copies whenever the shared contract changes.

Preserve real data, saved work, customer evidence, permissions and existing integrations. Do not deploy production apps or apply migrations merely for design changes. Visual acceptance requires rendered desktop/iPad/iPhone QA in addition to tests and builds.

## Cross-tool workflow and experience standard
For significant new features, redesigns, shared workflows, or Simple/Advanced functionality, also consult the internal [SoCal Design Bible](https://github.com/jonasmusson/SoCal-HUB/blob/main/docs/SOCAL-DESIGN-BIBLE.md) in the private SoCal-HUB repository. It is the canonical **UX/workflow** companion to the existing shared visual contract in this repository. Team members without access should follow the local design-system docs and request the internal UX guide rather than inventing a conflicting pattern.

Preserve all existing functionality, permissions and data; create reviewable mockups before major redesigns; keep everyday controls straightforward and advanced features organized; provide truthful save/approval/verified states; test failures, desktop/iPad/iPhone and recovery before declaring a feature complete. A mockup or simulation is not production verification.

## Connected-platform roadmap (read before cross-tool changes)
Read the private [SoCal Connected Platform Roadmap](https://github.com/jonasmusson/SoCal-HUB/blob/main/docs/SOCAL-PLATFORM-UNIFICATION-ROADMAP.md) together with the SoCal Design Bible and canonical visual tokens before implementing any change that spans Hub, Inspect, Invoice Studio, planner, timecards, CRM or website leads. **Start with source-of-truth and feature-parity audit, then approved multi-device mockups; preserve operational data and existing features.** Do not infer shared database/identity or perform production migrations without explicit verified ownership and approval.
