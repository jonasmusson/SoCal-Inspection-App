import { useEffect, useState } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, Clock, FileCheck2, Package, RefreshCw, Wrench } from 'lucide-react';
import { hubWorkspace } from '../lib/hubWorkspace';

type Queue = {
  counts: {
    pending_work: number;
    ready_for_shopmonkey: number;
    unassigned_tasks: number;
    blocked_tasks: number;
    waiting_tasks: number;
    in_progress_tasks: number;
    parts_requested: number;
    parts_ordered: number;
    open_timecards: number;
    stale_open_timecards: number;
    inspections_pending_review: number;
    capacity_pending_review: number;
  };
  hours: {
    pending_project_hours: number;
    ready_billable_hours: number;
    unassigned_ready_hours: number;
    blocked_hours: number;
    waiting_hours: number;
    capacity_pending_review_hours: number;
  };
};

type TechRow = {
  user_id: string;
  name: string;
  role: string;
  attendance_hours: number;
  productive_credit_hours: number;
  customer_production_hours: number;
  customer_support_hours: number;
  internal_investment_hours: number;
  shop_operations_hours: number;
  training_supervision_hours: number;
  rework_warranty_hours: number;
  non_project_productive_hours: number;
  constrained_hours: number;
  unaccounted_hours: number;
  over_accounted_hours: number;
  customer_production_opportunity_hours: number;
  approved_billable_hours: number;
  pending_project_hours: number;
  pending_capacity_hours: number;
  productive_utilization_percent: number;
  billable_utilization_percent: number;
  customer_production_opportunity_percent: number;
  billable_conversion_percent: number;
  weekly_billable_target: number;
  target_attainment_percent: number;
};

type Productivity = {
  week_start: string;
  settings: {
    weekly_billable_target: number;
    labor_rate: number;
    timezone: string;
  };
  shop: TechRow & {
    tech_count: number;
    target_billable_hours: number;
    pending_review_count: number;
  };
  technicians: TechRow[];
};

const DEMO_QUEUE: Queue = {
  counts: {
    pending_work: 4,
    ready_for_shopmonkey: 3,
    unassigned_tasks: 5,
    blocked_tasks: 2,
    waiting_tasks: 1,
    in_progress_tasks: 4,
    parts_requested: 3,
    parts_ordered: 2,
    open_timecards: 4,
    stale_open_timecards: 0,
    inspections_pending_review: 1,
    capacity_pending_review: 2,
  },
  hours: {
    pending_project_hours: 7.2,
    ready_billable_hours: 8.2,
    unassigned_ready_hours: 12,
    blocked_hours: 6.5,
    waiting_hours: 2,
    capacity_pending_review_hours: 4,
  },
};

const DEMO_PRODUCTIVITY: Productivity = {
  week_start: '2026-11-09',
  settings: { weekly_billable_target: 30, labor_rate: 175, timezone: 'America/Los_Angeles' },
  shop: {
    user_id: 'shop',
    name: 'Shop',
    role: 'shop',
    tech_count: 4,
    attendance_hours: 32,
    productive_credit_hours: 29.5,
    customer_production_hours: 17,
    customer_support_hours: 4,
    internal_investment_hours: 5,
    shop_operations_hours: 1.5,
    training_supervision_hours: 1,
    rework_warranty_hours: 0,
    non_project_productive_hours: 1,
    constrained_hours: 1.5,
    unaccounted_hours: 1,
    over_accounted_hours: 0,
    customer_production_opportunity_hours: 19.5,
    approved_billable_hours: 15.5,
    pending_project_hours: 3,
    pending_capacity_hours: 2,
    productive_utilization_percent: 92.2,
    billable_utilization_percent: 48.4,
    customer_production_opportunity_percent: 87.2,
    billable_conversion_percent: 91.2,
    weekly_billable_target: 30,
    target_attainment_percent: 12.9,
    target_billable_hours: 120,
    pending_review_count: 4,
  },
  technicians: [
    {
      user_id: 'demo-tech',
      name: 'Demo Technician',
      role: 'tech',
      attendance_hours: 8,
      productive_credit_hours: 8,
      customer_production_hours: 2,
      customer_support_hours: 2.5,
      internal_investment_hours: 3,
      shop_operations_hours: 0.5,
      training_supervision_hours: 0,
      rework_warranty_hours: 0,
      non_project_productive_hours: 0,
      constrained_hours: 0,
      unaccounted_hours: 0,
      over_accounted_hours: 0,
      customer_production_opportunity_hours: 2,
      approved_billable_hours: 2,
      pending_project_hours: 0,
      pending_capacity_hours: 0,
      productive_utilization_percent: 100,
      billable_utilization_percent: 25,
      customer_production_opportunity_percent: 100,
      billable_conversion_percent: 100,
      weekly_billable_target: 30,
      target_attainment_percent: 6.7,
    },
    {
      user_id: 'demo-tech-2',
      name: 'Demo Technician 2',
      role: 'tech',
      attendance_hours: 8,
      productive_credit_hours: 6.5,
      customer_production_hours: 5,
      customer_support_hours: 0,
      internal_investment_hours: 0,
      shop_operations_hours: 0.5,
      training_supervision_hours: 0.5,
      rework_warranty_hours: 0,
      non_project_productive_hours: 0.5,
      constrained_hours: 1,
      unaccounted_hours: 0.5,
      over_accounted_hours: 0,
      customer_production_opportunity_hours: 6,
      approved_billable_hours: 4.5,
      pending_project_hours: 1,
      pending_capacity_hours: 1,
      productive_utilization_percent: 81.3,
      billable_utilization_percent: 56.3,
      customer_production_opportunity_percent: 83.3,
      billable_conversion_percent: 90,
      weekly_billable_target: 30,
      target_attainment_percent: 15,
    },
  ],
};

function Metric({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-950">{value}</p>
      {detail && <p className="mt-1 text-xs leading-5 text-stone-500">{detail}</p>}
    </div>
  );
}

export function HubManagementPilotPage({ demoMode = false }: { demoMode?: boolean }) {
  const [queue, setQueue] = useState<Queue | null>(demoMode ? DEMO_QUEUE : null);
  const [productivity, setProductivity] = useState<Productivity | null>(demoMode ? DEMO_PRODUCTIVITY : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    if (demoMode) return;
    setBusy(true);
    setError('');
    try {
      const [queueData, productivityData] = await Promise.all([
        hubWorkspace<Queue>('management/review-queue'),
        hubWorkspace<Productivity>('productivity/summary'),
      ]);
      setQueue(queueData);
      setProductivity(productivityData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Workshop management data.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const shop = productivity?.shop;

  return (
    <div className="min-h-screen bg-[#f4f3ee] px-4 py-5 pb-24">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-2xl bg-stone-950 p-5 text-white shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">SoCal Workshop</p>
              <h1 className="mt-1 text-2xl font-bold">Management</h1>
              <p className="mt-2 text-sm text-stone-300">What needs attention, where capacity went, and what opportunity actually existed.</p>
            </div>
            <div className="flex items-center gap-2">
              {demoMode && <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-950">Demo · No Writes</span>}
              <button type="button" onClick={() => void load()} disabled={busy || demoMode}
                className="flex min-h-10 items-center gap-2 rounded-xl bg-white/10 px-3 text-sm font-semibold disabled:opacity-40">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            </div>
          </div>
        </header>

        {error && (
          <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
            <span>{error}</span>
          </div>
        )}

        <section>
          <div className="mb-3 flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-stone-500" />
            <h2 className="text-lg font-bold text-stone-950">Needs attention</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Work review" value={queue?.counts.pending_work ?? 0} detail={`${queue?.hours.pending_project_hours ?? 0} project hrs`} />
            <Metric label="Capacity review" value={queue?.counts.capacity_pending_review ?? 0} detail={`${queue?.hours.capacity_pending_review_hours ?? 0} hrs awaiting classification`} />
            <Metric label="Blocked" value={queue?.counts.blocked_tasks ?? 0} detail={`${queue?.hours.blocked_hours ?? 0} estimated hrs`} />
            <Metric label="Parts requested" value={queue?.counts.parts_requested ?? 0} detail={`${queue?.counts.parts_ordered ?? 0} already ordered`} />
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center gap-2">
            <Wrench className="h-5 w-5 text-stone-500" />
            <h2 className="text-lg font-bold text-stone-950">Production opportunity</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Metric label="Ready / unassigned" value={queue?.hours.unassigned_ready_hours ?? 0} detail={`${queue?.counts.unassigned_tasks ?? 0} tasks`} />
            <Metric label="Waiting" value={queue?.hours.waiting_hours ?? 0} detail={`${queue?.counts.waiting_tasks ?? 0} tasks`} />
            <Metric label="Open timecards" value={queue?.counts.open_timecards ?? 0} detail={`${queue?.counts.stale_open_timecards ?? 0} need attention`} />
            <Metric label="Ready for billing" value={queue?.hours.ready_billable_hours ?? 0} detail={`${queue?.counts.ready_for_shopmonkey ?? 0} work entries`} />
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-800" />
            <div>
              <h2 className="text-lg font-bold text-stone-950">Shop capacity</h2>
              <p className="text-sm text-stone-500">Contribution is not the same thing as billable labor.</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Metric label="Attendance" value={shop?.attendance_hours ?? 0} />
            <Metric label="Productive credit" value={shop?.productive_credit_hours ?? 0} detail={`${shop?.productive_utilization_percent ?? 0}% utilization`} />
            <Metric label="Customer production" value={shop?.customer_production_hours ?? 0} detail={`${shop?.customer_production_opportunity_hours ?? 0} opportunity hrs`} />
            <Metric label="Billable" value={shop?.approved_billable_hours ?? 0} detail={`${shop?.billable_conversion_percent ?? 0}% conversion`} />
            <Metric label="Constrained" value={shop?.constrained_hours ?? 0} detail={`${shop?.unaccounted_hours ?? 0} unaccounted hrs`} />
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-stone-500" />
            <div>
              <h2 className="text-lg font-bold text-stone-950">By technician</h2>
              <p className="text-sm text-stone-500">Read the allocation before judging the output.</p>
            </div>
          </div>
          <div className="space-y-4">
            {(productivity?.technicians ?? []).map(tech => (
              <article key={tech.user_id} className="rounded-xl border border-stone-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-stone-950">{tech.name}</h3>
                    <p className="text-xs text-stone-500">{tech.attendance_hours} attendance hrs · {tech.productive_credit_hours} productive credit hrs</p>
                  </div>
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-bold text-emerald-900">{tech.productive_utilization_percent}% productive</span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm md:grid-cols-4">
                  <div><span className="text-stone-500">Customer production</span><strong className="block text-stone-950">{tech.customer_production_hours} hrs</strong></div>
                  <div><span className="text-stone-500">Customer support</span><strong className="block text-stone-950">{tech.customer_support_hours} hrs</strong></div>
                  <div><span className="text-stone-500">Internal investment</span><strong className="block text-stone-950">{tech.internal_investment_hours} hrs</strong></div>
                  <div><span className="text-stone-500">Shop / other productive</span><strong className="block text-stone-950">{tech.shop_operations_hours + tech.non_project_productive_hours} hrs</strong></div>
                  <div><span className="text-stone-500">Constrained</span><strong className="block text-stone-950">{tech.constrained_hours} hrs</strong></div>
                  <div><span className="text-stone-500">Unaccounted</span><strong className="block text-stone-950">{tech.unaccounted_hours} hrs</strong></div>
                  <div><span className="text-stone-500">Production opportunity</span><strong className="block text-stone-950">{tech.customer_production_opportunity_hours} hrs</strong></div>
                  <div><span className="text-stone-500">Approved billable</span><strong className="block text-stone-950">{tech.approved_billable_hours} hrs</strong></div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg bg-stone-100 p-3 text-center text-xs md:grid-cols-4">
                  <div><span className="text-stone-500">Productive util.</span><strong className="block text-base text-stone-950">{tech.productive_utilization_percent}%</strong></div>
                  <div><span className="text-stone-500">Prod. opportunity</span><strong className="block text-base text-stone-950">{tech.customer_production_opportunity_percent}%</strong></div>
                  <div><span className="text-stone-500">Billable conversion</span><strong className="block text-base text-stone-950">{tech.billable_conversion_percent}%</strong></div>
                  <div><span className="text-stone-500">Billable util.</span><strong className="block text-base text-stone-950">{tech.billable_utilization_percent}%</strong></div>
                </div>
              </article>
            ))}
          </div>
        </section>

        {demoMode && (
          <section className="flex gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none" />
            <p><strong>Demo example:</strong> the first technician shows 8 attendance hours, only 2 customer-production hours, but 8 productive-credit hours because management allocated the rest to transport, internal investment and shop operations. The system does not label that technician 25% productive.</p>
          </section>
        )}

        <section className="rounded-2xl border border-stone-200 bg-white p-5 text-sm text-stone-600 shadow-sm">
          <div className="flex items-center gap-2 font-semibold text-stone-900"><Package className="h-4 w-4" /> Interpretation rule</div>
          <p className="mt-2 leading-6">The dashboard should diagnose the system before judging the person. Productive contribution, management allocation, constraints and billable economics remain separate.</p>
        </section>
      </div>
    </div>
  );
}
