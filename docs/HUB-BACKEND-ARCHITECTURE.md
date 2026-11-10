# SoCal HUB backend architecture

This document records the current live HUB backend contract so future development is based on the deployed source of truth rather than a parallel prototype.

## Current live service

- Supabase project: the existing SoCal/Bolt production database.
- Edge Function: `socal-hub-workspace`.
- Current function version when synchronized: `0.10.0`.
- The browser sends a Supabase user access token; the Edge Function validates the user and then applies organization/role/project assignment checks before using privileged database access.
- The Edge Function is intentionally configured with `verify_jwt = false` because it performs its own user validation through Supabase Auth. Do not treat CORS as authorization.

## Existing HUB records

The live backend already separates:

- organizations and membership
- vehicles
- customer/contact records
- projects
- vehicle assignments
- private project media
- upload reservation/finalization jobs
- activity/timeline events
- inspection links and inspection evidence
- technician work entries
- operation receipts/idempotency support
- access requests

## Existing technician work entry model

`hub_work_entries` is the canonical starting point for the future digital clipboard. It already captures:

- organization, vehicle and project identity
- technician identity
- work date
- optional start/stop time
- actual project hours
- manager-controlled billable hours
- system/category
- work performed
- internal notes
- manager review state
- invoice readiness state
- review note and audit timestamps

New digital-clipboard UI should use this record instead of creating a second work-log table.

## Existing inspection connection

Projects can link to the production Inspection App through `hub_inspection_links`. The HUB Edge Function already supports starting an inspection, loading inspection data, editing findings, attaching HUB media as evidence and submitting an inspection for manager review.

The Inspection App remains authoritative for the full inspection/report workflow. The HUB should provide a unified project entry point without duplicating inspection records.

## Source-of-truth boundaries

- HUB: project identity, assignments, shop media, activity, project work entries.
- Inspection App: inspection template/detail/report data.
- Shopmonkey: customer billing/invoice truth once a future write integration is explicitly approved and verified.
- Timecards: attendance must remain distinct from project work entries.
- Whiteboard/tasks: should become a dedicated project-task model linked to HUB project/vehicle identity, not stored in work entries or activity notes.

## Next schema additions

The next production-quality HUB additions should be designed as separate, linked models:

1. project task / whiteboard records
2. technician attendance/timecards
3. parts requests
4. clipboard-photo intake batches linked to project work entries
5. explicit Shopmonkey handoff receipts/status

Do not add these as free-form JSON blobs when a durable relational model is appropriate.

## Security follow-up

Supabase advisors currently report several HUB tables with RLS enabled but no policies. Today, direct client access is intentionally mediated by the Edge Function, but these findings should be reviewed before broader rollout. The Inspection database also has publicly executable `SECURITY DEFINER` functions that require an intentional-access review.

No production security behavior is changed by this documentation/source sync.
