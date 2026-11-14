import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Inspection, InspectionSection, InspectionItem, ItemCondition, InspectionItemStatus } from '../types';
import { ConditionButton } from '../components/common/ConditionButton';
import { ProgressBar } from '../components/common/ProgressBar';
import { CameraView, VideoRecorderView } from '../components/common/CameraComponents';
import { laborSeconds, formatLaborTime } from '../lib/laborTime';
import { Camera, Video, X, Check, ArrowLeft, ArrowRight, AlertCircle, Pause, Play, Timer } from 'lucide-react';
import { withTimeout } from '../lib/async';

export function InspectSectionPage() {
  const { id, sectionNumber } = useParams<{ id: string; sectionNumber: string }>();
  const navigate = useNavigate();
  const sectionNum = parseInt(sectionNumber || '1');

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [section, setSection] = useState<InspectionSection | null>(null);
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [currentItemIndex, setCurrentItemIndex] = useState(0);
  const [totalSections, setTotalSections] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [photoCounts, setPhotoCounts] = useState<Record<string, number>>({});
  const [videoCounts, setVideoCounts] = useState<Record<string, number>>({});
  const [pauseLoading, setPauseLoading] = useState(false);
  const timerTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, forceUpdate] = useState(0);

  const [showCamera, setShowCamera] = useState(false);
  const [activeItem, setActiveItem] = useState<string | null>(null);

  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  const [activeVideoItem, setActiveVideoItem] = useState<string | null>(null);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  useEffect(() => { loadInspection(); }, [id, sectionNum]);

  useEffect(() => {
    const isRunning = inspection?.work_started_at && !inspection.paused_at && !inspection.work_completed_at;
    if (isRunning) {
      timerTickRef.current = setInterval(() => forceUpdate(n => n + 1), 1_000);
    } else {
      if (timerTickRef.current) { clearInterval(timerTickRef.current); timerTickRef.current = null; }
    }
    return () => { if (timerTickRef.current) clearInterval(timerTickRef.current); };
  }, [inspection?.work_started_at, inspection?.paused_at, inspection?.work_completed_at]);

  async function loadInspection() {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    try {
    const { data: insp } = await withTimeout(supabase.from('inspections').select('*').eq('id', id).single());
    const { count } = await withTimeout(supabase.from('inspection_sections').select('*', { count: 'exact', head: true }).eq('inspection_id', id));
    setTotalSections(count ?? 0);
    if (insp) {
      setInspection(insp);
      if (insp.status === 'not_started' && (count ?? 0) > 0) {
        await supabase.from('inspections').update({ status: 'in_progress' }).eq('id', id);
      }
    }

    const { data: sec } = await withTimeout(supabase.from('inspection_sections').select('*').eq('inspection_id', id).eq('section_number', sectionNum).single());
    setSection(sec || null);

    if (sec) {
      const { data: itemsData } = await withTimeout(supabase.from('inspection_items').select('*').eq('section_id', sec.id).order('created_at'));
      const loadedItems = itemsData || [];
      setItems(loadedItems);
      const firstOpen = loadedItems.findIndex(item => !item.status);
      setCurrentItemIndex(firstOpen >= 0 ? firstOpen : 0);

      const notesMap: Record<string, string> = {};
      loadedItems.forEach(i => { if (i.notes) notesMap[i.id] = i.notes; });
      setNotes(notesMap);

      if (loadedItems.length > 0) {
        const itemIds = loadedItems.map(i => i.id);
        const [{ data: photos }, { data: videos }] = await withTimeout(Promise.all([
          supabase.from('inspection_photos').select('item_id').in('item_id', itemIds),
          supabase.from('inspection_videos').select('item_id').in('item_id', itemIds),
        ]));
        const pc: Record<string, number> = {};
        const vc: Record<string, number> = {};
        photos?.forEach(p => { pc[p.item_id] = (pc[p.item_id] || 0) + 1; });
        videos?.forEach(v => { vc[v.item_id] = (vc[v.item_id] || 0) + 1; });
        setPhotoCounts(pc);
        setVideoCounts(vc);
      }
    }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function saveAndExit() {
    if (inspection && inspection.work_started_at && !inspection.paused_at) {
      const now = new Date().toISOString();
      await supabase.from('inspections').update({ paused_at: now }).eq('id', inspection.id);
    }
    navigate(`/inspection/${id}`);
  }

  async function pauseTimer() {
    if (!inspection) return;
    setPauseLoading(true);
    const now = new Date().toISOString();
    await supabase.from('inspections').update({ paused_at: now }).eq('id', inspection.id);
    setInspection(prev => prev ? { ...prev, paused_at: now } : prev);
    setPauseLoading(false);
  }

  async function resumeTimer() {
    if (!inspection?.paused_at) return;
    setPauseLoading(true);
    const pausedSecs = Math.floor((Date.now() - new Date(inspection.paused_at).getTime()) / 1000);
    const newTotal = (inspection.paused_duration_seconds ?? 0) + pausedSecs;
    await supabase.from('inspections').update({ paused_at: null, paused_duration_seconds: newTotal }).eq('id', inspection.id);
    setInspection(prev => prev ? { ...prev, paused_at: null, paused_duration_seconds: newTotal } : prev);
    setPauseLoading(false);
  }

  async function autoResume() {
    if (!inspection?.paused_at) return;
    const pausedSecs = Math.floor((Date.now() - new Date(inspection.paused_at).getTime()) / 1000);
    const newTotal = (inspection.paused_duration_seconds ?? 0) + pausedSecs;
    await supabase.from('inspections').update({ paused_at: null, paused_duration_seconds: newTotal }).eq('id', inspection.id);
    setInspection(prev => prev ? { ...prev, paused_at: null, paused_duration_seconds: newTotal } : prev);
  }

  async function updateItem(itemId: string, fields: Partial<InspectionItem>) {
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...fields } : i));
    await supabase.from('inspection_items').update(fields).eq('id', itemId);
  }
  async function handleCondition(item: InspectionItem, condition: InspectionItemStatus) {
    await updateItem(item.id, { status: condition });
    if (inspection && !inspection.work_started_at) {
      const started = new Date().toISOString();
      await supabase.from('inspections').update({ work_started_at: started }).eq('id', inspection.id);
      setInspection(prev => prev ? { ...prev, work_started_at: started } : prev);
    } else {
      await autoResume();
    }
  }

  async function saveNotes(itemId: string, note: string) {
    await supabase.from('inspection_items').update({ notes: note }).eq('id', itemId);
  }

  async function uploadPhoto(file: File, itemId: string) {
    await autoResume();
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${id}/${itemId}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('inspection-photos').upload(fileName, file, { contentType: file.type });
    if (uploadError) return;
    const { data: { publicUrl } } = supabase.storage.from('inspection-photos').getPublicUrl(fileName);
    const { error: recordError } = await supabase.from('inspection_photos').insert({ item_id: itemId, photo_url: publicUrl });
    if (!recordError) setPhotoCounts(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
  }

  async function capturePhoto(file: File) {
    if (!activeItem) return;
    await uploadPhoto(file, activeItem);
    setShowCamera(false);
    setActiveItem(null);
  }

  async function handleVideoRecorded(file: File) {
    const itemId = activeVideoItem;
    if (!itemId || !id) return;
    setShowVideoRecorder(false);
    setUploadingVideo(true);
    await autoResume();
    const ext = file.name.split('.').pop() || 'webm';
    const fileName = `${id}/${itemId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('inspection-videos').upload(fileName, file, { contentType: file.type });
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('inspection-videos').getPublicUrl(fileName);
      await supabase.from('inspection_videos').insert({ item_id: itemId, video_url: publicUrl });
      setVideoCounts(prev => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
    }
    setUploadingVideo(false);
    setActiveVideoItem(null);
  }

  function getMissingRequired(): string[] {
    const missing: string[] = [];
    for (const item of items) {
      if (!item.status) continue;
      if (item.status === 'not_inspected') { if (!item.not_inspected_reason?.trim()) missing.push(`${item.item_name}: reason required`); continue; }
      if (item.notes_mode === 'required' && !notes[item.id]?.trim()) missing.push(`${item.item_name}: notes required`);
      if (item.photo_mode === 'required' && !(photoCounts[item.id] > 0)) missing.push(`${item.item_name}: photo required`);
      if (item.video_mode === 'required' && !(videoCounts[item.id] > 0)) missing.push(`${item.item_name}: video required`);
    }
    return missing;
  }

  async function completeSection() {
    if (!section || !id) return;
    const hasIssue = items.some(i => i.status === 'needs_attention');
    const hasMonitor = items.some(i => i.status === 'monitor');
    const status: ItemCondition = hasIssue ? 'needs_attention' : hasMonitor ? 'monitor' : 'good';
    await supabase.from('inspection_sections').update({ overall_status: status, completed_at: new Date().toISOString() }).eq('id', section.id);

    if (sectionNum === totalSections) {
      const completedAt = new Date().toISOString();
      await supabase.from('inspections').update({
        status: 'pending_review', progress_percent: 100,
        completed_at: completedAt, work_completed_at: completedAt,
      }).eq('id', id);
      navigate(`/inspection/${id}`);
    } else {
      await updateProgress();
      navigate(`/inspect/${id}/${sectionNum + 1}`);
    }
  }

  async function updateProgress() {
    const { data } = await supabase.from('inspection_sections').select('completed_at').eq('inspection_id', id);
    if (data) {
      const progress = Math.round((data.filter(s => s.completed_at).length / totalSections) * 100);
      await supabase.from('inspections').update({ progress_percent: progress }).eq('id', id);
    }
  }

  if (loading) return <div className="p-4 text-center text-primary-400">Loading...</div>;
  if (loadError) return <div className="p-6 text-center"><p className="text-primary-600 mb-3">This inspection section could not be loaded.</p><button onClick={loadInspection} className="px-4 py-2 rounded-lg bg-primary-900 text-white font-medium">Try Again</button></div>;
  if (!section || !inspection) return <div className="p-4 text-center text-primary-400">Not found</div>;

  const allRated = items.every(i => i.status);
  const missingRequired = getMissingRequired();
  const canComplete = allRated && missingRequired.length === 0;
  const isPaused = !!inspection.paused_at;
  const laborSecs = laborSeconds(inspection);

  const unratedCount = items.filter(i => !i.status).length;
  const currentItem = items[currentItemIndex];
  const currentReady = !!currentItem?.status && (currentItem.status !== 'not_inspected' || !!currentItem.not_inspected_reason?.trim());

  return (
    <div className="pb-28 bg-primary-50 min-h-screen">
      {/* Sticky header */}
      <div className="sticky top-0 bg-white border-b border-primary-200 px-4 py-3 z-10">
        <div className="flex items-center gap-3 mb-2.5">
          <button aria-label="Back to inspection" onClick={saveAndExit} className="p-1.5 rounded-lg text-primary-500 hover:text-primary-900 hover:bg-primary-50 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-400">Section {sectionNum} of {totalSections}</p>
            <h1 className="font-semibold text-primary-900 truncate">{section.section_name}</h1>
          </div>
          {inspection.work_started_at && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold tabular-nums ${isPaused ? 'bg-warning-50 text-warning-700' : 'bg-primary-100 text-primary-700'}`}>
                <Timer className="w-3.5 h-3.5" />
                {formatLaborTime(laborSecs)}
              </div>
              <button onClick={isPaused ? resumeTimer : pauseTimer}
                disabled={pauseLoading}
                className={`p-2 rounded-lg border transition-colors disabled:opacity-50 ${isPaused ? 'bg-primary-900 border-primary-900 text-white' : 'border-primary-200 text-primary-500 hover:bg-primary-50'}`}
                title={isPaused ? 'Resume timer' : 'Pause timer'}>
                {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
        <ProgressBar percent={inspection.progress_percent} compact />
      </div>

      {/* Item navigator */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-primary-500">
            Item {Math.min(currentItemIndex + 1, items.length)} of {items.length}
          </span>
          <div className="flex items-center gap-1">
            {items.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === currentItemIndex ? 'w-5 bg-primary-900' : i < currentItemIndex ? 'w-1.5 bg-success-400' : 'w-1.5 bg-primary-200'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="px-4 space-y-3">
        {items.slice(currentItemIndex, currentItemIndex + 1).map(item => {
          const showNotes = item.notes_mode === 'required' || (item.notes_mode === 'optional' && (item.status === 'needs_attention' || item.status === 'monitor'));
          const showPhoto = item.photo_mode === 'required' || (item.photo_mode === 'optional' && (item.status === 'needs_attention' || item.status === 'monitor'));
          const showVideo = item.video_mode === 'required' || (item.video_mode === 'optional' && (item.status === 'needs_attention' || item.status === 'monitor'));
          const photoCount = photoCounts[item.id] || 0;
          const videoCount = videoCounts[item.id] || 0;
          const notesMissing = item.notes_mode === 'required' && !notes[item.id]?.trim();
          const photoMissing = item.photo_mode === 'required' && photoCount === 0;
          const videoMissing = item.video_mode === 'required' && videoCount === 0;
          const hasMissing = (notesMissing || photoMissing || videoMissing) && item.status;

          return (
            <div key={item.id} className={`bg-white rounded-xl p-4 shadow-card border transition-colors ${hasMissing ? 'border-warning-300' : 'border-primary-100'}`}>
              <div className="flex items-start justify-between mb-3 gap-2">
                <h3 className="font-semibold text-primary-900">{item.item_name}</h3>
                <div className="flex gap-1 flex-shrink-0">
                  {item.photo_mode === 'required' && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-0.5 ${photoCount > 0 ? 'bg-success-50 text-success-600' : 'bg-primary-100 text-primary-600'}`}>
                      <Camera className="w-3 h-3" />{photoCount > 0 ? photoCount : '*'}
                    </span>
                  )}
                  {item.video_mode === 'required' && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-0.5 ${videoCount > 0 ? 'bg-success-50 text-success-600' : 'bg-primary-100 text-primary-600'}`}>
                      <Video className="w-3 h-3" />{videoCount > 0 ? videoCount : '*'}
                    </span>
                  )}
                  {item.notes_mode === 'required' && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${notes[item.id]?.trim() ? 'bg-success-50 text-success-600' : 'bg-warning-50 text-warning-600'}`}>
                      Note*
                    </span>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(['good', 'monitor', 'needs_attention', 'not_inspected'] as InspectionItemStatus[]).map(c => (
                  <ConditionButton key={c} condition={c} selected={item.status === c} onClick={() => handleCondition(item, c)} />
                ))}
              </div>

              {item.status === 'not_inspected' && (
                <label className="block mt-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-primary-500">Reason not inspected *</span>
                  <textarea defaultValue={item.not_inspected_reason || ''} onBlur={e => updateItem(item.id,{not_inspected_reason:e.target.value || null})} placeholder="Not accessible, customer declined testing, vehicle could not be safely operated..." className="mt-1.5 w-full px-3 py-2 border border-primary-200 rounded-lg text-sm normal-case resize-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all" rows={2}/>
                </label>
              )}

              {showNotes && (
                <textarea
                  placeholder={item.notes_mode === 'required' ? 'Notes required...' : 'Add notes...'}
                  value={notes[item.id] || ''}
                  onChange={e => setNotes(prev => ({ ...prev, [item.id]: e.target.value }))}
                  onBlur={e => { if (e.target.value) { saveNotes(item.id, e.target.value); autoResume(); } }}
                  className={`w-full mt-3 px-3 py-2 border rounded-lg text-sm resize-none focus:ring-2 focus:border-primary-400 transition-all ${notesMissing && item.status ? 'border-warning-300 bg-warning-50' : 'border-primary-200 focus:ring-primary-300'}`}
                  rows={2}
                />
              )}

              {(item.status === 'needs_attention' || item.status === 'monitor') && (
                <div className="mt-3 rounded-lg border border-primary-200 bg-primary-50 p-3 space-y-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary-500">Finding details</p>
                  <label className="block">
                    <span className="text-xs font-semibold text-primary-600">Why it matters</span>
                    <textarea defaultValue={item.impact || ''} onBlur={e=>updateItem(item.id,{impact:e.target.value || null})} placeholder="Safety, reliability, drivability or preservation impact..." className="mt-1.5 w-full px-3 py-2 border border-primary-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all" rows={3}/>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-primary-600">Recommended action</span>
                    <textarea defaultValue={item.recommended_action || ''} onBlur={e=>updateItem(item.id,{recommended_action:e.target.value || null})} placeholder="What should be repaired, verified or upgraded next..." className="mt-1.5 w-full px-3 py-2 border border-primary-200 rounded-lg text-sm resize-none focus:ring-2 focus:ring-primary-300 focus:border-primary-400 transition-all" rows={3}/>
                  </label>
                </div>
              )}

              {(showPhoto || showVideo) && (
                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  {showPhoto && (
                    <>
                      <button
                        onClick={() => { setActiveItem(item.id); setShowCamera(true); }}
                        className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                          photoMissing && item.status ? 'bg-danger-50 text-danger-600 border border-danger-200'
                            : photoCount > 0 ? 'bg-success-50 text-success-700 border border-success-200'
                            : 'bg-primary-100 text-primary-600 hover:bg-primary-200'
                        }`}>
                        <Camera className="w-4 h-4" />
                        {photoCount > 0 ? `${photoCount} photo${photoCount > 1 ? 's' : ''}` : item.photo_mode === 'required' ? 'Take Photo*' : 'Take Photo'}
                      </button>
                      <label className="flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg bg-primary-100 text-primary-600 hover:bg-primary-200 cursor-pointer transition-colors">
                        Upload Photo
                        <input type="file" accept="image/*" className="sr-only" onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) void uploadPhoto(file, item.id);
                          e.target.value = '';
                        }} />
                      </label>
                    </>
                  )}

                  {showVideo && (
                    <button
                      onClick={() => { setActiveVideoItem(item.id); setShowVideoRecorder(true); }}
                      disabled={uploadingVideo && activeVideoItem === item.id}
                      className={`flex items-center gap-1.5 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ${
                        videoMissing && item.status ? 'bg-danger-50 text-danger-600 border border-danger-200'
                          : videoCount > 0 ? 'bg-success-50 text-success-700 border border-success-200'
                          : 'bg-primary-100 text-primary-600 hover:bg-primary-200'
                      }`}>
                      <Video className="w-4 h-4" />
                      {uploadingVideo && activeVideoItem === item.id
                        ? 'Uploading...'
                        : videoCount > 0 ? `${videoCount} video${videoCount > 1 ? 's' : ''}` : item.video_mode === 'required' ? 'Add Video*' : 'Add Video'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-primary-200 p-4 z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
        {missingRequired.length > 0 && allRated && (
          <div className="flex items-start gap-2 mb-3 p-2.5 bg-warning-50 rounded-lg border border-warning-200">
            <AlertCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-warning-700">
              {missingRequired[0]}{missingRequired.length > 1 ? ` (+${missingRequired.length - 1} more)` : ''}
            </p>
          </div>
        )}
        {!allRated && (
          <p className="text-xs text-center text-primary-400 mb-2">
            Rate all {unratedCount} remaining item{unratedCount > 1 ? 's' : ''} to continue
          </p>
        )}
        <div className="flex gap-2">
          <button
            onClick={saveAndExit}
            aria-label="Save and exit"
            className="flex items-center justify-center gap-1.5 px-3 py-3 rounded-lg border border-primary-200 text-primary-500 font-medium text-sm hover:bg-primary-50 transition-colors flex-shrink-0">
            <Pause className="w-4 h-4" />
          </button>
          <button onClick={()=>setCurrentItemIndex(i=>Math.max(0,i-1))} disabled={currentItemIndex===0} aria-label="Previous item" className="px-3 py-3 rounded-lg border border-primary-200 text-primary-500 font-medium text-sm disabled:opacity-30 flex-shrink-0 hover:bg-primary-50 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          {currentItemIndex < items.length - 1 && (
            <button
              onClick={()=>setCurrentItemIndex(i=>Math.min(items.length-1,i+1))}
              disabled={!currentReady}
              className="flex-1 py-3 rounded-lg font-semibold bg-primary-900 text-white disabled:bg-primary-200 disabled:text-primary-400 hover:bg-primary-800 transition-all flex items-center justify-center gap-2 min-w-0">
              <span className="truncate">Next Item</span> <ArrowRight className="w-4 h-4 flex-shrink-0"/>
            </button>
          )}
          {currentItemIndex === items.length - 1 && (
            <button
              onClick={completeSection}
              disabled={!canComplete || loading}
              className={`flex-1 py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all duration-200 min-w-0 ${
                canComplete
                  ? 'bg-accent-500 hover:bg-accent-600 text-white shadow-card'
                  : 'bg-white border border-primary-200 text-primary-300 cursor-not-allowed'
              }`}>
              <Check className="w-5 h-5 flex-shrink-0" />
              <span className="truncate">{sectionNum === totalSections ? 'Complete & Submit' : 'Next Section'}</span>
              <ArrowRight className="w-5 h-5 flex-shrink-0" />
            </button>
          )}
        </div>
      </div>

      {/* Photo camera overlay */}
      {showCamera && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] bg-black z-50 flex flex-col">
          <div className="flex justify-between items-center p-4 text-white">
            <button onClick={() => { setShowCamera(false); setActiveItem(null); }}><X className="w-6 h-6" /></button>
            <span className="font-medium">Take Photo</span>
            <div className="w-10" />
          </div>
          <CameraView onCapture={capturePhoto} />
        </div>
      )}

      {/* Video recorder overlay */}
      {showVideoRecorder && (
        <VideoRecorderView
          onCapture={handleVideoRecorded}
          onClose={() => { setShowVideoRecorder(false); setActiveVideoItem(null); }}
          title="Record Video"
        />
      )}
    </div>
  );
}
