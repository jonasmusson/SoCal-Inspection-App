# SoCal HUB Workshop OS — controlled rollout plan

This is the deployment order for the current review branches. It is intentionally conservative: no production migration or Edge Function replacement should happen simply because a feature PR is green.

## Current production baseline

- Production HUB database already contains vehicle/project/media/access/inspection/work-entry tables.
- Production `socal-hub-workspace` Edge Function was synchronized to GitHub from deployed v0.10.0.
- Production work entries are still a pilot dataset, so schema changes should be completed before broad technician adoption.
- The exact current Workshop frontend source remains to be recovered; do not replace the live frontend with an older prototype.

## Feature dependency graph

### Common foundation
1. **PR #14 — live backend source sync**
2. **PR #15 — Project Whiteboard / project tasks**

### Technician workflow chain
3. **PR #17 — technician task capabilities**
4. **PR #19 — Parts Requests**
5. **PR #20 — physical Clipboard Apply**
6. **PR #21 — explicit Shopmonkey handoff**

### Attendance / management chain
3. **PR #16 — Timecards**
4. **PR #18 — Productivity summary**

The two chains intentionally branch after Project Whiteboard so each concern can be tested independently. Before production, combine them on one integration branch and run the entire Inspection App QA suite again.

## Production migration order

When owner review authorizes a production pilot:

1. Reconcile the green feature branches into one integration branch.
2. Convert each approved `supabase/review-sql/*.sql` file into normal repository migration files in dependency order.
3. Review SQL for reversibility, existing-record compatibility and indexes.
4. Apply migrations to a Supabase development branch or other isolated test environment first.
5. Run Supabase security + performance advisors.
6. Deploy the combined Edge Function to the isolated environment.
7. Run negative authorization tests:
   - tech cannot see unassigned vehicles;
   - tech cannot change task definition/capability grants/billable state;
   - tech cannot view another technician's attendance;
   - manager cannot change owner-only task capabilities or trigger Shopmonkey sync;
   - direct Data API calls cannot bypass the workspace Edge Function.
8. Exercise one complete test project:
   - project + task;
   - tech assignment;
   - Clock In;
   - task progress;
   - work entry;
   - Parts Request;
   - photo;
   - inspection link;
   - Clock Out;
   - manager review;
   - productivity summary.
9. Test physical clipboard import with duplicate/retry attempts and confirm one set of work entries.
10. Configure Shopmonkey credential only after API scope is verified. Link a disposable/test Shopmonkey order and run preview before any write.
11. For the first external write, use a non-customer test order or the existing dedicated duplicate order pattern. Confirm remote service/labor IDs are stored and retry cannot double-post.
12. Only then expose the new modules in the Workshop frontend.

## Frontend release rule

Do not build a second permanent admin interface. The live Workshop frontend should surface the backend modules through role-based project workflows:

**Technician**
- Clock In / Clock Out
- My assigned projects
- Current / Next task
- Add Work (voice/text)
- Photos
- Parts Request
- Blocked / Need Help

**Manager / Owner**
- Project Whiteboard
- review queue
- Clipboard Intake
- Timecards
- Productivity
- Parts queue
- Inspection link
- Shopmonkey preview / explicit owner sync

## Data ownership boundaries

- **HUB project task** = planned work.
- **HUB work entry** = actual technician project work.
- **HUB Timecard** = attendance only.
- **Inspection App** = inspection findings/report authority.
- **HUB media** = private project originals/evidence.
- **Shopmonkey** = invoice/order authority.
- **HUB Shopmonkey receipts** = proof of what was externally written, never a replacement invoice ledger.

## Stop conditions

Stop a rollout rather than working around any of these:

- a migration fails or partially applies;
- authorization negative tests fail;
- a work entry can be duplicated by retry;
- a Shopmonkey write succeeds without a durable remote ID receipt;
- a partial Shopmonkey write would be blindly retried;
- a technician can see owner/management data outside their assignment;
- a live frontend build cannot be traced to source control.
