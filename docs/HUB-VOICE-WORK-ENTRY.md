# HUB voice work entry — review-first design

## Goal

Let a technician speak naturally on a shop iPhone instead of typing a formal clipboard entry.

Example:

> Removed the left front caliper and inspected the hose. Hose is cracked and needs replacement. Worked 1.4 hours. Need one front brake hose. Task is blocked until the hose arrives.

The first release should use the phone/browser's dictation capability to produce **transcript text**. The HUB sends only that text to the server-side work-draft action.

## Why transcript text first

- no raw shop audio needs to be retained by the HUB;
- the technician can see and correct speech-recognition mistakes before AI interpretation;
- the transcript remains available if AI drafting fails;
- it works with the normal mobile text field as a fallback;
- the same parser can later accept a dedicated speech-transcription source without changing the work-entry model.

## Review boundary

AI produces a **draft only**:

- system/category;
- cleaned work-performed description;
- explicitly stated actual hours, or blank when not stated;
- internal detail;
- optional task-status suggestion;
- optional blocker note;
- explicit parts requests;
- warnings for ambiguity.

The draft must never automatically:

- save a work entry;
- approve billable hours;
- mark a task complete/blocked;
- create a Parts Request;
- punch a Timecard;
- write to Shopmonkey.

The technician reviews the draft and chooses what to apply.

## Desired mobile flow

1. Open assigned project/task.
2. Tap **Add Work**.
3. Tap microphone / use iPhone dictation.
4. Speak naturally.
5. See transcript.
6. Tap **Organize Work**.
7. Review structured draft.
8. Edit if needed.
9. Save work entry.
10. Separately confirm any suggested task status or Parts Requests.

## Privacy and failure behavior

- No OpenAI key is exposed in the browser.
- The server receives transcript text, not raw microphone audio in this version.
- AI output is not persisted by the drafting action.
- If drafting fails, keep the transcript visible so the technician can retry or enter work manually.
- Never display an AI failure as if work was saved.
