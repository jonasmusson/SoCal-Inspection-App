import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Inspection, InspectionSection, UserProfile, ItemCondition } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { ProgressBar } from '../components/common/ProgressBar';
import { laborSeconds, formatLaborTime } from '../lib/laborTime';
import { VEHICLE_COLORS } from '../data/vehicleColors';
import { Car, User, Phone, Mail, MapPin, Play, Check, AlertTriangle, Eye, Clock, UserCheck, ChevronDown, Image, Video as VideoIcon, Trash2, Archive, MoreVertical, X, Pause, Timer } from 'lucide-react';
import { format } from 'date-fns';
import { withTimeout } from '../lib/async';

export function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isManager, isOwner, isTech, profile } = useAuth();
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [assignedTech, setAssignedTech] = useState<UserProfile | null>(null);
  const [checkinPhotos, setCheckinPhotos] = useState<{ photo_url: string }[]>([]);
  const [assigningTo, setAssigningTo] = useState<string>('');
  const [assigning, setAssigning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (id) loadAll(id);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [id]);

  useEffect(() => {
    const isRunning = inspection?.status === 'in_progress'
      && inspection.work_started_at
      && !inspection.work_completed_at
      && !inspection.paused_at;
    if (isRunning) {
      timerRef.current = setInterval(() => forceUpdate(n => n + 1), 1_000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    }
  }, [inspection?.status, inspection?.work_started_at, inspection?.work_completed_at, inspection?.paused_at]);

  async function loadAll(inspectionId: string) {
    setLoading(true);
    setLoadError(false);
    try {
      const [{ data: insp }, { data: secs }, { data: photos }] = await withTimeout(Promise.all([
        supabase.from('inspections').select('*').eq('id', inspectionId).single(),
        supabase.from('inspection_sections').select('*').eq('inspection_id', inspectionId).order('section_number'),
        supabase.from('checkin_photos').select('photo_url').eq('inspection_id', inspectionId),
      ]));
      setInspection(insp || null);
      setSections(secs || []);
      setCheckinPhotos(photos || []);

      if (insp?.assigned_tech_id) {
        const { data: tech } = await supabase.from('user_profiles').select('*').eq('id', insp.assigned_tech_id).single();
        setAssignedTech(tech || null);
      }

      if (isManager || isOwner) {
        const { data: staffData } = await supabase
          .from('user_profiles').select('*')
          .eq('role', 'tech').eq('status', 'active').order('full_name');
        setStaff(staffData || []);
        if (insp && !insp.assigned_tech_id) setAssigningTo(profile?.id || '');
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function assignInspection() {
    if (!inspection || !assigningTo) return;
    setAssigning(true);
    await supabase.from('inspections').update({ assigned_tech_id: assigningTo }).eq('id', inspection.id);
    const targetStaff = staff.find(s => s.id === assigningTo) || (assigningTo === profile?.id ? profile : null);
    if (targetStaff?.role === 'tech') {
      await supabase.functions.invoke('notify-tech-assignment', { body: { inspectionId: inspection.id, techId: assigningTo } });
    }
    setInspection(prev => prev ? { ...prev, assigned_tech_id: assigningTo } : prev);
    if (targetStaff) setAssignedTech(targetStaff as UserProfile);
    setAssigning(false);
  }

  async function archiveInspection() {
    if (!inspection) return;
    setActionLoading(true);
    await supabase.from('inspections')
      .update({ archived: true, archived_at: new Date().toISOString() })
      .eq('id', inspection.id);
    setActionLoading(false);
    navigate(-1);
  }

  async function deleteInspection() {
    if (!inspection) return;
    setActionLoading(true);
    await supabase.from('inspections').delete().eq('id', inspection.id);
    setActionLoading(false);
    navigate('/dashboard');
  }

  async function pauseInspection() {
    if (!inspection) return;
    setPauseLoading(true);
    const now = new Date().toISOString();
    await supabase.from('inspections').update({ paused_at: now }).eq('id', inspection.id);
    setInspection(prev => prev ? { ...prev, paused_at: now } : prev);
    setPauseLoading(false);
  }

  async function resumeInspection() {
    if (!inspection || !inspection.paused_at) return;
    setPauseLoading(true);
    const pausedSecs = Math.floor((Date.now() - new Date(inspection.paused_at).getTime()) / 1000);
    const newTotal = (inspection.paused_duration_seconds ?? 0) + pausedSecs;
    await supabase.from('inspections').update({ paused_at: null, paused_duration_seconds: newTotal }).eq('id', inspection.id);
    setInspection(prev => prev ? { ...prev, paused_at: null, paused_duration_seconds: newTotal } : prev);
    setPauseLoading(false);
  }

  const canStart = inspection
    ? ((isTech && inspection.assigned_tech_id === profile?.id) || isManager || isOwner)
    : false;
  const isActive = inspection?.status === 'not_started' || inspection?.status === 'in_progress';

  function getIcon(c: ItemCondition | null) {
    if (c === 'good') return Check;
    if (c === 'monitor') return Eye;
    if (c === 'needs_attention') return AlertTriangle;
    return null;
  }

  if (loading) return <div className="p-4 text-center text-gray-500">Loading...</div>;
  if (loadError) return (
    <div className="p-4 text-center py-12">
      <AlertTriangle className="w-12 h-12 text-danger-300 mx-auto mb-3" />
      <p className="text-gray-600 mb-4">Unable to load inspection details. Check your connection and try again.</p>
      <button onClick={() => id && loadAll(id)}
        className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl">
        Try Again
      </button>
    </div>
  );
  if (!inspection) return <div className="p-4 text-center text-gray-500">Not found</div>;

  const canArchive = (isOwner || isManager) && inspection.status === 'sent' && !inspection.archived;
  const canDelete = isOwner || isManager;
  const isTimerRunning = inspection.status === 'in_progress' && !!inspection.work_started_at && !inspection.paused_at && !inspection.work_completed_at;
  const isPaused = inspection.status === 'in_progress' && !!inspection.paused_at;
  const showTimer = inspection.status === 'in_progress' && !!inspection.work_started_at;
  const canControlTimer = showTimer && (isTech && inspection.assigned_tech_id === profile?.id || isManager || isOwner);
  const laborSecs = laborSeconds(inspection);
  const showTimeTracking = (isManager || isOwner) && !!inspection.work_started_at;

  return (
    <div className="p-4 pb-24 space-y-4">
      {/* Header card */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <div className="flex justify-between items-start mb-3">
          <div className="flex-1 min-w-0 mr-2">
            <h1 className="text-xl font-bold text-gray-900">
              {inspection.vehicle_year} {inspection.vehicle_make} {inspection.vehicle_model}
            </h1>
            <p className="text-gray-500 text-sm">
              {inspection.vehicle_mileage.toLocaleString()} miles
              {inspection.vehicle_vin && <span className="ml-2 text-xs text-gray-400">VIN: {inspection.vehicle_vin}</span>}
            </p>
            {inspection.vehicle_color && (() => {
              const col = VEHICLE_COLORS.find(c => c.name === inspection.vehicle_color);
              return (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="w-3.5 h-3.5 rounded-full border border-gray-200 flex-shrink-0"
                    style={{ backgroundColor: col?.hex ?? '#ccc' }} />
                  <span className="text-xs text-gray-500">{inspection.vehicle_color}</span>
                </div>
              );
            })()}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusBadge status={inspection.status} />
            {(canDelete || canArchive) && (
              <div className="relative">
                <button onClick={() => setShowMenu(v => !v)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                  <MoreVertical className="w-5 h-5" />
                </button>
                {showMenu && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                    <div className="absolute right-0 top-8 z-20 bg-white rounded-xl shadow-lg border border-gray-200 py-1 min-w-[160px]">
                      {canArchive && (
                        <button onClick={() => { setShowMenu(false); archiveInspection(); }}
                          disabled={actionLoading}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                          <Archive className="w-4 h-4 text-gray-400" /> Archive
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => { setShowMenu(false); setConfirmDelete(true); }}
                          className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-danger-600 hover:bg-danger-50">
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        <ProgressBar percent={inspection.progress_percent} />

        {isActive && canStart && (
          <button onClick={async () => {
            if (inspection.paused_at) {
              const pausedSecs = Math.floor((Date.now() - new Date(inspection.paused_at).getTime()) / 1000);
              const newTotal = (inspection.paused_duration_seconds ?? 0) + pausedSecs;
              await supabase.from('inspections').update({ paused_at: null, paused_duration_seconds: newTotal }).eq('id', inspection.id);
            }
            navigate(`/inspect/${inspection.id}`);
          }}
            className="w-full mt-4 bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2">
            <Play className="w-5 h-5" />
            {inspection.status === 'not_started' ? 'Start Inspection' : inspection.paused_at ? 'Resume Inspection' : 'Continue Inspection'}
          </button>
        )}
        {inspection.status === 'pending_review' && (isManager || isOwner) && (
          <button onClick={() => navigate(`/review/${inspection.id}`)}
            className="w-full mt-4 bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2">
            Review & Approve
          </button>
        )}
        {inspection.status === 'approved' && (isManager || isOwner) && (
          <button onClick={() => navigate(`/review/${inspection.id}`)}
            className="w-full mt-4 bg-amber-600 hover:bg-amber-700 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2">
            Review &amp; Send Report
          </button>
        )}
        {inspection.status === 'sent' && (isManager || isOwner) && (
          <button onClick={() => navigate(`/review/${inspection.id}`)}
            className="w-full mt-4 border border-primary-300 bg-primary-50 hover:bg-primary-100 text-primary-800 font-medium py-3 rounded-xl flex items-center justify-center gap-2">
            View, Print or Resend Report
          </button>
        )}
      </div>

      {/* Assignment card */}
      {(isManager || isOwner) && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-gray-400" /> Assignment
          </h2>
          {inspection.assigned_tech_id ? (
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <span className="text-primary-700 font-semibold text-sm">
                  {(assignedTech?.full_name || '?').charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900">{assignedTech?.full_name || 'Loading...'}</p>
                <p className="text-xs text-gray-500 capitalize">{assignedTech?.role}</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-warning-600 font-medium">Unassigned — assign to get started</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <select value={assigningTo} onChange={e => setAssigningTo(e.target.value)}
                    className="w-full appearance-none pl-3 pr-8 py-2.5 border border-gray-300 rounded-xl text-sm">
                    {profile && <option value={profile.id}>Me ({profile.full_name})</option>}
                    {staff.filter(s => s.id !== profile?.id).map(s => (
                      <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <button onClick={assignInspection} disabled={!assigningTo || assigning}
                  className="px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-xl disabled:opacity-50">
                  {assigning ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Live timer card — visible to assigned tech + managers while in-progress */}
      {showTimer && (
        <div className={`rounded-xl p-4 shadow-sm border ${isPaused ? 'bg-amber-50 border-amber-200' : 'bg-primary-50 border-primary-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isPaused ? 'bg-amber-100' : 'bg-primary-100'}`}>
                <Timer className={`w-5 h-5 ${isPaused ? 'text-amber-600' : 'text-primary-600'}`} />
              </div>
              <div>
                <p className={`text-xs font-medium uppercase tracking-wide ${isPaused ? 'text-amber-600' : 'text-primary-600'}`}>
                  {isPaused ? 'Paused' : 'Labor Time'}
                </p>
                <p className={`text-2xl font-bold tabular-nums ${isPaused ? 'text-amber-800' : 'text-primary-900'}`}>
                  {formatLaborTime(laborSecs)}
                </p>
              </div>
            </div>
            {canControlTimer && (
              <button onClick={isPaused ? resumeInspection : pauseInspection}
                disabled={pauseLoading}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${
                  isPaused
                    ? 'bg-primary-600 hover:bg-primary-700 text-white'
                    : 'bg-white hover:bg-amber-50 text-amber-700 border border-amber-300'
                }`}>
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                {isPaused ? 'Resume' : 'Pause'}
              </button>
            )}
          </div>
          {isPaused && inspection.paused_at && (
            <p className="text-xs text-amber-600 mt-2 ml-13">
              Paused at {format(new Date(inspection.paused_at), 'h:mm a')} — resume when ready to continue
            </p>
          )}
        </div>
      )}

      {/* Time tracking summary (manager/owner only) */}
      {showTimeTracking && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-400" /> Time Tracking
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Started</p>
              <p className="text-sm font-semibold text-gray-900">
                {format(new Date(inspection.work_started_at!), 'h:mm a')}
              </p>
              <p className="text-xs text-gray-400">{format(new Date(inspection.work_started_at!), 'MMM d')}</p>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Labor Time</p>
              <p className={`text-sm font-bold tabular-nums ${inspection.work_completed_at ? 'text-success-700' : isTimerRunning ? 'text-primary-600' : 'text-amber-600'}`}>
                {formatLaborTime(laborSecs)}
              </p>
              {isTimerRunning && <p className="text-xs text-primary-400">live</p>}
              {isPaused && <p className="text-xs text-amber-500">paused</p>}
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Completed</p>
              {inspection.work_completed_at ? (
                <>
                  <p className="text-sm font-semibold text-gray-900">
                    {format(new Date(inspection.work_completed_at), 'h:mm a')}
                  </p>
                  <p className="text-xs text-gray-400">{format(new Date(inspection.work_completed_at), 'MMM d')}</p>
                </>
              ) : (
                <p className="text-sm text-gray-400">—</p>
              )}
            </div>
          </div>
          {inspection.paused_duration_seconds > 0 && (
            <p className="text-xs text-gray-400 mt-2 text-center">
              {formatLaborTime(inspection.paused_duration_seconds)} excluded (paused)
            </p>
          )}
        </div>
      )}

      {/* Customer card */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <User className="w-5 h-5 text-gray-400" /> Customer
        </h2>
        <p className="font-medium text-gray-900">{inspection.customer_first_name} {inspection.customer_last_name}</p>
        <div className="mt-2 space-y-1">
          <p className="text-sm text-gray-600 flex items-center gap-2">
            <Phone className="w-4 h-4 text-gray-400" />{inspection.customer_phone}
          </p>
          <p className="text-sm text-gray-600 flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-400" />{inspection.customer_email}
          </p>
          {inspection.customer_address && (
            <p className="text-sm text-gray-600 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gray-400" />{inspection.customer_address}
            </p>
          )}
        </div>
      </div>

      {/* Check-in media card */}
      {(checkinPhotos.length > 0 || inspection.checkin_video_url || inspection.checkin_notes) && (
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Car className="w-5 h-5 text-gray-400" /> Check-In Record
          </h2>

          {inspection.checkin_notes && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
              <p className="text-xs font-medium text-amber-700 mb-1">Customer Notes / Known Issues</p>
              <p className="text-sm text-amber-900">{inspection.checkin_notes}</p>
            </div>
          )}

          {checkinPhotos.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                <Image className="w-3.5 h-3.5" /> Check-in Photos ({checkinPhotos.length})
              </p>
              <div className="grid grid-cols-3 gap-2">
                {checkinPhotos.map((p, i) => (
                  <a key={i} href={p.photo_url} target="_blank" rel="noopener noreferrer">
                    <img src={p.photo_url} alt={`Check-in photo ${i + 1}`}
                      className="w-full aspect-square object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {inspection.checkin_video_url && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2 flex items-center gap-1.5">
                <VideoIcon className="w-3.5 h-3.5" /> Walk-around Video
              </p>
              <a href={inspection.checkin_video_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm text-primary-600 font-medium hover:bg-gray-100 transition-colors">
                <VideoIcon className="w-4 h-4" /> View Walk-around Video
              </a>
            </div>
          )}
        </div>
      )}

      {/* Sections */}
      <div>
        <h2 className="font-semibold text-gray-900 mb-3">Inspection Sections</h2>
        <div className="space-y-2">
          {sections.map(s => {
            const Icon = getIcon(s.overall_status);
            const completed = !!s.completed_at;
            return (
              <button key={s.id}
                disabled={!canStart || !isActive}
                onClick={() => navigate(`/inspect/${inspection.id}/${s.section_number}`)}
                className={`w-full bg-white rounded-xl p-4 shadow-sm border text-left flex justify-between items-center transition-colors ${
                  completed ? 'border-success-300 bg-success-50' : 'border-gray-200 hover:border-primary-300'
                } disabled:opacity-50`}>
                <div className="flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                    completed ? 'bg-success-500 text-white' : 'bg-gray-200 text-gray-600'
                  }`}>
                    {s.section_number}
                  </span>
                  <span className="font-medium text-gray-900">{s.section_name}</span>
                </div>
                {Icon && (
                  <Icon className={`w-5 h-5 flex-shrink-0 ${
                    s.overall_status === 'good' ? 'text-success-500'
                    : s.overall_status === 'monitor' ? 'text-warning-500'
                    : 'text-danger-500'
                  }`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="w-10 h-10 rounded-full bg-danger-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-danger-600" />
              </div>
              <button onClick={() => setConfirmDelete(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-1">Delete Inspection?</h3>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete the inspection for <strong>{inspection.vehicle_year} {inspection.vehicle_make} {inspection.vehicle_model}</strong> and all associated data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={deleteInspection} disabled={actionLoading}
                className="flex-1 py-2.5 bg-danger-600 hover:bg-danger-700 rounded-xl text-sm font-medium text-white disabled:opacity-50">
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
