import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Mic, Package, Play, Plus, RefreshCw, Save, Square, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { hubWorkspace, HubWorkspaceError } from '../lib/hubWorkspace';

type Task = {
  id: string;
  project_id: string;
  project_title?: string;
  vehicle_name?: string;
  title: string;
  status: string;
  priority: string;
  skill_code: string;
  estimated_hours: number;
  assigned_user_id: string | null;
};

type WorkSession = {
  id: string;
  project_id: string;
  task_id: string | null;
  started_at: string;
  status: string;
};

type TimeShift = {
  id: string;
  clock_in: string;
};

type PartsRequest = {
  id: string;
  project_id: string;
  part_name: string;
  quantity: number;
  status: string;
};

type HomeResponse = {
  profile: { id: string; email: string; role: string };
  clock: { clocked_in: boolean; open_shift: TimeShift | null };
  work: {
    active_session: WorkSession | null;
    current_task: Task | null;
    next_tasks: Task[];
    ready_to_claim: Task[];
    blocked_tasks: Task[];
    waiting_tasks: Task[];
  };
  parts_requests: PartsRequest[];
  pending_work_entries: Array<{ id: string; project_id: string; actual_hours: number; work_performed: string }>;
  capabilities: string[];
  need_work: boolean;
};

const DEMO_HOME: HomeResponse = {
  profile: { id: 'demo-tech', email: 'tech@socal.demo', role: 'tech' },
  clock: { clocked_in: false, open_shift: null },
  work: {
    active_session: null,
    current_task: {
      id: 'task-brakes',
      project_id: 'demo-project-brakes',
      project_title: 'Brake & Road Test',
      vehicle_name: '1968 Camaro RS',
      title: 'Inspect front brakes',
      status: 'todo',
      priority: 'high',
      skill_code: 'L2',
      estimated_hours: 2.5,
      assigned_user_id: 'demo-tech',
    },
    next_tasks: [
      {
        id: 'task-roadtest',
        project_id: 'demo-project-brakes',
        project_title: 'Brake & Road Test',
        vehicle_name: '1968 Camaro RS',
        title: 'Road test after repair',
        status: 'todo',
        priority: 'normal',
        skill_code: 'L2',
        estimated_hours: 1,
        assigned_user_id: 'demo-tech',
      },
    ],
    ready_to_claim: [
      {
        id: 'task-trailer',
        project_id: 'demo-project-trailer',
        project_title: 'Shop Trailer Improvements',
        vehicle_name: 'SoCal Shop Trailer',
        title: 'Repair interior lighting',
        status: 'todo',
        priority: 'normal',
        skill_code: 'L2',
        estimated_hours: 3,
        assigned_user_id: null,
      },
    ],
    blocked_tasks: [],
    waiting_tasks: [],
  },
  parts_requests: [
    { id: 'parts-1', project_id: 'demo-project-brakes', part_name: 'Front brake hose', quantity: 1, status: 'requested' },
  ],
  pending_work_entries: [],
  capabilities: ['L1', 'L2'],
  need_work: false,
};

const CAPACITY_OPTIONS = [
  { value: 'transport_support', label: 'Vehicle transport / customer support' },
  { value: 'shop_operations', label: 'Shop operations' },
  { value: 'training', label: 'Training' },
  { value: 'supervision', label: 'Helping / supervising another tech' },
  { value: 'admin_documentation', label: 'Documentation / project admin' },
  { value: 'no_work_available', label: 'No ready work available' },
  { value: 'waiting_parts', label: 'Waiting for parts' },
  { value: 'waiting_authorization', label: 'Waiting for authorization' },
  { value: 'waiting_supervision', label: 'Waiting for technical supervision' },
  { value: 'vehicle_unavailable', label: 'Vehicle unavailable' },
  { value: 'equipment_issue', label: 'Shop / equipment issue' },
  { value: 'unaccounted', label: 'Other / unaccounted' },
];

function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function taskLabel(task: Task | null) {
  if (!task) return '';
  return task.vehicle_name || task.project_title || task.title;
}

export function HubPilotPage({ demoMode = false }: { demoMode?: boolean }) {
  const navigate = useNavigate();
  const [home, setHome] = useState<HomeResponse | null>(demoMode ? structuredClone(DEMO_HOME) : null);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [capacityCategory, setCapacityCategory] = useState('transport_support');
  const [capacityHours, setCapacityHours] = useState('');
  const [capacityNotes, setCapacityNotes] = useState('');
  const [partsOpen, setPartsOpen] = useState(false);
  const [partName, setPartName] = useState('');
  const [partQty, setPartQty] = useState('1');
  const [partNotes, setPartNotes] = useState('');

  const currentTask = home?.work.current_task ?? null;
  const activeSession = home?.work.active_session ?? null;

  const pendingCount = useMemo(
    () => (home?.pending_work_entries.length ?? 0),
    [home?.pending_work_entries.length],
  );

  async function load() {
    if (demoMode) return;
    setBusy('load');
    setError('');
    try {
      setHome(await hubWorkspace<HomeResponse>('tech/home'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your Workshop home.');
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function demoUpdate(mutator: (value: HomeResponse) => void) {
    setHome(current => {
      const next = structuredClone(current ?? DEMO_HOME);
      mutator(next);
      return next;
    });
  }

  async function punch() {
    if (!home) return;
    const operation = home.clock.clocked_in ? 'clock_out' : 'clock_in';
    setBusy('clock');
    setError('');
    setMessage('');
    if (demoMode) {
      demoUpdate(next => {
        next.clock.clocked_in = operation === 'clock_in';
        next.clock.open_shift = operation === 'clock_in'
          ? { id: 'demo-shift', clock_in: new Date().toISOString() }
          : null;
      });
      setMessage(operation === 'clock_in' ? 'Demo: clocked in.' : 'Demo: clocked out.');
      setBusy('');
      return;
    }
    try {
      await hubWorkspace('timeclock/punch', { method: 'POST', body: { operation } });
      setMessage(operation === 'clock_in' ? 'Clocked in.' : 'Clocked out.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the Timecard.');
    } finally {
      setBusy('');
    }
  }

  async function claim(task: Task) {
    setBusy('claim:' + task.id);
    setError('');
    setMessage('');
    if (demoMode) {
      demoUpdate(next => {
        next.work.ready_to_claim = next.work.ready_to_claim.filter(item => item.id !== task.id);
        next.work.next_tasks = [...next.work.next_tasks, { ...task, assigned_user_id: next.profile.id }];
      });
      setMessage('Demo: task claimed.');
      setBusy('');
      return;
    }
    try {
      await hubWorkspace('task/claim', { method: 'POST', body: { id: task.id } });
      setMessage('Task claimed.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim this task.');
    } finally {
      setBusy('');
    }
  }

  async function startWork(task: Task) {
    setBusy('start:' + task.id);
    setError('');
    setMessage('');
    if (demoMode) {
      demoUpdate(next => {
        next.work.active_session = {
          id: 'demo-session',
          project_id: task.project_id,
          task_id: task.id,
          started_at: new Date().toISOString(),
          status: 'active',
        };
        next.work.current_task = { ...task, status: 'in_progress' };
      });
      setMessage('Demo: work session started.');
      setBusy('');
      return;
    }
    try {
      await hubWorkspace('work-session/start', {
        method: 'POST',
        body: { project_id: task.project_id, task_id: task.id },
      });
      setMessage('Work started.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start work.');
    } finally {
      setBusy('');
    }
  }

  async function stopWork() {
    if (!activeSession) return;
    setBusy('stop');
    setError('');
    setMessage('');
    if (demoMode) {
      demoUpdate(next => {
        next.work.active_session = null;
      });
      setMessage('Demo: work stopped. Next step is Add Work to describe what you did.');
      setBusy('');
      return;
    }
    try {
      const result = await hubWorkspace<{ suggested_actual_hours: number }>('work-session/stop', {
        method: 'POST',
        body: { id: activeSession.id },
      });
      setMessage(`Work stopped. Suggested project time: ${result.suggested_actual_hours} hrs. Add Work to document it.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not stop work.');
    } finally {
      setBusy('');
    }
  }

  async function submitCapacity() {
    const hours = Number(capacityHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      setError('Enter the number of hours to account for.');
      return;
    }
    setBusy('capacity');
    setError('');
    setMessage('');
    if (demoMode) {
      setMessage('Demo: time submitted as Pending Review. It would not count as Productive Credit until management approves it.');
      setCapacityOpen(false);
      setCapacityHours('');
      setCapacityNotes('');
      setBusy('');
      return;
    }
    try {
      await hubWorkspace('capacity/create', {
        method: 'POST',
        body: {
          work_date: today(),
          hours,
          category: capacityCategory,
          notes: capacityNotes,
        },
      });
      setMessage('Other time submitted as Pending Review.');
      setCapacityOpen(false);
      setCapacityHours('');
      setCapacityNotes('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit this time.');
    } finally {
      setBusy('');
    }
  }

  async function submitPart() {
    if (!currentTask?.project_id) {
      setError('Choose or start a project task before requesting a part.');
      return;
    }
    if (partName.trim().length < 2) {
      setError('Enter the part or material needed.');
      return;
    }
    setBusy('part');
    setError('');
    setMessage('');
    if (demoMode) {
      demoUpdate(next => {
        next.parts_requests.unshift({
          id: 'demo-part-' + Date.now(),
          project_id: currentTask.project_id,
          part_name: partName.trim(),
          quantity: Math.max(1, Number(partQty) || 1),
          status: 'requested',
        });
      });
      setMessage('Demo: Parts Request created.');
      setPartsOpen(false);
      setPartName('');
      setPartQty('1');
      setPartNotes('');
      setBusy('');
      return;
    }
    try {
      await hubWorkspace('parts/create', {
        method: 'POST',
        body: {
          project_id: currentTask.project_id,
          task_id: currentTask.id,
          part_name: partName.trim(),
          quantity: Math.max(1, Number(partQty) || 1),
          urgency: 'normal',
          notes: partNotes,
        },
      });
      setMessage('Parts Request submitted.');
      setPartsOpen(false);
      setPartName('');
      setPartQty('1');
      setPartNotes('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not submit the Parts Request.');
    } finally {
      setBusy('');
    }
  }

  if (!home && busy === 'load') {
    return <div className="min-h-screen bg-[#f4f3ee] p-6 text-center text-stone-500">Loading Workshop…</div>;
  }

  return (
    <div className="min-h-screen bg-[#f4f3ee] px-4 py-5 pb-28">
      <div className="mx-auto max-w-2xl space-y-4">
        <header className="rounded-2xl bg-stone-950 p-5 text-white shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">SoCal Workshop</p>
              <h1 className="mt-1 text-2xl font-bold">My Work</h1>
            </div>
            {demoMode && <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-950">Demo · No Writes</span>}
          </div>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-white/10 p-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-emerald-300" />
              <div>
                <p className="text-xs text-stone-300">Timecard</p>
                <p className="font-semibold">{home?.clock.clocked_in ? 'Clocked In' : 'Clocked Out'}</p>
              </div>
            </div>
            <button type="button" onClick={() => void punch()} disabled={busy === 'clock'}
              className="min-h-11 rounded-xl bg-white px-4 text-sm font-bold text-stone-950 disabled:opacity-50">
              {home?.clock.clocked_in ? 'Clock Out' : 'Clock In'}
            </button>
          </div>
        </header>

        {error && (
          <div role="alert" className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
            <span>{error}</span>
          </div>
        )}
        {message && (
          <div role="status" className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none" />
            <span>{message}</span>
          </div>
        )}

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-500">Current work</p>
          {currentTask ? (
            <>
              <h2 className="mt-2 text-xl font-bold text-stone-950">{taskLabel(currentTask)}</h2>
              <p className="mt-1 text-base font-semibold text-stone-800">{currentTask.title}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-stone-100 px-2.5 py-1">{currentTask.skill_code}</span>
                <span className="rounded-full bg-stone-100 px-2.5 py-1">{currentTask.priority} priority</span>
                <span className="rounded-full bg-stone-100 px-2.5 py-1">{currentTask.estimated_hours} est. hrs</span>
              </div>
              {activeSession ? (
                <button type="button" onClick={() => void stopWork()} disabled={busy === 'stop'}
                  className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-red-700 px-4 text-base font-bold text-white">
                  <Square className="h-5 w-5" /> Stop Work
                </button>
              ) : (
                <button type="button" onClick={() => void startWork(currentTask)} disabled={busy.startsWith('start:')}
                  className="mt-5 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 px-4 text-base font-bold text-white">
                  <Play className="h-5 w-5" /> Start Work
                </button>
              )}
            </>
          ) : (
            <div className="mt-3 rounded-xl bg-stone-100 p-4 text-sm text-stone-600">
              No current task. Check Next or Ready to Claim below.
            </div>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => navigate(demoMode ? '/review/hub/add-work' : '/hub/add-work')}
            className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl bg-stone-950 p-3 font-bold text-white shadow-sm">
            <Mic className="h-6 w-6" /> Add Work
          </button>
          <button type="button" onClick={() => setPartsOpen(value => !value)}
            className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white p-3 font-bold text-stone-900 shadow-sm">
            <Package className="h-6 w-6" /> Parts
          </button>
          <button type="button" onClick={() => setCapacityOpen(value => !value)}
            className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white p-3 font-bold text-stone-900 shadow-sm">
            <Clock className="h-6 w-6" /> Other Time
          </button>
          <button type="button" onClick={() => void load()}
            className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white p-3 font-bold text-stone-900 shadow-sm">
            <RefreshCw className="h-6 w-6" /> Refresh
          </button>
        </section>

        {partsOpen && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-stone-950">Request a part</h2>
            <div className="mt-4 grid gap-3">
              <input value={partName} onChange={event => setPartName(event.target.value)}
                placeholder="Part or material needed"
                className="min-h-12 rounded-xl border border-stone-300 px-3 text-base" />
              <div className="grid grid-cols-[100px_1fr] gap-3">
                <input type="number" min="1" max="999" value={partQty} onChange={event => setPartQty(event.target.value)}
                  className="min-h-12 rounded-xl border border-stone-300 px-3 text-base" />
                <input value={partNotes} onChange={event => setPartNotes(event.target.value)}
                  placeholder="Notes (optional)"
                  className="min-h-12 rounded-xl border border-stone-300 px-3 text-base" />
              </div>
              <button type="button" onClick={() => void submitPart()} disabled={busy === 'part'}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-900 font-bold text-white">
                <Plus className="h-5 w-5" /> Submit Parts Request
              </button>
            </div>
          </section>
        )}

        {capacityOpen && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-stone-950">Other time / constraint</h2>
            <p className="mt-1 text-sm text-stone-500">This starts Pending Review. Management decides whether it becomes productive credit, constrained time, or remains unaccounted.</p>
            <div className="mt-4 grid gap-3">
              <select value={capacityCategory} onChange={event => setCapacityCategory(event.target.value)}
                className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 text-base">
                {CAPACITY_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <input type="number" min="0.1" max="24" step="0.1" value={capacityHours}
                onChange={event => setCapacityHours(event.target.value)}
                placeholder="Hours"
                className="min-h-12 rounded-xl border border-stone-300 px-3 text-base" />
              <textarea value={capacityNotes} onChange={event => setCapacityNotes(event.target.value)}
                rows={3} placeholder="What were you doing / what held you up?"
                className="rounded-xl border border-stone-300 p-3 text-base" />
              <button type="button" onClick={() => void submitCapacity()} disabled={busy === 'capacity'}
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-stone-950 font-bold text-white">
                <Save className="h-5 w-5" /> Submit for Review
              </button>
            </div>
          </section>
        )}

        {home?.work.next_tasks.length ? (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-stone-950">Next</h2>
            <div className="mt-3 space-y-3">
              {home.work.next_tasks.map(task => (
                <div key={task.id} className="rounded-xl border border-stone-200 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{task.vehicle_name || task.project_title}</p>
                  <p className="mt-1 font-bold text-stone-950">{task.title}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-stone-500">{task.skill_code} · {task.estimated_hours} est. hrs</span>
                    {!activeSession && (
                      <button type="button" onClick={() => void startWork(task)}
                        className="min-h-10 rounded-lg bg-emerald-900 px-3 text-sm font-bold text-white">
                        Start
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {home?.work.ready_to_claim.length ? (
          <section className="rounded-2xl border border-emerald-900/20 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold text-stone-950">Ready to Claim</h2>
            <p className="mt-1 text-sm text-stone-500">Only work on assigned vehicles that matches your approved capability.</p>
            <div className="mt-3 space-y-3">
              {home.work.ready_to_claim.map(task => (
                <div key={task.id} className="rounded-xl bg-emerald-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">{task.vehicle_name || task.project_title}</p>
                  <p className="mt-1 font-bold text-stone-950">{task.title}</p>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-stone-600">{task.skill_code} · {task.estimated_hours} est. hrs</span>
                    <button type="button" onClick={() => void claim(task)} disabled={busy === 'claim:' + task.id}
                      className="min-h-10 rounded-lg border border-emerald-900 bg-white px-3 text-sm font-bold text-emerald-950">
                      Claim
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {(home?.work.blocked_tasks.length || home?.work.waiting_tasks.length) ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="flex items-center gap-2 text-lg font-bold text-amber-950">
              <AlertTriangle className="h-5 w-5" /> Blocked / Waiting
            </h2>
            <div className="mt-3 space-y-2 text-sm text-amber-950">
              {[...(home?.work.blocked_tasks ?? []), ...(home?.work.waiting_tasks ?? [])].map(task => (
                <div key={task.id} className="rounded-lg bg-white/70 p-3">
                  <strong>{task.title}</strong> · {task.status}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-stone-500" />
            <h2 className="text-lg font-bold text-stone-950">My open items</h2>
          </div>
          <div className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between rounded-lg bg-stone-100 px-3 py-2">
              <span>Parts requests</span><strong>{home?.parts_requests.length ?? 0}</strong>
            </div>
            <div className="flex justify-between rounded-lg bg-stone-100 px-3 py-2">
              <span>Work pending review</span><strong>{pendingCount}</strong>
            </div>
          </div>
        </section>

        {home?.need_work && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-amber-800" />
            <h2 className="mt-2 text-lg font-bold text-amber-950">Need Work</h2>
            <p className="mt-1 text-sm text-amber-800">No active, assigned, or eligible Ready-to-Claim task is available. This is a management/work-availability signal—not automatic technician downtime.</p>
          </section>
        )}
      </div>
    </div>
  );
}
