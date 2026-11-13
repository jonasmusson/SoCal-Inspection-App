import {
  CheckinPhoto, Inspection, InspectionItem, InspectionPhoto,
  InspectionSection, InspectionVideo, ItemCondition, PriorityLevel,
} from '../../types';

interface InspectionReportProps {
  inspection: Inspection;
  sections: InspectionSection[];
  items: InspectionItem[];
  photos: InspectionPhoto[];
  videos: InspectionVideo[];
  checkinPhotos: CheckinPhoto[];
  overall: ItemCondition | null;
  guidance: string;
  managerNotes: string;
  executiveSummary: string;
  primaryRecommendation: string;
  laborRate?: number;
}

const INK = '#1d211d';
const PAPER = '#f6f2e8';
const BORDER = '#bbb29f';

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  needs_attention: { label: 'Needs Attention', color: '#b94838', bg: '#f9ece9' },
  monitor: { label: 'Monitor', color: '#b18431', bg: '#f7f0e1' },
  good: { label: 'Good', color: '#50755b', bg: '#edf3ee' },
  not_inspected: { label: 'Not Inspected', color: '#77776f', bg: '#f0efec' },
};

const PRIORITY_META: Record<PriorityLevel, { label: string; color: string }> = {
  immediate: { label: 'Immediate', color: '#ae493b' },
  short_term: { label: 'Short-Term', color: '#a67b2e' },
  long_term: { label: 'Long-Term', color: '#527260' },
  upgrade: { label: 'Optional', color: '#5e6176' },
};

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function priorityFor(item: InspectionItem, priorities?: Record<string, PriorityLevel>): PriorityLevel | null {
  if (priorities && priorities[item.id]) return priorities[item.id];
  if (item.priority) return item.priority;
  return null;
}

function photosForItem(photos: InspectionPhoto[], itemId: string): InspectionPhoto[] {
  return photos.filter(p => p.item_id === itemId);
}

function videosForItem(videos: InspectionVideo[], itemId: string): InspectionVideo[] {
  return videos.filter(v => v.item_id === itemId);
}

export function InspectionReport({
  inspection, sections, items, photos, videos, checkinPhotos,
  guidance, managerNotes, executiveSummary, primaryRecommendation,
  laborRate = 175,
  priorities,
}: InspectionReportProps & { priorities?: Record<string, PriorityLevel> }) {
  const needsAttention = items.filter(i => i.status === 'needs_attention');
  const monitor = items.filter(i => i.status === 'monitor');
  const good = items.filter(i => i.status === 'good');
  const notInspected = items.filter(i => i.status === 'not_inspected');
  const noStatus = items.filter(i => !i.status);

  const vehicleName = `${inspection.vehicle_year} ${inspection.vehicle_make} ${inspection.vehicle_model}`;
  const reportDate = new Date(inspection.completed_at || inspection.updated_at || inspection.created_at)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const reportNumber = inspection.id.slice(0, 8).toUpperCase();

  const immediateItems = [...needsAttention, ...monitor].filter(item =>
    priorityFor(item, priorities) === 'immediate'
  );
  const futureItems = [...needsAttention, ...monitor].filter(item => {
    const p = priorityFor(item, priorities);
    return p === 'short_term' || p === 'long_term' || p === 'upgrade';
  });
  const unprioritizedItems = [...needsAttention, ...monitor].filter(item => !priorityFor(item, priorities));

  function allowance(item: InspectionItem) {
    const low = (item.labor_hours_low ?? 0) * laborRate + (item.parts_cost_low ?? 0);
    const high = (item.labor_hours_high ?? item.labor_hours_low ?? 0) * laborRate + (item.parts_cost_high ?? item.parts_cost_low ?? 0);
    return low || high ? `${money(low)} – ${money(high)}` : '';
  }

  function renderItemFinding(item: InspectionItem, showPriority = true) {
    const section = sections.find(s => s.id === item.section_id);
    const itemPhotos = photosForItem(photos, item.id);
    const itemVideos = videosForItem(videos, item.id);
    const pr = priorityFor(item, priorities);
    const statusMeta = item.status ? STATUS_META[item.status] : null;
    const allow = allowance(item);

    return (
      <article data-report-finding key={item.id} className="border-t border-stone-300 pt-4 pb-6 first:border-t-0 first:pt-0">
        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{section?.section_name}</p>
            <h4 className="text-base font-bold text-stone-900 mt-0.5">{item.item_name}</h4>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 flex-shrink-0">
            {statusMeta && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded" style={{ color: statusMeta.color, backgroundColor: statusMeta.bg }}>
                {statusMeta.label}
              </span>
            )}
            {showPriority && pr && (
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide rounded text-white" style={{ backgroundColor: PRIORITY_META[pr].color }}>
                {PRIORITY_META[pr].label}
              </span>
            )}
          </div>
        </div>

        {item.notes && (
          <blockquote className="text-sm leading-6 text-stone-800 border-l-2 pl-3 mb-2" style={{ borderColor: statusMeta?.color || BORDER }}>
            {item.notes}
          </blockquote>
        )}

        {item.impact && (
          <p className="text-sm leading-6 text-stone-700 mb-1">
            <span className="font-bold text-stone-900">Why it matters: </span>{item.impact}
          </p>
        )}

        {item.recommended_action && (
          <p className="text-sm leading-6 text-stone-700 mb-2">
            <span className="font-bold text-stone-900">Recommendation: </span>{item.recommended_action}
          </p>
        )}

        {item.status === 'not_inspected' && item.not_inspected_reason && (
          <p className="text-sm leading-6 text-stone-600 italic mb-2">
            Reason: {item.not_inspected_reason}
          </p>
        )}

        {allow && (
          <p className="text-xs text-stone-500 mb-2">
            Planning allowance: <span className="font-semibold text-stone-700">{allow}</span>
          </p>
        )}

        {itemPhotos.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
            {itemPhotos.map(photo => (
              <figure key={photo.id} className="overflow-hidden rounded">
                <img src={photo.photo_url} alt={`${item.item_name} evidence`} className="w-full h-32 sm:h-36 object-cover" loading="lazy" />
                {photo.caption && <figcaption className="text-[10px] text-stone-500 mt-1">{photo.caption}</figcaption>}
              </figure>
            ))}
          </div>
        )}

        {itemVideos.length > 0 && (
          <div className="mt-3 space-y-2">
            {itemVideos.map(video => (
              <div key={video.id} className="rounded border border-stone-300 bg-stone-50 p-2">
                <video src={video.video_url} controls className="w-full rounded" preload="none" />
                {video.caption && <p className="text-[10px] text-stone-500 mt-1">{video.caption}</p>}
                <p className="text-[10px] text-stone-400 mt-1 print:hidden">Video evidence — playable in web view</p>
                <p className="hidden text-[10px] text-stone-500 print:block">Video evidence recorded. Visit the online report to view.</p>
              </div>
            ))}
          </div>
        )}
      </article>
    );
  }

  function renderSystemSection(section: InspectionSection) {
    const sectionItems = items.filter(item => item.section_id === section.id);
    if (sectionItems.length === 0) return null;

    const hasGood = sectionItems.some(i => i.status === 'good');
    const hasNotInspected = sectionItems.some(i => i.status === 'not_inspected' || !i.status);
    const problemCount = sectionItems.filter(i => i.status === 'needs_attention' || i.status === 'monitor').length;

    return (
      <section data-report-system key={section.id} className="mb-8">
        <div className="flex items-center justify-between mb-3 pb-2 border-b-2" style={{ borderColor: INK }}>
          <h3 className="text-base font-bold text-stone-900 uppercase tracking-wide">{section.section_name}</h3>
          <div className="flex gap-2 text-[10px] font-bold uppercase">
            {problemCount > 0 && <span style={{ color: STATUS_META.needs_attention.color }}>{problemCount} attention</span>}
            {hasGood && <span style={{ color: STATUS_META.good.color }}>passed</span>}
            {hasNotInspected && <span style={{ color: STATUS_META.not_inspected.color }}>not inspected</span>}
          </div>
        </div>

        {section.notes && <p className="text-sm text-stone-600 italic mb-3">{section.notes}</p>}

        <div className="space-y-0">
          {sectionItems.filter(i => i.status === 'needs_attention' || i.status === 'monitor').map(item => renderItemFinding(item))}

          {sectionItems.filter(i => i.status === 'good').length > 0 && (
            <div className="pt-4 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: STATUS_META.good.color }}>Passed Items</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {sectionItems.filter(i => i.status === 'good').map(item => {
                  const itemPhotos = photosForItem(photos, item.id);
                  const itemVideos = videosForItem(videos, item.id);
                  return (
                    <div key={item.id} className="flex items-start gap-1.5 py-0.5">
                      <span className="text-xs font-bold flex-shrink-0 mt-0.5" style={{ color: STATUS_META.good.color }}>✓</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-stone-700">{item.item_name}</span>
                        {item.notes && <p className="text-xs text-stone-500 italic">{item.notes}</p>}
                        {itemPhotos.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {itemPhotos.map(photo => (
                              <img key={photo.id} src={photo.photo_url} alt={item.item_name} className="h-14 w-14 object-cover rounded" loading="lazy" />
                            ))}
                          </div>
                        )}
                        {itemVideos.length > 0 && (
                          <p className="text-[10px] text-stone-400 mt-0.5">Video evidence available</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {sectionItems.filter(i => i.status === 'not_inspected' || !i.status).map(item => (
            <div key={item.id} className="flex items-start gap-2 py-1.5 border-t border-stone-200">
              <span className="text-xs font-bold flex-shrink-0 mt-0.5" style={{ color: STATUS_META.not_inspected.color }}>—</span>
              <div className="flex-1">
                <span className="text-sm text-stone-600">{item.item_name}</span>
                <span className="text-[10px] uppercase ml-2" style={{ color: STATUS_META.not_inspected.color }}>
                  {item.status === 'not_inspected' ? 'Not Inspected' : 'Not Yet Answered'}
                </span>
                {item.not_inspected_reason && <p className="text-xs text-stone-500 italic">{item.not_inspected_reason}</p>}
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="rounded-2xl bg-[#d9d5ca] p-2 shadow-inner sm:p-5">
      {/* Print button — hidden in print */}
      <div className="mx-auto mb-4 flex max-w-[860px] items-center justify-between gap-3 print:hidden">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[.22em] text-stone-600">Customer Report Preview</p>
          <p className="mt-1 text-xs text-stone-600">The customer-facing inspection story.</p>
        </div>
        <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-full bg-[#20241f] px-4 py-2.5 text-xs font-bold text-white">
          Print / Save PDF
        </button>
      </div>

      <article className="printable-report mx-auto max-w-[860px] overflow-hidden rounded-sm text-[#282923] shadow-2xl" style={{ backgroundColor: PAPER }}>

        {/* ── A. VEHICLE / INSPECTION OVERVIEW ── */}
        <header data-report-cover className="px-6 py-6 sm:px-10 sm:py-8 border-b-2" style={{ borderColor: INK }}>
          <div className="flex items-center justify-between mb-5 pb-3 border-b" style={{ borderColor: BORDER }}>
            <img src="/image.png" alt="SoCal Autoworks" className="h-9 w-auto object-contain sm:h-10" />
            <div className="text-right text-[9px] font-bold uppercase tracking-wider text-stone-500">
              <p>Vehicle Condition Report</p>
              <p className="mt-0.5">Report #{reportNumber}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <h1 className="text-2xl font-black leading-tight text-stone-900 sm:text-3xl">{vehicleName}</h1>
              {inspection.vehicle_color && <p className="text-sm text-stone-600 mt-1">Color: {inspection.vehicle_color}</p>}
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Customer</p><p className="font-semibold text-stone-800">{inspection.customer_first_name} {inspection.customer_last_name}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Date</p><p className="font-semibold text-stone-800">{reportDate}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">Mileage</p><p className="font-semibold text-stone-800">{inspection.vehicle_mileage ? `${inspection.vehicle_mileage.toLocaleString()} mi` : 'Not recorded'}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-stone-500">VIN</p><p className="font-semibold text-stone-800 text-xs break-all">{inspection.vehicle_vin || 'Not recorded'}</p></div>
            </div>
          </div>

          {/* Summary counts */}
          <div className="grid grid-cols-4 border-y" style={{ borderColor: BORDER }}>
            {([
              ['Immediate', immediateItems.length, STATUS_META.needs_attention.color],
              ['Future', futureItems.length, STATUS_META.monitor.color],
              ['Good', good.length, STATUS_META.good.color],
              ['Not Inspected', notInspected.length + noStatus.length, STATUS_META.not_inspected.color],
            ] as const).map(([label, count, color], i) => (
              <div key={label} className={`px-3 py-3 text-center ${i < 3 ? 'border-r' : ''}`} style={{ borderColor: BORDER }}>
                <p className="text-2xl font-black" style={{ color }}>{count}</p>
                <p className="text-[9px] font-bold uppercase tracking-wider text-stone-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {executiveSummary && (
            <div className="mt-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Executive Summary</p>
              <p className="text-sm leading-6 text-stone-700">{executiveSummary}</p>
            </div>
          )}

          {primaryRecommendation && (
            <div className="mt-4 p-4 rounded text-white" style={{ backgroundColor: INK }}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#d1ad67' }}>Recommended Next Step</p>
              <p className="text-sm leading-6">{primaryRecommendation}</p>
            </div>
          )}

          {managerNotes && (
            <div className="mt-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-1">Notes from Our Team</p>
              <p className="text-sm leading-6 text-stone-600">{managerNotes}</p>
            </div>
          )}
        </header>

        <main className="px-6 py-6 sm:px-10 sm:py-8">
          {/* ── B. IMMEDIATE ATTENTION ── */}
          {immediateItems.length > 0 && (
            <section data-report-card className="mb-8">
              <h2 className="text-lg font-black text-stone-900 uppercase tracking-wide mb-1 pb-2 border-b-2" style={{ borderColor: STATUS_META.needs_attention.color }}>
                Immediate Attention
              </h2>
              <p className="text-xs text-stone-500 mb-4">Items requiring attention now — safety, reliability, and damage prevention.</p>
              <div className="space-y-0">
                {immediateItems.map(item => renderItemFinding(item, false))}
              </div>
            </section>
          )}

          {/* ── C. FUTURE ATTENTION ── */}
          {futureItems.length > 0 && (
            <section data-report-card className="mb-8">
              <h2 className="text-lg font-black text-stone-900 uppercase tracking-wide mb-1 pb-2 border-b-2" style={{ borderColor: STATUS_META.monitor.color }}>
                Future Attention
              </h2>
              <p className="text-xs text-stone-500 mb-4">Items to plan for — not urgent today, but should be addressed in time.</p>
              <div className="space-y-0">
                {futureItems.map(item => renderItemFinding(item, false))}
              </div>
            </section>
          )}

          {/* Unprioritized attention items */}
          {unprioritizedItems.length > 0 && (
            <section data-report-card className="mb-8">
              <h2 className="text-lg font-black text-stone-900 uppercase tracking-wide mb-1 pb-2 border-b-2" style={{ borderColor: BORDER }}>
                Items Requiring Attention
              </h2>
              <p className="text-xs text-stone-500 mb-4">The following items need attention. Priority has not yet been assigned.</p>
              <div className="space-y-0">
                {unprioritizedItems.map(item => renderItemFinding(item, false))}
              </div>
            </section>
          )}

          {/* ── D. INSPECTION BY SYSTEM ── */}
          <section data-report-card className="mb-8">
            <h2 className="text-lg font-black text-stone-900 uppercase tracking-wide mb-1 pb-2 border-b-2" style={{ borderColor: INK }}>
              Complete Inspection by System
            </h2>
            <p className="text-xs text-stone-500 mb-4">Every inspected item, organized by vehicle system.</p>
            {sections.map(section => renderSystemSection(section))}
          </section>

          {/* ── E. GOOD / SATISFACTORY SUMMARY ── */}
          {good.length > 0 && (
            <section data-report-card className="mb-8">
              <h2 className="text-lg font-black uppercase tracking-wide mb-1 pb-2 border-b-2" style={{ color: STATUS_META.good.color, borderColor: STATUS_META.good.color }}>
                Satisfactory Items ({good.length})
              </h2>
              <p className="text-xs text-stone-500 mb-3">Items that passed inspection. Photos and notes shown where recorded.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {good.map(item => {
                  const section = sections.find(s => s.id === item.section_id);
                  const itemPhotos = photosForItem(photos, item.id);
                  return (
                    <div key={item.id} className="flex items-start gap-1.5 py-0.5">
                      <span className="text-xs font-bold flex-shrink-0 mt-0.5" style={{ color: STATUS_META.good.color }}>✓</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-stone-700">{item.item_name}</span>
                        <span className="text-[10px] text-stone-400 ml-1">{section?.section_name}</span>
                        {item.notes && <p className="text-xs text-stone-500 italic">{item.notes}</p>}
                        {itemPhotos.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {itemPhotos.map(photo => (
                              <img key={photo.id} src={photo.photo_url} alt={item.item_name} className="h-14 w-14 object-cover rounded" loading="lazy" />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── F. NOT INSPECTED / UNABLE TO VERIFY ── */}
          {(notInspected.length > 0 || noStatus.length > 0) && (
            <section data-report-card className="mb-8">
              <h2 className="text-lg font-black uppercase tracking-wide mb-1 pb-2 border-b-2" style={{ color: STATUS_META.not_inspected.color, borderColor: STATUS_META.not_inspected.color }}>
                Not Inspected / Unable to Verify
              </h2>
              <p className="text-xs text-stone-500 mb-3">These items were not evaluated. Reasons are shown where recorded.</p>
              <div className="space-y-1">
                {notInspected.map(item => {
                  const section = sections.find(s => s.id === item.section_id);
                  return (
                    <div key={item.id} className="flex items-start gap-2 py-1.5 border-b border-stone-200">
                      <span className="text-xs font-bold flex-shrink-0 mt-0.5" style={{ color: STATUS_META.not_inspected.color }}>—</span>
                      <div className="flex-1">
                        <span className="text-sm text-stone-700">{item.item_name}</span>
                        <span className="text-[10px] text-stone-400 ml-1">{section?.section_name}</span>
                        {item.not_inspected_reason && <p className="text-xs text-stone-500 italic mt-0.5">{item.not_inspected_reason}</p>}
                      </div>
                    </div>
                  );
                })}
                {noStatus.map(item => {
                  const section = sections.find(s => s.id === item.section_id);
                  return (
                    <div key={item.id} className="flex items-start gap-2 py-1.5 border-b border-stone-200">
                      <span className="text-xs font-bold flex-shrink-0 mt-0.5 text-stone-400">?</span>
                      <div className="flex-1">
                        <span className="text-sm text-stone-600">{item.item_name}</span>
                        <span className="text-[10px] text-stone-400 ml-1">{section?.section_name}</span>
                        <p className="text-xs text-stone-400 italic mt-0.5">No inspection result recorded</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── CHECK-IN PHOTOS ── */}
          {checkinPhotos.length > 0 && (
            <section data-report-card className="mb-8">
              <h2 className="text-lg font-black uppercase tracking-wide mb-1 pb-2 border-b-2" style={{ borderColor: BORDER }}>
                Vehicle Check-In Photos
              </h2>
              <p className="text-xs text-stone-500 mb-3">Photographs taken when the vehicle arrived, before inspection.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {checkinPhotos.map(photo => (
                  <figure key={photo.id} className="overflow-hidden rounded">
                    <img src={photo.photo_url} alt="Vehicle check-in photo" className="w-full h-32 sm:h-36 object-cover" loading="lazy" />
                  </figure>
                ))}
              </div>
            </section>
          )}
        </main>

        {/* ── FOOTER ── */}
        <footer className="px-6 py-6 sm:px-10" style={{ backgroundColor: PAPER, borderTop: `1px solid ${BORDER}` }}>
          <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b" style={{ borderColor: BORDER }}>
            <img src="/image.png" alt="SoCal Autoworks" className="h-8 w-auto" />
            <p className="max-w-sm text-right text-[10px] leading-5 text-stone-500">
              This inspection documents visible and testable conditions at the time performed. It is not a warranty, appraisal, or authorization for repairs.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-3 text-[9px] font-bold uppercase tracking-wider text-stone-500">
            <span>socalautowork.com</span>
            <span>Hawthorne · California</span>
            <span>Report {reportNumber}</span>
          </div>
          {guidance && <p className="mt-3 text-[9px] text-stone-400">Planning classification: {guidance}</p>}
        </footer>
      </article>
    </div>
  );
}
