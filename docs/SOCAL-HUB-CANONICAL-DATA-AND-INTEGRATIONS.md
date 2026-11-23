# SoCal Hub — canonical records & no-double-entry contract
**Design status:** Draft, November 1, 2026. This is an implementation target, not a production migration.

## Product vision
One SoCal Hub login and consistent navigation; modular surfaces **Media, Inspect, Projects, Team**, with optional later content/YouTube production, buyer/seller workflows and licensed deployments for other shops. **Inspection is never required to create a vehicle, customer, project, job or photo record.** The shop should record a fact once and reuse it everywhere it is relevant.

## Canonical domain entities
1. **Organization** (`organization_id`) — company/tenant and branding, policies, quotas, permissions. Every record and object is scoped to an organization, including future licensees.
2. **Customer/Contact** (`customer_id`) — person or company, multiple ways to contact, source and revision. May exist without a vehicle or inspection.
3. **Vehicle** (`vehicle_id`) — long-lived ID, year/make/model/body style, VIN/chassis optional, identity confidence and aliases. May exist without customer, project, RO or inspection. No assumption that VIN identifies a unique historic car.
4. **Vehicle relationship** (`customer_id`, `vehicle_id`, role, valid-from/to, notes) — supports ownership changes, co-owners, fleet contacts, prospective buyers, authorized repair decision-makers. **Do not bake a forever-owner into the vehicle row.** UI can offer one primary contact for convenience.
5. **Project** (`project_id`, `vehicle_id`, optional customer ID, type, title, status, scope, assigned team) — repair, restoration, fabrication, inspection prep, purchase evaluation, transport, photoshoot, YouTube series, inventory/prep. Multiple projects per vehicle over time.
6. **External record mapping** (org, provider, entity type, remote ID, local ID, sync cursor, source revision) — one canonical Hub ID with **optional** Shopmonkey, Wix legacy, or other provider IDs. Idempotent import, no silent duplicate creation.
7. **Work order** — Shopmonkey is authoritative for service order/invoice and billed state. Hub stores a read-only reference or a reviewed outbound proposal until the API is explicitly enabled and tested. One project may involve more than one work order.
8. **Inspection** — SoCal Inspect owns findings, priority, evidence and approval; optionally associated with vehicle/project/order. Not a mandatory prerequisite.
9. **Media asset** — immutable original owned by the organization; uploader, capture time/provenance, checksum, private object storage key, revisions/derivatives; can link to vehicle without project. `media_usage` records uses in inspection, project, customer report, website, social or video without duplicating originals.
10. **Team member** — permanent profile ID and identity/login mapping, role and assignment; shared phones use individual authenticated sessions; never give a technician owner credentials.
11. **Attendance** — one authoritative timeclock system (Shopmonkey or SoCal), not both. Shifts, breaks and clocked hours are distinct from billable hours, and logging into an app never clocks anyone in.
12. **Project work entries** — technician, work date, vehicle/project/order reference, task, actual project hours, billable proposal, rework and consumables, manager review. One entry should supply reporting and approved billing handoff without retyping.
13. **Compensation** — owner-only effective-dated rate history, payroll classification and burden assumptions; isolated from technician/media API permissions. True payroll/actual wages remain with the payroll authority.
14. **Content & rights** — campaign/episode, asset use, owner/customer publication approval, derivative and release status. Media tagged for review is **not** automatically public.

## Non-negotiable UX flows
- **New customer**: save contact in seconds; add vehicle now or later.
- **New vehicle**: minimum display label; year/make/model, VIN and customer optional. Add photos directly. No inspection dialog and no compulsory RO.
- **New project**: choose existing vehicle; new customer optional; optional work-order reference. Never duplicate vehicle on repeat service.
- **Shopmonkey order enters**: read supported fields; look up external mapping first, then vetted candidates; flag ambiguity for owner. Don't overwrite authoritative data or start an inspection.
- **Technician opens project**: see media history, assigned tasks and relevant reports without viewing unrelated customers, pay or finances.
- **Photo**: choose vehicle/project once, capture, validate upload and private access; share gallery across authorized phone/PC accounts; immutable original retained.
- **Work log**: technician records job work once; manager reviews and explicitly approves mapping to billable lines; attendance is separately recorded or imported.
- **Inspection**: optional guided workflow attached to existing vehicle, reuses media asset IDs, creates no duplicate vehicle or uploads.
- **Video/social**: assets can become candidates for a campaign, with permission check and approved derivative; video originals may live on NAS/object tier, while metadata links back to vehicle.

## Systems of record / boundary
| Data | Authority | SoCal Hub behavior |
| --- | --- | --- |
| Customer billing contact + invoice + RO | Shopmonkey when linked | Read/match, present for review; no automatic writes |
| Permanent vehicle/project history | SoCal Hub | Create independent of inspection, link provider references |
| Inspection findings and report | SoCal Inspect | Reference shared media via immutable asset IDs |
| Business photos, versions, rights | SoCal Media | Private originals, approved derivatives, backups |
| Attendance | One chosen timeclock | Read or record, never parallel payroll clocks |
| Job work & billable proposal | One approved technician-entry path | Reconciliation and explicit billing review |
| Payroll & pay rates | Owner-controlled employee/payroll source | Isolated management analytics, never exposed to Tech |
| Public site/social/YouTube | Approved content workflow | Only published assets after approvals |

## Integration mechanics
- Stable internal IDs; provider mappings are separate from owner/customer data.
- Every integration message carries org, provider event ID, remote/local IDs, source updated time/revision, idempotency key and reconciliation status.
- Start with **read-only** Shopmonkey integration; do not assume API scopes, plan entitlements, webhook event coverage or write permissions.
- Durable inbox/outbox for retries, conflict detection, provenance and manual resolution; no double postings on repeated webhook deliveries.
- Worklogs do not imply attendance. Clock-in/out do not imply billable time. Approval in SoCal does not imply Shopmonkey billed until confirmed.
- One-way export is a fallback, never hidden two-way sync.
- Credential storage server-side only, least privilege; audit every identity mapping, export, approved write, and deletion.

## Security and privacy
- Row-level, object-level and endpoint-level organization scoping verified by negative tests. Role-based permissions enforced server-side, not only in the UI.
- No permanent public URLs for private vehicle photos, customer details or inspection records.
- Shared shop phones can switch employees without staying logged in or clocking one another out. Personal-device use optional and no personal cloud synchronization.
- Soft-delete with recovery and explicit retention for originals; test backups and restoration.
- Sensitive employee rates in an isolated service or schema; not returned to general technician/profile queries.
- For future licensing: multiple shops must never see each other's records, media, credentials or uploads.

## v0.3 local prototype scope
The local demonstration permits independent Customer / Vehicle / Project creation and photo association, including vehicle-only photos and later project creation. It tests interaction and model separation. It **does not** connect to Shopmonkey, Supabase production, payroll, timecards or other devices. Sample customer fields are placeholders, not real customer records. Current demo uses one convenient primary customer link per vehicle; production must support the many-to-many effective-dated relationship above.

## Real release acceptance tests
1. New vehicle without customer, inspection or RO; add 5 reference photos and find them on both shop phones and PC after private server upload.
2. One vehicle with multiple projects, customers/contacts and Shopmonkey ROs; no duplicates when reconnecting.
3. Staff role cannot access unrelated org/assignment, customer-private media, compensation or owner settings.
4. Interrupted upload and repeated webhook/event retry never duplicate objects, customers, time entries or invoice lines.
5. Existing Inspection App report and evidence work unchanged; evidence associates to media once.
6. Manager approves labor handoff; invoice state changes only after confirmed external write. Timeclock remains separately auditable.
7. Original image, project associations and metadata can be restored from independent backups.
