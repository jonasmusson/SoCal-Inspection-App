import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface CheckinDraftData {
  template_id: string;
  customer_first_name: string;
  customer_last_name: string;
  customer_phone: string;
  customer_email: string;
  customer_address: string;
  customer_city: string;
  customer_state: string;
  customer_zip: string;
  vehicle_year: number;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_color: string;
  vehicle_vin: string;
  vehicle_mileage: number;
  checkin_notes: string;
  assigned_tech_id: string;
  checkin_step: 1 | 2;
}

export interface SavedPhoto {
  id: string;
  photo_url: string;
  upload_status: 'uploading' | 'saved' | 'failed';
}

export interface SavedVideo {
  video_url: string;
}

const EMPTY_DRAFT: CheckinDraftData = {
  template_id: '',
  customer_first_name: '', customer_last_name: '',
  customer_phone: '', customer_email: '',
  customer_address: '', customer_city: '', customer_state: '', customer_zip: '',
  vehicle_year: new Date().getFullYear(), vehicle_make: '', vehicle_model: '',
  vehicle_color: '', vehicle_vin: '', vehicle_mileage: 0, checkin_notes: '',
  assigned_tech_id: '',
  checkin_step: 1,
};

export function useCheckinDraft(draftId: string | null) {
  const [draftData, setDraftData] = useState<CheckinDraftData>(EMPTY_DRAFT);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [inspectionId, setInspectionId] = useState<string | null>(draftId);
  const [savedPhotos, setSavedPhotos] = useState<SavedPhoto[]>([]);
  const [savedVideoUrl, setSavedVideoUrl] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(!!draftId);
  const [draftError, setDraftError] = useState(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef<string>('');
  const pendingFilesRef = useRef<Map<string, File>>(new Map());

  // Load existing draft from DB when resuming
  useEffect(() => {
    if (!draftId) { setDraftLoading(false); return; }
    let mounted = true;
    (async () => {
      setDraftLoading(true);
      setDraftError(false);
      try {
        const { data: insp, error } = await supabase
          .from('inspections')
          .select('*')
          .eq('id', draftId)
          .maybeSingle();
        if (!mounted) return;
        if (error || !insp) { setDraftError(true); setDraftLoading(false); return; }

        const loaded: CheckinDraftData = {
          template_id: insp.template_id || '',
          customer_first_name: insp.customer_first_name || '',
          customer_last_name: insp.customer_last_name || '',
          customer_phone: insp.customer_phone || '',
          customer_email: insp.customer_email || '',
          customer_address: insp.customer_address || '',
          customer_city: insp.customer_city || '',
          customer_state: insp.customer_state || '',
          customer_zip: insp.customer_zip || '',
          vehicle_year: insp.vehicle_year || new Date().getFullYear(),
          vehicle_make: insp.vehicle_make || '',
          vehicle_model: insp.vehicle_model || '',
          vehicle_color: insp.vehicle_color || '',
          vehicle_vin: insp.vehicle_vin || '',
          vehicle_mileage: insp.vehicle_mileage || 0,
          checkin_notes: insp.checkin_notes || '',
          assigned_tech_id: insp.assigned_tech_id || '',
          checkin_step: (insp.checkin_step as 1 | 2) || 1,
        };
        setDraftData(loaded);
        lastSavedRef.current = JSON.stringify(loaded);
        setSavedVideoUrl(insp.checkin_video_url || null);

        // Load saved photos
        const { data: photos } = await supabase
          .from('checkin_photos')
          .select('id, photo_url, upload_status')
          .eq('inspection_id', draftId)
          .order('created_at');
        if (mounted && photos) {
          setSavedPhotos(photos.map(p => ({
            id: p.id,
            photo_url: p.photo_url,
            upload_status: p.upload_status as SavedPhoto['upload_status'],
          })));
        }
      } catch {
        if (mounted) setDraftError(true);
      } finally {
        if (mounted) setDraftLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [draftId]);

  const persist = useCallback(async (data: CheckinDraftData, id: string | null, createdBy: string): Promise<string | null> => {
    const payload = {
      template_id: data.template_id || null,
      customer_first_name: data.customer_first_name || '',
      customer_last_name: data.customer_last_name || '',
      customer_phone: data.customer_phone || '',
      customer_email: data.customer_email || '',
      customer_address: data.customer_address || null,
      customer_city: data.customer_city || null,
      customer_state: data.customer_state || null,
      customer_zip: data.customer_zip || null,
      vehicle_year: data.vehicle_year,
      vehicle_make: data.vehicle_make || '',
      vehicle_model: data.vehicle_model || '',
      vehicle_color: data.vehicle_color || null,
      vehicle_vin: data.vehicle_vin || null,
      vehicle_mileage: data.vehicle_mileage,
      checkin_notes: data.checkin_notes || null,
      assigned_tech_id: data.assigned_tech_id || null,
      checkin_step: data.checkin_step,
      checkin_complete: false,
      created_by: createdBy,
    };

    if (id) {
      const { error } = await supabase
        .from('inspections')
        .update(payload)
        .eq('id', id);
      if (error) return null;
      return id;
    } else {
      const { data: created, error } = await supabase
        .from('inspections')
        .insert(payload)
        .select('id')
        .single();
      if (error || !created) return null;
      return created.id;
    }
  }, []);

  // Debounced autosave — called whenever draftData changes
  const scheduleSave = useCallback((data: CheckinDraftData, createdBy: string) => {
    const snapshot = JSON.stringify(data);
    if (snapshot === lastSavedRef.current && inspectionId) return;

    setSaveStatus('saving');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const id = await persist(data, inspectionId, createdBy);
      if (id) {
        setInspectionId(id);
        lastSavedRef.current = snapshot;
        setSaveStatus('saved');
      } else {
        setSaveStatus('error');
      }
    }, 800);
  }, [inspectionId, persist]);

  // Update a single field and trigger autosave
  const updateField = useCallback(<K extends keyof CheckinDraftData>(
    key: K,
    value: CheckinDraftData[K],
    createdBy: string,
  ) => {
    setDraftData(prev => {
      const next = { ...prev, [key]: value };
      scheduleSave(next, createdBy);
      return next;
    });
  }, [scheduleSave]);

  const updateFields = useCallback((
    updates: Partial<CheckinDraftData>,
    createdBy: string,
  ) => {
    setDraftData(prev => {
      const next = { ...prev, ...updates };
      scheduleSave(next, createdBy);
      return next;
    });
  }, [scheduleSave]);

  // Upload a photo to storage + create DB record with status tracking
  const uploadPhoto = useCallback(async (file: File): Promise<void> => {
    if (!inspectionId) return;
    const fileName = `${inspectionId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

    // Create a placeholder record as 'uploading'
    const { data: photoRecord, error: insertErr } = await supabase
      .from('checkin_photos')
      .insert({
        inspection_id: inspectionId,
        photo_url: '',
        upload_status: 'uploading',
      })
      .select('id')
      .single();
    if (insertErr || !photoRecord) return;

    pendingFilesRef.current.set(photoRecord.id, file);
    setSavedPhotos(prev => [...prev, {
      id: photoRecord.id,
      photo_url: '',
      upload_status: 'uploading',
    }]);

    const { error: upErr } = await supabase.storage
      .from('checkin-photos')
      .upload(fileName, file, { contentType: 'image/jpeg' });

    if (upErr) {
      await supabase.from('checkin_photos')
        .update({ upload_status: 'failed' })
        .eq('id', photoRecord.id);
      setSavedPhotos(prev => prev.map(p =>
        p.id === photoRecord.id ? { ...p, upload_status: 'failed' } : p
      ));
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('checkin-photos')
      .getPublicUrl(fileName);

    await supabase.from('checkin_photos')
      .update({ photo_url: publicUrl, upload_status: 'saved' })
      .eq('id', photoRecord.id);

    setSavedPhotos(prev => prev.map(p =>
      p.id === photoRecord.id ? { ...p, photo_url: publicUrl, upload_status: 'saved' } : p
    ));
    pendingFilesRef.current.delete(photoRecord.id);
  }, [inspectionId]);

  // Retry a failed photo upload — uses the original stored file if available,
  // otherwise the caller must pass a replacement File
  const retryPhotoUpload = useCallback(async (photoId: string, replacementFile?: File): Promise<void> => {
    if (!inspectionId) return;
    const file = replacementFile || pendingFilesRef.current.get(photoId);
    if (!file) return;
    const fileName = `${inspectionId}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;

    pendingFilesRef.current.set(photoId, file);
    setSavedPhotos(prev => prev.map(p =>
      p.id === photoId ? { ...p, upload_status: 'uploading' } : p
    ));
    await supabase.from('checkin_photos')
      .update({ upload_status: 'uploading' })
      .eq('id', photoId);

    const { error: upErr } = await supabase.storage
      .from('checkin-photos')
      .upload(fileName, file, { contentType: 'image/jpeg' });

    if (upErr) {
      await supabase.from('checkin_photos')
        .update({ upload_status: 'failed' })
        .eq('id', photoId);
      setSavedPhotos(prev => prev.map(p =>
        p.id === photoId ? { ...p, upload_status: 'failed' } : p
      ));
      return;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('checkin-photos')
      .getPublicUrl(fileName);

    await supabase.from('checkin_photos')
      .update({ photo_url: publicUrl, upload_status: 'saved' })
      .eq('id', photoId);

    setSavedPhotos(prev => prev.map(p =>
      p.id === photoId ? { ...p, photo_url: publicUrl, upload_status: 'saved' } : p
    ));
    pendingFilesRef.current.delete(photoId);
  }, [inspectionId]);

  // Delete a saved photo
  const deletePhoto = useCallback(async (photoId: string) => {
    setSavedPhotos(prev => prev.filter(p => p.id !== photoId));
    await supabase.from('checkin_photos').delete().eq('id', photoId);
  }, []);

  // Upload walk-around video
  const uploadVideo = useCallback(async (file: File): Promise<void> => {
    if (!inspectionId) return;
    const ext = file.name.split('.').pop() || 'webm';
    const fileName = `${inspectionId}/${Date.now()}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('checkin-videos')
      .upload(fileName, file, { contentType: file.type });

    if (upErr) return;

    const { data: { publicUrl } } = supabase.storage
      .from('checkin-videos')
      .getPublicUrl(fileName);

    await supabase.from('inspections')
      .update({ checkin_video_url: publicUrl })
      .eq('id', inspectionId);

    setSavedVideoUrl(publicUrl);
  }, [inspectionId]);

  // Delete saved video
  const deleteVideo = useCallback(async () => {
    if (!inspectionId || !savedVideoUrl) return;
    await supabase.from('inspections')
      .update({ checkin_video_url: null })
      .eq('id', inspectionId);
    setSavedVideoUrl(null);
  }, [inspectionId, savedVideoUrl]);

  // Flush any pending save immediately (call before completing check-in)
  const flushSave = useCallback(async (createdBy: string): Promise<string | null> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveStatus('saving');
    const id = await persist(draftData, inspectionId, createdBy);
    if (id) {
      setInspectionId(id);
      lastSavedRef.current = JSON.stringify(draftData);
      setSaveStatus('saved');
    } else {
      setSaveStatus('error');
    }
    return id;
  }, [draftData, inspectionId, persist]);

  // Force-save current step
  const saveStep = useCallback((step: 1 | 2, createdBy: string) => {
    setDraftData(prev => {
      const next = { ...prev, checkin_step: step };
      scheduleSave(next, createdBy);
      return next;
    });
  }, [scheduleSave]);

  const hasMediaErrors = savedPhotos.some(p => p.upload_status === 'failed');

  return {
    draftData,
    draftLoading,
    draftError,
    inspectionId,
    saveStatus,
    savedPhotos,
    savedVideoUrl,
    hasMediaErrors,
    updateField,
    updateFields,
    saveStep,
    uploadPhoto,
    retryPhotoUpload,
    deletePhoto,
    uploadVideo,
    deleteVideo,
    flushSave,
    setDraftData,
  };
}
