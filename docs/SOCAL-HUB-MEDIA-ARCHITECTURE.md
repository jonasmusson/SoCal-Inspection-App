# SoCal Hub / SoCal Media — architecture & implementation contract
**Status:** review draft · 2026-11-01 · no production deployment or data migration authorized

## Product decision
Build a **shared vehicle-media service** used by SoCal Inspect and, subsequently, SoCal Projects, Team and approved marketing/content workflows. One mobile-first SoCal Hub entry point for shop iPhones, personal employee devices (voluntary), shop PC, iPad, and owner Mac. Do not build a separate photo app, rely on shared personal iCloud, or duplicate Shopmonkey invoice entry.

## Current-state constraints (confirmed from source)
- Current inspection app: React + Vite, Supabase Auth/DB/Storage, iOS Home Screen manifest.
- Existing `inspection_photos` and `checkin_photos` uploads reference public-style object URLs. Do **not** presume bucket privacy, ownership boundaries, or signed URLs are correct without auditing production storage, policies, and deployed configuration.
- Production Inspection App Supabase project is not currently accessible through the connected Supabase tools. Do not run migrations, access production media, or promise a working link until access and authorization exist.
- Five technicians will share two shop iPhones and may optionally use personal devices. Existing second shop iPhone still contains owner's personal account and should be restricted during transition.
- Four vehicle-specific albums organized in owner's old Mac Photos; originals must remain in place until imported, checksum-validated and independently backed up.
- SoCal Autoworks Workspace exceeded 30 GB; not a safe upload destination until resolved.
- Shopmonkey remains the authority for invoices and existing work orders. API/webhook scope must be validated under actual subscription before any write integration.
- Current repo is publicly visible; product IP and secrets review is required before commercial rollout. Never add secrets, actual customer images, or private customer data to Git.

## Canonical records
`organization`: id, display_name, status, branding, retention_policy.
`member`: id, organization_id, identity_provider_user_id, role (owner/manager/tech/media_editor), active; no pay data in media service.
`vehicle`: id, organization_id, year/make/model, VIN nullable, display_name, external_shopmonkey_vehicle_id nullable. VIN is not a globally sufficient identity for classics.
`project`: id, organization_id, vehicle_id, name, status, external_order_ref nullable, customer_id nullable; multiple projects per vehicle.
`media_asset`: id, organization_id, vehicle_id nullable, project_id nullable, uploader_member_id, captured_at, uploaded_at, original_filename, safe_mime, size_bytes, sha256, width/height nullable, storage_key, visibility (internal/restricted), source (camera/import/inspection), ingest_status. No public permanent object URL.
`media_derivative`: id, asset_id, kind (thumbnail/preview/web), storage_key, dimensions, version, status; original immutable.
`media_annotation`: id, asset_id, project_id nullable, category (checkin/progress/parts/fabrication/repair/completion/inspection/marketing/unsorted), caption, notes, author_id, revision.
`media_usage`: id, asset_id, purpose (inspection_evidence/customer_report/website/social/video), source_record_id, approval_status, approved_by, approved_at. References to one original, not duplicated uploads.
`import_batch`: id, organization_id, operator_id, source, status, total_files, imported_files, rejected_files, manifest_hash, created_at.
`upload_job`: id, organization_id, user_id, target_project_id, idempotency_key, expected_sha256 nullable, state (reserved/uploading/verified/failed), created_at, verified_at.
`external_mapping`: organization_id, local_entity_type/id, provider, remote_id, updated_at. Unique on provider, organization and remote ID.
`audit_event`: actor, org, action, subject, timestamp and policy decision (without raw secrets).

## Mandatory security and durability
1. Every query, blob operation and signed URL requires authenticated role **and organization scope**; enforce Postgres RLS, storage policies and server-side authorization, not hidden UI controls. Tech can read authorized project media and contribute; tech cannot administer users, access pay, export all organizations' media, or delete historical originals.
2. Private storage only: canonical object keys scoped by `org/project/asset`; short-lived download URLs issued after authorization. Never place Supabase service-role key in browsers or mobile apps.
3. Capture: select project before camera; allow offline local queue only after privacy/storage design approved; surface explicit upload success/error and retry; do not claim success on DB insert if object/record mismatch. Reconciliation job detects orphaned or unfinished uploads.
4. Immutable originals, computed checksum and duplicate candidates; derivative generation isolated. Avoid silent deduplication across different organizations or project associations.
5. Deletion: soft-hide in app by permitted roles, controlled retention/trash, admin recoverability, independent versioned backups. Never silently synchronize deletions to personal photos.
6. Source imports: Apple Photos export unmodified originals with original date metadata; batch manifest (filename, sha256, size, timestamp, source album, target project); preview, confirm, upload, verify, log rejections; leave old library intact.
7. Tenant isolation test: an account for Shop B must never retrieve Shop A's project metadata, object, thumbnail or signed URL, including altered URL/path inputs.
8. Mobile: permit only limited library access where possible; personal devices optional and unmanaged; sign out/switch user safely; technician authentication independent from attendance clock state.
9. Confidential records: customer/vehicle media is private by default. Publication requires explicit approval and permission; social/website integrations may only use approved derivatives.
10. Compliance: retain meaningful timekeeping and employee access logs; do not duplicate payroll system or silently update billable/invoice hours.

## Deliberate integration boundaries
- **SoCal Inspect:** keep existing inspection workflow; evidence refers to a `media_asset` through a secure usage/link record. Migration of legacy inspection photos only after inventory, access checks and backup.
- **Shopmonkey:** treat customer, RO, invoices as authoritative. First read-only import/matching and review queue; only later explicitly approved writes. No speculative endpoints and no secret in client bundles.
- **Workspace:** documents and archival exports, not automatic canonical camera-original store while over quota.
- **Video:** media catalog can index camera originals, footage, proxies, edits, approval versions; large video originals remain on working SSD/NAS/object archival tier with verifiable independent backup.
- **Social:** plan campaigns, approvals, captions and exports first. No auto-publication without explicit per-channel review and rights confirmation.

## Phase gates
**Gate A — Access & safety.** Verify actual production Supabase app project and storage policies; secret/PII scan, repo visibility/IP decision; sample authorization matrix; isolate development project. No customer data migrations.
**Gate B — Private media service.** Auth-scoped vehicle/project listing, typed media model, private storage, upload reservation/verification, thumbnail retrieval and audit trail; unit/integration tests.
**Gate C — First technician pilot.** One authorized real project with existing originals; capture five new photos on iPhone 13 Pro; verify originals and thumbnail on shop PC and other phone; deliberately interrupt upload; verify idempotent retry; unauthorized-account negative test; backup restore test.
**Gate D — Import four albums.** Dry-run listing, confirm mapping, import with checksums, reconcile records and counts, preserve owner's originals.
**Gate E — Inspect integration.** Evidence linking without duplicate original files; historical inspection migration only after review.
**Gate F — Team / Shopmonkey / content.** Secure technician identity, optional personal phones, integrations, media approval and publishing workflow.

## Explicit owner decision list (non-blocking, no credentials here)
- Supply current active project names/work-order IDs and approve which first vehicle can be used as pilot.
- Grant approved access to the **actual production** Inspection App Supabase project or identify its owner; never paste a service-role key in chat.
- Confirm where source full-resolution albums can be exported for controlled import; no need to disturb current originals.
- Decide initial photo retention and publication authorization rules (default private, indefinite retention pending review).
- Confirm preferred employee identity and account-provisioning method (personal email accepted; no shared owner credentials).
- Confirm the initial storage budget/expected photo and video volume; no new purchases assumed.
- Review repository visibility and proprietary licensing plan before commercializing.

## Acceptance definition
Not “a pretty demo.” One existing vehicle's historic photos and five new photos can be browsed on both shop phones and PC, associated to vehicle and uploader, independently recovered, safely uploaded/retried and inaccessible to unauthorized users. Only after this is verified should the first production user cohort be expanded.
