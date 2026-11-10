import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, ImagePlus, RefreshCw, Upload, X } from 'lucide-react';
import { CameraView } from '../components/common/CameraComponents';
import { hubWorkspace } from '../lib/hubWorkspace';
import { supabase } from '../lib/supabase';

type Project = { id: string; vehicle_id: string; title: string; status: string };
type Vehicle = { id: string; display_name: string; year?: number | null; make?: string | null; model?: string | null };
type Media = {
  id: string;
  project_id: string | null;
  vehicle_id: string;
  original_name: string;
  category: string;
  captured_at: string | null;
  created_at: string;
};
type Snapshot = {
  projects: Project[];
  vehicles: Vehicle[];
  media: Media[];
};

type Pending = {
  id: string;
  file: File;
  previewUrl: string;
  state: 'ready' | 'uploading' | 'finalizing' | 'saved' | 'error';
  error?: string;
};

const MAX_BYTES = 25_165_824;
const ALLOWED = new Set(['image/jpeg','image/png','image/webp','image/heic','image/heif','image/avif']);

const DEMO_SNAPSHOT: Snapshot = {
  projects: [
    { id: 'demo-project-brakes', vehicle_id: 'demo-vehicle-camaro', title: 'Brake & Road Test', status: 'active' },
    { id: 'demo-project-trailer', vehicle_id: 'demo-vehicle-trailer', title: 'Shop Trailer Improvements', status: 'active' },
  ],
  vehicles: [
    { id: 'demo-vehicle-camaro', display_name: '1968 Camaro RS', year: 1968, make: 'Chevrolet', model: 'Camaro RS' },
    { id: 'demo-vehicle-trailer', display_name: 'SoCal Shop Trailer', make: 'SoCal', model: 'Shop Trailer' },
  ],
  media: [],
};

async function sha256(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function safeId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const value = Math.random() * 16 | 0;
    const result = char === 'x' ? value : (value & 0x3 | 0x8);
    return result.toString(16);
  });
}

export function HubProjectPhotosPage({ demoMode = false }: { demoMode?: boolean }) {
  const query = useMemo(() => new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search), []);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(demoMode ? DEMO_SNAPSHOT : null);
  const [projectId, setProjectId] = useState(() => query.get('project_id') || (demoMode ? DEMO_SNAPSHOT.projects[0].id : ''));
  const [cameraOpen, setCameraOpen] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [savedDemo, setSavedDemo] = useState<Array<{ id: string; name: string; captured: string }>>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(!demoMode);

  const project = snapshot?.projects.find(row => row.id === projectId) ?? null;
  const vehicle = project ? snapshot?.vehicles.find(row => row.id === project.vehicle_id) ?? null : null;
  const projectMedia = (snapshot?.media ?? []).filter(row => row.project_id === projectId);

  async function load() {
    if (demoMode) return;
    setLoading(true);
    setError('');
    try {
      const data = await hubWorkspace<Snapshot>('snapshot');
      setSnapshot(data);
      const requested = query.get('project_id');
      const next = data.projects.some(row => row.id === requested)
        ? requested!
        : data.projects.find(row => row.status === 'active')?.id || data.projects[0]?.id || '';
      setProjectId(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load project photos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    return () => pending.forEach(item => URL.revokeObjectURL(item.previewUrl));
    // The current in-memory queue is intentionally not persisted across reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addFile(file: File) {
    setError('');
    const type = file.type.toLowerCase();
    if (!ALLOWED.has(type)) {
      setError('Choose a JPEG, PNG, WebP, HEIC, HEIF or AVIF image.');
      return;
    }
    if (file.size < 1 || file.size > MAX_BYTES) {
      setError('Photo must be smaller than 24 MB.');
      return;
    }
    setPending(items => [
      ...items,
      { id: safeId(), file, previewUrl: URL.createObjectURL(file), state: 'ready' },
    ]);
    setMessage('Photo ready. Review it, then save it to this project.');
  }

  function removePending(id: string) {
    setPending(items => {
      const target = items.find(item => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return items.filter(item => item.id !== id);
    });
  }

  async function savePhoto(item: Pending) {
    if (!project || !vehicle) {
      setError('Choose a project before saving a photo.');
      return;
    }
    setError('');
    setMessage('');
    if (demoMode) {
      setPending(items => items.map(row => row.id === item.id ? { ...row, state: 'saved' } : row));
      setSavedDemo(rows => [...rows, { id: item.id, name: item.file.name, captured: new Date().toISOString() }]);
      setMessage('Demo only — photo flow completed, but nothing was uploaded or saved.');
      return;
    }

    try {
      setPending(items => items.map(row => row.id === item.id ? { ...row, state: 'uploading', error: undefined } : row));
      const checksum = await sha256(item.file);
      const capturedAt = new Date().toISOString();
      const reserve = await hubWorkspace<{ id: string; storage_key: string; state: string }>('uploads/reserve', {
        method: 'POST',
        body: {
          id: item.id,
          vehicle_id: vehicle.id,
          project_id: project.id,
          original_name: item.file.name,
          content_type: item.file.type.toLowerCase(),
          byte_count: item.file.size,
          sha256: checksum,
          category: 'Progress',
          captured_at: capturedAt,
        },
      });

      const { error: uploadError } = await supabase.storage
        .from('hub-pilot-private')
        .upload(reserve.storage_key, item.file, {
          contentType: item.file.type,
          upsert: false,
          cacheControl: '3600',
        });
      if (uploadError && !/already exists/i.test(uploadError.message)) throw uploadError;

      setPending(items => items.map(row => row.id === item.id ? { ...row, state: 'finalizing' } : row));
      await hubWorkspace('uploads/finalize', {
        method: 'POST',
        body: { id: item.id },
      });
      setPending(items => items.map(row => row.id === item.id ? { ...row, state: 'saved' } : row));
      setMessage('Photo saved, verified and archived.');
      await load();
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Photo upload did not finish.';
      setPending(items => items.map(row => row.id === item.id ? { ...row, state: 'error', error: text } : row));
      setError(text + ' Keep this screen open and tap Retry; do not recapture the photo.');
    }
  }

  if (loading) {
    return <div className="min-h-screen bg-[#f4f3ee] p-6 text-center text-stone-500">Loading project photos…</div>;
  }

  return (
    <div className="min-h-screen bg-[#f4f3ee] px-4 py-5 pb-24">
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-black">
          <div className="flex items-center justify-between bg-black p-4 text-white">
            <button type="button" onClick={() => setCameraOpen(false)} aria-label="Close camera">
              <X className="h-6 w-6" />
            </button>
            <span className="font-semibold">Project Photo</span>
            <div className="w-6" />
          </div>
          <CameraView onCapture={file => { addFile(file); setCameraOpen(false); }} />
        </div>
      )}

      <div className="mx-auto max-w-2xl space-y-4">
        {demoMode && (
          <nav className="grid grid-cols-4 gap-2 rounded-xl bg-white p-2 text-[11px] font-bold shadow-sm">
            <a href="/review/hub/pilot" className="rounded-lg px-2 py-2 text-center text-stone-700">Tech Home</a>
            <a href="/review/hub/add-work" className="rounded-lg px-2 py-2 text-center text-stone-700">Add Work</a>
            <a href="/review/hub/photos" className="rounded-lg bg-stone-950 px-2 py-2 text-center text-white">Photos</a>
            <a href="/review/hub/manage" className="rounded-lg px-2 py-2 text-center text-stone-700">Management</a>
          </nav>
        )}

        <header className="rounded-2xl bg-stone-950 p-5 text-white shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-300">SoCal Workshop</p>
              <h1 className="mt-1 text-2xl font-bold">Project Photos</h1>
              <p className="mt-2 text-sm text-stone-300">Capture evidence once. Keep the original private, verified and connected to the project.</p>
            </div>
            {demoMode && <span className="rounded-full bg-amber-300 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-stone-950">Demo · No Writes</span>}
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
          <label className="grid gap-1.5 text-sm font-semibold text-stone-800">
            Project
            <select value={projectId} onChange={event => { setProjectId(event.target.value); setPending([]); }}
              className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 text-base">
              <option value="">Choose project…</option>
              {(snapshot?.projects ?? []).filter(row => row.status === 'active').map(row => {
                const v = snapshot?.vehicles.find(item => item.id === row.vehicle_id);
                return <option key={row.id} value={row.id}>{v?.display_name || row.title} · {row.title}</option>;
              })}
            </select>
          </label>
          {project && (
            <p className="mt-3 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
              <strong className="text-stone-950">{vehicle?.display_name || project.title}</strong> · {project.title}
            </p>
          )}
        </section>

        <section className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setCameraOpen(true)} disabled={!projectId}
            className="flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl bg-emerald-900 p-3 font-bold text-white shadow-sm disabled:opacity-40">
            <Camera className="h-6 w-6" /> Take Photo
          </button>
          <label className={`flex min-h-20 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-stone-300 bg-white p-3 font-bold text-stone-900 shadow-sm ${!projectId ? 'pointer-events-none opacity-40' : ''}`}>
            <ImagePlus className="h-6 w-6" /> Import Photo
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif"
              className="hidden" disabled={!projectId}
              onChange={event => {
                const file = event.target.files?.[0];
                if (file) addFile(file);
                event.currentTarget.value = '';
              }} />
          </label>
        </section>

        {pending.length > 0 && (
          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="font-bold text-stone-950">Pending on this phone</h2>
            <p className="mt-1 text-xs leading-5 text-stone-500">If an upload fails, retry this same item instead of taking another photo.</p>
            <div className="mt-4 space-y-4">
              {pending.map(item => (
                <article key={item.id} className="overflow-hidden rounded-xl border border-stone-200">
                  <img src={item.previewUrl} alt="" className="h-48 w-full bg-stone-100 object-contain" />
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-stone-950">{item.file.name}</p>
                        <p className="text-xs text-stone-500">{(item.file.size / 1024 / 1024).toFixed(1)} MB · {item.state}</p>
                      </div>
                      {item.state === 'ready' || item.state === 'error' ? (
                        <button type="button" onClick={() => void savePhoto(item)}
                          className="flex min-h-10 items-center gap-2 rounded-lg bg-stone-950 px-3 text-sm font-bold text-white">
                          {item.state === 'error' ? <RefreshCw className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
                          {item.state === 'error' ? 'Retry' : 'Save'}
                        </button>
                      ) : item.state === 'saved' ? (
                        <span className="flex items-center gap-1 text-xs font-bold text-emerald-800"><CheckCircle2 className="h-4 w-4" /> Saved</span>
                      ) : (
                        <span className="text-xs font-semibold text-stone-500">{item.state === 'uploading' ? 'Uploading…' : 'Verifying…'}</span>
                      )}
                    </div>
                    {item.error && <p className="mt-2 text-xs text-red-700">{item.error}</p>}
                    {item.state === 'ready' && (
                      <button type="button" onClick={() => removePending(item.id)}
                        className="mt-2 text-xs font-semibold text-stone-500">Remove</button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="font-bold text-stone-950">Project history</h2>
          <p className="mt-1 text-xs text-stone-500">{demoMode ? savedDemo.length : projectMedia.length} photo(s) visible in this review.</p>
          {(demoMode ? savedDemo.length : projectMedia.length) === 0 ? (
            <p className="mt-4 rounded-xl bg-stone-100 p-4 text-sm text-stone-500">No project photos yet.</p>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-600">
              {(demoMode ? savedDemo.map(row => ({ id: row.id, original_name: row.name, category: 'Progress' })) : projectMedia).slice(0, 12).map(row => (
                <div key={row.id} className="rounded-lg bg-stone-100 p-3">
                  <strong className="block truncate text-stone-900">{row.original_name}</strong>
                  {row.category}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
