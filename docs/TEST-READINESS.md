# Inspection app test readiness

This file tracks repository-verifiable readiness for the first real shop-floor inspection test. It does not replace a production identity/device walkthrough.

## Verified in repository
- Manager/owner vehicle check-in flow creates inspections from active templates and supports technician assignment.
- Technicians are routed to My Inspections and non-manager lists are filtered to the signed-in technician's assigned inspections.
- Inspection sections support Good, Monitor, Needs Attention and Not Inspected findings, with required note/photo/video validation.
- Finding photos and videos are uploaded through the inspection workflow.
- Inspection labor tracking supports pause/resume; both Save & Exit and the section-header Back control use the timer-safe exit path that pauses an active timer before returning to inspection detail.
- Completing the last section moves the inspection to Pending Review.
- Manager/owner review and customer-report preview routes are present.
- Public report access uses a tokenized report route rather than the authenticated workspace.

## Must be verified in the real test
- Production sign-in for the actual technician account and correct assigned-inspection visibility.
- Phone camera/video permissions and successful production storage uploads.
- Timer behavior when the phone is backgrounded/locked or the user navigates in unexpected ways.
- Report rendering/printing with real captured media.
- Production report-delivery email should remain untested until a deliberately safe recipient is used.

## Known test-readiness follow-up
- A dedicated per-section field-test feedback box is not currently exposed in the technician UI. Capture workflow feedback separately during the first run rather than mixing it into customer-facing finding notes.
