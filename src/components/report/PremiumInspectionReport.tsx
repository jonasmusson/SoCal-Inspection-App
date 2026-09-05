import { Printer } from 'lucide-react';
import {
  CheckinPhoto, Inspection, InspectionItem, InspectionPhoto,
  InspectionSection, ItemCondition, PriorityLevel,
} from '../../types';
import { findReportVehicleIllustration } from '../../data/reportVehicleIllustrations';

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

const GOLD = '#ad8444';
const INK = '#1d211d';
const PAPER = '#f6f2e8';
const STATUS = {
  attention: { label: 'Attention', color: '#b94838' },
  monitor: { label: 'Monitor', color: '#b18431' },
  good: { label: 'Good', color: '#50755b' },
  not_inspected: { label: 'Not inspected', color: '#77776f' },
} as const;

const PRIORITY: Record<PriorityLevel, { label: string; number: string; color: string; copy: string }> = {
  immediate: { label: 'Now', number: '01', color: '#ae493b', copy: 'Safety, reliability and damage-prevention work.' },
  short_term: { label: 'Next', number: '02', color: '#a67b2e', copy: 'Repairs to plan after immediate concerns.' },
  long_term: { label: 'Later', number: '03', color: '#527260', copy: 'Items to monitor and address with time.' },
  upgrade: { label: 'Optional', number: '04', color: '#5e6176', copy: 'Enhancements aligned with your goals.' },
};

function money(value: number) {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function sentence(items: InspectionItem[]) {
  const named = items.slice(0, 2).map(item => item.item_name);
  if (!named.length) return 'No items identified in this phase.';
  return `${named.join(' and ')}${items.length > 2 ? `, plus ${items.length - 2} additional item${items.length > 3 ? 's' : ''}` : ''}.`;
}

export function PremiumInspectionReport({
  inspection, sections, needsAttention, monitor, good, notInspected, photos,
  checkinPhotos, priorities, overall, guidance, managerNotes, executiveSummary,
  primaryRecommendation, colorMeta, laborRate = 175,
}: PremiumInspectionReportProps) {
  const allItems = [...needsAttention, ...monitor, ...good, ...notInspected];
  const inspectedCount = good.length + monitor.length + needsAttention.length;
  const score = inspectedCount ? Math.round(((good.length + monitor.length * .5) / inspectedCount) * 100) : 0;
  const vehicleName = `${inspection.vehicle_year} ${inspection.vehicle_make} ${inspection.vehicle_model}`;
  const illustration = findReportVehicleIllustration(inspection.vehicle_year, inspection.vehicle_make, inspection.vehicle_model);
  const heroPhoto = checkinPhotos[0]?.photo_url;
  const reportDate = new Date(inspection.completed_at || inspection.updated_at || inspection.created_at)
    .toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const reportNumber = inspection.id.slice(0, 8).toUpperCase();
  const vehicleColor = colorMeta?.hex || GOLD;
  const overallLabel = overall === 'needs_attention' ? 'Repair, then enjoy' : overall === 'monitor' ? 'Enjoy with a plan' : overall === 'good' ? 'Ready to enjoy' : 'Complete the assessment';

  const rangedItems = [...needsAttention, ...monitor].filter(item =>
    item.labor_hours_low != null || item.labor_hours_high != null ||
    item.parts_cost_low != null || item.parts_cost_high != null
  );
  const partsLow = rangedItems.reduce((sum, item) => sum + (item.parts_cost_low ?? 0), 0);
  const partsHigh = rangedItems.reduce((sum, item) => sum + (item.parts_cost_high ?? item.parts_cost_low ?? 0), 0);
  const laborLow = rangedItems.reduce((sum, item) => sum + (item.labor_hours_low ?? 0), 0);
  const laborHigh = rangedItems.reduce((sum, item) => sum + (item.labor_hours_high ?? item.labor_hours_low ?? 0), 0);
  const planLow = partsLow + laborLow * laborRate;
  const planHigh = partsHigh + laborHigh * laborRate;

  const systemRows = sections.map(section => {
    const items = allItems.filter(item => item.section_id === section.id);
    const attention = items.filter(item => item.status === 'needs_attention');
    const watching = items.filter(item => item.status === 'monitor');
    const passed = items.filter(item => item.status === 'good');
    const status = attention.length ? 'attention' : watching.length ? 'monitor' : passed.length ? 'good' : 'not_inspected';
    const note = attention[0]?.notes || watching[0]?.notes || (passed.length ? `${passed.length} inspected point${passed.length === 1 ? '' : 's'} presented satisfactorily.` : 'No inspection result recorded.');
    return { section, items, attention, watching, passed, status, note };
  });

  const roadmap = (['immediate', 'short_term', 'long_term', 'upgrade'] as PriorityLevel[]).map(priority => ({
    priority,
    meta: PRIORITY[priority],
    items: [...needsAttention, ...monitor].filter(item => (priorities[item.id] || item.priority || 'short_term') === priority),
  }));

  function allowance(item: InspectionItem) {
    const low = (item.labor_hours_low ?? 0) * laborRate + (item.parts_cost_low ?? 0);
    const high = (item.labor_hours_high ?? item.labor_hours_low ?? 0) * laborRate + (item.parts_cost_high ?? item.parts_cost_low ?? 0);
    return low || high ? `${money(low)}–${money(high)}` : 'To be estimated';
  }

  return <div className="rounded-2xl bg-[#d9d5ca] p-2 shadow-inner sm:p-5">
    <div className="mx-auto mb-4 flex max-w-[920px] items-center justify-between gap-3 print:hidden">
      <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-stone-600">Customer report preview</p><p className="mt-1 text-xs text-stone-600">The customer-facing inspection story.</p></div>
      <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-full bg-[#20241f] px-4 py-2.5 text-xs font-bold text-white"><Printer className="h-4 w-4" /> Print / Save PDF</button>
    </div>

    <article className="printable-report mx-auto max-w-[920px] overflow-hidden rounded-[3px] text-[#282923] shadow-2xl" style={{ backgroundColor: PAPER }}>
      <header data-report-cover className="relative min-h-[720px] overflow-hidden px-7 pb-7 pt-7 sm:px-12 sm:pb-10 sm:pt-10">
        <div className="flex items-start justify-between border-b border-[#bbb29f] pb-5">
          <img src="/image.png" alt="SoCal Autoworks" className="h-10 w-auto object-contain sm:h-12" />
          <div className="text-right text-[8px] font-bold uppercase tracking-[.18em] text-stone-500 sm:text-[9px]"><p>Vehicle Condition Report</p><p className="mt-1">Form SAW–01 · {reportNumber}</p></div>
        </div>

        <div className="relative z-10 pt-12 sm:pt-16">
          <p className="text-[10px] font-black uppercase tracking-[.3em]" style={{ color: GOLD }}>Comprehensive Inspection</p>
          <h1 className="mt-5 text-[44px] font-black leading-[.83] tracking-[-.055em] text-[#20231f] sm:text-[76px]">KNOW THE CAR.</h1>
          <p className="mt-3 font-serif text-[39px] italic leading-none sm:text-[62px]" style={{ color: GOLD }}>Plan the work.</p>
          <p className="mt-7 max-w-xl text-sm leading-6 text-stone-600 sm:text-base sm:leading-7">A complete, evidence-led assessment of condition, priorities and the road ahead—prepared for confident ownership decisions.</p>
        </div>

        <div className="relative mt-2 min-h-[270px] sm:min-h-[340px]">
          {illustration ? <img src={illustration.src} alt={illustration.alt} className="absolute inset-0 h-full w-full object-contain" /> : heroPhoto ? <img src={heroPhoto} alt={vehicleName} className="absolute inset-x-[8%] inset-y-4 h-[calc(100%-2rem)] w-[84%] rounded-sm object-cover grayscale-[15%]" /> : <div className="absolute inset-x-0 top-1/2 border-t border-[#bcb4a1]" />}
        </div>

        <div className="grid grid-cols-2 border-y border-[#bbb29f] sm:grid-cols-4">
          {[
            ['Vehicle', vehicleName],
            ['Prepared for', `${inspection.customer_first_name} ${inspection.customer_last_name}`],
            ['Mileage', inspection.vehicle_mileage ? `${inspection.vehicle_mileage.toLocaleString()} miles` : 'Not recorded'],
            ['Report date', reportDate],
          ].map(([label, value], index) => <div key={label} className={`px-3 py-4 ${index % 2 === 0 ? 'border-r' : ''} border-[#bbb29f] sm:border-r sm:last:border-r-0`}><p className="text-[8px] font-black uppercase tracking-[.18em] text-stone-500">{label}</p><p className="mt-1 text-xs font-bold sm:text-sm">{value}</p></div>)}
        </div>
        <nav className="mt-5 grid grid-cols-5 text-[8px] font-black uppercase tracking-[.12em] text-stone-500 sm:text-[9px]"><span>01 Summary</span><span>02 Condition</span><span>03 Priorities</span><span>04 Findings</span><span>05 Plan</span></nav>
      </header>

      <main>
        <section data-report-card className="border-t border-[#bbb29f] px-7 py-12 sm:px-12 sm:py-16">
          <p className="text-[9px] font-black uppercase tracking-[.26em]" style={{ color: GOLD }}>01 · Executive Summary</p>
          <div className="mt-4 grid gap-8 lg:grid-cols-[1.2fr_.8fr]">
            <div><h2 className="max-w-xl text-4xl font-black leading-[.95] tracking-[-.04em] sm:text-5xl">The complete picture—before the first repair.</h2><p className="mt-6 max-w-xl text-sm leading-7 text-stone-600">{executiveSummary || `We evaluated ${inspectedCount} points across ${sections.length} vehicle systems. This report separates what is healthy, what deserves monitoring and what should be addressed first.`}</p></div>
            <div className="border-l border-[#bbb29f] pl-7">
              <p className="text-[9px] font-black uppercase tracking-[.2em] text-stone-500">Condition index</p>
              <div className="mt-2 flex items-end gap-3"><strong className="text-7xl font-black leading-none" style={{ color: INK }}>{score}</strong><span className="pb-2 text-sm font-bold text-stone-400">/ 100</span></div>
              <div className="mt-5 h-1.5 bg-[#ddd7ca]"><div className="h-full" style={{ width: `${score}%`, backgroundColor: GOLD }} /></div>
              <p className="mt-3 text-[10px] leading-5 text-stone-500">A planning index based on the recorded inspection findings—not a vehicle valuation.</p>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-2 border-y border-[#bbb29f] sm:grid-cols-4">
            {[
              ['Good', good.length, STATUS.good.color], ['Monitor', monitor.length, STATUS.monitor.color],
              ['Attention', needsAttention.length, STATUS.attention.color], ['Not inspected', notInspected.length, STATUS.not_inspected.color],
            ].map(([label, value, color], index) => <div key={String(label)} className={`px-4 py-5 ${index !== 3 ? 'sm:border-r' : ''} border-[#bbb29f]`}><p className="text-4xl font-black" style={{ color: String(color) }}>{value}</p><p className="mt-1 text-[9px] font-black uppercase tracking-[.16em] text-stone-500">{label}</p></div>)}
          </div>

          <div className="mt-10 grid overflow-hidden border border-[#a9a18f] lg:grid-cols-[.38fr_.62fr]">
            <div className="p-6 text-white sm:p-8" style={{ backgroundColor: INK }}><p className="text-[9px] font-black uppercase tracking-[.2em]" style={{ color: '#d1ad67' }}>Our recommendation</p><p className="mt-4 font-serif text-3xl italic leading-tight">{overallLabel}</p></div>
            <div className="p-6 sm:p-8"><p className="text-sm leading-7 text-stone-700">{primaryRecommendation || 'Review the findings with your advisor, resolve the highest-priority items first, then build the remaining work into a thoughtful ownership plan.'}</p>{managerNotes && <p className="mt-4 border-t border-[#d4cebf] pt-4 text-xs leading-6 text-stone-500">{managerNotes}</p>}</div>
          </div>
        </section>

        <section data-report-card className="px-7 py-12 text-white sm:px-12 sm:py-16" style={{ backgroundColor: INK }}>
          <p className="text-[9px] font-black uppercase tracking-[.26em] text-[#d1ad67]">02 · System Condition</p>
          <div className="mt-4 grid gap-6 lg:grid-cols-[.68fr_.32fr]"><h2 className="text-4xl font-black leading-[.96] tracking-[-.04em] sm:text-5xl">{sections.length} systems.<br />One complete-car view.</h2><p className="text-sm leading-7 text-white/60">Each system is summarized in the same order your technician followed through the vehicle. The color is a signal; the written finding is the evidence.</p></div>
          {illustration && <div className="mt-7 h-[260px] overflow-hidden bg-[#f2ede1] sm:h-[340px]"><img src={illustration.src} alt={illustration.alt} className="h-full w-full object-contain" /></div>}
          <div className="mt-7 grid border-l border-t border-white/15 sm:grid-cols-2 lg:grid-cols-3">
            {systemRows.map((row, index) => {
              const meta = STATUS[row.status];
              return <article key={row.section.id} className="min-h-[155px] border-b border-r border-white/15 p-5">
                <div className="flex items-start justify-between"><span className="text-2xl font-black text-white/20">{String(index + 1).padStart(2, '0')}</span><span className="rounded-full px-2.5 py-1 text-[8px] font-black uppercase tracking-[.12em]" style={{ backgroundColor: meta.color, color: 'white' }}>{meta.label}</span></div>
                <h3 className="mt-4 text-lg font-black leading-tight">{row.section.section_name}</h3>
                <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-white/55">{row.note}</p>
              </article>;
            })}
          </div>
        </section>

        <section data-report-card className="px-7 py-12 sm:px-12 sm:py-16">
          <p className="text-[9px] font-black uppercase tracking-[.26em]" style={{ color: GOLD }}>03 · Action Plan</p>
          <div className="mt-4 grid gap-6 lg:grid-cols-[.7fr_.3fr]"><h2 className="text-4xl font-black leading-[.96] tracking-[-.04em] sm:text-5xl">The right sequence changes everything.</h2><p className="text-sm leading-7 text-stone-600">A serious project becomes manageable when the work is organized by consequence and timing.</p></div>
          <div className="mt-9 grid border-l border-t border-[#bbb29f] sm:grid-cols-2">
            {roadmap.map(({ priority, meta, items }) => <article key={priority} className="border-b border-r border-[#bbb29f] p-6 sm:p-8">
              <div className="flex items-end justify-between"><p className="text-5xl font-black leading-none" style={{ color: meta.color }}>{meta.number}</p><p className="text-3xl font-black uppercase tracking-[-.04em]">{meta.label}</p></div>
              <p className="mt-5 text-[10px] font-black uppercase tracking-[.14em] text-stone-500">{items.length} item{items.length === 1 ? '' : 's'} · {meta.copy}</p>
              <p className="mt-3 text-sm leading-6 text-stone-700">{sentence(items)}</p>
            </article>)}
          </div>
          {(planLow > 0 || planHigh > 0) && <div className="mt-9 grid items-end border-y border-[#bbb29f] py-6 sm:grid-cols-[1fr_auto]"><div><p className="text-[9px] font-black uppercase tracking-[.2em] text-stone-500">Preliminary planning allowance</p><p className="mt-2 text-xs leading-5 text-stone-500">Labor and parts guidance for sequencing only. This report is not an estimate or authorization.</p></div><p className="mt-4 text-3xl font-black sm:mt-0">{money(planLow)}–{money(planHigh)}</p></div>}
        </section>

        {(needsAttention.length > 0 || monitor.length > 0) && <section data-report-card className="border-t border-[#bbb29f] px-7 py-12 sm:px-12 sm:py-16">
          <p className="text-[9px] font-black uppercase tracking-[.26em]" style={{ color: GOLD }}>04 · Detailed Findings</p>
          <h2 className="mt-4 text-4xl font-black leading-[.96] tracking-[-.04em] sm:text-5xl">Evidence—not just colored dots.</h2>
          <p className="mt-5 max-w-2xl text-sm leading-7 text-stone-600">Every important conclusion should show what was observed, why it matters and what we recommend doing next.</p>
          <div className="mt-9 space-y-8">
            {[...needsAttention, ...monitor].map((item, index) => {
              const section = sections.find(section => section.id === item.section_id);
              const itemPhotos = photos.filter(photo => photo.item_id === item.id);
              const itemPriority = priorities[item.id] || item.priority || 'short_term';
              const meta = PRIORITY[itemPriority];
              return <article data-report-finding key={item.id} className="border-t-2 pt-6" style={{ borderColor: meta.color }}>
                <div className="grid gap-6 lg:grid-cols-[.34fr_.66fr]">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[.18em] text-stone-500">Finding {String(index + 1).padStart(2, '0')} · {section?.section_name}</p>
                    <h3 className="mt-3 text-2xl font-black leading-tight">{item.item_name}</h3>
                    <span className="mt-4 inline-flex px-3 py-1.5 text-[8px] font-black uppercase tracking-[.14em] text-white" style={{ backgroundColor: meta.color }}>{meta.label}</span>
                    <div className="mt-6 border-t border-[#d4cebf] pt-4"><p className="text-[8px] font-black uppercase tracking-[.16em] text-stone-500">Planning allowance</p><p className="mt-1 text-lg font-black">{allowance(item)}</p></div>
                  </div>
                  <div>
                    <div className="grid border-l border-t border-[#d4cebf] sm:grid-cols-3">
                      {[
                        ['Observation', item.notes || 'Condition recorded during the inspection.'],
                        ['Why it matters', item.impact || 'This condition may affect reliability, safety, performance or long-term value.'],
                        ['Recommended next step', item.recommended_action || 'Review with your advisor and include it in the appropriate repair phase.'],
                      ].map(([label, copy]) => <div key={label} className="border-b border-r border-[#d4cebf] p-4"><p className="text-[8px] font-black uppercase tracking-[.14em]" style={{ color: GOLD }}>{label}</p><p className="mt-2 text-xs leading-5 text-stone-600">{copy}</p></div>)}
                    </div>
                    {itemPhotos.length ? <div className="mt-3 grid grid-cols-3 gap-2">{itemPhotos.slice(0, 3).map(photo => <img key={photo.id} src={photo.photo_url} alt={`${item.item_name} evidence`} className="h-32 w-full object-cover" />)}</div> : <div className="mt-3 border border-dashed border-[#c7bfaf] px-4 py-5 text-[9px] font-bold uppercase tracking-[.14em] text-stone-400">No evidence photo attached</div>}
                  </div>
                </div>
              </article>;
            })}
          </div>
        </section>}

        {good.length > 0 && <section data-report-card className="border-t border-[#bbb29f] px-7 py-10 sm:px-12"><div className="grid gap-6 sm:grid-cols-[auto_1fr]"><p className="text-7xl font-black leading-none" style={{ color: STATUS.good.color }}>{good.length}</p><div><p className="text-[9px] font-black uppercase tracking-[.22em]" style={{ color: STATUS.good.color }}>Checks that gave us confidence</p><h2 className="mt-2 text-2xl font-black">Healthy systems matter, too.</h2><p className="mt-2 text-sm leading-6 text-stone-600">Passed points are retained in the inspection record and summarized here so the report stays focused on decisions.</p></div></div></section>}

        <section data-report-card className="px-7 py-14 text-white sm:px-12 sm:py-20" style={{ backgroundColor: INK }}>
          <p className="text-[9px] font-black uppercase tracking-[.26em] text-[#d1ad67]">05 · The Decision After the Data</p>
          <div className="mt-5 grid gap-8 lg:grid-cols-[.58fr_.42fr]"><div><h2 className="text-4xl font-black leading-[.96] tracking-[-.04em] sm:text-5xl">A report should lead to a conversation.</h2><p className="mt-6 max-w-xl text-sm leading-7 text-white/60">Your advisor will walk through the evidence, answer questions and help build a plan around how you want to own, drive and enjoy the vehicle.</p></div><div className="border-l border-white/20 pl-6 sm:pl-8">{[['01', 'Review the evidence'], ['02', 'Confirm priorities'], ['03', 'Build the estimate'], ['04', 'Authorize your plan']].map(([number, label]) => <div key={number} className="flex items-center gap-4 border-b border-white/15 py-3"><span className="text-sm font-black text-[#d1ad67]">{number}</span><span className="text-sm font-bold">{label}</span></div>)}</div></div>
        </section>
      </main>

      <footer className="px-7 py-8 sm:px-12" style={{ backgroundColor: PAPER }}>
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-[#bbb29f] pb-6"><img src="/image.png" alt="SoCal Autoworks" className="h-9 w-auto" /><p className="max-w-sm text-right text-[10px] leading-5 text-stone-500">This inspection documents visible and testable conditions at the time performed. It is not a warranty, appraisal or authorization for repairs.</p></div>
        <div className="mt-5 flex flex-wrap justify-between gap-3 text-[9px] font-black uppercase tracking-[.14em] text-stone-500"><span>socalautowork.com</span><span>Hawthorne · California</span><span>Report {reportNumber}</span></div>
        {guidance && <p className="mt-4 text-[9px] text-stone-400">Planning classification: {guidance}</p>}
        <i className="hidden" style={{ color: vehicleColor }} />
      </footer>
    </article>
  </div>;
}
