import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useCheckinDraft } from '../hooks/useCheckinDraft';
import { InspectionTemplate, UserProfile, MediaMode } from '../types';
import { getMakesForYear, getModelsForMakeYear } from '../data/vehicles';
import { VEHICLE_COLORS } from '../data/vehicleColors';
import { CameraView, VideoRecorderView, SectionHelp } from '../components/common/CameraComponents';
import {
  ArrowLeft, Camera, Video, X, Check, ChevronRight, User, Car,
  FileText, Users, AlertCircle, Palette, CheckCircle, ClipboardList,
  Cloud, CloudOff, Loader2, RotateCw,
} from 'lucide-react';
import { withTimeout } from '../lib/async';

interface CheckinConfig {
  photosMode: MediaMode;
  videoMode: MediaMode;
  notesMode: MediaMode;
}

interface SuccessData {
  inspectionId: string;
  vehicleYear: number;
  vehicleMake: string;
  vehicleModel: string;
  customerName: string;
  techName: string | null;
  warnings: string[];
}

const DEFAULT_CONFIG: CheckinConfig = { photosMode: 'required', videoMode: 'optional', notesMode: 'optional' };

export function CheckInPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { draftId } = useParams<{ draftId: string }>();

  const draft = useCheckinDraft(draftId || null);

  const [step, setStep] = useState<1 | 2>(1);
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [requiredPhotos, setRequiredPhotos] = useState(3);
  const [checkinConfig, setCheckinConfig] = useState<CheckinConfig>(DEFAULT_CONFIG);
  const [initLoading, setInitLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);
  const [initError, setInitError] = useState(false);
  const [customMake, setCustomMake] = useState(false);
  const [customModel, setCustomModel] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);

  const profileId = profile?.id || '';

  useEffect(() => { loadInit(); }, []);
  useEffect(() => { if (draft.draftData.template_id) loadCheckinConfig(draft.draftData.template_id); }, [draft.draftData.template_id]);
  useEffect(() => {
    if (!draft.draftLoading) setStep(draft.draftData.checkin_step || 1);
  }, [draft.draftLoading]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [step]);

  async function loadInit() {
    setInitLoading(true);
    setInitError(false);
    try {
      const [{ data: tmplData }, { data: staffData }, { data: settingsData }] = await withTimeout(Promise.all([
        supabase.from('inspection_templates').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('user_profiles').select('*').eq('status', 'active').order('full_name'),
        supabase.from('shop_settings').select('key, value'),
      ]));
      if (tmplData?.length) {
        setTemplates(tmplData);
        if (!draft.draftData.template_id && !draftId) {
          draft.updateField('template_id', tmplData[0].id, profileId);
        }
      }
      if (staffData) setStaff(staffData as UserProfile[]);
      if (settingsData) {
        const get = (k: string) => settingsData.find((setting: { key: string; value: string }) => setting.key === k)?.value;
        if (get('checkin_required_photos')) setRequiredPhotos(parseInt(get('checkin_required_photos')!));
      }
    } catch {
      setInitError(true);
    } finally {
      setInitLoading(false);
    }
  }

  async function loadCheckinConfig(templateId: string) {
    const { data: sec } = await supabase
      .from('template_sections').select('id')
      .eq('template_id', templateId).eq('is_checkin', true).single();
    if (!sec) return;
    const { data: items } = await supabase
      .from('template_items').select('item_key, photo_mode, video_mode, notes_mode')
      .eq('section_id', sec.id).eq('is_active', true);
    if (!items) return;
    const find = (key: string) => items.find((item: { item_key: string }) => item.item_key === key);
    setCheckinConfig({
      photosMode: (find('checkin_photos')?.photo_mode as MediaMode) ?? 'required',
      videoMode: (find('checkin_video')?.video_mode as MediaMode) ?? 'optional',
      notesMode: (find('checkin_notes')?.notes_mode as MediaMode) ?? 'optional',
    });
  }

  function handlePhotoCapture(file: File) {
    draft.uploadPhoto(file);
    setShowCamera(false);
  }

  function handlePhotoUpload(files: FileList | null) {
    if (!files) return;
    Array.from(files)
      .filter(file => file.type.startsWith('image/'))
      .forEach(file => draft.uploadPhoto(file));
  }

  function handleVideoRecorded(file: File) {
    draft.uploadVideo(file);
    setShowVideoRecorder(false);
  }

  function handleVideoUpload(file: File | undefined) {
    if (file?.type.startsWith('video/')) draft.uploadVideo(file);
  }

  function goToStep(newStep: 1 | 2) {
    setStep(newStep);
    draft.saveStep(newStep, profileId);
  }

  const photosRequired = checkinConfig.photosMode === 'required';
  const videoRequired = checkinConfig.videoMode === 'required';
  const notesRequired = checkinConfig.notesMode === 'required';
  const showPhotos = checkinConfig.photosMode !== 'hidden';
  const showVideo = checkinConfig.videoMode !== 'hidden';
  const showNotes = checkinConfig.notesMode !== 'hidden';

  const savedPhotoCount = draft.savedPhotos.filter(p => p.upload_status === 'saved').length;
  const uploadingPhotoCount = draft.savedPhotos.filter(p => p.upload_status === 'uploading').length;
  const failedPhotoCount = draft.savedPhotos.filter(p => p.upload_status === 'failed').length;

  const photosOk = !photosRequired || savedPhotoCount >= requiredPhotos;
  const videoOk = !videoRequired || draft.savedVideoUrl !== null;
  const notesOk = !notesRequired || draft.draftData.checkin_notes.trim().length > 0;
  const mediaReady = photosOk && videoOk && draft.hasMediaErrors === false && uploadingPhotoCount === 0;
  const canSubmit = mediaReady && notesOk && !submitting;

  const step1Valid = !!(
    draft.draftData.template_id &&
    draft.draftData.customer_first_name.trim() &&
    draft.draftData.customer_last_name.trim() &&
    draft.draftData.customer_phone.trim() &&
    draft.draftData.customer_email.trim() &&
    draft.draftData.vehicle_make.trim() &&
    draft.draftData.vehicle_model.trim() &&
    draft.draftData.vehicle_mileage > 0 &&
    (!notesRequired || draft.draftData.checkin_notes.trim())
  );

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1929 }, (_, i) => currentYear - i);
  const makeOptions = getMakesForYear(draft.draftData.vehicle_year);
  const modelOptions = getModelsForMakeYear(draft.draftData.vehicle_make, draft.draftData.vehicle_year);

  if (initLoading || draft.draftLoading) return <div className="p-4 text-center text-gray-500">Loading...</div>;
  if (initError) return <div className="p-6 text-center"><p className="text-gray-600 mb-3">Check-in setup could not be loaded.</p><button onClick={loadInit} className="px-4 py-2 rounded-xl bg-primary-600 text-white font-medium">Try Again</button></div>;
  if (draft.draftError) return <div className="p-6 text-center"><p className="text-gray-600 mb-3">Could not load this check-in draft.</p><button onClick={() => navigate('/dashboard')} className="px-4 py-2 rounded-xl bg-primary-600 text-white font-medium">Back to Dashboard</button></div>;

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-sm w-full">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div className="bg-gradient-to-br from-success-500 to-success-600 px-8 py-10 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/20 mb-4">
                <CheckCircle className="w-9 h-9 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">Inspection Created!</h1>
              <p className="text-success-100 text-sm">Check-in completed successfully</p>
            </div>
            <div className="px-8 py-6 space-y-4">
              <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <Car className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="font-semibold text-gray-900">
                    {success.vehicleYear} {success.vehicleMake} {success.vehicleModel}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <span className="text-gray-600 text-sm">{success.customerName}</span>
                </div>
                {success.techName && (
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400 flex-shrink-0" />
                    <span className="text-gray-600 text-sm">Assigned to {success.techName}</span>
                  </div>
                )}
              </div>
              {success.warnings.length > 0 && (
                <div className="p-3 bg-warning-50 border border-warning-200 rounded-xl text-xs text-warning-700 space-y-1">
                  {success.warnings.map(warning => <p key={warning}>{warning}</p>)}
                </div>
              )}
              <button
                onClick={() => navigate('/dashboard')}
                className="w-full py-3.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2">
                <ClipboardList className="w-5 h-5" />
                Back to Dashboard
              </button>
              <button
                onClick={() => navigate(`/inspection/${success.inspectionId}`)}
                className="w-full py-3 border-2 border-gray-200 hover:border-gray-300 text-gray-600 font-medium rounded-xl transition-colors text-sm">
                View Inspection
              </button>
              <button
                onClick={() => navigate('/checkin')}
                className="w-full py-3 text-primary-600 font-medium text-sm hover:underline">
                + Check In Another Vehicle
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const d = draft.draftData;
  const upd = <K extends keyof typeof d>(key: K, value: (typeof d)[K]) => draft.updateField(key, value, profileId);
  const updMany = (updates: Partial<typeof d>) => draft.updateFields(updates, profileId);

  return (
    <div className="pb-36">
      {/* Header with save status */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <div className="flex items-center gap-3">
          <button aria-label={step === 1 ? 'Back to dashboard' : 'Back to vehicle details'}
            onClick={() => step === 1 ? navigate('/dashboard') : goToStep(1)}
            className="text-gray-500">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900">Vehicle Check-In</h1>
            {step === 2 && (
              <p className="text-xs text-gray-500 truncate">
                {d.vehicle_year} {d.vehicle_make} {d.vehicle_model}{d.vehicle_color ? ` · ${d.vehicle_color}` : ''}
              </p>
            )}
          </div>
          <SaveStatusBadge status={draft.saveStatus} onRetry={() => draft.flushSave(profileId)} />
          <div className="flex items-center gap-1.5">
            <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${step === 1 ? 'bg-primary-600 text-white' : 'bg-success-500 text-white'}`}>
              {step === 1 ? '1' : <Check className="w-3.5 h-3.5" />}
            </span>
            <ChevronRight className="w-3 h-3 text-gray-300" />
            <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${step === 2 ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500'}`}>2</span>
          </div>
        </div>
      </div>

      {/* ── Step 1: Info ─────────────────────────────────────────────────────── */}
      {step === 1 && (
        <form onSubmit={e => { e.preventDefault(); if (step1Valid) goToStep(2); }} className="p-4 space-y-5">

          {/* Inspection Type */}
          <section className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Inspection Type</h3>
              <SectionHelp text="Select the type of inspection. This determines what sections and items will be checked." />
            </div>
            <select value={d.template_id} onChange={e => upd('template_id', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </section>

          {/* Customer */}
          <section className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <User className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Customer</h3>
            </div>
            <SectionHelp text="Enter the customer's contact info. First name, last name, phone, and email are required." />
            <div className="grid grid-cols-2 gap-3 mt-3 mb-3">
              <div className="relative">
                <input placeholder="First Name" value={d.customer_first_name}
                  onChange={e => upd('customer_first_name', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required />
                <RequiredDot filled={!!d.customer_first_name.trim()} />
              </div>
              <div className="relative">
                <input placeholder="Last Name" value={d.customer_last_name}
                  onChange={e => upd('customer_last_name', e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required />
                <RequiredDot filled={!!d.customer_last_name.trim()} />
              </div>
            </div>
            <div className="relative mb-3">
              <input placeholder="Phone" value={d.customer_phone}
                onChange={e => upd('customer_phone', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required />
              <RequiredDot filled={!!d.customer_phone.trim()} />
            </div>
            <div className="relative mb-3">
              <input type="email" placeholder="Email" value={d.customer_email}
                onChange={e => upd('customer_email', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required />
              <RequiredDot filled={!!d.customer_email.trim()} />
            </div>
            <input placeholder="Street Address (optional)" value={d.customer_address}
              onChange={e => upd('customer_address', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm mb-3" />
            <div className="grid grid-cols-5 gap-2">
              <input placeholder="City" value={d.customer_city}
                onChange={e => upd('customer_city', e.target.value)}
                className="col-span-2 px-4 py-3 border border-gray-300 rounded-xl text-sm" />
              <input placeholder="State" value={d.customer_state}
                onChange={e => upd('customer_state', e.target.value)}
                maxLength={2}
                className="col-span-1 px-4 py-3 border border-gray-300 rounded-xl text-sm uppercase" />
              <input placeholder="ZIP" value={d.customer_zip}
                onChange={e => upd('customer_zip', e.target.value)}
                className="col-span-2 px-4 py-3 border border-gray-300 rounded-xl text-sm" />
            </div>
          </section>

          {/* Vehicle */}
          <section className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <Car className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Vehicle</h3>
            </div>
            <SectionHelp text="Enter the vehicle details. Make, model, and mileage are required." />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3 mb-3">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-500 mb-1">Year</span>
                <select aria-label="Vehicle year" value={d.vehicle_year} onChange={e => {
                  const yr = parseInt(e.target.value);
                  setCustomMake(false);
                  setCustomModel(false);
                  updMany({ vehicle_year: yr, vehicle_make: '', vehicle_model: '' });
                }} className="w-full px-3 py-3 border border-gray-300 rounded-xl text-sm">
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </label>

              <div>
                <label htmlFor="vehicle-make" className="block text-xs font-semibold text-gray-500 mb-1">Make</label>
                <div className="relative">
                  <select id="vehicle-make" aria-label="Vehicle make"
                    value={customMake ? '__custom__' : d.vehicle_make}
                    onChange={e => {
                      if (e.target.value === '__custom__') {
                        setCustomMake(true);
                        setCustomModel(true);
                        updMany({ vehicle_make: '', vehicle_model: '' });
                      } else {
                        setCustomMake(false);
                        setCustomModel(false);
                        updMany({ vehicle_make: e.target.value, vehicle_model: '' });
                      }
                    }}
                    className="w-full px-3 py-3 border border-gray-300 rounded-xl text-sm" required={!customMake}>
                    <option value="">Select make...</option>
                    {makeOptions.map(m => <option key={m} value={m}>{m}</option>)}
                    <option value="__custom__">Other / Custom...</option>
                  </select>
                  {!customMake && <RequiredDot filled={!!d.vehicle_make.trim()} />}
                </div>
                {customMake && (
                  <div className="relative mt-2">
                    <input aria-label="Custom vehicle make" placeholder="Enter make" value={d.vehicle_make}
                      onChange={e => updMany({ vehicle_make: e.target.value, vehicle_model: '' })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required autoFocus />
                    <RequiredDot filled={!!d.vehicle_make.trim()} />
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="vehicle-model" className="block text-xs font-semibold text-gray-500 mb-1">Model</label>
                {customModel || (!!d.vehicle_make && modelOptions.length === 0) ? (
                  <div className="relative">
                    <input id="vehicle-model" aria-label="Custom vehicle model" placeholder="Enter model" value={d.vehicle_model}
                      onChange={e => upd('vehicle_model', e.target.value)}
                      className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required />
                    <RequiredDot filled={!!d.vehicle_model.trim()} />
                  </div>
                ) : (
                  <div className="relative">
                    <select id="vehicle-model" aria-label="Vehicle model" value={d.vehicle_model}
                      onChange={e => {
                        if (e.target.value === '__custom__') {
                          setCustomModel(true);
                          upd('vehicle_model', '');
                        } else {
                          upd('vehicle_model', e.target.value);
                        }
                      }}
                      disabled={!d.vehicle_make}
                      className="w-full px-3 py-3 border border-gray-300 rounded-xl text-sm disabled:bg-gray-100 disabled:text-gray-400" required>
                      <option value="">{d.vehicle_make ? 'Select model...' : 'Select make first'}</option>
                      {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
                      {d.vehicle_make && <option value="__custom__">Other / Custom...</option>}
                    </select>
                    <RequiredDot filled={!!d.vehicle_model.trim()} />
                  </div>
                )}
              </div>
            </div>

            {/* Color picker */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Palette className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Color</span>
                {d.vehicle_color && (
                  <span className="ml-auto text-xs font-medium text-gray-600">{d.vehicle_color}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {VEHICLE_COLORS.map(c => (
                  <button key={c.name} type="button"
                    onClick={() => upd('vehicle_color', d.vehicle_color === c.name ? '' : c.name)}
                    title={c.name}
                    style={{ backgroundColor: c.hex }}
                    className={`w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center ${
                      d.vehicle_color === c.name
                        ? 'border-primary-600 ring-2 ring-primary-300 scale-110'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}>
                    {d.vehicle_color === c.name && (
                      <Check className={`w-4 h-4 ${c.textDark ? 'text-gray-700' : 'text-white'}`} strokeWidth={3} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <input type="number" aria-label="Vehicle mileage" placeholder="Mileage" value={d.vehicle_mileage || ''}
                  onChange={e => upd('vehicle_mileage', parseInt(e.target.value) || 0)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required min={0} />
                <RequiredDot filled={d.vehicle_mileage > 0} />
              </div>
              <input placeholder="VIN (optional)" value={d.vehicle_vin}
                onChange={e => upd('vehicle_vin', e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-xl text-sm" />
            </div>
          </section>

          {/* Customer Concerns */}
          {showNotes && (
            <section className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                  Customer Concerns {notesRequired && <span className="text-danger-500 font-bold ml-0.5">*</span>}
                </h3>
              </div>
              <SectionHelp text="Document any concerns, issues, or requests the customer mentioned at drop-off." />
              <textarea value={d.checkin_notes}
                onChange={e => upd('checkin_notes', e.target.value)}
                placeholder={notesRequired ? 'Required — enter customer concerns or known issues...' : 'Known issues, customer concerns, or items to look into...'}
                rows={4}
                className={`w-full mt-3 px-4 py-3 border rounded-xl text-sm resize-none ${notesRequired && !d.checkin_notes.trim() ? 'border-warning-300 bg-warning-50' : 'border-gray-300'}`} />
            </section>
          )}

          {/* Step 1 Continue button */}
          <button
            type="submit"
            disabled={!step1Valid}
            className={`w-full py-3.5 font-semibold rounded-xl flex items-center justify-center gap-2 transition-all duration-200 ${
              step1Valid
                ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-sm'
                : 'bg-white border-2 border-gray-200 text-gray-300 cursor-not-allowed'
            }`}
          >
            Continue to Media &amp; Assignment
            <ChevronRight className="w-5 h-5" />
          </button>

          {!step1Valid && (
            <p className="text-xs text-center text-gray-400 -mt-2">
              Complete all required fields above to continue
            </p>
          )}
        </form>
      )}

      {/* ── Step 2: Media + Assignment ─────────────────────────────────────── */}
      {step === 2 && (
        <div className="p-4 space-y-5">

          {/* Check-In Photos */}
          {showPhotos && (
            <section className={`bg-white rounded-xl p-4 shadow-sm border transition-colors ${!photosOk ? 'border-warning-300' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Check-In Photos</h3>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${
                  photosRequired
                    ? (savedPhotoCount >= requiredPhotos ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700')
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {photosRequired ? `${savedPhotoCount} / ${requiredPhotos} required` : `${savedPhotoCount} saved`}
                </span>
              </div>
              <SectionHelp text="Photograph all sides of the vehicle to document pre-existing condition before work begins." />

              {draft.savedPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3 mb-3">
                  {draft.savedPhotos.map(p => (
                    <div key={p.id} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                      {p.upload_status === 'uploading' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2">
                          <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
                          <span className="text-xs text-gray-500">Uploading...</span>
                        </div>
                      ) : p.upload_status === 'failed' ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-1">
                          <CloudOff className="w-6 h-6 text-danger-400" />
                          <span className="text-xs text-danger-600 text-center font-medium">Upload failed</span>
                          <button onClick={() => draft.retryPhotoUpload(p.id)}
                            className="text-xs text-primary-600 font-medium flex items-center gap-1">
                            <RotateCw className="w-3 h-3" /> Retry
                          </button>
                        </div>
                      ) : (
                        <>
                          <img src={p.photo_url} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => draft.deletePhoto(p.id)}
                            className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {uploadingPhotoCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-primary-600 mb-2">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Uploading {uploadingPhotoCount} photo{uploadingPhotoCount > 1 ? 's' : ''}...
                </div>
              )}

              {failedPhotoCount > 0 && (
                <div className="flex items-start gap-2 p-2 bg-danger-50 border border-danger-200 rounded-lg mb-2">
                  <AlertCircle className="w-4 h-4 text-danger-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-danger-700">{failedPhotoCount} photo{failedPhotoCount > 1 ? 's' : ''} failed to upload. Tap Retry on each failed photo to try again.</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setShowCamera(true)}
                  className="flex items-center gap-2 text-sm font-medium px-3 py-2.5 rounded-xl border border-gray-300 text-gray-700 justify-center hover:bg-gray-50">
                  <Camera className="w-4 h-4" /> Use Camera
                </button>
                <label className={`flex items-center gap-2 text-sm font-medium px-3 py-2.5 rounded-xl border justify-center cursor-pointer transition-colors ${
                  photosRequired && savedPhotoCount < requiredPhotos
                    ? 'border-primary-400 text-primary-600 bg-primary-50 hover:bg-primary-100'
                    : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}>
                  <FileText className="w-4 h-4" /> Upload Photos
                  <input type="file" accept="image/*" multiple className="sr-only"
                    onChange={e => { handlePhotoUpload(e.target.files); e.target.value = ''; }} />
                </label>
              </div>
            </section>
          )}

          {/* Walk-Around Video */}
          {showVideo && (
            <section className={`bg-white rounded-xl p-4 shadow-sm border transition-colors ${!videoOk ? 'border-warning-300' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Walk-Around Video</h3>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${
                  draft.savedVideoUrl ? 'bg-success-100 text-success-700' : videoRequired ? 'bg-warning-100 text-warning-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {draft.savedVideoUrl ? 'Saved' : videoRequired ? 'Required' : 'Optional'}
                </span>
              </div>
              <SectionHelp text="Record a full walk-around to capture any pre-existing dents, scratches, or damage on all sides." />

              {draft.savedVideoUrl && (
                <div className="mt-3 mb-3 p-3 bg-success-50 border border-success-200 rounded-xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-success-100 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-success-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-success-700">Video uploaded</p>
                  </div>
                  <button onClick={() => draft.deleteVideo()}
                    className="text-success-500 hover:text-danger-500 transition-colors flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-3">
                <button type="button" onClick={() => setShowVideoRecorder(true)}
                  className="flex items-center gap-2 text-sm font-medium px-3 py-2.5 rounded-xl border border-gray-300 text-gray-700 justify-center hover:bg-gray-50">
                  <Video className="w-4 h-4" /> {draft.savedVideoUrl ? 'Re-record' : 'Record Video'}
                </button>
                <label className={`flex items-center gap-2 text-sm font-medium px-3 py-2.5 rounded-xl border justify-center cursor-pointer ${
                  !draft.savedVideoUrl && videoRequired ? 'border-primary-400 text-primary-600 bg-primary-50 hover:bg-primary-100' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}>
                  <FileText className="w-4 h-4" /> Upload Video
                  <input type="file" accept="video/*" className="sr-only"
                    onChange={e => { handleVideoUpload(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </div>
            </section>
          )}

          {/* Assign To */}
          <section className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Assign To</h3>
            </div>
            <SectionHelp text="Assign this inspection to a staff member. They will receive a notification when assigned." />
            <div className="grid grid-cols-2 gap-2 mt-3 mb-3">
              <button type="button" onClick={() => upd('assigned_tech_id', profileId)}
                className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${d.assigned_tech_id === profileId ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                Assign to Me
              </button>
              <button type="button" onClick={() => upd('assigned_tech_id', '')}
                className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${d.assigned_tech_id === '' ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-300 text-gray-400 hover:bg-gray-50'}`}>
                Unassigned
              </button>
            </div>
            <select value={d.assigned_tech_id} onChange={e => upd('assigned_tech_id', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm">
              <option value="">Select staff member...</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.role})</option>)}
            </select>
          </section>

          {/* Validation summary */}
          {(!photosOk || !videoOk || !notesOk) && (
            <div className="flex items-start gap-2 p-3 bg-warning-50 border border-warning-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-warning-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-warning-700 space-y-0.5">
                {!photosOk && <p>Need {requiredPhotos - savedPhotoCount} more check-in photo{requiredPhotos - savedPhotoCount > 1 ? 's' : ''}</p>}
                {!videoOk && <p>Walk-around video is required</p>}
                {!notesOk && <p>Customer concerns / notes are required</p>}
              </div>
            </div>
          )}

          {draft.hasMediaErrors && (
            <div className="flex items-start gap-2 p-3 bg-danger-50 border border-danger-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-danger-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-danger-700">Some photos failed to upload. Cannot complete check-in until all uploads succeed. Retry the failed uploads above.</p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-danger-50 border border-danger-200 rounded-xl">
              <AlertCircle className="w-4 h-4 text-danger-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-danger-700">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Bottom action bar */}
      {step === 2 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
          {/* Summary strip */}
          <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 flex items-center gap-3 text-xs text-gray-500">
            <span className={`flex items-center gap-1 font-medium ${photosOk ? 'text-success-600' : 'text-warning-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${photosOk ? 'bg-success-500' : 'bg-warning-400'}`} />
              {savedPhotoCount} photo{savedPhotoCount !== 1 ? 's' : ''}{uploadingPhotoCount > 0 ? ` (${uploadingPhotoCount} uploading)` : ''}
            </span>
            <span className={`flex items-center gap-1 font-medium ${videoOk ? 'text-success-600' : 'text-warning-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${videoOk ? 'bg-success-500' : 'bg-warning-400'}`} />
              {draft.savedVideoUrl ? 'Video saved' : 'No video'}
            </span>
            <span className="flex items-center gap-1 font-medium text-gray-500 ml-auto">
              {d.assigned_tech_id ? `Assigned: ${staff.find(s => s.id === d.assigned_tech_id)?.full_name?.split(' ')[0] ?? 'Me'}` : 'Unassigned'}
            </span>
          </div>
          <div className="bg-white border-t border-gray-200 p-4">
            <button
              onClick={handleComplete}
              disabled={!canSubmit}
              className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
                canSubmit
                  ? 'bg-success-600 hover:bg-success-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Check className="w-5 h-5" />
              {submitting ? 'Completing...' : 'Complete Check-In & Save'}
            </button>
            {!canSubmit && !submitting && (
              <p className="text-xs text-center text-gray-400 mt-1.5">
                {draft.hasMediaErrors ? 'Fix failed uploads to continue' :
                 uploadingPhotoCount > 0 ? 'Waiting for uploads to finish...' :
                 !photosOk ? `Add ${requiredPhotos - savedPhotoCount} more photo${requiredPhotos - savedPhotoCount > 1 ? 's' : ''} to continue` :
                 !videoOk ? 'Record the walk-around video to continue' :
                 'Complete all required items above to continue'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Camera overlay */}
      {showCamera && (
        <div className="fixed inset-x-0 top-0 h-[100dvh] bg-black z-50 flex flex-col">
          <div className="flex justify-between items-center p-4 text-white">
            <button onClick={() => setShowCamera(false)}><X className="w-6 h-6" /></button>
            <span className="font-medium">
              Photo {draft.savedPhotos.length + 1}{photosRequired ? ` of ${requiredPhotos} min` : ''}
            </span>
            <div className="w-10" />
          </div>
          <CameraView onCapture={handlePhotoCapture} />
        </div>
      )}

      {/* Video recorder overlay */}
      {showVideoRecorder && (
        <VideoRecorderView
          onCapture={handleVideoRecorded}
          onClose={() => setShowVideoRecorder(false)}
          title="Walk-Around Video"
        />
      )}
    </div>
  );

  async function handleComplete() {
    if (!draft.inspectionId || !profile) return;
    setError(null);
    setSubmitting(true);

    // Flush any pending autosave
    await draft.flushSave(profileId);

    const id = draft.inspectionId;

    // Mark check-in as complete
    const { error: completeErr } = await supabase.from('inspections')
      .update({ checkin_complete: true })
      .eq('id', id);

    if (completeErr) {
      setError('Failed to complete check-in. Please try again.');
      setSubmitting(false);
      return;
    }

    // Create inspection sections + items from the template
    const { data: tSections, error: tSecErr } = await supabase.from('template_sections')
      .select('id, section_name, sort_order')
      .eq('template_id', draft.draftData.template_id)
      .eq('is_active', true)
      .eq('is_checkin', false)
      .order('sort_order');

    if (tSecErr || !tSections?.length) {
      setError('Failed to load template sections. Your check-in data is saved — try completing again.');
      setSubmitting(false);
      return;
    }

    // Check if sections already exist (from a previous completion attempt)
    const { data: existingSections } = await supabase.from('inspection_sections')
      .select('id').eq('inspection_id', id);

    if (!existingSections?.length) {
      const { data: sections, error: secInsErr } = await supabase.from('inspection_sections')
        .insert(tSections.map((s, i) => ({ inspection_id: id, section_number: i + 1, section_name: s.section_name })))
        .select('id, section_number');

      if (secInsErr || !sections) {
        setError('Failed to create inspection sections. Your check-in data is saved — try completing again.');
        setSubmitting(false);
        return;
      }

      const { data: tItems } = await supabase.from('template_items').select('*')
        .in('section_id', tSections.map(s => s.id)).eq('is_active', true).order('sort_order');
      if (tItems?.length) {
        const allItems = tSections.flatMap((tSec, i) => {
          const dbSec = sections.find(s => s.section_number === i + 1);
          if (!dbSec) return [];
          return tItems.filter(item => item.section_id === tSec.id).map(item => ({
            section_id: dbSec.id, item_name: item.item_name, item_key: item.item_key,
            photo_required: item.photo_required, video_required: item.video_required,
            notes_required: item.notes_required, photo_mode: item.photo_mode,
            video_mode: item.video_mode, notes_mode: item.notes_mode,
          }));
        });
        await supabase.from('inspection_items').insert(allItems);
      }
    }

    const warnings: string[] = [];

    // Notify tech if assigned
    if (draft.draftData.assigned_tech_id) {
      const tech = staff.find(s => s.id === draft.draftData.assigned_tech_id);
      if (tech?.role === 'tech') {
        const { data: notificationResult, error: notificationError } = await supabase.functions.invoke('notify-tech-assignment', { body: { inspectionId: id, techId: draft.draftData.assigned_tech_id } });
        if (notificationError || notificationResult?.emailSent !== true) warnings.push('Inspection saved, but the technician assignment email was not delivered.');
      }
    }

    const tech = staff.find(s => s.id === draft.draftData.assigned_tech_id);
    setSubmitting(false);
    setSuccess({
      inspectionId: id,
      vehicleYear: draft.draftData.vehicle_year,
      vehicleMake: draft.draftData.vehicle_make,
      vehicleModel: draft.draftData.vehicle_model,
      customerName: `${draft.draftData.customer_first_name} ${draft.draftData.customer_last_name}`.trim(),
      techName: tech ? (tech.first_name || tech.full_name?.split(' ')[0] || null) : null,
      warnings,
    });
  }
}

function SaveStatusBadge({ status, onRetry }: { status: 'idle' | 'saving' | 'saved' | 'error'; onRetry: () => void }) {
  if (status === 'idle') return null;
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1 text-xs text-primary-600 font-medium flex-shrink-0">
        <Loader2 className="w-3 h-3 animate-spin" /> Saving...
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1 text-xs text-success-600 font-medium flex-shrink-0">
        <Cloud className="w-3 h-3" /> Saved
      </span>
    );
  }
  return (
    <button onClick={onRetry} className="flex items-center gap-1 text-xs text-danger-600 font-medium flex-shrink-0 hover:text-danger-700">
      <CloudOff className="w-3 h-3" /> Save failed — Retry
    </button>
  );
}

function RequiredDot({ filled }: { filled: boolean }) {
  return (
    <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full transition-colors ${filled ? 'bg-success-400' : 'bg-gray-300'}`} />
  );
}
