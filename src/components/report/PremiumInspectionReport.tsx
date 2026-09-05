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

function CutawayVehicleDiagram({ color, focus }: { color: string; focus?: string }) {
  const focusKey = focus?.toLowerCase() || '';
  const focusZone = focusKey.includes('engine') ? { x: 338, y: 220, rx: 92, ry: 66 }
    : focusKey.includes('cool') ? { x: 248, y: 222, rx: 54, ry: 72 }
    : focusKey.includes('brake') ? { x: 690, y: 271, rx: 66, ry: 66 }
    : focusKey.includes('suspension') || focusKey.includes('steering') ? { x: 209, y: 257, rx: 104, ry: 82 }
    : focusKey.includes('wheel') || focusKey.includes('tire') ? { x: 690, y: 271, rx: 78, ry: 78 }
    : focusKey.includes('transmission') ? { x: 478, y: 250, rx: 82, ry: 58 }
    : focusKey.includes('driveline') ? { x: 570, y: 269, rx: 118, ry: 48 }
    : focusKey.includes('fuel') ? { x: 672, y: 220, rx: 105, ry: 52 }
    : focusKey.includes('exhaust') ? { x: 510, y: 301, rx: 210, ry: 40 }
    : focusKey.includes('electric') ? { x: 520, y: 135, rx: 112, ry: 78 }
    : focusKey.includes('under') ? { x: 465, y: 282, rx: 275, ry: 52 }
    : focusKey.includes('test') || focusKey.includes('drive') ? { x: 470, y: 205, rx: 360, ry: 155 }
    : { x: 500, y: 140, rx: 310, ry: 112 };
  return (
    <svg viewBox="0 0 920 420" role="img" aria-label="Classic vehicle technical cutaway" className="h-full w-full">
      <defs>
        <linearGradient id="cutaway-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".42" />
          <stop offset="1" stopColor="#d7bd7b" stopOpacity=".16" />
        </linearGradient>
        <filter id="cutaway-glow"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
      </defs>
      <g opacity=".14" stroke="#f3ead3" strokeWidth="1"><path d="M38 70h844M38 140h844M38 210h844M38 280h844M38 350h844" /><path d="M120 34v350M240 34v350M360 34v350M480 34v350M600 34v350M720 34v350M840 34v350" /></g>
      <path d="M111 283c11-65 48-104 112-117l95-19 64-91c10-15 27-24 45-24h216c20 0 38 8 51 23l76 90 63 14c34 8 55 30 61 65l5 29h-84c-8-55-43-87-95-87-51 0-87 32-95 87H304c-8-55-43-87-95-87-52 0-87 32-95 87H75l7-23c5-16 15-29 29-37Z" fill="url(#cutaway-body)" stroke="#efe6cf" strokeWidth="4" strokeLinejoin="round" />
      <path d="M323 146h430M431 38l-61 108M625 38l78 108M505 38v108M257 155l32 93h404l42-93M116 247h47M756 247h92" fill="none" stroke="#efe6cf" strokeWidth="3" opacity=".78" />
      <path d="M183 263h561" stroke="#c5aa69" strokeWidth="8" strokeLinecap="round" opacity=".8" />
      <path d="M275 259l26-51M648 259l-26-51M303 259h318" stroke="#d9c996" strokeWidth="4" strokeLinecap="round" />
      <circle cx="209" cy="271" r="66" fill="#171b17" stroke="#efe6cf" strokeWidth="5" /><circle cx="209" cy="271" r="39" fill="none" stroke="#c5aa69" strokeWidth="8" /><circle cx="209" cy="271" r="11" fill="#c5aa69" />
      <circle cx="690" cy="271" r="66" fill="#171b17" stroke="#efe6cf" strokeWidth="5" /><circle cx="690" cy="271" r="39" fill="none" stroke="#c5aa69" strokeWidth="8" /><circle cx="690" cy="271" r="11" fill="#c5aa69" />
      <g filter="url(#cutaway-glow)">
        <path d="M296 187h92l28 24-22 49H286l-18-39Z" fill="#b98b45" fillOpacity=".46" stroke="#e8c56d" strokeWidth="3" />
        <path d="M308 176v-22h55v22M288 218h-25M416 218h29" stroke="#e8c56d" strokeWidth="4" />
        <rect x="240" y="187" width="18" height="72" rx="7" fill="#6ea6ad" stroke="#9fd0d5" strokeWidth="2" />
        <path d="M414 236h76l52 28h81" fill="none" stroke="#d3b56d" strokeWidth="8" strokeLinecap="round" />
        <path d="M480 262l22-19 27 19-27 19Z" fill="#d3b56d" fillOpacity=".5" stroke="#ead38f" strokeWidth="2" />
        <path d="M307 281c58 29 169 35 263 22 50-7 83-19 104-34" fill="none" stroke="#c58e59" strokeWidth="5" strokeDasharray="8 6" />
        <path d="M458 95v103M541 95v103M458 112c24-21 59-21 83 0" fill="none" stroke="#79b99a" strokeWidth="3" strokeDasharray="6 5" />
      </g>
      <g fontFamily="sans-serif" fontSize="15" fontWeight="700" letterSpacing="1.2" fill="#f7f2e7">
        <path d="M317 185 242 107H90" stroke="#d3b56d" strokeWidth="2" fill="none" /><circle cx="317" cy="185" r="5" fill="#d3b56d" /><text x="90" y="98">ENGINE + COOLING</text>
        <path d="M207 226 155 156H57" stroke="#d3b56d" strokeWidth="2" fill="none" /><circle cx="207" cy="226" r="5" fill="#d3b56d" /><text x="57" y="147">BRAKES + SUSPENSION</text>
        <path d="M502 257 580 107H832" stroke="#d3b56d" strokeWidth="2" fill="none" /><circle cx="502" cy="257" r="5" fill="#d3b56d" /><text x="649" y="98">TRANSMISSION + DRIVELINE</text>
        <path d="M670 301 756 345H866" stroke="#d3b56d" strokeWidth="2" fill="none" /><circle cx="670" cy="301" r="5" fill="#d3b56d" /><text x="706" y="370">FUEL + EXHAUST</text>
        <path d="M540 118 614 62H832" stroke="#d3b56d" strokeWidth="2" fill="none" /><circle cx="540" cy="118" r="5" fill="#d3b56d" /><text x="678" y="53">BODY + ELECTRICAL</text>
      </g>
      {focus && <g>
        <ellipse cx={focusZone.x} cy={focusZone.y} rx={focusZone.rx} ry={focusZone.ry} fill={color} fillOpacity=".14" stroke={color} strokeWidth="4" strokeDasharray="11 7" filter="url(#cutaway-glow)" />
        <circle cx={focusZone.x} cy={focusZone.y} r="8" fill={color} stroke="#fff8e7" strokeWidth="3" />
        <path d={`M${focusZone.x} ${focusZone.y - focusZone.ry} V22 H90`} fill="none" stroke={color} strokeWidth="2.5" />
        <text x="90" y="16" fill="#fff8e7" fontFamily="sans-serif" fontSize="18" fontWeight="800" letterSpacing="2">{focus.toUpperCase()}</text>
      </g>}
    </svg>
  );
}

function SystemIllustration({ name, status }: { name: string; status: ReportSystemStatus }) {
  const accent = SYSTEM_ACCENT[status];
  return <CutawayVehicleDiagram color={accent} focus={name} />;
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
    { label: 'Good', value: good.length, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-800 border-emerald-200', bar: 'bg-emerald-500' },
    { label: 'Monitor', value: monitor.length, icon: Eye, tone: 'bg-amber-50 text-amber-800 border-amber-200', bar: 'bg-amber-500' },
    { label: 'Attention', value: needsAttention.length, icon: AlertTriangle, tone: 'bg-red-50 text-red-800 border-red-200', bar: 'bg-red-500' },
    { label: 'Not inspected', value: notInspected.length, icon: CircleSlash2, tone: 'bg-stone-100 text-stone-700 border-stone-200', bar: 'bg-stone-400' },
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
          <div className={`pointer-events-none absolute left-1/2 top-20 h-48 w-[82%] max-w-2xl -translate-x-1/2 ${heroPhoto ? 'opacity-45' : 'opacity-90'}`}>
            <CutawayVehicleDiagram color={vehicleColor} />
          </div>
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
              <div className="min-h-[290px] py-3"><CutawayVehicleDiagram color={vehicleColor} /></div>
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
                      <div className="relative h-56 w-full max-w-lg opacity-95"><SystemIllustration name={section.section_name} status={status as ReportSystemStatus} /></div>
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

                      {highlightedItems.length > 0 ? <div className="mt-5 space-y-3">{highlightedItems.slice(0, 3).map(item => <div key={item.id} className="border-l-2 pl-4" style={{ borderColor: accent }}><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-stone-800">{item.item_name}</p><span className="text-[8px] font-black uppercase tracking-wider" style={{ color: accent }}>{item.status === 'needs_attention' ? 'Needs attention' : 'Monitor'}</span></div>{item.notes && <p className="mt-1 text-xs leading-5 text-stone-600">{item.notes}</p>}{item.recommended_action && <p className="mt-1 text-[10px] font-semibold leading-4 text-stone-500"><span className="uppercase tracking-wider text-[#8a6b30]">Next step:</span> {item.recommended_action}</p>}</div>)}</div> : <div className="mt-5 rounded-xl bg-emerald-50 p-4"><div className="flex items-center gap-2 text-sm font-black text-emerald-800"><CheckCircle2 className="h-4 w-4" />No concerns identified</div><p className="mt-1 text-xs leading-5 text-emerald-900/65">All inspected points in this system performed or presented satisfactorily at the time of inspection.</p></div>}

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
              <div className="flex items-center gap-3 border-b border-[#cfc4a8] p-5 sm:border-b-0 sm:border-r"><Clock3 className="h-6 w-6 text-[#8a6b30]" /><div><p className="text-[9px] uppercase tracking-widest text-stone-500">Labor time</p><p className="text-lg font-black">{totalLaborLow}–{totalLaborHigh} hours</p></div></div>
              <div className="flex items-center gap-3 border-b border-[#cfc4a8] p-5 sm:border-b-0 sm:border-r"><Wrench className="h-6 w-6 text-[#8a6b30]" /><div><p className="text-[9px] uppercase tracking-widest text-stone-500">Labor planning</p><p className="text-lg font-black">{money(totalLaborCostLow)}–{money(totalLaborCostHigh)}</p></div></div>
              <div className="flex items-center gap-3 p-5"><Wrench className="h-6 w-6 text-[#8a6b30]" /><div><p className="text-[9px] uppercase tracking-widest text-stone-500">Parts planning</p><p className="text-lg font-black">{money(totalPartsLow)}–{money(totalPartsHigh)}</p></div></div>
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
            <p className="text-[10px] font-black uppercase tracking-[.24em] text-[#9b7a38]">07 · Watch list</p>
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
