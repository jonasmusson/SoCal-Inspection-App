# SoCal Media — Experience contract (v0.2 review)

Status: **prototype UX validated in isolated browser simulation; NOT a connected shop release.** This accompanies the existing architecture draft on the same development branch. The v0.2 runnable files are attached to the originating ChatGPT project conversation and are not deployed.

## Design direction
- **Product:** SoCal Hub > SoCal Media. Quiet, premium automotive editorial look: charcoal navigation, warm off-white working surface, restrained copper accents and deep green primary actions.
- **Default landing:** Active vehicles. A technician should never be asked which storage provider or app they want to use.
- **Primary interaction:** Open vehicle -> take photo / import -> optional context -> see gallery. Reuse the selected project rather than asking for year/make/model again.
- **Secondary areas:** All media, Unsorted, For review; content approvals are separate from inspection evidence.
- **Use photographic content, not dashboard decoration.** Simple labels, large touch targets, ample white space, high contrast.
- **Never mislead about storage:** Local preview, staging and verified cloud uploads are explicitly different states. A media count appearing in the browser is not proof of a durable backup.

## v0.2 locally implemented UX
Desktop and phone layouts, project cards, active project detail, tabs for photo gallery/activity/vehicle info, camera input, multi-file import, category filters, full-text local search, note/vehicle reassignment, review shortlist, original photo download, metadata-only catalog export. No destructive action exposed in local preview.

## Key interaction specifications
**Projects:** Search by year/make/model or RO. Cards show latest project photo if available, otherwise a neutral vehicle placeholder. Status visible without reading a table. Primary action Add Photos within vehicle.

**Media import:** Offer two paths: Take Photo (uses device capture where supported) and Import Originals (multi-select). Default to current vehicle; allow Unsorted for historical uploads. Show explicit count and category. Real cloud version must show Queued / Uploading / Verified / Failed with safe retry and idempotency.

**Photo detail:** Large preview; original filename, source file date (not verified EXIF capture date), file size, vehicle, category, caption. Review shortlist is a private queue, not permission to publish. Download original without altering it.

**Unsorted:** Not an error. A first-class inbox for unidentified historical photos. Reassignment must preserve uploader/source/provenance, use audit log, and never duplicate the original.

**Shared device:** Each technician logs in independently; switching users closes old app session without clocking out attendance. No owner account on shared shop phones. No personal library sync.

**Content approval:** Only an authorized approver may approve customer/website/social use after confirming rights. One underlying media asset can have multiple uses/derivatives.

## Accessibility & resilience
- Mobile bottom navigation and thumb-friendly photo actions; desktop sidebar.
- Semantic buttons/headings, visible focus states, Escape-to-close dialogs, tab focus cycling, reduced-motion support.
- Empty state tells the user exactly how to start.
- Page navigation and search should preserve context and return focus predictably.
- For production: offline/interrupted uploads, storage quota, unsupported HEIC, bad MIME, huge video, expired sessions, lost auth and multi-device conflicts need explicit states and error recovery.
- Original capture time must come from verified EXIF/HEIC metadata or be labeled unknown; browser file modification date is only a source file date.

## Quality gates
1. Independent review on iPhone 13 Pro, second shop iPhone, iPad and shop PC; actual Safari camera and Photos permissions.
2. One real vehicle with historical originals; five new photos; each appears on authorized devices with complete original bytes and upload status.
3. Negative tests: technician cannot read other organizations, management/pay, or any disallowed media; sharing links cannot bypass RLS.
4. Retry, duplicate upload, abrupt app close, poor Wi-Fi, browser refresh, and object-store outage recovery.
5. Restore one object, one media record and one project from independent backups.
6. Validate no accidental public URL and no invoice/timeclock write triggered by photo capture.

## Testing evidence (v0.2 only)
- JS syntax checked with Node.
- Isolated Chromium DOM/interaction harness with mocked IndexedDB: initial 4 demo projects, project navigation, file import, category, caption, review queue, Unsorted, All Media, filename/caption search, JSON catalog download, phone navigation.
- Desktop/mobile screenshots generated and reviewed.
- Chromium in the test container blocked direct file/localhost navigation; **real IndexedDB persistence, native iOS camera and network are unverified**.
- Do not label this production ready.

## Next source change
Build a protected `/media` workflow in the existing SoCal Inspection App around a private multi-tenant media service. Avoid a second source of truth for vehicles/invoices. Await secure access to the actual app Supabase project before any live data or schema migration.
