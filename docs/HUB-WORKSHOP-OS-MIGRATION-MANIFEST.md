# Workshop OS migration manifest

This is the dependency order for converting the green review SQL into normal Supabase migrations after owner approval and isolated-environment testing.

## Preflight

Run the SELECT-only file:

- supabase/review-sql/hub-workshop-os-preflight.sql

Stop if required baseline tables/functions are missing, scope anomalies are nonzero, or unexpected Workshop OS tables already exist.

## Migration order

1. hub-project-tasks-v1.sql
   - adds project whiteboard tasks;
   - adds optional task_id to hub_work_entries.

2. hub-member-task-skills-v1.sql
   - depends on hub_pilot_members;
   - enables exact task-code eligibility.

3. hub-timecards-v1.sql
   - attendance only;
   - independent from project billing.

4. hub-org-settings-productivity-v1.sql
   - configurable weekly billable target, labor rate and timezone.

5. hub-parts-requests-v1.sql
   - depends on project tasks for optional task linkage.

6. hub-clipboard-apply-v1.sql
   - depends on project tasks and hub_work_entries;
   - adds the atomic reviewed clipboard apply RPC.

7. hub-shopmonkey-handoff-v1.sql
   - depends on work entries;
   - adds verified project/order, system/service and work/labor mappings plus durable sync receipts.

8. hub-work-sessions-v1.sql
   - depends on project tasks;
   - Start Work / Stop Work remains separate from attendance and billing.

## Edge Function deployment

Only after all approved migrations exist in the isolated environment, deploy the combined socal-hub-workspace source from the green integrated release candidate.

The Edge Function must not be deployed ahead of its required tables.

## Configuration after schema/function verification

Secrets remain unset until each feature is intentionally enabled:

- OPENAI_API_KEY — review-first transcript work drafting.
- SHOPMONKEY_API_TOKEN — explicit owner-approved Shopmonkey handoff.

Never place either value in frontend code or Git.

## Isolated-environment acceptance order

1. Sign in as owner.
2. Verify project/media/inspection baseline still works.
3. Create whiteboard tasks and capabilities.
4. Assign a technician and test Claim Task.
5. Clock In and Clock Out.
6. Start Work and Stop Work.
7. Submit a manual digital work entry.
8. Test transcript-to-draft; confirm no save occurs automatically.
9. Create and progress a Parts Request.
10. Confirm management Review Queue and Productivity.
11. Test clipboard photo apply twice with the same request ID; confirm no duplicate work.
12. Verify a disposable/test Shopmonkey Order ID.
13. Run Shopmonkey preview.
14. Perform the first external write only on the designated test order.
15. Confirm remote service/labor IDs are persisted and retry cannot double-post.
16. Run Supabase security/performance advisors.
17. Run full Inspection App QA again against the exact release source.

## Production stop conditions

Do not continue if:

- any required baseline table/function is missing;
- scope anomaly counts are nonzero without explanation;
- a technician can access unassigned work/customer/management data;
- duplicate work can be created by retry;
- a partial external write can be blindly repeated;
- a remote Shopmonkey labor line exists without a durable local mapping;
- current Workshop frontend source cannot be traced to version control for the release being deployed.
