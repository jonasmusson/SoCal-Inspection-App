# Check-In Autosave — Real Device Test Checklist

Test these on **iPhone** and **iPad** in Safari. Have a second browser tab open to the Supabase dashboard (Table Editor > inspections) to verify data is actually saved.

## 1. Start check-in, leave before completion

- [ ] Open the app, sign in, tap "New Check-In"
- [ ] Enter customer first name only
- [ ] Wait for "Saved" to appear in the header (within ~1 second)
- [ ] Verify the inspections table in Supabase shows a new row with `checkin_complete = false`
- [ ] Tap the back arrow to return to the Dashboard
- [ ] The incomplete check-in should appear in the "Resume Check-In" section

## 2. Resume an incomplete check-in

- [ ] From the Dashboard, tap "Resume" on the incomplete check-in
- [ ] The check-in form should open with the customer first name already filled in
- [ ] The form should be on the same step (Step 1 or Step 2) as when you left
- [ ] Continue filling in fields — "Saved" should appear after each change

## 3. Navigate backward and forward between steps

- [ ] Fill in all required fields on Step 1 and tap "Continue to Media & Assignment"
- [ ] On Step 2, tap the back arrow to return to Step 1
- [ ] All Step 1 data should still be present
- [ ] Tap "Continue" again to go back to Step 2
- [ ] All data should be intact

## 4. Background the app and return

- [ ] Start filling in a check-in form
- [ ] Press the home button / swipe away to background the browser
- [ ] Wait 30 seconds
- [ ] Return to the app
- [ ] All entered data should still be present
- [ ] If "Saving..." was showing when you left, it should resolve to "Saved" or "Save failed"

## 5. Answer a phone call during check-in

- [ ] Start filling in a check-in form on iPhone
- [ ] Have someone call the iPhone
- [ ] Answer the call (or let it ring and dismiss)
- [ ] Return to the app
- [ ] All entered data should still be present

## 6. Photo upload — successful

- [ ] On Step 2, tap "Use Camera"
- [ ] Take a photo
- [ ] The photo should show with a brief "Uploading..." state, then display normally
- [ ] Verify the `checkin_photos` table in Supabase has a row with `upload_status = 'saved'`
- [ ] Take 2 more photos — each should upload independently

## 7. Photo upload — failed and retry

- [ ] This is hard to simulate on a good connection. If possible:
  - Turn on Airplane Mode, take a photo (it should show "Upload failed")
  - Turn off Airplane Mode, tap "Retry" on the failed photo
  - The photo should upload successfully
- [ ] If you can't simulate failure, verify the failed state UI looks correct:
  - Failed photos show a cloud-off icon and "Upload failed" with a Retry button
  - The "Complete Check-In" button is disabled when there are failed uploads

## 8. Video upload

- [ ] On Step 2, tap "Record Video"
- [ ] Record a short walk-around video
- [ ] The video should upload and show "Video uploaded" with a checkmark
- [ ] Verify `inspections.checkin_video_url` is set in Supabase

## 9. Complete a check-in

- [ ] Fill in all required fields, add required photos, optionally record video
- [ ] Tap "Complete Check-In & Save"
- [ ] The success screen should appear
- [ ] Verify in Supabase: `checkin_complete = true` on the inspection row
- [ ] Verify `inspection_sections` and `inspection_items` were created

## 10. No duplicate inspections

- [ ] Start a new check-in, enter some data, go to Step 2
- [ ] Tap "Complete Check-In & Save"
- [ ] If it fails (e.g., network error), tap it again
- [ ] Verify only ONE inspection row exists in Supabase (not two)
- [ ] Verify only ONE set of inspection_sections was created (not duplicated)

## 11. Reload the page during check-in

- [ ] Start a check-in, enter data on Step 1
- [ ] Wait for "Saved" to appear
- [ ] Reload the page (pull to refresh or tap the URL bar and hit Go)
- [ ] Sign back in if needed
- [ ] Go to the Dashboard — the incomplete check-in should appear in "Resume Check-In"
- [ ] Tap "Resume" — all data should be restored

## 12. iPad-specific

- [ ] Repeat tests 1-5 on iPad
- [ ] Verify the layout looks good in both portrait and landscape
- [ ] Verify the camera and video recorder work in Safari on iPad
- [ ] Verify the sticky header (with save status) stays visible while scrolling
