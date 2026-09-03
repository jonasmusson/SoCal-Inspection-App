import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { InspectionTemplate, UserProfile, MediaMode } from '../types';
import { getMakesForYear, getModelsForMakeYear } from '../data/vehicles';
import { VEHICLE_COLORS } from '../data/vehicleColors';
import { CameraView, VideoRecorderView, SectionHelp } from '../components/common/CameraComponents';
import {
  ArrowLeft, Camera, Video, X, Check, ChevronRight, User, Car,
  FileText, Users, AlertCircle, Palette, CheckCircle, ClipboardList,
} from 'lucide-react';

interface LocalPhoto { file: File; preview: string; }

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

  const [step, setStep] = useState<1 | 2>(1);
  const [templates, setTemplates] = useState<InspectionTemplate[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [requiredPhotos, setRequiredPhotos] = useState(3);
  const [checkinConfig, setCheckinConfig] = useState<CheckinConfig>(DEFAULT_CONFIG);
  const [initLoading, setInitLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessData | null>(null);

  const [form, setForm] = useState({
    template_id: '',
    customer_first_name: '', customer_last_name: '',
    customer_phone: '', customer_email: '',
    customer_address: '', customer_city: '', customer_state: '', customer_zip: '',
    vehicle_year: new Date().getFullYear(), vehicle_make: '', vehicle_model: '',
    vehicle_color: '', vehicle_vin: '', vehicle_mileage: 0, checkin_notes: '',
  });

  const [localPhotos, setLocalPhotos] = useState<LocalPhoto[]>([]);
  const [localVideo, setLocalVideo] = useState<File | null>(null);
  const [assignedTechId, setAssignedTechId] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);

  useEffect(() => { loadInit(); }, []);
  useEffect(() => { if (form.template_id) loadCheckinConfig(form.template_id); }, [form.template_id]);

  async function loadInit() {
    const [{ data: tmplData }, { data: staffData }, { data: settingsData }] = await Promise.all([
      supabase.from('inspection_templates').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('user_profiles').select('*').eq('status', 'active').order('full_name'),
      supabase.from('shop_settings').select('key, value'),
    ]);
    if (tmplData?.length) { setTemplates(tmplData); setForm(f => ({ ...f, template_id: tmplData[0].id })); }
    if (staffData) setStaff(staffData as UserProfile[]);
    if (settingsData) {
      const get = (k: string) => settingsData.find((setting: { key: string; value: string }) => setting.key === k)?.value;
      if (get('checkin_required_photos')) setRequiredPhotos(parseInt(get('checkin_required_photos')!));
    }
    setInitLoading(false);
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
    setLocalPhotos(prev => [...prev, { file, preview: URL.createObjectURL(file) }]);
    setShowCamera(false);
  }

  function handlePhotoUpload(files: FileList | null) {
    if (!files) return;
    const additions = Array.from(files)
      .filter(file => file.type.startsWith('image/'))
      .map(file => ({ file, preview: URL.createObjectURL(file) }));
    setLocalPhotos(prev => [...prev, ...additions]);
  }

  function removePhoto(idx: number) {
    setLocalPhotos(prev => { URL.revokeObjectURL(prev[idx].preview); return prev.filter((_, i) => i !== idx); });
  }

  function handleVideoRecorded(file: File) {
    setLocalVideo(file);
    setShowVideoRecorder(false);
  }

  function handleVideoUpload(file: File | undefined) {
    if (file?.type.startsWith('video/')) setLocalVideo(file);
  }

  const photosRef = useRef<HTMLElement | null>(null);
  const videoSectionRef = useRef<HTMLElement | null>(null);

  async function handleSubmit() {
    if (!form.template_id || !profile) return;
    setError(null);
    setSubmitting(true);

    const { data: inspection, error: inspErr } = await supabase.from('inspections').insert({
      customer_first_name: form.customer_first_name,
      customer_last_name: form.customer_last_name,
      customer_phone: form.customer_phone,
      customer_email: form.customer_email,
      customer_address: form.customer_address || null,
      customer_city: form.customer_city || null,
      customer_state: form.customer_state || null,
      customer_zip: form.customer_zip || null,
      vehicle_year: form.vehicle_year,
      vehicle_make: form.vehicle_make,
      vehicle_model: form.vehicle_model,
      vehicle_color: form.vehicle_color || null,
      vehicle_vin: form.vehicle_vin || null,
      vehicle_mileage: form.vehicle_mileage,
      checkin_notes: form.checkin_notes || null,
      assigned_tech_id: assignedTechId || null,
      created_by: profile.id,
      template_id: form.template_id,
      checkin_complete: true,
    }).select('id').single();

    if (inspErr || !inspection) {
      console.error('Failed to create inspection:', inspErr);
      setError('Failed to create inspection. Please try again.');
      setSubmitting(false);
      return;
    }

    const { data: tSections, error: tSecErr } = await supabase.from('template_sections')
      .select('id, section_name, sort_order')
      .eq('template_id', form.template_id)
      .eq('is_active', true)
      .eq('is_checkin', false)
      .order('sort_order');

    if (tSecErr || !tSections?.length) {
      await supabase.from('inspections').delete().eq('id', inspection.id);
      setError('Failed to load template sections. Please try again.');
      setSubmitting(false);
      return;
    }

    const { data: sections, error: secInsErr } = await supabase.from('inspection_sections')
      .insert(tSections.map((s, i) => ({ inspection_id: inspection.id, section_number: i + 1, section_name: s.section_name })))
      .select('id, section_number');

    if (secInsErr || !sections) {
      await supabase.from('inspections').delete().eq('id', inspection.id);
      setError('Failed to create inspection sections. Please try again.');
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

    const warnings: string[] = [];

    const photoResults = await Promise.all(localPhotos.map(async (p, idx) => {
      const fileName = `${inspection.id}/${Date.now()}_${idx}.jpg`;
      const { error: upErr } = await supabase.storage.from('checkin-photos').upload(fileName, p.file, { contentType: 'image/jpeg' });
      if (upErr) return false;
      const { data: { publicUrl } } = supabase.storage.from('checkin-photos').getPublicUrl(fileName);
      const { error: recordError } = await supabase.from('checkin_photos').insert({ inspection_id: inspection.id, photo_url: publicUrl });
      return !recordError;
    }));
    if (photoResults.some(result => !result)) warnings.push('One or more check-in photos could not be saved.');

    if (localVideo) {
      const ext = localVideo.name.split('.').pop() || 'webm';
      const fileName = `${inspection.id}/${Date.now()}.${ext}`;
      const { error: videoUploadError } = await supabase.storage.from('checkin-videos').upload(fileName, localVideo, { contentType: localVideo.type });
      if (videoUploadError) {
        warnings.push('The walk-around video could not be saved.');
      } else {
        const { data: { publicUrl } } = supabase.storage.from('checkin-videos').getPublicUrl(fileName);
        const { error: videoRecordError } = await supabase.from('inspections').update({ checkin_video_url: publicUrl }).eq('id', inspection.id);
        if (videoRecordError) warnings.push('The walk-around video could not be linked to the inspection.');
      }
    }

    if (assignedTechId) {
      const tech = staff.find(s => s.id === assignedTechId);
      if (tech?.role === 'tech') {
        const { data: notificationResult, error: notificationError } = await supabase.functions.invoke('notify-tech-assignment', { body: { inspectionId: inspection.id, techId: assignedTechId } });
        if (notificationError || notificationResult?.emailSent !== true) warnings.push('Inspection saved, but the technician assignment email was not delivered.');
      }
    }

    const tech = staff.find(s => s.id === assignedTechId);
    setSubmitting(false);
    setSuccess({
      inspectionId: inspection.id,
      vehicleYear: form.vehicle_year,
      vehicleMake: form.vehicle_make,
      vehicleModel: form.vehicle_model,
      customerName: `${form.customer_first_name} ${form.customer_last_name}`.trim(),
      techName: tech ? (tech.first_name || tech.full_name?.split(' ')[0] || null) : null,
      warnings,
    });
  }

  const photosRequired = checkinConfig.photosMode === 'required';
  const videoRequired = checkinConfig.videoMode === 'required';
  const notesRequired = checkinConfig.notesMode === 'required';
  const showPhotos = checkinConfig.photosMode !== 'hidden';
  const showVideo = checkinConfig.videoMode !== 'hidden';
  const showNotes = checkinConfig.notesMode !== 'hidden';

  const photosOk = !photosRequired || localPhotos.length >= requiredPhotos;
  const videoOk = !videoRequired || localVideo !== null;
  const notesOk = !notesRequired || form.checkin_notes.trim().length > 0;
  const canSubmit = photosOk && videoOk && notesOk && !submitting;

  const step1Valid = !!(
    form.template_id &&
    form.customer_first_name.trim() &&
    form.customer_last_name.trim() &&
    form.customer_phone.trim() &&
    form.customer_email.trim() &&
    form.vehicle_make.trim() &&
    form.vehicle_model.trim() &&
    form.vehicle_mileage > 0 &&
    (!notesRequired || form.checkin_notes.trim())
  );

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1929 }, (_, i) => currentYear - i);
  const makeOptions = getMakesForYear(form.vehicle_year);
  const modelOptions = getModelsForMakeYear(form.vehicle_make, form.vehicle_year);

  if (initLoading) return <div className="p-4 text-center text-gray-500">Loading...</div>;

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

  return (
    <div className="pb-40">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => step === 1 ? navigate('/dashboard') : setStep(1)} className="text-gray-500">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Vehicle Check-In</h1>
            {step === 2 && (
              <p className="text-xs text-gray-500 truncate">
                {form.vehicle_year} {form.vehicle_make} {form.vehicle_model}{form.vehicle_color ? ` · ${form.vehicle_color}` : ''}
              </p>
            )}
          </div>
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
        <form onSubmit={e => { e.preventDefault(); if (step1Valid) setStep(2); }} className="p-4 space-y-5">

          {/* Inspection Type */}
          <section className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Inspection Type</h3>
              <SectionHelp text="Select the type of inspection. This determines what sections and items will be checked." />
            </div>
            <select value={form.template_id} onChange={e => setForm({ ...form, template_id: e.target.value })}
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
                <input placeholder="First Name" value={form.customer_first_name}
                  onChange={e => setForm({ ...form, customer_first_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required />
                <RequiredDot filled={!!form.customer_first_name.trim()} />
              </div>
              <div className="relative">
                <input placeholder="Last Name" value={form.customer_last_name}
                  onChange={e => setForm({ ...form, customer_last_name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required />
                <RequiredDot filled={!!form.customer_last_name.trim()} />
              </div>
            </div>
            <div className="relative mb-3">
              <input placeholder="Phone" value={form.customer_phone}
                onChange={e => setForm({ ...form, customer_phone: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required />
              <RequiredDot filled={!!form.customer_phone.trim()} />
            </div>
            <div className="relative mb-3">
              <input type="email" placeholder="Email" value={form.customer_email}
                onChange={e => setForm({ ...form, customer_email: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required />
              <RequiredDot filled={!!form.customer_email.trim()} />
            </div>
            {/* Full address */}
            <input placeholder="Street Address (optional)" value={form.customer_address}
              onChange={e => setForm({ ...form, customer_address: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm mb-3" />
            <div className="grid grid-cols-5 gap-2">
              <input placeholder="City" value={form.customer_city}
                onChange={e => setForm({ ...form, customer_city: e.target.value })}
                className="col-span-2 px-4 py-3 border border-gray-300 rounded-xl text-sm" />
              <input placeholder="State" value={form.customer_state}
                onChange={e => setForm({ ...form, customer_state: e.target.value })}
                maxLength={2}
                className="col-span-1 px-4 py-3 border border-gray-300 rounded-xl text-sm uppercase" />
              <input placeholder="ZIP" value={form.customer_zip}
                onChange={e => setForm({ ...form, customer_zip: e.target.value })}
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
            <div className="grid grid-cols-3 gap-3 mt-3 mb-3">
              <select value={form.vehicle_year} onChange={e => {
                const yr = parseInt(e.target.value);
                setForm(f => ({ ...f, vehicle_year: yr, vehicle_make: '', vehicle_model: '' }));
              }} className="px-3 py-3 border border-gray-300 rounded-xl text-sm">
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div className="relative">
                <input list="makes-list" placeholder="Make" value={form.vehicle_make}
                  onChange={e => setForm(f => ({ ...f, vehicle_make: e.target.value, vehicle_model: '' }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required />
                <datalist id="makes-list">{makeOptions.map(m => <option key={m} value={m} />)}</datalist>
                <RequiredDot filled={!!form.vehicle_make.trim()} />
              </div>
              <div className="relative">
                <input list="models-list" placeholder="Model" value={form.vehicle_model}
                  onChange={e => setForm(f => ({ ...f, vehicle_model: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required />
                <datalist id="models-list">{modelOptions.map(m => <option key={m} value={m} />)}</datalist>
                <RequiredDot filled={!!form.vehicle_model.trim()} />
              </div>
            </div>

            {/* Color picker */}
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2">
                <Palette className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Color</span>
                {form.vehicle_color && (
                  <span className="ml-auto text-xs font-medium text-gray-600">{form.vehicle_color}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {VEHICLE_COLORS.map(c => (
                  <button key={c.name} type="button"
                    onClick={() => setForm(f => ({ ...f, vehicle_color: f.vehicle_color === c.name ? '' : c.name }))}
                    title={c.name}
                    style={{ backgroundColor: c.hex }}
                    className={`w-9 h-9 rounded-full border-2 transition-all flex items-center justify-center ${
                      form.vehicle_color === c.name
                        ? 'border-primary-600 ring-2 ring-primary-300 scale-110'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}>
                    {form.vehicle_color === c.name && (
                      <Check className={`w-4 h-4 ${c.textDark ? 'text-gray-700' : 'text-white'}`} strokeWidth={3} />
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative">
                <input type="number" placeholder="Mileage" value={form.vehicle_mileage || ''}
                  onChange={e => setForm({ ...form, vehicle_mileage: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm" required min={0} />
                <RequiredDot filled={form.vehicle_mileage > 0} />
              </div>
              <input placeholder="VIN (optional)" value={form.vehicle_vin}
                onChange={e => setForm({ ...form, vehicle_vin: e.target.value })}
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
              <textarea value={form.checkin_notes}
                onChange={e => setForm({ ...form, checkin_notes: e.target.value })}
                placeholder={notesRequired ? 'Required — enter customer concerns or known issues...' : 'Known issues, customer concerns, or items to look into...'}
                rows={4}
                className={`w-full mt-3 px-4 py-3 border rounded-xl text-sm resize-none ${notesRequired && !form.checkin_notes.trim() ? 'border-warning-300 bg-warning-50' : 'border-gray-300'}`} />
            </section>
          )}

          {/* Step 1 Continue button — ghost until valid */}
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
            <section ref={el => { photosRef.current = el; }} className={`bg-white rounded-xl p-4 shadow-sm border transition-colors ${!photosOk ? 'border-warning-300' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Check-In Photos</h3>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${
                  photosRequired
                    ? (localPhotos.length >= requiredPhotos ? 'bg-success-100 text-success-700' : 'bg-warning-100 text-warning-700')
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {photosRequired ? `${localPhotos.length} / ${requiredPhotos} required` : `${localPhotos.length} added`}
                </span>
              </div>
              <SectionHelp text="Photograph all sides of the vehicle to document pre-existing condition before work begins." />

              {localPhotos.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3 mb-3">
                  {localPhotos.map((p, i) => (
                    <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                      <img src={p.preview} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => removePhoto(i)}
                        className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
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
                  photosRequired && localPhotos.length < requiredPhotos
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
            <section ref={el => { videoSectionRef.current = el; }} className={`bg-white rounded-xl p-4 shadow-sm border transition-colors ${!videoOk ? 'border-warning-300' : 'border-gray-200'}`}>
              <div className="flex items-start justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Video className="w-4 h-4 text-gray-400" />
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Walk-Around Video</h3>
                </div>
                <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${
                  localVideo ? 'bg-success-100 text-success-700' : videoRequired ? 'bg-warning-100 text-warning-700' : 'bg-gray-100 text-gray-500'
                }`}>
                  {localVideo ? 'Recorded' : videoRequired ? 'Required' : 'Optional'}
                </span>
              </div>
              <SectionHelp text="Record a full walk-around to capture any pre-existing dents, scratches, or damage on all sides." />

              {localVideo && (
                <div className="mt-3 mb-3 p-3 bg-success-50 border border-success-200 rounded-xl flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-success-100 flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-success-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-success-700 truncate">{localVideo.name}</p>
                    <p className="text-xs text-success-600">{(localVideo.size / (1024 * 1024)).toFixed(1)} MB</p>
                  </div>
                  <button onClick={() => setLocalVideo(null)}
                    className="text-success-500 hover:text-danger-500 transition-colors flex-shrink-0">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mt-3">
                <button type="button" onClick={() => setShowVideoRecorder(true)}
                  className="flex items-center gap-2 text-sm font-medium px-3 py-2.5 rounded-xl border border-gray-300 text-gray-700 justify-center hover:bg-gray-50">
                  <Video className="w-4 h-4" /> {localVideo ? 'Re-record' : 'Record Video'}
                </button>
                <label className={`flex items-center gap-2 text-sm font-medium px-3 py-2.5 rounded-xl border justify-center cursor-pointer ${
                  !localVideo && videoRequired ? 'border-primary-400 text-primary-600 bg-primary-50 hover:bg-primary-100' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}>
                  <FileText className="w-4 h-4" /> Upload Video
                  <input type="file" accept="video/*" className="sr-only"
                    onChange={e => { handleVideoUpload(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
              </div>
            </section>
          )}

          {/* Assign To — AFTER media so the flow is: photos → video → assign → save */}
          <section className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Assign To</h3>
            </div>
            <SectionHelp text="Assign this inspection to a staff member. They will receive a notification when assigned." />
            <div className="grid grid-cols-2 gap-2 mt-3 mb-3">
              <button type="button" onClick={() => setAssignedTechId(profile?.id || '')}
                className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${assignedTechId === profile?.id ? 'border-primary-400 bg-primary-50 text-primary-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                Assign to Me
              </button>
              <button type="button" onClick={() => setAssignedTechId('')}
                className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors ${assignedTechId === '' ? 'border-gray-400 bg-gray-100 text-gray-700' : 'border-gray-300 text-gray-400 hover:bg-gray-50'}`}>
                Unassigned
              </button>
            </div>
            <select value={assignedTechId} onChange={e => setAssignedTechId(e.target.value)}
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
                {!photosOk && <p>Need {requiredPhotos - localPhotos.length} more check-in photo{requiredPhotos - localPhotos.length > 1 ? 's' : ''}</p>}
                {!videoOk && <p>Walk-around video is required</p>}
                {!notesOk && <p>Customer concerns / notes are required</p>}
              </div>
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

      {/* Bottom action bar — z-50 to float above the Layout nav bar (z-40) */}
      {step === 2 && (
        <div className="fixed bottom-0 left-0 right-0 z-50">
          {/* Summary strip */}
          <div className="bg-gray-50 border-t border-gray-200 px-4 py-2 flex items-center gap-3 text-xs text-gray-500">
            <span className={`flex items-center gap-1 font-medium ${photosOk ? 'text-success-600' : 'text-warning-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${photosOk ? 'bg-success-500' : 'bg-warning-400'}`} />
              {localPhotos.length} photo{localPhotos.length !== 1 ? 's' : ''}
            </span>
            <span className={`flex items-center gap-1 font-medium ${videoOk ? 'text-success-600' : 'text-warning-600'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${videoOk ? 'bg-success-500' : 'bg-warning-400'}`} />
              {localVideo ? 'Video ready' : 'No video'}
            </span>
            <span className="flex items-center gap-1 font-medium text-gray-500 ml-auto">
              {assignedTechId ? `Assigned: ${staff.find(s => s.id === assignedTechId)?.full_name?.split(' ')[0] ?? 'Me'}` : 'Unassigned'}
            </span>
          </div>
          <div className="bg-white border-t border-gray-200 p-4">
            <button
              onClick={handleSubmit}
              disabled={!canSubmit || submitting}
              className={`w-full py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all duration-200 ${
                canSubmit
                  ? 'bg-success-600 hover:bg-success-700 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              <Check className="w-5 h-5" />
              {submitting ? 'Creating Inspection...' : 'Complete Check-In & Save'}
            </button>
            {!canSubmit && !submitting && (
              <p className="text-xs text-center text-gray-400 mt-1.5">
                {!photosOk ? `Add ${requiredPhotos - localPhotos.length} more photo${requiredPhotos - localPhotos.length > 1 ? 's' : ''} to continue` :
                 !videoOk ? 'Record the walk-around video to continue' :
                 'Complete all required items above to continue'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Camera overlay */}
      {showCamera && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex justify-between items-center p-4 text-white">
            <button onClick={() => setShowCamera(false)}><X className="w-6 h-6" /></button>
            <span className="font-medium">
              Photo {localPhotos.length + 1}{photosRequired ? ` of ${requiredPhotos} min` : ''}
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
}

function RequiredDot({ filled }: { filled: boolean }) {
  return (
    <span className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full transition-colors ${filled ? 'bg-success-400' : 'bg-gray-300'}`} />
  );
}
