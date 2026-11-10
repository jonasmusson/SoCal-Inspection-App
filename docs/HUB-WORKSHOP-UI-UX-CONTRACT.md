# SoCal Workshop — UI / UX contract

Status: review standard for the next Workshop frontend. This document does not replace the current live v0.9.5 frontend or authorize a deployment.

## Product character

The Workshop should feel like software built for a high-end restoration and fabrication shop: professional, restrained, technical, confident, and fast on an iPhone in a shop environment.

Avoid visual language that feels like a game, a school project, a generic app-builder template, or an automotive novelty app.

## Non-negotiable visual rules

1. No cartoon or generated vehicle illustrations for normal project cards. Use a verified real project photo when one exists. Otherwise use a clean text-only project card or neutral placeholder. Never invent a vehicle image.
2. Use green as an accent, not as the entire operating system. Primary surfaces should be warm off-white / white; navigation deep charcoal / near-black; SoCal green for selected states and positive actions; warm brass/tan as a limited premium accent.
3. Use one consistent utilitarian UI type system. Strong hierarchy for hours, counts and status. Avoid decorative type mixtures.
4. Cards must earn their space. Active-project views must scale to 15–25 vehicles without becoming giant tiles.
5. Hide development language from normal users. Build/version information belongs under Settings / About for owner/admin.
6. Design shop-iPhone first: thumb-reachable actions, approximately 44px minimum touch targets, no hover dependence, no technician horizontal-scroll tables.

## Information architecture

### Technician navigation

Primary mobile areas: Home, Projects, Photos, Time.

Home hierarchy: Clock In/Out; Current Work; Next; Ready to Claim; Blocked/Waiting; Add Work; Photos; Parts; Need Help.

Technicians should not navigate through separate Whiteboard, Worksheet, Labor Performance, or Shopmonkey screens for ordinary work.

### Manager / Owner navigation

SHOP: Projects, Whiteboard, Clipboard Intake, Photos.
TEAM: Timecards, Technician Work, Parts Requests, Team / Capabilities.
MANAGEMENT: Review Queue, Productivity, Inspections, Shopmonkey Handoff.
SETTINGS: Shop Settings, Access, Integrations, About / Version.

## Project list

The project list should answer at a glance: What car is this? What are we doing? Who is working on it? What is happening now? What is blocked? What needs attention?

Recommended compact row example:

1978 Ford F-250
Current: Front brake inspection
Garrett · 2.4 hrs today
IN PROGRESS · 1 BLOCKED · 2 PARTS REQUESTS

Do not use a large decorative illustration when no real vehicle photo exists.

## Project workspace

Tabs should follow the shop workflow: Work, Photos, Inspection, Timeline, Details.

Work tab should contain Current/Active work session, Whiteboard, and Work History. Management-only actions should not clutter the technician view.

## Tech Home

The mobile technician home should visually prioritize one thing: what should I do now?

MY WORK
1968 Camaro RS
Front brake inspection
L2 · High priority
[ START WORK ]

Next: Cooling system service
[ ADD WORK ] [ PHOTOS ] [ PARTS ] [ NEED HELP ]

If no assigned task exists, show eligible Ready to Claim work based on vehicle assignment plus capability. If neither exists, show a clear Need Work state rather than generic cleaning/organizing by default.

## Voice / dictation work entry

1. Tap Add Work.
2. Use microphone / device dictation.
3. Keep transcript visible and editable.
4. Tap Organize Work.
5. Review System, Work performed, Actual hours, Internal note, Suggested task status, Suggested Parts Requests, and Warnings.
6. Edit.
7. Save Work.
8. Task/parts suggestions require separate explicit confirmation.

Never show AI output as saved merely because drafting succeeded.

## Clipboard Intake

Owner/manager flow should remain one screen: add photos; select or create project; read clipboard; review interpreted work; Apply Reviewed Work; optional owner-only billing state; Shopmonkey preview; explicit owner sync.

Keep Source photo, AI interpretation, Reviewed work, Applied work, and Shopmonkey status visually distinct. Never collapse them into a vague Processed state.

## Review Queue

Owner/manager home should surface attention rather than raw data:
Needs Review: technician work and inspections.
Production Bottlenecks: blocked tasks, waiting tasks, requested parts.
Ready Work: unassigned estimated hours.
Billing: approved hours ready for Shopmonkey.
Time: long-open Timecards.

Each number opens the relevant filtered records.

## Productivity

Do not reduce technicians to one score. Show Attendance hours, Project hours, Approved billable hours, Pending project hours, Billable target progress, Project coverage, Efficiency, Blocked/Waiting hours, and Rework when available.

The weekly production target is configurable and must not be hard-coded into UI components.

## Status language

Use shop language: To Do, In Progress, Waiting, Blocked, Done, Pending Review, Approved, Ready for Invoice, Synced.

Avoid vague SaaS terms when a real shop state exists.

## Interaction standards

- Autosave only where partial record state is safe.
- Consequential actions use explicit verbs: Apply Reviewed Work, Approve Work, Mark Ready for Invoice, Sync to Shopmonkey.
- Never use a generic Save button for a consequential cross-system action.
- Show last save / sync state.
- Cross-device conflicts require refresh/review, never last-write-wins.
- Offline/pending photo state must be unmistakable.

## Design definition of done

A Workshop screen is not complete until desktop and shop-iPhone layouts are reviewed; roles show only relevant controls; empty/loading/offline/error/conflict/success states exist; real shop data density is tested; no cartoon placeholder art weakens the presentation; the workflow can be explained to a technician in under one minute; and the deployed source revision is traceable to version control.