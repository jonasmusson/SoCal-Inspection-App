import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Inspection, InspectionSection, InspectionItem, InspectionPhoto, ItemCondition, PriorityLevel } from '../types';
import { VEHICLE_COLORS } from '../data/vehicleColors';
import { ArrowLeft, Check, AlertTriangle, Eye, Send, Eye as Preview, ClipboardList, MinusCircle, Printer, Save } from 'lucide-react';
import { withTimeout } from '../lib/async';

const PRIORITY_OPTIONS: { value: PriorityLevel; label: string; color: string; bg: string }[] = [
  { value: 'immediate',  label: 'Immediate',   color: 'text-danger-700',  bg: 'bg-danger-100 border-danger-300'  },
  { value: 'short_term', label: 'Short-Term',  color: 'text-warning-700', bg: 'bg-warning-100 border-warning-300' },
  { value: 'long_term',  label: 'Long-Term',   color: 'text-blue-700',    bg: 'bg-blue-100 border-blue-300'      },
  { value: 'upgrade',    label: 'Upgrade',      color: 'text-purple-700',  bg: 'bg-purple-100 border-purple-300'  },
];

const GUIDANCE_LABELS: Record<string, string> = {
  minor:       'Minor Investment — Routine maintenance, low-priority items',
  moderate:    'Moderate Investment — Several items need timely attention',
  significant: 'Significant Investment — Major repairs or safety concerns identified',
  prioritized: 'Prioritized Repairs — Critical items requiring immediate attention',
};

export function ReviewInspectionPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isManager, isOwner } = useAuth();

  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [sections, setSections] = useState<InspectionSection[]>([]);
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  const [overall, setOverall] = useState<ItemCondition | null>(null);
  const [guidance, setGuidance] = useState('');
  const [managerNotes, setManagerNotes] = useState('');
  const [priorities, setPriorities] = useState<Record<string, PriorityLevel>>({});
  const [executiveSummary, setExecutiveSummary] = useState('');
  const [primaryRecommendation, setPrimaryRecommendation] = useState('');
  const [photos, setPhotos] = useState<InspectionPhoto[]>([]);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => { if (id) loadInspection(id); }, [id]);
  useEffect(() => { if (!isManager && !isOwner) navigate('/'); }, [isManager, isOwner, navigate]);

  async function loadInspection(inspectionId: string) {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await withTimeout(
        supabase.from('inspections').select('*').eq('id', inspectionId).single(),
      );
      if (data) {
        setInspection(data);
        setOverall(data.overall_condition);
        setGuidance(data.investment_guidance || '');
        setManagerNotes(data.manager_notes || '');
        setExecutiveSummary(data.executive_summary || ''); setPrimaryRecommendation(data.primary_recommendation || '');
        const { data: secData } = await supabase
          .from('inspection_sections').select('*').eq('inspection_id', inspectionId).order('section_number');
        setSections(secData || []);
        if (secData?.length) {
          const { data: itemData } = await supabase
            .from('inspection_items').select('*').in('section_id', secData.map(s => s.id)).order('created_at');
          const loaded = itemData || [];
          setItems(loaded);
          const p: Record<string, PriorityLevel> = {};
          loaded.forEach(i => { if (i.priority) p[i.id] = i.priority as PriorityLevel; });
          setPriorities(p);
          if (loaded.length > 0) {
            const { data: photoData } = await supabase.from('inspection_photos').select('*').in('item_id', loaded.map(i=>i.id)); setPhotos(photoData || []);
          } else {
            setPhotos([]);
          }
        } else {
          setPhotos([]);
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

  if (loading) return <div className="p-4 text-center text-gray-500">Loading...</div>;
  if (loadError) return (
    <div className="p-4 text-center py-12">
      <AlertTriangle className="w-12 h-12 text-danger-300 mx-auto mb-3" />
      <p className="text-gray-600 mb-4">Unable to load the inspection for review. Check your connection and try again.</p>
      <button onClick={() => id && loadInspection(id)}
        className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl">
        Try Again
      </button>
    </div>
  );
  if (!inspection) return <div className="p-4 text-center text-gray-500">Not found</div>;

  const needsAttention = items.filter(i => i.status === 'needs_attention');
  const monitor = items.filter(i => i.status === 'monitor');
  const good = items.filter(i => i.status === 'good');
  const notInspected = items.filter(i => i.status === 'not_inspected');
  const prioritiesComplete = needsAttention.every(item => !!priorities[item.id]);
  const reportReady = !!overall && !!executiveSummary.trim()
    && (needsAttention.length === 0 || !!primaryRecommendation.trim())
    && prioritiesComplete;
  const colorMeta = VEHICLE_COLORS.find(c => c.name === inspection.vehicle_color);

  return (
    <div className="pb-[160px]">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 z-10 px-4 py-3">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => navigate(`/inspection/${id}`)} className="text-gray-600" aria-label="Back to inspection">
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
          <ReportPreview
            inspection={inspection}
            sections={sections}
            needsAttention={needsAttention}
            monitor={monitor}
            good={good}
            notInspected={notInspected} photos={photos}
            priorities={priorities}
            overall={overall}
            guidance={guidance}
            managerNotes={managerNotes}
            executiveSummary={executiveSummary} primaryRecommendation={primaryRecommendation}
            colorMeta={colorMeta}
          />
        </div>
      )}

      {/* Bottom action — sits above the 72px Layout nav */}
      <div className="fixed bottom-[72px] left-0 right-0 bg-white border-t border-gray-200 p-4 z-30">
        {feedback && <p role="status" className={`text-xs text-center mb-2 font-medium ${feedback.type === 'success' ? 'text-success-700' : 'text-danger-700'}`}>
          {feedback.message}
        </p>}
        {!reportReady && <p className="text-xs text-center text-warning-700 mb-2 font-medium">
          {!overall ? 'Select an overall assessment' : !executiveSummary.trim() ? 'Add the Executive Summary' : needsAttention.length > 0 && !primaryRecommendation.trim() ? 'Add the Recommended Next Step' : 'Set a priority for every item requiring attention'}
        </p>}
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

// ─── Report Preview ─────────────────────────────────────────────────────────

interface PreviewProps {
  inspection: Inspection;
  sections: InspectionSection[];
  needsAttention: InspectionItem[];
  monitor: InspectionItem[];
  good: InspectionItem[];
  notInspected: InspectionItem[]; photos: InspectionPhoto[];
  priorities: Record<string, PriorityLevel>;
  overall: ItemCondition | null;
  guidance: string;
  managerNotes: string;
  executiveSummary: string; primaryRecommendation: string;
  colorMeta: { hex: string } | undefined;
}

function ReportPreview({ inspection, sections, needsAttention, monitor, good, notInspected, photos, priorities, overall, guidance, managerNotes, executiveSummary, primaryRecommendation, colorMeta }: PreviewProps) {
  const conditionConfig = {
    good:            { label: 'All Good', bg: 'bg-success-100', text: 'text-success-700', border: 'border-success-300' },
    monitor:         { label: 'Monitor',  bg: 'bg-warning-100', text: 'text-warning-700', border: 'border-warning-300' },
    needs_attention: { label: 'Needs Attention', bg: 'bg-danger-100', text: 'text-danger-700', border: 'border-danger-300' },
  };
  const cond = overall ? conditionConfig[overall] : null;
  const inspectedCount = good.length + monitor.length + needsAttention.length;
  const rangedItems = [...needsAttention, ...monitor].filter(item =>
    item.labor_hours_low != null || item.labor_hours_high != null || item.parts_cost_low != null || item.parts_cost_high != null
  );
  const totalLaborLow = rangedItems.reduce((sum, item) => sum + (item.labor_hours_low ?? 0), 0);
  const totalLaborHigh = rangedItems.reduce((sum, item) => sum + (item.labor_hours_high ?? item.labor_hours_low ?? 0), 0);
  const totalPartsLow = rangedItems.reduce((sum, item) => sum + (item.parts_cost_low ?? 0), 0);
  const totalPartsHigh = rangedItems.reduce((sum, item) => sum + (item.parts_cost_high ?? item.parts_cost_low ?? 0), 0);
  const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function planningAllowance(item: InspectionItem) {
    const labor = item.labor_hours_low == null
      ? ''
      : `${item.labor_hours_low}–${item.labor_hours_high ?? item.labor_hours_low} labor hours`;
    const parts = item.parts_cost_low == null
      ? ''
      : `${money(item.parts_cost_low)}–${money(item.parts_cost_high ?? item.parts_cost_low)} parts allowance`;
    return [labor, parts].filter(Boolean).join(' · ');
  }

  return (
    <div className="bg-[#e9e6dc] rounded-2xl p-3 shadow-inner">
      <p className="text-xs text-gray-500 text-center mb-3 font-medium uppercase tracking-wide">Customer Report Preview</p>
      <button type="button" onClick={()=>window.print()} className="mx-auto mb-3 flex items-center gap-1.5 text-xs font-semibold text-gray-600"><Printer className="w-4 h-4"/> Print / Save PDF</button>

      <div className="printable-report bg-white rounded-xl overflow-hidden shadow-sm">
        {/* Header */}
        <div className="bg-gradient-to-br from-[#20251f] to-[#3d463a] px-6 py-8 text-center"><p className="text-xs text-[#d3b56d] uppercase tracking-[0.2em] mb-1">SoCal Autoworks · Comprehensive Inspection</p>
          <h2 className="text-xl font-bold text-white">
            {inspection.vehicle_year} {inspection.vehicle_make} {inspection.vehicle_model}
          </h2>
          {(inspection.vehicle_color || inspection.vehicle_mileage) && (
            <div className="flex items-center justify-center gap-3 mt-2">
              {inspection.vehicle_color && (
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full border border-white/40"
                    style={{ backgroundColor: colorMeta?.hex ?? '#888' }} />
                  <span className="text-sm text-primary-200">{inspection.vehicle_color}</span>
                </div>
              )}
              {inspection.vehicle_color && inspection.vehicle_mileage > 0 && (
                <span className="text-primary-400">·</span>
              )}
              {inspection.vehicle_mileage > 0 && (
                <span className="text-sm text-primary-200">{inspection.vehicle_mileage.toLocaleString()} miles</span>
              )}
            </div>
          )}
          {inspection.vehicle_vin && (
            <p className="text-xs text-primary-400 mt-1">VIN: {inspection.vehicle_vin}</p>
          )}
        </div>

        <div className="p-5 space-y-5">
          {/* Greeting */}
          <div>
            <p className="text-gray-700">Dear {inspection.customer_first_name},</p>
            <p className="text-sm text-gray-500 mt-1">
              Thank you for bringing your vehicle in. Here is a summary of your inspection results.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">{([['Good',good.length,'bg-success-50 text-success-700'],['Monitor',monitor.length,'bg-warning-50 text-warning-700'],['Attention',needsAttention.length,'bg-danger-50 text-danger-700'],['Not inspected',notInspected.length,'bg-gray-50 text-gray-600']] as const).map(([l,n,s])=><div key={l} className={`rounded-lg border p-2 text-center ${s}`}><p className="text-lg font-bold">{n}</p><p className="text-[10px] uppercase">{l}</p></div>)}</div>
          <p className="text-xs text-center text-gray-500">{inspectedCount} items inspected across {sections.length} systems</p>
          {rangedItems.length > 0 && (
            <div data-report-card className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <p className="text-xs font-bold uppercase tracking-widest text-stone-500">Preliminary Repair Planning</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div><p className="text-xs text-stone-500">Labor allowance</p><p className="font-semibold text-stone-900">{totalLaborLow}–{totalLaborHigh} hours</p></div>
                <div><p className="text-xs text-stone-500">Parts allowance</p><p className="font-semibold text-stone-900">{money(totalPartsLow)}–{money(totalPartsHigh)}</p></div>
              </div>
              <p className="mt-2 text-[11px] leading-4 text-stone-500">These figures help prioritize next steps and are not a repair authorization or fixed estimate.</p>
            </div>
          )}
          {executiveSummary && <div data-report-card className="border-l-4 border-[#b7954f] bg-stone-50 p-4"><p className="text-xs font-bold uppercase tracking-widest text-[#77705f] mb-2">Executive Summary</p><p className="text-sm leading-6 whitespace-pre-line">{executiveSummary}</p></div>}{primaryRecommendation && <div data-report-card className="rounded-xl bg-[#2f372d] text-white p-4"><p className="text-xs uppercase tracking-widest text-[#d3b56d]">Recommended next step</p><p className="text-sm leading-6">{primaryRecommendation}</p></div>}

          {/* Overall condition */}
          {cond && (
            <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${cond.bg} ${cond.border}`}>
              <div className={`text-sm font-bold ${cond.text}`}>Overall: {cond.label}</div>
              {guidance && <div className="ml-auto text-xs text-gray-500">{guidance.charAt(0).toUpperCase() + guidance.replace('_', ' ').slice(1)}</div>}
            </div>
          )}
          {guidance && (
            <p className="text-sm text-gray-600 -mt-2 px-1">{GUIDANCE_LABELS[guidance]}</p>
          )}

          {/* Needs Attention */}
          {needsAttention.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-danger-500" /> Items Requiring Attention
              </h3>
              <div className="space-y-3">
                {needsAttention.map(item => {
                  const sec = sections.find(s => s.id === item.section_id);
                  const p = priorities[item.id];
                  const pOpt = PRIORITY_OPTIONS.find(o => o.value === p);
                  return (
                    <div data-report-card key={item.id} className="border border-gray-200 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{item.item_name}</p>
                          <p className="text-xs text-gray-400">{sec?.section_name}</p>
                        </div>
                        {pOpt && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border flex-shrink-0 ${pOpt.bg} ${pOpt.color}`}>
                            {pOpt.label}
                          </span>
                        )}
                      </div>
                      {item.notes && (
                        <p className="text-sm text-gray-600 mt-2 bg-gray-50 rounded-lg px-3 py-2">
                          {item.notes}
                        </p>
                      )}
                      {item.impact && <p className="text-sm text-gray-600 mt-2"><strong>Why it matters:</strong> {item.impact}</p>}
                      {item.recommended_action && <p className="text-sm text-gray-600 mt-2"><strong>Recommended:</strong> {item.recommended_action}</p>}
                      {planningAllowance(item) && (
                        <div className="mt-3 rounded-lg bg-stone-100 px-3 py-2 text-xs text-stone-700">
                          <strong>Planning allowance:</strong> {planningAllowance(item)}
                          <p className="mt-1 text-[11px] text-stone-500">Budgetary range only. Final pricing requires diagnosis and an approved repair estimate.</p>
                        </div>
                      )}
                      {photos.filter(p=>p.item_id===item.id).length>0 && <div className="grid grid-cols-2 gap-2 mt-3">{photos.filter(p=>p.item_id===item.id).slice(0,4).map(p=><img key={p.id} src={p.photo_url} alt={item.item_name} className="w-full h-28 object-cover rounded-lg"/>)}</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Monitor */}
          {monitor.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-warning-500" /> Items to Monitor
              </h3>
              <div className="space-y-2">
                {monitor.map(item => {
                  const sec = sections.find(s => s.id === item.section_id);
                  return (
                    <div data-report-card key={item.id} className="border border-warning-200 rounded-xl px-3 py-2.5 bg-warning-50">
                      <p className="text-sm font-medium text-gray-900">{item.item_name}</p>
                      <p className="text-xs text-gray-400">{sec?.section_name}</p>
                      {item.notes && <p className="text-xs text-gray-600 mt-1">{item.notes}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Good */}
          {good.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-gray-800 uppercase tracking-wide mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-success-500" /> Passed Inspection ({good.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {good.map(item => (
                  <span key={item.id} className="px-2.5 py-1 bg-success-50 text-success-700 text-xs font-medium rounded-full border border-success-200">
                    {item.item_name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {notInspected.length>0 && <div><h3 className="text-sm font-bold uppercase mb-2">Not Inspected ({notInspected.length})</h3>{notInspected.map(i=><div key={i.id} className="border bg-gray-50 rounded-xl px-3 py-2 mb-2"><p className="text-sm font-medium">{i.item_name}</p><p className="text-xs text-gray-500">{i.not_inspected_reason}</p></div>)}</div>}

          {/* Manager notes */}
          {managerNotes && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Notes from Our Team</p>
              <p className="text-sm text-gray-700 whitespace-pre-line">{managerNotes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="border-t border-gray-100 pt-4 text-center">
            <p className="text-sm text-gray-600">
              Questions about your report? We're happy to walk you through any findings and help you
              prioritize repairs based on your budget and timeline.
            </p>
            <p className="text-xs text-gray-400 mt-3">
              {inspection.customer_first_name} {inspection.customer_last_name} · {inspection.customer_email}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
