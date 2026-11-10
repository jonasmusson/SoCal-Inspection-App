# SoCal HUB — First Shop Pilot Test Plan

## Goal

Validate whether the Workshop OS makes the shop easier to run before broad technician rollout.

The first pilot is not a feature tour. It should answer four questions:

1. Can a technician understand what to do next without asking management?
2. Can a technician document work quickly enough that they will actually use it?
3. Can management see why capacity was or was not converted into customer production?
4. Can the system preserve clean review/billing boundaries without duplicate work?

## Phase 0 — No-write phone UX review

Use the review-only Workshop demos before any isolated database setup:

- /review/hub/pilot — technician home / day flow
- /review/hub/add-work — talk-to-text work entry
- /review/hub/manage — owner/manager view

All three demo routes are designed to make no HUB writes.

### Voice / transcript

- Open the Add Work review route on a shop iPhone.
- Tap the large microphone if supported.
- Speak naturally for 20–40 seconds.
- Confirm the transcript remains visible.
- Correct a speech-recognition mistake manually.
- Confirm editing the transcript invalidates any previous organized draft.
- Test the iPhone keyboard microphone fallback.
- Load the sample note and run the full flow without speaking.

Pass condition:
- A normal technician can produce and correct a useful transcript without feeling like they are writing a service invoice.

### Organize Work

- Tap Organize Work.
- Review System, Work Performed, Project Hours, Date and Internal Detail.
- Edit all fields.
- Confirm task/parts suggestions are visibly suggestions, not saved actions.
- Tap Demo Save.

Pass condition:
- Demo Save clearly confirms no write occurred.
- User never wonders whether work was actually saved or billed.

## Phase 1 — Isolated backend smoke test

Use one owner/manager account and one technician account in the isolated Supabase environment.

Create:
- one customer-production project;
- one internal project such as Shop Trailer;
- one customer-support/transport project;
- three to five Whiteboard tasks;
- capabilities for the test technician;
- one Parts Request.

Do not connect a real customer invoice.

## Phase 2 — Technician morning flow

1. Sign in.
2. Clock In.
3. Open Tech Home.
4. Verify Current / Next / Ready to Claim.
5. Claim one eligible task.
6. Start Work.
7. Stop Work.
8. Confirm Document Work carries the same project/task and displays elapsed time only as an optional suggestion.
9. Add Work using talk-to-text.
10. Review transcript.
11. Organize Work.
12. Correct wording/hours; deliberately choose whether to use the stopped-session time suggestion.
13. Save as Pending Review.
14. Request a part.
15. Record one Other Time / Constraint entry.
16. Mark one task Blocked or Waiting through the normal task workflow.
17. Clock Out.

Record:
- taps required;
- time required;
- confusing wording;
- typing required;
- repeated data entry;
- anything the technician tries to do that has no obvious button.

## Phase 3 — Contribution + Capacity fairness cases

### Customer production

Record normal customer repair/restoration work.

Expected:
- counts as Productive Credit after approval;
- counts as Customer Production;
- approved billable hours remain separately measured.

### Customer support / transport

Record a vehicle transport or customer support activity.

Expected:
- technician receives Productive Credit after approval;
- time does not falsely reduce Productive Utilization;
- time is visible separately from Customer Production and Billable Labor.

### Internal investment

Record work on an internal project such as the shop trailer.

Expected:
- technician receives Productive Credit after approval;
- time appears as Internal Investment;
- it reduces available customer-production opportunity for that period.

### Shop operations / training / supervision

Record a non-project capacity entry.

Expected:
- starts Pending Review;
- management must approve it before it becomes Productive Credit.

### Constraint

Record Waiting for Parts or No Work Available.

Expected:
- starts Pending Review;
- after management approval it appears as Constrained Hours;
- it reduces Customer Production Opportunity;
- it does not count as Productive Credit.

### Unaccounted

Leave a deliberate gap between attendance and accounted activity.

Expected:
- the dashboard exposes Unaccounted Hours;
- the system does not silently classify or excuse the gap.

## Phase 4 — Manager review

Open Review Queue and verify:

- Pending Work appears.
- Pending Capacity appears.
- Blocked / Waiting / Unassigned tasks appear.
- Requested / Ordered Parts appear.
- long-open Timecards are visible.
- inspection review appears when applicable.
- Ready-for-Shopmonkey work is separate from Pending Review.

Approve/correct the test technician's work and capacity entries through their normal guarded workflows.

Pass condition:
- Review Queue itself remains read-only and directs the manager to the correct underlying action.

## Phase 5 — Productivity / opportunity review

For the test technician verify that the dashboard can distinguish:

- Attendance Hours
- Productive Credit Hours
- Customer Production Hours
- Customer Support Hours
- Internal Investment Hours
- Shop Operations
- Training / Supervision
- Rework / Warranty
- Constrained Hours
- Unaccounted Hours
- Customer Production Opportunity
- Approved Billable Hours
- Billable Conversion
- Productive Utilization
- Billable Utilization

Test the scenario:

8.0 Attendance
2.0 Customer Production
2.5 Customer Support / Transport
3.0 Internal Investment
0.5 Shop Operations

Expected:
- 8.0 Productive Credit
- 100% Productive Utilization
- 2.0 Customer Production
- billable performance is not judged against all 8 attendance hours.

## Phase 6 — Clipboard transition

- Upload 1–6 physical clipboard photos.
- Review interpreted lines.
- Edit technician/date/hours/description.
- Apply Reviewed Work.
- Repeat the same request intentionally.

Pass condition:
- one set of canonical work entries;
- retry does not duplicate labor;
- source photos and reviewed lines remain traceable.

## Phase 7 — Shopmonkey test order only

Use only a disposable/dedicated test order.

- Verify exact remote Order ID.
- Preview work.
- Confirm only Approved + Ready work is included.
- Owner performs explicit sync.
- Verify returned Service ID and Labor ID are persisted.
- Retry the same sync request.

Pass condition:
- no duplicate labor;
- ambiguous/partial write stops for reconciliation;
- production/customer order remains untouched.

## Pilot feedback scorecard

For each workflow rate 1–5:

- Speed
- Clarity
- Number of taps
- Amount of typing
- Confidence that data was saved correctly
- Confidence that nothing unintended was billed/changed
- Usefulness of information shown
- Would use this every day

Capture one sentence for:

- Best part
- Most annoying part
- Something missing
- Something unnecessary
- Wording that confused me

## Rollout gate

Do not add all technicians until:

- no data-loss or duplicate-write issue remains;
- voice entry is faster than manual phone typing for the pilot user;
- management review is manageable;
- contribution/capacity numbers can be explained from underlying records;
- technician cannot see management/financial/private customer data outside their role;
- the exact deployed frontend/backend revision is traceable to Git.
