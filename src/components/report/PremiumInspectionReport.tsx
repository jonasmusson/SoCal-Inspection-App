import {
  AlertTriangle, ArrowRight, Camera, CheckCircle2, CircleSlash2,
  Clock3, Eye, Gauge, Printer, ShieldCheck, Sparkles, Wrench,
} from 'lucide-react';
import {
  CheckinPhoto, Inspection, InspectionItem, InspectionPhoto,
  InspectionSection, ItemCondition, PriorityLevel,
} from '../../types';

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

function ClassicCarLine({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 720 230" role="img" aria-label="Classic vehicle profile" className="h-full w-full">
      <defs>
        <linearGradient id="car-glow" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".9" />
          <stop offset="1" stopColor="#d3b56d" stopOpacity=".55" />
        </linearGradient>
      </defs>
      <path d="M74 148c17-35 42-48 87-55l91-12 63-47c14-10 30-15 48-15h95c21 0 39 7 55 22l51 48 74 16c27 6 43 20 50 43l5 20h-52c-7-39-31-61-68-61-36 0-61 22-68 61H247c-7-39-31-61-68-61-36 0-61 22-68 61H58l3-12c3-10 7-19 13-28Z" fill="url(#car-glow)" opacity=".17" />
      <path d="M62 166h47c6-39 31-64 70-64 40 0 64 25 70 64h256c6-39 31-64 70-64 40 0 64 25 70 64h48M78 145c16-31 39-43 84-50l91-13 62-46c14-10 30-15 48-15h95c20 0 38 7 53 21l52 48 75 16c27 6 42 20 49 39M265 79h270M372 23l-25 56M458 23l45 56M111 166H58M645 166h50" fill="none" stroke="rgba(255,255,255,.9)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="179" cy="170" r="42" fill="#151814" stroke="rgba(255,255,255,.8)" strokeWidth="4" />
      <circle cx="179" cy="170" r="19" fill="none" stroke="#d3b56d" strokeWidth="5" />
      <circle cx="575" cy="170" r="42" fill="#151814" stroke="rgba(255,255,255,.8)" strokeWidth="4" />
      <circle cx="575" cy="170" r="19" fill="none" stroke="#d3b56d" strokeWidth="5" />
      <path d="M107 129h38M589 118h52M282 94h18" stroke="#d3b56d" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}

export function PremiumInspectionReport({
  inspection, sections, needsAttention, monitor, good, notInspected, photos,
  checkinPhotos, priorities, overall, guidance, managerNotes, executiveSummary,
  primaryRecommendation, colorMeta,
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
  const vehicleName = `${inspection.vehicle_year} ${inspection.vehicle_make} ${inspection.vehicle_model}`;
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
    return { section, attention, watching, passed, skipped, total: sectionItems.length, status };
  });

  function allowance(item: InspectionItem) {
    const labor = item.labor_hours_low == null ? '' : `${item.labor_hours_low}–${item.labor_hours_high ?? item.labor_hours_low} hrs`;
    const parts = item.parts_cost_low == null ? '' : `${money(item.parts_cost_low)}–${money(item.parts_cost_high ?? item.parts_cost_low)} parts`;
    return [labor, parts].filter(Boolean).join(' · ');
  }

  const summaryCards = [
    { label: 'Good', value: good.length, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500' },
    { label: 'Monitor', value: monitor.length, icon: Eye, tone: 'bg-amber-50 text-amber-800 border-amber-200', bar: 'bg-amber-500' },
    { label: 'Attention', value: needsAttention.length, icon: AlertTriangle, tone: 'bg-red-50 text-red-800 border-red-200', bar: 'bg-red-500' },
    { label: 'Not inspected', value: notInspected.length, icon: CircleSlash2, tone: 'bg-stone-100 text-stone-700 border-stone-200', bar: 'bg-stone-400' },
  ];

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
          {heroPhoto && <img src={heroPhoto} alt={vehicleName} className="absolute inset-0 h-full w-full object-cover opacity-45" />}
          <div className="absolute inset-0 bg-gradient-to-b from-[#11150f]/55 via-[#20251f]/55 to-[#171b16]" />
          <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-[#171b16] via-[#171b16]/85 to-transparent" />
          <div className="relative z-10 flex min-h-[520px] flex-col px-6 py-7 sm:px-10 sm:py-9">
            <div className="flex items-start justify-between gap-4 border-b border-white/20 pb-5">
              <img src="/image.png" alt="SoCal Autoworks" className="h-9 max-w-[150px] object-contain brightness-0 invert" />
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-[.24em] text-[#d3b56d]">Comprehensive Inspection</p>
                <p className="mt-1 text-xs text-white/60">Report {inspection.id.slice(0, 8).toUpperCase()}</p>
              </div>
            </div>

            {!heroPhoto && <div className="mx-auto mt-7 h-44 w-full max-w-2xl opacity-90"><ClassicCarLine color={vehicleColor} /></div>}
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
                <Gauge className="mx-auto h-7 w-7 text-[#d3b56d]" />
                <p className="mt-2 text-6xl font-black">{score}</p>
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
                <card.icon className="h-5 w-5 opacity-75" />
                <p className="mt-5 text-3xl font-black">{card.value}</p>
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

          <section data-report-card>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div><p className="text-[10px] font-black uppercase tracking-[.24em] text-[#9b7a38]">02 · Vehicle health map</p><h2 className="mt-2 text-2xl font-black text-[#252b24]">Every system, one clear view.</h2></div>
              <div className="flex gap-3 text-[10px] font-bold uppercase tracking-wide text-stone-500"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />Good</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-amber-500" />Monitor</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-red-500" />Attention</span></div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {sectionRows.map(({ section, attention, watching, passed, skipped, total, status }) => {
                const tone = status === 'attention' ? 'border-red-200 bg-red-50' : status === 'monitor' ? 'border-amber-200 bg-amber-50' : status === 'good' ? 'border-emerald-200 bg-emerald-50' : 'border-stone-200 bg-stone-100';
                const dot = status === 'attention' ? 'bg-red-500' : status === 'monitor' ? 'bg-amber-500' : status === 'good' ? 'bg-emerald-500' : 'bg-stone-400';
                return <div key={section.id} className={`rounded-xl border p-3.5 ${tone}`}>
                  <div className="flex items-start gap-3"><span className={`mt-1 h-2.5 w-2.5 flex-none rounded-full ${dot}`} /><div className="min-w-0"><p className="text-sm font-bold text-stone-800">{section.section_name}</p><p className="mt-1 text-[10px] text-stone-500">{total} checked · {passed} good{watching ? ` · ${watching} monitor` : ''}{attention ? ` · ${attention} attention` : ''}{skipped ? ` · ${skipped} skipped` : ''}</p></div></div>
                </div>;
              })}
            </div>
          </section>

          {rangedItems.length > 0 && <section data-report-card className="rounded-2xl bg-[#e8e1ce] p-6 sm:p-8">
            <div className="grid gap-6 sm:grid-cols-3">
              <div><p className="text-[10px] font-black uppercase tracking-[.22em] text-[#8a6b30]">03 · Planning snapshot</p><h2 className="mt-2 text-2xl font-black text-[#252b24]">A realistic place to start.</h2></div>
              <div className="flex items-center gap-3 rounded-xl bg-white/70 p-4"><Clock3 className="h-7 w-7 text-[#8a6b30]" /><div><p className="text-[10px] uppercase tracking-widest text-stone-500">Labor allowance</p><p className="text-xl font-black">{totalLaborLow}–{totalLaborHigh} hours</p></div></div>
              <div className="flex items-center gap-3 rounded-xl bg-white/70 p-4"><Wrench className="h-7 w-7 text-[#8a6b30]" /><div><p className="text-[10px] uppercase tracking-widest text-stone-500">Parts allowance</p><p className="text-xl font-black">{money(totalPartsLow)}–{money(totalPartsHigh)}</p></div></div>
            </div>
            <p className="mt-4 text-[11px] leading-5 text-stone-600">Planning ranges help sequence the work. Final pricing requires diagnosis, parts availability and an approved repair estimate.</p>
          </section>}

          {needsAttention.length > 0 && <section>
            <p className="text-[10px] font-black uppercase tracking-[.24em] text-[#9b7a38]">04 · Findings</p>
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
                      {itemPhotos[0] ? <img src={itemPhotos[0].photo_url} alt={item.item_name} className="absolute inset-0 h-full w-full object-cover" /> : <div className="flex h-full min-h-56 items-center justify-center"><Camera className="h-10 w-10 text-white/20" /></div>}
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
            <p className="text-[10px] font-black uppercase tracking-[.24em] text-[#9b7a38]">05 · Watch list</p>
            <h2 className="mt-2 text-2xl font-black text-[#252b24]">Not urgent. Not forgotten.</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">{monitor.map(item => {
              const section = sections.find(s => s.id === item.section_id);
              return <div key={item.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2"><Eye className="h-4 w-4 text-amber-700" /><p className="font-bold text-stone-800">{item.item_name}</p></div><p className="mt-1 text-[10px] uppercase tracking-wide text-stone-500">{section?.section_name}</p>{item.notes && <p className="mt-2 text-sm leading-6 text-stone-600">{item.notes}</p>}</div>;
            })}</div>
          </section>}

          {good.length > 0 && <section data-report-card className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
            <div className="flex items-start gap-4"><ShieldCheck className="h-10 w-10 flex-none text-emerald-700" /><div><p className="text-[10px] font-black uppercase tracking-[.22em] text-emerald-800">Passed inspection</p><h2 className="mt-1 text-2xl font-black text-[#1f3528]">{good.length} checks gave us confidence.</h2><p className="mt-2 text-sm leading-6 text-emerald-900/70">Passed items are summarized by system so the report stays useful without burying the important findings.</p></div></div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">{sectionRows.filter(row => row.passed > 0).map(row => <div key={row.section.id} className="flex items-center justify-between rounded-lg bg-white/65 px-3 py-2"><span className="text-sm font-semibold text-stone-700">{row.section.section_name}</span><span className="rounded-full bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">{row.passed} passed</span></div>)}</div>
          </section>}

          {notInspected.length > 0 && <section data-report-card><h2 className="text-lg font-black text-[#252b24]">Not inspected</h2><div className="mt-3 grid gap-2 sm:grid-cols-2">{notInspected.map(item => <div key={item.id} className="rounded-xl border border-stone-200 bg-stone-100 p-3"><p className="text-sm font-bold">{item.item_name}</p><p className="mt-1 text-xs text-stone-500">{item.not_inspected_reason || 'Reason not provided'}</p></div>)}</div></section>}

          {managerNotes && <section data-report-card className="rounded-2xl border-l-4 border-[#b7954f] bg-white p-6 shadow-sm"><p className="text-[10px] font-black uppercase tracking-[.22em] text-[#9b7a38]">A note from our team</p><p className="mt-3 text-sm leading-7 text-stone-700">{managerNotes}</p></section>}
        </div>

        <footer data-report-card className="bg-[#20251f] px-6 py-10 text-center text-white sm:px-10">
          <img src="/image.png" alt="SoCal Autoworks" className="mx-auto h-9 max-w-[160px] object-contain brightness-0 invert" />
          <p className="mx-auto mt-5 max-w-xl text-xl font-black">Know what you have. Understand what it needs. Build the right plan.</p>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/60">Questions about your report? We are happy to walk through every finding and help prioritize the next steps around your goals, budget and timeline.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[10px] font-bold uppercase tracking-[.16em] text-[#d3b56d]"><span>socalautowork.com</span><span>Hawthorne, California</span><span>Comprehensive Inspection</span></div>
          {guidance && <p className="mt-5 text-xs text-white/45">{GUIDANCE_LABELS[guidance]}</p>}
        </footer>
      </article>
    </div>
  );
}
