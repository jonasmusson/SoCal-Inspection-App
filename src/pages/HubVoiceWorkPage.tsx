import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Mic, MicOff, RefreshCw, Save, Sparkles } from 'lucide-react';
import { hubWorkspace, HubWorkspaceError } from '../lib/hubWorkspace';

type Project = {
  id: string;
  vehicle_id: string;
  title: string;
  status: string;
};

type Vehicle = {
  id: string;
  display_name: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
};

type Task = {
  id: string;
  project_id: string;
  assigned_user_id: string | null;
  title: string;
  status: string;
  skill_code: string;
};

type Snapshot = {
  member: { user_id: string; role: string };
  projects: Project[];
  vehicles: Vehicle[];
  project_tasks: Task[];
  work_systems: string[];
};

type PartDraft = {
  part_name: string;
  part_number: string;
  quantity: number;
  urgency: 'normal' | 'urgent';
  notes: string;
};

type WorkDraft = {
  system: string;
  work_performed: string;
  actual_hours: number | null;
  internal_notes: string;
  task_status_suggestion: 'no_change' | 'done' | 'blocked' | 'waiting';
  blocker_note: string;
  parts_requests: PartDraft[];
  warnings: string[];
};

type DraftResponse = {
  draft: WorkDraft;
  transcript: string;
  review_required: boolean;
  saved: boolean;
  boundary: string;
};

interface SpeechAlternativeLike {
  transcript: string;
}
interface SpeechResultLike {
  isFinal: boolean;
  [index: number]: SpeechAlternativeLike;
}
interface SpeechResultEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechResultLike>;
}
interface SpeechErrorEventLike {
  error?: string;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: SpeechErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function shopDate() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function speechConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const candidate = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export function HubVoiceWorkPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [projectId, setProjectId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState<WorkDraft | null>(null);
  const [workDate, setWorkDate] = useState(shopDate());
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [draftConfigured, setDraftConfigured] = useState<boolean | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechBaseRef = useRef('');

  const selectedProject = snapshot?.projects.find(project => project.id === projectId) ?? null;
  const selectedVehicle = selectedProject
    ? snapshot?.vehicles.find(vehicle => vehicle.id === selectedProject.vehicle_id) ?? null
    : null;
  const tasks = useMemo(() => {
    if (!snapshot || !projectId) return [];
    return snapshot.project_tasks.filter(task =>
      task.project_id === projectId &&
      (!task.assigned_user_id || task.assigned_user_id === snapshot.member.user_id) &&
      task.status !== 'done'
    );
  }, [snapshot, projectId]);

  const micSupported = Boolean(speechConstructor());

  async function load() {
    setError('');
    try {
      const data = await hubWorkspace<Snapshot>('snapshot');
      setSnapshot(data);
      const first = data.projects.find(project => project.status === 'active') ?? data.projects[0];
      setProjectId(current => current || first?.id || '');
      try {
        const status = await hubWorkspace<{ configured: boolean }>('work/draft/status');
        setDraftConfigured(Boolean(status.configured));
      } catch {
        setDraftConfigured(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load HUB projects.');
    }
  }

  useEffect(() => {
    void load();
    return () => recognitionRef.current?.stop();
  }, []);

  useEffect(() => {
    setTaskId('');
    setDraft(null);
    setMessage('');
  }, [projectId]);

  function stopListening() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  function startListening() {
    const Recognition = speechConstructor();
    if (!Recognition) {
      setError('This browser does not expose a speech-recognition button. Tap the transcript box and use the iPhone keyboard microphone instead.');
      return;
    }
    setError('');
    setMessage('');
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    speechBaseRef.current = transcript.trim();
    recognition.onresult = event => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const phrase = result[0]?.transcript?.trim() ?? '';
        if (!phrase) continue;
        if (result.isFinal) finalText += (finalText ? ' ' : '') + phrase;
        else interimText += (interimText ? ' ' : '') + phrase;
      }
      const base = speechBaseRef.current;
      const spoken = [finalText, interimText].filter(Boolean).join(' ');
      setTranscript([base, spoken].filter(Boolean).join(base && spoken ? ' ' : ''));
      if (finalText) speechBaseRef.current = [base, finalText].filter(Boolean).join(base && finalText ? ' ' : '');
    };
    recognition.onerror = event => {
      setError(
        event.error === 'not-allowed'
          ? 'Microphone permission was denied. You can still tap the transcript box and use the iPhone keyboard microphone.'
          : 'Speech recognition stopped. Your transcript is still here; tap the mic to continue.'
      );
      setListening(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  async function organizeWork() {
    if (!projectId) {
      setError('Choose a project first.');
      return;
    }
    if (transcript.trim().length < 2) {
      setError('Talk or dictate a work note first.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await hubWorkspace<DraftResponse>('work/draft', {
        method: 'POST',
        body: {
          project_id: projectId,
          task_id: taskId || null,
          transcript: transcript.trim(),
        },
      });
      setDraft(response.draft);
      setMessage('Draft organized. Review it before saving anything.');
    } catch (err) {
      setError(
        err instanceof HubWorkspaceError
          ? err.message
          : 'Could not organize the work note. Your transcript has not been lost.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveWork() {
    if (!draft || !projectId) return;
    if (!draft.actual_hours || draft.actual_hours <= 0) {
      setError('Enter actual project hours before saving.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await hubWorkspace('work/create', {
        method: 'POST',
        body: {
          project_id: projectId,
          task_id: taskId || null,
          work_date: workDate,
          system: draft.system,
          work_performed: draft.work_performed,
          actual_hours: draft.actual_hours,
          internal_notes: draft.internal_notes,
        },
      });
      setMessage('Work saved as Pending Review. Nothing was billed or sent to Shopmonkey.');
      setTranscript('');
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the work entry.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full bg-[#f4f3ee] px-4 py-5 pb-28">
      <div className="mx-auto max-w-2xl space-y-4">
        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-800">SoCal Workshop · Add Work</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-950">Talk it. Check it. Save it.</h1>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            Speak naturally about what you did. The HUB will organize the note, but you review the result before anything is saved.
          </p>
        </section>

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
          <div className="grid gap-4">
            <label className="grid gap-1.5 text-sm font-semibold text-stone-800">
              Project
              <select value={projectId} onChange={event => setProjectId(event.target.value)}
                className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 text-base">
                <option value="">Choose project…</option>
                {snapshot?.projects.filter(project => project.status === 'active').map(project => {
                  const vehicle = snapshot.vehicles.find(item => item.id === project.vehicle_id);
                  return <option key={project.id} value={project.id}>{vehicle?.display_name || project.title} · {project.title}</option>;
                })}
              </select>
            </label>

            <label className="grid gap-1.5 text-sm font-semibold text-stone-800">
              Task <span className="font-normal text-stone-500">(optional)</span>
              <select value={taskId} onChange={event => setTaskId(event.target.value)}
                className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 text-base">
                <option value="">General project work</option>
                {tasks.map(task => <option key={task.id} value={task.id}>{task.title} · {task.skill_code}</option>)}
              </select>
            </label>

            {selectedProject && (
              <div className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
                <strong className="text-stone-950">{selectedVehicle?.display_name || selectedProject.title}</strong>
                <span className="mx-2 text-stone-400">·</span>
                {selectedProject.title}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-stone-950">Tell the HUB what you did</h2>
              <p className="mt-1 text-sm leading-5 text-stone-500">
                Don&apos;t worry about wording. Mention the work, findings, hours and any parts you need.
              </p>
            </div>
            <button type="button" onClick={listening ? stopListening : startListening}
              aria-pressed={listening}
              className={`flex min-h-14 min-w-14 items-center justify-center rounded-full border text-white shadow-sm transition ${
                listening ? 'border-red-700 bg-red-700' : 'border-emerald-900 bg-emerald-900'
              }`}>
              {listening ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
            </button>
          </div>

          <textarea value={transcript} onChange={event => { setTranscript(event.target.value); setDraft(null); }}
            rows={7}
            placeholder="Tap the microphone and talk. Or tap here and use the iPhone keyboard microphone."
            className="mt-4 w-full resize-y rounded-xl border border-stone-300 bg-stone-50 p-4 text-base leading-6 text-stone-950 placeholder:text-stone-400" />

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
            <span className={`rounded-full px-2.5 py-1 font-semibold ${micSupported ? 'bg-emerald-50 text-emerald-800' : 'bg-stone-100 text-stone-600'}`}>
              {micSupported ? 'Browser mic available' : 'Use iPhone keyboard dictation'}
            </span>
            {draftConfigured === false && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-semibold text-amber-800">Organize Work backend not enabled in this deployment</span>
            )}
          </div>

          <button type="button" onClick={() => void organizeWork()} disabled={busy || !transcript.trim() || !projectId}
            className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-stone-950 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            Organize Work
          </button>
        </section>

        {draft && (
          <section className="rounded-2xl border border-emerald-900/20 bg-white p-5 shadow-sm">
            <div className="mb-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-800">Review before save</p>
              <h2 className="mt-1 text-lg font-bold text-stone-950">Organized work draft</h2>
            </div>

            {draft.warnings.length > 0 && (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <strong>Check these:</strong>
                <ul className="mt-1 list-disc pl-5">{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
              </div>
            )}

            <div className="grid gap-4">
              <label className="grid gap-1.5 text-sm font-semibold text-stone-800">
                System
                <select value={draft.system} onChange={event => setDraft({ ...draft, system: event.target.value })}
                  className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 text-base">
                  {(snapshot?.work_systems ?? []).map(system => <option key={system}>{system}</option>)}
                </select>
              </label>

              <label className="grid gap-1.5 text-sm font-semibold text-stone-800">
                Work performed
                <textarea value={draft.work_performed}
                  onChange={event => setDraft({ ...draft, work_performed: event.target.value })}
                  rows={4} className="rounded-xl border border-stone-300 bg-white p-3 text-base leading-6" />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm font-semibold text-stone-800">
                  Project hours
                  <input type="number" min="0.1" max="24" step="0.1"
                    value={draft.actual_hours ?? ''}
                    onChange={event => setDraft({ ...draft, actual_hours: event.target.value ? Number(event.target.value) : null })}
                    className="min-h-12 rounded-xl border border-stone-300 px-3 text-base" />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold text-stone-800">
                  Date
                  <input type="date" value={workDate} onChange={event => setWorkDate(event.target.value)}
                    className="min-h-12 rounded-xl border border-stone-300 px-3 text-base" />
                </label>
              </div>

              <label className="grid gap-1.5 text-sm font-semibold text-stone-800">
                Internal detail <span className="font-normal text-stone-500">(optional)</span>
                <textarea value={draft.internal_notes}
                  onChange={event => setDraft({ ...draft, internal_notes: event.target.value })}
                  rows={3} className="rounded-xl border border-stone-300 bg-white p-3 text-base leading-6" />
              </label>

              {draft.task_status_suggestion !== 'no_change' && (
                <div className="rounded-xl bg-stone-100 p-3 text-sm text-stone-700">
                  <strong>Suggested task status:</strong> {draft.task_status_suggestion}
                  {draft.blocker_note ? <p className="mt-1">{draft.blocker_note}</p> : null}
                  <p className="mt-2 text-xs text-stone-500">Suggestion only — saving this work does not change the task status.</p>
                </div>
              )}

              {draft.parts_requests.length > 0 && (
                <div className="rounded-xl bg-stone-100 p-3 text-sm text-stone-700">
                  <strong>Suggested Parts Requests</strong>
                  <ul className="mt-2 space-y-2">
                    {draft.parts_requests.map((part, index) => (
                      <li key={index}>
                        {part.quantity} × {part.part_name}{part.part_number ? ` · ${part.part_number}` : ''}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-stone-500">Suggestions only — parts are not requested automatically.</p>
                </div>
              )}
            </div>

            <button type="button" onClick={() => void saveWork()} disabled={busy || !draft.work_performed.trim() || !draft.actual_hours}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-900 px-4 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
              <Save className="h-5 w-5" />
              Save Work · Pending Review
            </button>
            <p className="mt-2 text-center text-xs text-stone-500">Saving creates project work only. It does not bill the customer or send anything to Shopmonkey.</p>
          </section>
        )}
      </div>
    </div>
  );
}
