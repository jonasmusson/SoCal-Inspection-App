import {
  ArrowRight, Printer, Sparkles,
} from 'lucide-react';
import {
  CheckinPhoto, Inspection, InspectionItem, InspectionPhoto,
  InspectionSection, ItemCondition, PriorityLevel,
} from '../../types';
import {
  findIllustrationFocusZone, findReportVehicleIllustration, ReportVehicleIllustration,
} from '../../data/reportVehicleIllustrations';

interface PremiumInspectionReportProps {
  inspection: Inspection;
  sections: InspectionSection[];
  needsAttention: InspectionItem[];
  monitor: InspectionItem[];
  good: InspectionItem[];
  notInspected: InspectionItem[];
  photos: InspectionPhoto[];
  checkinPhotos: CheckinPhoto[];
  priorities: Record<string, PriorityLevel>;
  overall: ItemCondition | null;
  guidance: string;
  managerNotes: string;
  executiveSummary: string;
  primaryRecommendation: string;
  colorMeta?: { hex: string };
  laborRate?: number;
}

const PRIORITY_META: Record<PriorityLevel, { label: string; eyebrow: string; className: string; dot: string }> = {
  immediate: { label: 'Immediate', eyebrow: 'Address now', className: 'bg-red-50 text-red-800 border-red-200', dot: 'bg-red-500' },
  short_term: { label: 'Short-Term', eyebrow: 'Plan next', className: 'bg-amber-50 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  long_term: { label: 'Long-Term', eyebrow: 'Future planning', className: 'bg-blue-50 text-blue-800 border-blue-200', dot: 'bg-blue-500' },
  upgrade: { label: 'Upgrade', eyebrow: 'Opportunity', className: 'bg-purple-50 text-purple-800 border-purple-200', dot: 'bg-purple-500' },
};

const GUIDANCE_LABELS: Record<string, string> = {
  minor: 'Minor Investment — routine maintenance and lower-priority items',
  moderate: 'Moderate Investment — several items deserve timely attention',
  significant: 'Significant Investment — major repairs or safety concerns identified',
  prioritized: 'Prioritized Repairs — critical work should be addressed in a clear sequence',
};

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

type ReportSystemStatus = 'attention' | 'monitor' | 'good' | 'not_inspected';

const SYSTEM_ACCENT: Record<ReportSystemStatus, string> = {
  attention: '#dc5a4b',
  monitor: '#d6a63c',
  good: '#4f8a67',
  not_inspected: '#8a8b84',
};

function PremiumCutawayArtwork({ illustration, focus, accent = '#b7954f' }: { illustration: ReportVehicleIllustration; focus?: string; accent?: string }) {
  const zone = focus ? findIllustrationFocusZone(illustration, focus) : null;
  return <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#f4f0e5]">
    <img src={illustration.src} alt={illustration.alt} className="h-full w-full object-contain" />
    {focus && zone && <>
      <div className="absolute rounded-[45%] border-2 shadow-[0_0_0_999px_rgba(26,31,26,.28)]" style={{ ...zone, borderColor: accent, boxShadow: `0 0 0 999px rgba(26,31,26,.28), 0 0 28px ${accent}66` }} />
      <span className="absolute left-4 top-4 rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[.17em] text-white shadow-lg" style={{ backgroundColor: accent }}>{focus}</span>
    </>}
  </div>;
}

function SystemIllustration({ illustration, name, status }: { illustration?: ReportVehicleIllustration; name: string; status: ReportSystemStatus }) {
  if (!illustration) return <div className="flex h-full w-full items-end rounded-2xl border border-white/10 bg-gradient-to-br from-[#293028] to-[#151915] p-6"><div><p className="text-[9px] font-black uppercase tracking-[.2em] text-[#d3b56d]">Vehicle-specific artwork coming soon</p><p className="mt-2 text-2xl font-black text-white">{name}</p></div></div>;
  return <PremiumCutawayArtwork illustration={illustration} focus={name} accent={SYSTEM_ACCENT[status]} />;
}

export function PremiumInspectionReport({
  inspection, sections, needsAttention, monitor, good, notInspected, photos,
  checkinPhotos, priorities, overall, guidance, managerNotes, executiveSummary,
  primaryRecommendation, colorMeta,
  laborRate = 175,
}: PremiumInspectionReportProps) {
  const inspectedCount = good.length + monitor.length + needsAttention.length;
  const totalCount = inspectedCount + notInspected.length;
  const score = inspectedCount ? Math.round(((good.length + monitor.length * .5) / inspectedCount) * 100) : 0;
  const rangedItems = [...needsAttention, ...monitor].filter(item =>
    item.labor_hours_low != null || item.labor_hours_high != null ||
    item.parts_cost_low != null || item.parts_cost_high != null
  );
  const totalLaborLow = rangedItems.reduce((sum, item) => sum + (item.labor_hours_low ?? 0), 0);
  const totalLaborHigh = rangedItems.reduce((sum, item) => sum + (item.labor_hours_high ?? item.labor_hours_low ?? 0), 0);
  const totalPartsLow = rangedItems.reduce((sum, item) => sum + (item.parts_cost_low ?? 0), 0);
  const totalPartsHigh = rangedItems.reduce((sum, item) => sum + (item.parts_cost_high ?? item.parts_cost_low ?? 0), 0);
  const totalLaborCostLow = totalLaborLow * laborRate;
  const totalLaborCostHigh = totalLaborHigh * laborRate;
  const planningTotalLow = totalLaborCostLow + totalPartsLow;
  const planningTotalHigh = totalLaborCostHigh + totalPartsHigh;
  const vehicleName = `${inspection.vehicle_year} ${inspection.vehicle_make} ${inspection.vehicle_model}`;
  const vehicleIllustration = findReportVehicleIllustration(inspection.vehicle_year, inspection.vehicle_make, inspection.vehicle_model);
  const reportDate = new Date(inspection.completed_at || inspection.updated_at || inspection.created_at)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const heroPhoto = checkinPhotos[0]?.photo_url;
  const vehicleColor = colorMeta?.hex || '#b7954f';
  const overallLabel = overall === 'needs_attention' ? 'Needs Attention' : overall === 'monitor' ? 'Monitor' : overall === 'good' ? 'All Good' : 'Assessment Pending';

  const sectionRows = sections.map(section => {
    const sectionItems = [...good, ...monitor, ...needsAttention, ...notInspected]
      .filter(item => item.section_id === section.id);
    const attention = sectionItems.filter(item => item.status === 'needs_attention').length;
    const watching = sectionItems.filter(item => item.status === 'monitor').length;
    const passed = sectionItems.filter(item => item.status === 'good').length;
    const skipped = sectionItems.filter(item => item.status === 'not_inspected').length;
    const status = attention ? 'attention' : watching ? 'monitor' : passed ? 'good' : 'not_inspected';
    const highlightedItems = sectionItems.filter(item => item.status === 'needs_attention' || item.status === 'monitor');
    return { section, attention, watching, passed, skipped, total: sectionItems.length, status, highlightedItems, sectionItems };
  });

  function allowance(item: InspectionItem) {
    const labor = item.labor_hours_low == null ? '' : `${item.labor_hours_low}–${item.labor_hours_high ?? item.labor_hours_low} hrs`;
    const parts = item.parts_cost_low == null ? '' : `${money(item.parts_cost_low)}–${money(item.parts_cost_high ?? item.parts_cost_low)} parts`;
    return [labor, parts].filter(Boolean).join(' · ');
  }

  const summaryCards = [
    { label: 'Good', value: good.length, tone: 'bg-emerald-50 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500' },
    { label: 'Monitor', value: monitor.length, tone: 'bg-amber-50 text-amber-800 border-amber-200', bar: 'bg-amber-500' },
    { label: 'Attention', value: needsAttention.length, tone: 'bg-red-50 text-red-800 border-red-200', bar: 'bg-red-500' },
    { label: 'Not inspected', value: notInspected.length, tone: 'bg-stone-100 text-stone-700 border-stone-200', bar: 'bg-stone-400' },
  ];
  const roadmapGroups = (['immediate', 'short_term', 'long_term', 'upgrade'] as PriorityLevel[]).map(priority => ({
    priority,
    meta: PRIORITY_META[priority],
    items: [...needsAttention, ...monitor].filter(item => (priorities[item.id] || item.priority || 'short_term') === priority),
  }));

  return (
    <div className="rounded-2xl bg-[#dcd8cc] p-2 sm:p-5 shadow-inner">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1 print:hidden">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-stone-600">Customer report preview</p>
          <p className="mt-1 text-xs text-stone-600">This is the presentation your customer receives.</p>
        </div>
        <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-full bg-[#252b24] px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#343d32]">
          <Printer className="h-4 w-4" /> Print / Save PDF
        </button>
      </div>

      <article className="printable-report mx-auto max-w-[900px] overflow-hidden rounded-[22px] bg-[#f7f5ef] text-stone-900 shadow-2xl">
        <section data-report-cover className="relative min-h-[520px] overflow-hidden bg-[#20251f] text-white">
          {heroPhoto && <img src={heroPhoto} alt={vehicleName} className="absolute inset-0 h-full w-full object-cover opacity-20" />}
          <div className="absolute inset-0 bg-gradient-to-b from-[#11150f]/75 via-[#20251f]/72 to-[#171b16]" />
          <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#171b16] via-[#171b16]/85 to-transparent" />
          {vehicleIllustration && <div className="pointer-events-none absolute left-1/2 top-20 h-60 w-[82%] max-w-3xl -translate-x-1/2 overflow-hidden rounded-2xl border border-[#d3b56d]/40 bg-[#f4f0e5] shadow-2xl">
            <PremiumCutawayArtwork illustration={vehicleIllustration} accent={vehicleColor} />
          </div>}
          <div className="relative z-10 flex min-h-[520px] flex-col px-6 py-7 sm:px-10 sm:py-9">
            <div className="flex items-start justify-between gap-4 border-b border-white/20 pb-5">
              <span className="inline-flex rounded-md bg-white px-2.5 py-1.5 shadow-sm">
                <img src="/image.png" alt="SoCal Autoworks" className="h-8 w-auto object-contain" />
              </span>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-[.24em] text-[#d3b56d]">Comprehensive Inspection</p>
                <p className="mt-1 text-xs text-white/60">Report {inspection.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            <div className="mt-auto max-w-3xl">
              <div className="mb-4 flex items-center gap-2 text-[#d3b56d]">
                <Sparkles className="h-4 w-4" />
                <span className="text-[11px] font-bold uppercase tracking-[.2em]">The complete story of your vehicle</span>
              </div>
              <h1 className="text-4xl font-black leading-[.95] tracking-tight sm:text-6xl">{vehicleName}</h1>
              <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/20 pt-5 text-sm sm:grid-cols-4">
                <div><p className="text-[9px] uppercase tracking-widest text-white/45">Mileage</p><p className="mt-1 font-semibold">{inspection.vehicle_mileage ? `${inspection.vehicle_mileage.toLocaleString()} miles` : 'Not recorded'}</p></div>
                <div><p className="text-[9px] uppercase tracking-widest text-white/45">Color</p><p className="mt-1 flex items-center gap-2 font-semibold"><span className="h-3 w-3 rounded-full border border-white/30" style={{ backgroundColor: vehicleColor }} />{inspection.vehicle_color || 'Not recorded'}</p></div>
                <div><p className="text-[9px] uppercase tracking-widest text-white/45">Prepared for</p><p className="mt-1 font-semibold">{inspection.customer_first_name} {inspection.customer_last_name}</p></div>
                <div><p className="text-[9px] uppercase tracking-widest text-white/45">Inspection date</p><p className="mt-1 font-semibold">{reportDate}</p></div>
              </div>
            </div>
          </div>
        </section>

        <div className="space-y-10 px-5 py-8 sm:px-10 sm:py-12">
          <section data-report-card className="grid gap-6 lg:grid-cols-[1.35fr_.65fr]">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[.24em] text-[#9b7a38]">01 · At a glance</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-[#252b24]">A clear picture, before the first repair.</h2>
              <p className="mt-4 text-sm leading-7 text-stone-600">Our Comprehensive Inspection is a hands-on evaluation of the vehicle's condition, operation, safety and suitability for your goals. This report turns those hours in the shop into a practical plan you can understand and act on.</p>
            </div>
            <div className="relative flex min-h-48 items-center justify-center rounded-2xl bg-[#252b24] p-6 text-white">
              <div className="absolute inset-3 rounded-xl border border-white/10" />
              <div className="relative text-center">
                <p className="text-6xl font-black">{score}</p>
                <p className="text-[10px] font-bold uppercase tracking-[.22em] text-white/55">Condition index</p>
                <p className="mt-2 inline-flex rounded-full border border-[#d3b56d]/40 bg-[#d3b56d]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#d3b56d]">{overallLabel}</p>
                <p className="mt-3 text-xs text-white/60">{inspectedCount} items · {sections.length} systems</p>
              </div>
            </div>
          </section>

          <section data-report-card>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {summaryCards.map(card => <div key={card.label} className={`relative overflow-hidden rounded-2xl border p-4 ${card.tone}`}>
                <div className={`absolute inset-x-0 top-0 h-1 ${card.bar}`} />
                <p className="mt-3 text-3xl font-black">{card.value}</p>
                <p className="mt-1 text-[10px] font-bold uppercase tracking-widest">{card.label}</p>
              </div>)}
            </div>
            <p className="mt-3 text-center text-xs text-stone-500">{totalCount} total inspection points documented</p>
          </section>

          {(executiveSummary || primaryRecommendation) && <section data-report-card className="overflow-hidden rounded-2xl border border-[#d8d1bd] bg-white shadow-sm">
            <div className="grid lg:grid-cols-[1.3fr_.7fr]">
              {executiveSummary && <div className="p-6 sm:p-8">
                <p className="text-[10px] font-black uppercase tracking-[.22em] text-[#9b7a38]">Our assessment</p>
                <p className="mt-3 text-base leading-7 text-stone-700">{executiveSummary}</p>
              </div>}
              {primaryRecommendation && <div className="bg-[#30382e] p-6 text-white sm:p-8">
                <p className="text-[10px] font-black uppercase tracking-[.22em] text-[#d3b56d]">Recommended next step</p>
                <p className="mt-3 text-sm leading-6 text-white/85">{primaryRecommendation}</p>
                <ArrowRight className="mt-5 h-5 w-5 text-[#d3b56d]" />
              </div>}
            </div>
          </section>}

          <section data-report-card className="overflow-hidden rounded-[28px] bg-[#1d231e] text-white shadow-xl">
            <div className="grid gap-5 px-6 pt-7 sm:px-9 lg:grid-cols-[.7fr_1.3fr] lg:items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.24em] text-[#d3b56d]">02 · The complete vehicle</p>
                <h2 className="mt-2 text-3xl font-black tracking-tight">One vehicle.<br />Every system connected.</h2>
                <p className="mt-4 text-sm leading-7 text-white/65">We inspect the car as a complete mechanical story—not a collection of unrelated checkboxes. Each chapter below follows the same path our technician takes through the vehicle.</p>
                <div className="mt-5 flex flex-wrap gap-3 text-[9px] font-bold uppercase tracking-wider text-white/65">
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" />Good</span>
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-500" />Monitor</span>
                  <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-red-500" />Attention</span>
                </div>
              </div>
              <div className="min-h-[290px] p-4">{vehicleIllustration ? <PremiumCutawayArtwork illustration={vehicleIllustration} accent={vehicleColor} /> : heroPhoto ? <img src={heroPhoto} alt={vehicleName} className="h-full min-h-[260px] w-full rounded-2xl object-cover" /> : <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-white/10 bg-white/5 px-8 text-center text-xs font-bold uppercase tracking-[.18em] text-white/35">Vehicle-specific illustration not yet available</div>}</div>
            </div>
            <div className="grid grid-cols-5 border-t border-white/10 bg-black/15 px-5 py-4 text-center text-[8px] font-bold uppercase tracking-widest text-[#d3b56d] sm:text-[9px]">
              <span>Structure</span><span>Power</span><span>Control</span><span>Safety</span><span>Road</span>
            </div>
          </section>

          <section>
            <div className="max-w-2xl">
              <p className="text-[10px] font-black uppercase tracking-[.24em] text-[#9b7a38]">03 · System-by-system</p>
              <h2 className="mt-2 text-3xl font-black tracking-tight text-[#252b24]">Follow the inspection from front to back.</h2>
              <p className="mt-3 text-sm leading-7 text-stone-600">Every illustrated chapter matches a section completed in the app, so the findings stay easy to understand and easy to discuss.</p>
            </div>
            <div className="mt-7 space-y-6">
              {sectionRows.map(({ section, attention, watching, passed, skipped, total, status, highlightedItems, sectionItems }, index) => {
                const accent = SYSTEM_ACCENT[status as ReportSystemStatus];
                const statusLabel = status === 'attention' ? 'Needs attention' : status === 'monitor' ? 'Monitor' : status === 'good' ? 'All good' : 'Not inspected';
                const relatedPhotos = photos.filter(photo => sectionItems.some(item => item.id === photo.item_id)).slice(0, 3);
                return <article data-report-card data-report-system key={section.id} className="overflow-hidden rounded-[26px] border border-stone-200 bg-white shadow-[0_16px_45px_rgba(50,45,35,.08)]">
                  <div className="grid min-h-[300px] lg:grid-cols-[.44fr_.56fr]">
                    <div className={`relative flex min-h-[270px] items-center justify-center overflow-hidden bg-[#20261f] p-8 ${index % 2 ? 'lg:order-2' : ''}`}>
                      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)', backgroundSize: '34px 34px' }} />
                      <div className="absolute left-5 top-5 flex items-center gap-3"><span className="text-4xl font-black text-white/10">{String(index + 1).padStart(2, '0')}</span><span className="h-px w-12 bg-white/20" /></div>
                      <div className="relative h-56 w-full max-w-lg opacity-95"><SystemIllustration illustration={vehicleIllustration} name={section.section_name} status={status as ReportSystemStatus} /></div>
                      <span className="absolute bottom-5 left-5 rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[.14em]" style={{ color: accent, borderColor: `${accent}66`, backgroundColor: `${accent}18` }}>{statusLabel}</span>
                      <span className="absolute bottom-6 right-5 text-[9px] font-bold uppercase tracking-widest text-white/30">SoCal inspection chapter</span>
                    </div>
                    <div className={`flex flex-col p-6 sm:p-8 ${index % 2 ? 'lg:order-1' : ''}`}>
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div><p className="text-[9px] font-black uppercase tracking-[.22em] text-[#9b7a38]">Chapter {String(index + 1).padStart(2, '0')} · Inspection system</p><h3 className="mt-2 text-3xl font-black leading-none tracking-tight text-[#252b24]">{section.section_name}</h3></div>
                        <div className="rounded-xl bg-stone-50 px-4 py-3 text-center"><p className="text-2xl font-black" style={{ color: accent }}>{passed}/{total}</p><p className="text-[8px] font-bold uppercase tracking-widest text-stone-400">Checks clear</p></div>
                      </div>
                      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full" style={{ width: `${total ? Math.max(8, Math.round(((passed + watching + attention) / total) * 100)) : 0}%`, backgroundColor: accent }} /></div>
                      <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">{total} checks completed · {passed} good{watching ? ` · ${watching} monitor` : ''}{attention ? ` · ${attention} attention` : ''}{skipped ? ` · ${skipped} not inspected` : ''}</p>

                      {highlightedItems.length > 0 ? <div className="mt-5 space-y-3">{highlightedItems.slice(0, 3).map(item => <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: accent }}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-stone-800">{item.item_name}</p><span className="text-[8px] font-black uppercase tracking-wider" style={{ color: accent }}>{item.status === 'needs_attention' ? 'Needs attention' : 'Monitor'}</span></div>{item.notes && <p className="mt-1 text-xs leading-5 text-stone-600">{item.notes}</p>}{item.recommended_action && <p className="mt-1 text-[10px] font-semibold leading-4 text-stone-500"><span className="uppercase tracking-wider text-[#8a6b30]">Next step:</span> {item.recommended_action}</p>}</div>)}</div> : <div className="mt-5 rounded-xl bg-emerald-50 p-4"><div className="flex items-center gap-2 text-sm font-black text-emerald-800"><span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />No concerns identified</div><p className="mt-1 text-xs leading-5 text-emerald-900/65">All inspected points in this system performed or presented satisfactorily at the time of inspection.</p></div>}

                      <div className="mt-auto pt-5"><p className="text-[8px] font-black uppercase tracking-[.18em] text-stone-400">Inspection coverage</p><p className="mt-1 text-[10px] leading-5 text-stone-500">{sectionItems.slice(0, 6).map(item => item.item_name).join(' · ')}{sectionItems.length > 6 ? ` · +${sectionItems.length - 6} more` : ''}</p></div>
                    </div>
                  </div>
                  {relatedPhotos.length > 0 && <div className="grid grid-cols-3 gap-1 border-t border-white bg-stone-100 p-1">{relatedPhotos.map(photo => <img key={photo.id} src={photo.photo_url} alt={`${section.section_name} evidence`} className="h-36 w-full object-cover" />)}</div>}
                </article>;
              })}
            </div>
          </section>

          {rangedItems.length > 0 && <section data-report-card className="overflow-hidden rounded-[26px] bg-[#e8e1ce]">
            <div className="grid gap-6 p-6 sm:grid-cols-[.8fr_1.2fr] sm:p-8">
              <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-[#8a6b30]">04 · Planning snapshot</p><h2 className="mt-2 text-3xl font-black leading-tight text-[#252b24]">Understand the scale before choosing the sequence.</h2><p className="mt-3 text-xs leading-5 text-stone-600">Built from the technician's preliminary labor and parts allowances.</p></div>
              <div className="rounded-2xl bg-[#252b24] p-5 text-white shadow-lg"><p className="text-[9px] font-black uppercase tracking-[.2em] text-[#d3b56d]">Preliminary project range</p><p className="mt-2 text-3xl font-black">{money(planningTotalLow)}–{money(planningTotalHigh)}</p><p className="mt-2 text-[10px] leading-4 text-white/50">Planning guidance only · not an estimate or authorization</p></div>
            </div>
            <div className="grid border-t border-[#cfc4a8] sm:grid-cols-3">
              <div className="border-b border-[#cfc4a8] p-5 sm:border-b-0 sm:border-r"><p className="text-[9px] font-black uppercase tracking-widest text-[#8a6b30]">Labor time</p><p className="mt-2 text-lg font-black">{totalLaborLow}–{totalLaborHigh} hours</p></div>
              <div className="border-b border-[#cfc4a8] p-5 sm:border-b-0 sm:border-r"><p className="text-[9px] font-black uppercase tracking-widest text-[#8a6b30]">Labor planning</p><p className="mt-2 text-lg font-black">{money(totalLaborCostLow)}–{money(totalLaborCostHigh)}</p></div>
              <div className="p-5"><p className="text-[9px] font-black uppercase tracking-widest text-[#8a6b30]">Parts planning</p><p className="mt-2 text-lg font-black">{money(totalPartsLow)}–{money(totalPartsHigh)}</p></div>
            </div>
            <p className="border-t border-[#cfc4a8] px-6 py-4 text-[10px] leading-5 text-stone-600 sm:px-8">Labor planning uses the current shop rate of {money(laborRate)} per hour. Final pricing may change after disassembly, diagnosis, parts selection and availability. No work is authorized by this report.</p>
          </section>}

          {(needsAttention.length > 0 || monitor.length > 0) && <section data-report-card className="overflow-hidden rounded-[28px] border border-[#d8d1bd] bg-white shadow-lg">
            <div className="grid bg-[#252b24] text-white lg:grid-cols-[.72fr_1.28fr]">
              <div className="p-7 sm:p-9">
                <p className="text-[10px] font-black uppercase tracking-[.24em] text-[#d3b56d]">05 · Your repair roadmap</p>
                <h2 className="mt-3 text-3xl font-black leading-tight">A clear plan turns a large project into confident decisions.</h2>
                <p className="mt-4 text-sm leading-7 text-white/65">The goal is not to approve everything at once. It is to understand what protects the vehicle now, what should follow, and what can wait.</p>
              </div>
              <div className="grid grid-cols-2 border-l border-white/10">
                {roadmapGroups.map(({ priority, meta, items }) => <div key={priority} className="border-b border-r border-white/10 p-5 sm:p-6">
                  <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} /><p className="text-[9px] font-black uppercase tracking-[.18em] text-white/55">{meta.eyebrow}</p></div>
                  <p className="mt-2 text-xl font-black">{items.length}</p><p className="text-xs font-bold text-white/85">{meta.label}</p>
                  <p className="mt-2 text-[10px] leading-4 text-white/45">{items.length ? items.slice(0, 2).map(item => item.item_name).join(' · ') : 'No items in this phase'}</p>
                </div>)}
              </div>
            </div>
            <div className="grid gap-4 bg-[#f2eee3] p-6 sm:grid-cols-3 sm:p-8">
              <div><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#8a6b30]">First decision</p><p className="mt-2 text-sm font-bold leading-6 text-stone-800">Begin with safety, reliability, and anything that could create additional damage.</p></div>
              <div><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#8a6b30]">Then protect value</p><p className="mt-2 text-sm font-bold leading-6 text-stone-800">Sequence corrective work so repairs are not duplicated or undone later.</p></div>
              <div><p className="text-[9px] font-black uppercase tracking-[.18em] text-[#8a6b30]">Build with purpose</p><p className="mt-2 text-sm font-bold leading-6 text-stone-800">Plan upgrades around how you want to drive, use, and enjoy the vehicle.</p></div>
            </div>
          </section>}

          {needsAttention.length > 0 && <section>
            <p className="text-[10px] font-black uppercase tracking-[.24em] text-[#9b7a38]">06 · Findings</p>
            <h2 className="mt-2 text-2xl font-black text-[#252b24]">What needs attention—and why.</h2>
            <div className="mt-5 space-y-5">
              {needsAttention.map((item, index) => {
                const section = sections.find(s => s.id === item.section_id);
                const itemPhotos = photos.filter(p => p.item_id === item.id).slice(0, 4);
                const priority = priorities[item.id] || item.priority || 'short_term';
                const meta = PRIORITY_META[priority];
                return <article data-report-card key={item.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
                  <div className="grid lg:grid-cols-[.8fr_1.2fr]">
                    <div className="relative min-h-56 bg-[#262d25]">
                      {itemPhotos[0] ? <img src={itemPhotos[0].photo_url} alt={item.item_name} className="absolute inset-0 h-full w-full object-cover" /> : <div className="flex h-full min-h-56 items-center justify-center px-8 text-center text-[10px] font-black uppercase tracking-[.2em] text-white/25">Evidence photo not captured</div>}
                      <span className="absolute left-4 top-4 rounded-full bg-black/65 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white">Finding {String(index + 1).padStart(2, '0')}</span>
                    </div>
                    <div className="p-5 sm:p-7">
                      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">{section?.section_name}</p><h3 className="mt-1 text-xl font-black text-[#252b24]">{item.item_name}</h3></div><span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide ${meta.className}`}>{meta.label}</span></div>
                      {item.notes && <p className="mt-4 rounded-xl bg-stone-50 p-3 text-sm leading-6 text-stone-700">{item.notes}</p>}
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {item.impact && <div><p className="text-[10px] font-black uppercase tracking-widest text-red-700">Why it matters</p><p className="mt-1 text-sm leading-6 text-stone-600">{item.impact}</p></div>}
                        {item.recommended_action && <div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Our recommendation</p><p className="mt-1 text-sm leading-6 text-stone-600">{item.recommended_action}</p></div>}
                      </div>
                      {allowance(item) && <p className="mt-5 border-t border-stone-100 pt-4 text-xs font-bold text-stone-600">Planning allowance · {allowance(item)}</p>}
                    </div>
                  </div>
                  {itemPhotos.length > 1 && <div className="grid grid-cols-3 gap-1 border-t border-white bg-stone-100 p-1">{itemPhotos.slice(1).map(photo => <img key={photo.id} src={photo.photo_url} alt={`${item.item_name} evidence`} className="h-28 w-full object-cover" />)}</div>}
                </article>;
              })}
            </div>
          </section>}

          {monitor.length > 0 && <section data-report-card>
            <p className="text-[10px] font-black uppercase tracking-[.24em] text-[#9b7a38]">07 · Watch list</p>
            <h2 className="mt-2 text-2xl font-black text-[#252b24]">Not urgent. Not forgotten.</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">{monitor.map(item => {
              const section = sections.find(s => s.id === item.section_id);
              return <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /><p className="font-bold text-stone-800">{item.item_name}</p></div><p className="mt-1 text-[10px] uppercase tracking-wide text-stone-500">{section?.section_name}</p>{item.notes && <p className="mt-2 text-sm leading-6 text-stone-600">{item.notes}</p>}</div>;
            })}</div>
          </section>}

          {good.length > 0 && <section data-report-card className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
            <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start"><p className="text-6xl font-black leading-none text-emerald-700">{good.length}</p><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-emerald-800">Passed inspection</p><h2 className="mt-1 text-2xl font-black text-[#1f3528]">Checks that gave us confidence.</h2><p className="mt-2 text-sm leading-6 text-emerald-900/70">Passed items are summarized by system so the report stays useful without burying the important findings.</p></div></div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">{sectionRows.filter(row => row.passed > 0).map(row => <div key={row.section.id} className="flex items-center justify-between rounded-lg bg-white/65 px-3 py-2"><span className="text-sm font-semibold text-stone-700">{row.section.section_name}</span><span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">{row.passed} passed</span></div>)}</div>
          </section>}

          {notInspected.length > 0 && <section data-report-card><h2 className="text-lg font-black text-[#252b24]">Not inspected</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{notInspected.map(item => <div key={item.id} className="rounded-xl border border-stone-200 bg-stone-100 p-3"><p className="text-sm font-bold">{item.item_name}</p><p className="mt-1 text-xs text-stone-500">{item.not_inspected_reason || 'Reason not provided'}</p></div>)}</div></section>}

          {managerNotes && <section data-report-card className="rounded-2xl border-l-4 border-[#b7954f] bg-white p-6 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[.22em] text-[#9b7a38]">A note from our team</p><p className="mt-3 text-sm leading-7 text-stone-700">{managerNotes}</p></section>}

          <section data-report-card className="overflow-hidden rounded-[26px] border border-[#d8d1bd] bg-white shadow-sm">
            <div className="grid lg:grid-cols-[.72fr_1.28fr]">
              <div className="bg-[#30382e] p-7 text-white sm:p-9"><p className="text-[10px] font-black uppercase tracking-[.22em] text-[#d3b56d]">The next conversation</p><h2 className="mt-3 text-3xl font-black leading-tight">Turn the inspection into the right plan.</h2><p className="mt-4 text-sm leading-7 text-white/65">Your advisor will walk through the findings, confirm priorities and build a formal estimate around your goals.</p></div>
              <div className="grid gap-px bg-stone-200 sm:grid-cols-3">
                {[['01', 'Review', 'Discuss the evidence and answer questions.'], ['02', 'Sequence', 'Choose what happens now, next and later.'], ['03', 'Authorize', 'Approve only the work and budget you select.']].map(([number, title, copy]) => <div key={number} className="bg-[#f7f5ef] p-6"><p className="text-3xl font-black text-[#b7954f]">{number}</p><p className="mt-5 text-sm font-black uppercase tracking-wider text-[#252b24]">{title}</p><p className="mt-2 text-xs leading-5 text-stone-600">{copy}</p></div>)}
              </div>
            </div>
          </section>
        </div>

        <footer data-report-card className="bg-[#20251f] px-6 py-10 text-center text-white sm:px-10">
          <span className="mx-auto inline-flex rounded-md bg-white px-3 py-2 shadow-sm">
            <img src="/image.png" alt="SoCal Autoworks" className="h-9 w-auto object-contain" />
          </span>
          <p className="mx-auto mt-5 max-w-xl text-xl font-black">Know what you have. Understand what it needs. Build the right plan.</p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/60">Questions about your report? We are happy to walk through every finding and help prioritize the next steps around your goals, budget and timeline.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#d3b56d]"><span>socalautowork.com</span><span>Hawthorne, California</span><span>Comprehensive Inspection</span></div>
          {guidance && <p className="mt-5 text-xs text-white/45">{GUIDANCE_LABELS[guidance]}</p>}
        </footer>
      </article>
    </div>
  );
}
