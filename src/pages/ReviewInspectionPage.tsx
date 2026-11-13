import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Inspection, InspectionSection, InspectionItem, InspectionPhoto, InspectionVideo, CheckinPhoto, ItemCondition, PriorityLevel } from '../types';
import { ArrowLeft, Check, AlertTriangle, Eye, Send, Eye as Preview, ClipboardList, MinusCircle, Save, Link as LinkIcon } from 'lucide-react';
import { withTimeout } from '../lib/async';
import { InspectionReport } from '../components/report/InspectionReport';

const PRIORITY_OPTIONS: { value: PriorityLevel; label: string; color: string; bg: string }[] = [
  { value: 'immediate',  label: 'Immediate',   color: 'text-danger-700',  bg: 'bg-danger-100 border-danger-300'  },
  { value: 'short_term', label: 'Short-Term',  color: 'text-warning-700', bg: 'bg-warning-100 border-warning-300' },
  { value: 'long_term',  label: 'Long-Term',   color: 'text-blue-700',    bg: 'bg-blue-100 border-blue-300'      },
  { value: 'upgrade',    label: 'Upgrade',      color: 'text-purple-700',  bg: 'bg-purple-100 border-purple-300'  },
];

export function ReviewInspectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isManager, isOwner } = useAuth();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  const [overall, setOverall] = useState<ItemCondition | null>(null);
  const [guidance, setGuidance] = useState('');
  const [managerNotes, setManagerNotes] = useState('');
  const [priorities, setPriorities] = useState<Record<string, PriorityLevel>>({});
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [primaryRecommendation, setPrimaryRecommendation] = useState('');
  const [photos, setPhotos] = useState<InspectionPhoto[]>([]);
  const [videos, setVideos] = useState<InspectionVideo[]>([]);
  const [checkinPhotos, setCheckinPhotos] = useState<CheckinPhoto[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [laborRate, setLaborRate] = useState(175);

  useEffect(() => { if (id) loadInspection(id); }, [id]);
  useEffect(() => { if (!isManager && !isOwner) navigate('/'); }, [isManager, isOwner, navigate]);

  async function loadInspection(inspectionId: string) {
    setLoading(true);
    setLoadError(false);
    try {
    const { data, error } = await withTimeout(supabase.from('inspections').select('*').eq('id', inspectionId).single());
    if (error) throw error;
    if (data) {
      setInspection(data);
      const { data: laborRateSetting } = await withTimeout(supabase
        .from('shop_settings').select('value').eq('key', 'labor_rate').maybeSingle());
      const configuredLaborRate = Number(laborRateSetting?.value);
      if (Number.isFinite(configuredLaborRate) && configuredLaborRate > 0) setLaborRate(configuredLaborRate);
      const { data: checkinPhotoData } = await withTimeout(supabase
        .from('checkin_photos').select('*').eq('inspection_id', inspectionId).order('created_at'));
      setCheckinPhotos(checkinPhotoData || []);
      setOverall(data.overall_condition);
      setGuidance(data.investment_guidance || '');
      setManagerNotes(data.manager_notes || '');
      setExecutiveSummary(data.executive_summary || ''); setPrimaryRecommendation(data.primary_recommendation || '');
      const { data: secData, error: sectionError } = await withTimeout(supabase
        .from('inspection_sections').select('*').eq('inspection_id', inspectionId).order('section_number'));
      if (sectionError) throw sectionError;
      setSections(secData || []);
      if (secData?.length) {
        const { data: itemData, error: itemError } = await withTimeout(supabase
          .from('inspection_items').select('*').in('section_id', secData.map(s => s.id)).order('created_at'));
        if (itemError) throw itemError;
        const loaded = itemData || [];
        setItems(loaded);
        const p: Record<string, PriorityLevel> = {};
        loaded.forEach(i => { if (i.priority) p[i.id] = i.priority as PriorityLevel; });
        setPriorities(p);
        if (loaded.length) {
          const [photoResult, videoResult] = await Promise.all([
            withTimeout(supabase.from('inspection_photos').select('*').in('item_id', loaded.map(i=>i.id))),
            withTimeout(supabase.from('inspection_videos').select('*').in('item_id', loaded.map(i=>i.id))),
          ]);
          setPhotos(photoResult.data || []);
          setVideos(videoResult.data || []);
        } else {
          setPhotos([]);
          setVideos([]);
        }
      }
    }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  function setPriority(itemId: string, p: PriorityLevel) {
    setPriorities(prev => ({ ...prev, [itemId]: p }));
  }

  async function saveDraft() {
    if (!inspection) return;
    setFeedback(null);
    setSaving(true);
    const priorityResults = await Promise.all(
      Object.entries(priorities).map(([itemId, priority]) =>
        supabase.from('inspection_items').update({ priority }).eq('id', itemId)
      )
    );
    const priorityError = priorityResults.find(result => result.error)?.error;
    const { error: inspectionError } = await supabase.from('inspections').update({
      overall_condition: overall,
      investment_guidance: guidance || null,
      manager_notes: managerNotes || null,
      executive_summary: executiveSummary || null,
      primary_recommendation: primaryRecommendation || null,
    }).eq('id', inspection.id);
    setSaving(false);
    if (priorityError || inspectionError) {
      setFeedback({ type: 'error', message: 'The review draft could not be saved. Please check your connection and try again.' });
      return;
    }
    setFeedback({ type: 'success', message: 'Review draft saved.' });
  }

  function validateReport() {
    if (!inspection || !overall) return false;
    const attentionItems = items.filter(item => item.status === 'needs_attention');
    const missingPriority = attentionItems.find(item => !priorities[item.id]);
    if (!executiveSummary.trim()) {
      setFeedback({ type: 'error', message: 'Add an Executive Summary before approving the customer report.' });
      return false;
    }
    if (attentionItems.length > 0 && !primaryRecommendation.trim()) {
      setFeedback({ type: 'error', message: 'Add a Recommended Next Step before approving a report with items requiring attention.' });
      return false;
    }
    if (missingPriority) {
      setFeedback({ type: 'error', message: `Set a report priority for ${missingPriority.item_name} before approving.` });
      return false;
    }
    return true;
  }

  async function approveReport() {
    if (!inspection || !overall || !validateReport()) return;
    setFeedback(null);
    setSaving(true);

    const updates = Object.entries(priorities).map(([itemId, p]) =>
      supabase.from('inspection_items').update({ priority: p }).eq('id', itemId)
    );
    const priorityResults = await Promise.all(updates);

    const { error: approvalError } = await supabase.from('inspections').update({
      status: 'approved', overall_condition: overall,
      investment_guidance: guidance || null,
      manager_notes: managerNotes || null,
      executive_summary: executiveSummary || null, primary_recommendation: primaryRecommendation || null,
      report_approved: true, approved_at: new Date().toISOString(),
    }).eq('id', inspection.id);

    if (approvalError || priorityResults.some(result => result.error)) {
      setSaving(false);
      setFeedback({ type: 'error', message: 'The report could not be approved. Please check your connection and try again.' });
      return;
    }

    setInspection(prev => prev ? { ...prev, status: 'approved', overall_condition: overall, report_approved: true } : prev);
    setSaving(false);
    setActiveTab('preview');
    setFeedback({ type: 'success', message: 'Report approved. You can print it or save it as a PDF now. Email delivery can be completed later.' });
  }

  async function sendReport() {
    if (!inspection || !validateReport()) return;
    if (!inspection.report_approved && inspection.status !== 'approved' && inspection.status !== 'sent') {
      setFeedback({ type: 'error', message: 'Approve the report before sending it by email.' });
      return;
    }
    setSaving(true);

    const { data: fnData, error } = await supabase.functions.invoke('send-inspection-report', { body: { inspectionId: inspection.id } });
    if (error || fnData?.success === false || fnData?.emailSent === false) {
      setFeedback({ type: 'error', message: 'Report approved but email delivery failed. Email delivery can be configured when the app goes live.' });
      setSaving(false);
      return;
    }
    if (fnData?.usingTestSender) {
      setFeedback({ type: 'success', message: 'Report sent using the temporary test sender.' });
    }

    await supabase.from('inspections').update({
      status: 'sent', report_sent: true, report_sent_at: new Date().toISOString(),
    }).eq('id', inspection.id);
    setSaving(false);
    navigate(`/inspection/${inspection.id}`);
  }

  async function copyCustomerReportLink() {
    if (!inspection?.report_access_token) {
      setFeedback({ type: 'error', message: 'Publish the customer-report database migration before copying a report link.' });
      return;
    }
    const reportUrl = `${window.location.origin}/report/${inspection.report_access_token}`;
    try {
      await navigator.clipboard.writeText(reportUrl);
      setFeedback({ type: 'success', message: 'Private customer report link copied.' });
    } catch {
      setFeedback({ type: 'error', message: `Copy this customer report link: ${reportUrl}` });
    }
  }

  if (loading) return <div className="p-4 text-center text-gray-500">Loading...</div>;
  if (loadError) return <div className="p-6 text-center"><p className="text-gray-600 mb-3">The report could not be loaded.</p><button onClick={() => id && loadInspection(id)} className="px-4 py-2 rounded-xl bg-primary-600 text-white font-medium">Try Again</button></div>;
  if (!inspection) return <div className="p-4 text-center text-gray-500">Not found</div>;

  const needsAttention = items.filter(i => i.status === 'needs_attention');
  const monitor = items.filter(i => i.status === 'monitor');
  const good = items.filter(i => i.status === 'good');
  const notInspected = items.filter(i => i.status === 'not_inspected');
  const prioritiesComplete = needsAttention.every(item => !!priorities[item.id]);
  const reportReady = !!overall && !!executiveSummary.trim()
    && (needsAttention.length === 0 || !!primaryRecommendation.trim())
    && prioritiesComplete;

  return (
    <div className="pb-28">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button aria-label="Back to inspection" onClick={() => navigate(`/inspection/${id}`)} className="text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-gray-900 truncate">
              {inspection.vehicle_year} {inspection.vehicle_make} {inspection.vehicle_model}
            </h1>
            <p className="text-sm text-gray-500">
              {inspection.customer_first_name} {inspection.customer_last_name} · {inspection.customer_email}
            </p>
          </div>
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
          <button onClick={() => setActiveTab('edit')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'edit' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            <ClipboardList className="w-4 h-4" /> Edit
          </button>
          <button onClick={() => setActiveTab('preview')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'preview' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            <Preview className="w-4 h-4" /> Preview Report
          </button>
        </div>
      </div>

      {/* ── EDIT TAB ── */}
      {activeTab === 'edit' && (
        <div className="p-4 space-y-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900">Executive Summary</h2>
              <p className="text-xs text-gray-400 mt-1">Lead with the vehicle's overall story—not a list of defects.</p>
              <textarea value={executiveSummary} onChange={e => setExecutiveSummary(e.target.value)}
                placeholder="Describe the vehicle's strengths, principal concerns, and practical path forward..."
                className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none" rows={4} />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">Recommended Next Step</label>
              <textarea value={primaryRecommendation} onChange={e => setPrimaryRecommendation(e.target.value)}
                placeholder="The first action we recommend and why..."
                className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none" rows={2} />
            </div>
          </div>

          {/* Overall Assessment */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-3">Overall Assessment</h2>
            <div className="flex gap-2 mb-4">
              {(['good', 'monitor', 'needs_attention'] as ItemCondition[]).map(c => (
                <button key={c} onClick={() => setOverall(c)}
                  className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                    overall === c
                      ? c === 'good' ? 'bg-success-500 text-white' : c === 'monitor' ? 'bg-warning-500 text-white' : 'bg-danger-500 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {c === 'good' ? 'All Good' : c === 'monitor' ? 'Monitor' : 'Needs Attention'}
                </button>
              ))}
            </div>
            <select value={guidance} onChange={e => setGuidance(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm">
              <option value="">Investment Guidance (optional)</option>
              <option value="minor">Minor Investment</option>
              <option value="moderate">Moderate Investment</option>
              <option value="significant">Significant Investment</option>
              <option value="prioritized">Prioritized Repairs</option>
            </select>
          </div>

          {/* Needs Attention */}
          {needsAttention.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-danger-200">
              <div className="p-4 border-b border-danger-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-danger-500" />
                <h2 className="font-semibold text-gray-900">Needs Attention ({needsAttention.length})</h2>
                <span className="ml-auto text-xs text-gray-400">Set priority for report</span>
              </div>
              <div className="divide-y divide-gray-100">
                {needsAttention.map(item => {
                  const sec = sections.find(s => s.id === item.section_id);
                  const currentPriority = priorities[item.id];
                  return (
                    <div key={item.id} className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{item.item_name}</p>
                          <p className="text-xs text-gray-400">{sec?.section_name}</p>
                        </div>
                      </div>
                      {item.notes && (
                        <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mb-3 italic">
                          "{item.notes}"
                        </p>
                      )}
                      {item.impact && <p className="text-sm text-gray-600 mb-2"><strong>Why it matters:</strong> {item.impact}</p>}{item.recommended_action && <p className="text-sm text-gray-600 mb-2"><strong>Recommended:</strong> {item.recommended_action}</p>}
                      <div className="flex flex-wrap gap-1.5">
                        {PRIORITY_OPTIONS.map(opt => (
                          <button key={opt.value} type="button"
                            onClick={() => setPriority(item.id, opt.value)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                              currentPriority === opt.value
                                ? `${opt.bg} ${opt.color} shadow-sm`
                                : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}>
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Monitor */}
          {monitor.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-warning-200">
              <div className="p-4 border-b border-warning-100 flex items-center gap-2">
                <Eye className="w-5 h-5 text-warning-500" />
                <h2 className="font-semibold text-gray-900">Monitor ({monitor.length})</h2>
              </div>
              <div className="divide-y divide-gray-100">
                {monitor.map(item => {
                  const sec = sections.find(s => s.id === item.section_id);
                  return (
                    <div key={item.id} className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                      <p className="text-xs text-gray-400">{sec?.section_name}</p>
                      {item.notes && <p className="text-sm text-gray-500 mt-1 italic">"{item.notes}"</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* All Good summary */}
          {good.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-success-200">
              <div className="p-4 border-b border-success-100 flex items-center gap-2">
                <Check className="w-5 h-5 text-success-500" />
                <h2 className="font-semibold text-gray-900">All Good ({good.length})</h2>
              </div>
              <div className="p-4 flex flex-wrap gap-1.5">
                {good.map(item => (
                  <span key={item.id} className="px-2.5 py-1 bg-success-50 text-success-700 text-xs font-medium rounded-full border border-success-200">
                    {item.item_name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {notInspected.length>0 && <div className="bg-white rounded-xl shadow-sm border border-gray-200"><div className="p-4 border-b flex items-center gap-2"><MinusCircle className="w-5 h-5 text-gray-500"/><h2 className="font-semibold">Not Inspected ({notInspected.length})</h2></div>{notInspected.map(i=><div key={i.id} className="px-4 py-3 border-t"><p className="text-sm font-medium">{i.item_name}</p><p className="text-xs text-gray-500">{i.not_inspected_reason}</p></div>)}</div>}

          {/* Manager Notes */}
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
            <h2 className="font-semibold text-gray-900 mb-1">Notes to Customer</h2>
            <p className="text-xs text-gray-400 mb-3">Visible in the customer report</p>
            <textarea value={managerNotes} onChange={e => setManagerNotes(e.target.value)}
              placeholder="Additional context, recommendations, or next steps for the customer..."
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm resize-none" rows={4} />
          </div>
        </div>
      )}

      {/* ── PREVIEW TAB ── */}
      {activeTab === 'preview' && (
        <div className="p-4">
          <InspectionReport
            inspection={inspection}
            sections={sections}
            items={items}
            photos={photos}
            videos={videos}
            checkinPhotos={checkinPhotos}
            priorities={priorities}
            overall={overall}
            guidance={guidance}
            managerNotes={managerNotes}
            executiveSummary={executiveSummary}
            primaryRecommendation={primaryRecommendation}
            laborRate={laborRate}
          />
        </div>
      )}

      {/* Keep review actions within the document while previewing so they do not
          obscure the customer-facing report. The edit view retains the fixed bar. */}
      <div className={`${activeTab === 'preview'
        ? 'mx-4 mb-8 rounded-xl border border-gray-200 bg-white p-4 shadow-sm'
        : 'fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white p-4 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]'
      } print:hidden`}>
        {feedback && <p role="status" className={`text-xs text-center mb-2 font-medium ${feedback.type === 'success' ? 'text-success-700' : 'text-danger-700'}`}>
          {feedback.message}
        </p>}
        {!reportReady && <p className="text-xs text-center text-warning-700 mb-2 font-medium">
          {!overall ? 'Select an overall assessment' : !executiveSummary.trim() ? 'Add the Executive Summary' : needsAttention.length > 0 && !primaryRecommendation.trim() ? 'Add the Recommended Next Step' : 'Set a priority for every item requiring attention'}
        </p>}
        {(inspection.report_approved || inspection.status === 'approved' || inspection.status === 'sent') && inspection.report_access_token && (
          <div className="mx-auto mb-3 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-success-200 bg-success-50 px-4 py-3">
            <div><p className="text-sm font-semibold text-success-800">Customer report is ready</p><p className="text-xs text-success-700">Private link · no app login required</p></div>
            <div className="flex gap-2">
              <a href={`/report/${inspection.report_access_token}`} target="_blank" rel="noreferrer"
                className="rounded-lg border border-success-300 bg-white px-3 py-2 text-xs font-semibold text-success-800 hover:bg-success-100">Open Customer View</a>
              <button onClick={copyCustomerReportLink} disabled={saving}
                className="flex items-center gap-1.5 rounded-lg bg-success-700 px-3 py-2 text-xs font-semibold text-white hover:bg-success-800 disabled:opacity-50">
                <LinkIcon className="h-4 w-4" /> Copy Link
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-3 max-w-3xl mx-auto">
          <button onClick={saveDraft} disabled={saving}
            className="flex-1 py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            <Save className="w-5 h-5" /> {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button onClick={inspection.report_approved || inspection.status === 'approved' || inspection.status === 'sent' ? sendReport : approveReport} disabled={!reportReady || saving}
            className={`flex-[2] py-3.5 rounded-xl font-semibold flex items-center justify-center gap-2 transition-colors ${
              reportReady ? 'bg-primary-600 hover:bg-primary-700 text-white' : 'bg-gray-100 text-gray-400'
            }`}>
            {inspection.report_approved || inspection.status === 'approved' || inspection.status === 'sent'
              ? <Send className="w-5 h-5" />
              : <Check className="w-5 h-5" />}
            {saving ? 'Working...' : inspection.status === 'sent' ? 'Resend Report Email' : inspection.report_approved || inspection.status === 'approved' ? 'Send Report by Email' : 'Approve Report'}
          </button>
        </div>
      </div>
    </div>
  );
}
