import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { PremiumInspectionReport } from '../components/report/PremiumInspectionReport';
import { supabase } from '../lib/supabase';
import {
  CheckinPhoto, Inspection, InspectionItem, InspectionPhoto,
  InspectionSection, PriorityLevel,
} from '../types';
import { VEHICLE_COLORS } from '../data/vehicleColors';

interface PublicReportPayload {
  inspection: Inspection;
  sections: InspectionSection[];
  items: InspectionItem[];
  photos: InspectionPhoto[];
  checkinPhotos: CheckinPhoto[];
  laborRate: number;
}

export function PublicReportPage() {
  const { token } = useParams<{ token: string }>();
  const [report, setReport] = useState<PublicReportPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadReport() {
      if (!token) {
        setError(true);
        setLoading(false);
        return;
      }
      const { data, error: reportError } = await supabase.rpc('get_public_inspection_report', { p_token: token });
      if (!active) return;
      if (reportError || !data) setError(true);
      else setReport(data as PublicReportPayload);
      setLoading(false);
    }
    loadReport();
    return () => { active = false; };
  }, [token]);

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#e3dfd4]"><div className="text-center"><img src="/image.png" alt="SoCal Autoworks" className="mx-auto h-12 w-auto" /><p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-stone-500">Preparing your report…</p></div></div>;

  if (error || !report) return <div className="flex min-h-screen items-center justify-center bg-[#e3dfd4] px-6"><div className="max-w-md bg-[#f6f2e8] p-10 text-center shadow-xl"><img src="/image.png" alt="SoCal Autoworks" className="mx-auto h-12 w-auto" /><h1 className="mt-7 text-2xl font-black text-[#1d211d]">This report is not available.</h1><p className="mt-3 text-sm leading-6 text-stone-600">The link may be incomplete, or the report may still be awaiting approval. Please contact SoCal Autoworks for assistance.</p></div></div>;

  const { inspection, sections, items, photos, checkinPhotos, laborRate } = report;
  const needsAttention = items.filter(item => item.status === 'needs_attention');
  const monitor = items.filter(item => item.status === 'monitor');
  const good = items.filter(item => item.status === 'good');
  const notInspected = items.filter(item => item.status === 'not_inspected');
  const priorities = items.reduce<Record<string, PriorityLevel>>((result, item) => {
    if (item.priority) result[item.id] = item.priority;
    return result;
  }, {});
  const colorMeta = VEHICLE_COLORS.find(color => color.name === inspection.vehicle_color);

  return <main className="min-h-screen bg-[#d9d5ca] py-0 sm:py-8">
    <PremiumInspectionReport
      inspection={inspection}
      sections={sections}
      needsAttention={needsAttention}
      monitor={monitor}
      good={good}
      notInspected={notInspected}
      photos={photos}
      checkinPhotos={checkinPhotos}
      priorities={priorities}
      overall={inspection.overall_condition}
      guidance={inspection.investment_guidance || ''}
      managerNotes={inspection.manager_notes || ''}
      executiveSummary={inspection.executive_summary || ''}
      primaryRecommendation={inspection.primary_recommendation || ''}
      colorMeta={colorMeta}
      laborRate={Number(laborRate) || 175}
    />
  </main>;
}
