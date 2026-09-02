import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { InspectionTemplate } from '../types';
import { Plus, ChevronRight, Layers, ToggleLeft, ToggleRight, Download } from 'lucide-react';

type TemplateListRow = InspectionTemplate & {
  template_sections?: Array<{ id: string; template_items?: Array<{ id: string }> }>;
};

type CsvItem = { item_name: string; item_key: string; sort_order: number; photo_required: boolean; notes_required: boolean };
type CsvSection = { section_name: string; sort_order: number; template_items?: CsvItem[] };
type CsvTemplate = { name: string; template_sections?: CsvSection[] };

export function TemplatesPage() {
  const { isOwner } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<(InspectionTemplate & { sectionCount: number; itemCount: number })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (isOwner) load(); }, [isOwner]);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('inspection_templates')
      .select('*, template_sections(id, template_items(id))')
      .order('sort_order');
    if (data) {
      setTemplates((data as TemplateListRow[]).map(t => ({
        ...t,
        sectionCount: t.template_sections?.length ?? 0,
        itemCount: (t.template_sections ?? []).reduce((n, section) => n + (section.template_items?.length ?? 0), 0),
      })));
    }
    setLoading(false);
  }

  async function createTemplate() {
    const { data } = await supabase
      .from('inspection_templates')
      .insert({ name: 'New Template', description: '', sort_order: templates.length })
      .select('id')
      .single();
    if (!data) return;

    const { data: sec } = await supabase
      .from('template_sections')
      .insert({ template_id: data.id, section_name: 'Check-In', sort_order: 0, is_active: true, is_checkin: true })
      .select('id')
      .single();

    if (sec) {
      await supabase.from('template_items').insert([
        { section_id: sec.id, item_name: 'Walk-around Photos', item_key: 'checkin_photos', sort_order: 0, is_active: true, photo_mode: 'required', video_mode: 'hidden', notes_mode: 'hidden', photo_required: false, video_required: false, notes_required: false },
        { section_id: sec.id, item_name: 'Walk-around Video',  item_key: 'checkin_video',  sort_order: 1, is_active: true, photo_mode: 'hidden',   video_mode: 'required', notes_mode: 'hidden', photo_required: false, video_required: false, notes_required: false },
        { section_id: sec.id, item_name: 'Customer Concerns',  item_key: 'checkin_notes',  sort_order: 2, is_active: true, photo_mode: 'hidden',   video_mode: 'hidden',   notes_mode: 'optional', photo_required: false, video_required: false, notes_required: false },
      ]);
    }

    navigate(`/templates/${data.id}`);
  }

  async function downloadCSV() {
    const { data } = await supabase
      .from('inspection_templates')
      .select('name, template_sections(section_name, sort_order, template_items(item_name, item_key, sort_order, photo_required, notes_required))')
      .order('name');
    if (!data) return;

    const rows = ['Template,Section #,Section Name,Item #,Item Name,Item Key,Photo Required,Notes Required'];
    for (const t of data as CsvTemplate[]) {
      const sections = [...(t.template_sections ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      sections.forEach((s, si) => {
        const items = [...(s.template_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
        items.forEach((item, ii) => {
          rows.push([t.name, si + 1, s.section_name, ii + 1, item.item_name, item.item_key,
            item.photo_required ? 'TRUE' : 'FALSE', item.notes_required ? 'TRUE' : 'FALSE'].join(','));
        });
      });
    }

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inspection-items.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function toggleActive(t: InspectionTemplate) {
    await supabase.from('inspection_templates').update({ is_active: !t.is_active }).eq('id', t.id);
    setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, is_active: !t.is_active } : x));
  }

  if (!isOwner) return <div className="p-4 text-center text-gray-500">Access denied</div>;

  return (
    <div className="p-4 pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inspection Templates</h1>
          <p className="text-sm text-gray-500 mt-1">Customize what gets inspected and what's required</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={downloadCSV}
            className="flex items-center gap-2 border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 bg-white px-4 py-2 rounded-xl font-medium text-sm">
            <Download className="w-4 h-4" /> Export CSV
          </button>
          <button onClick={createTemplate}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-xl font-medium text-sm">
          <Plus className="w-4 h-4" /> New
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className={`bg-white rounded-xl shadow-sm border ${t.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-center p-4 gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <Layers className="w-5 h-5 text-primary-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{t.name}</h3>
                  {t.description && <p className="text-sm text-gray-500 truncate">{t.description}</p>}
                  <div className="flex gap-3 mt-1">
                    <span className="text-xs text-gray-400">{t.sectionCount} sections</span>
                    <span className="text-xs text-gray-400">{t.itemCount} items</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={(e) => { e.stopPropagation(); toggleActive(t); }}
                    className={`${t.is_active ? 'text-success-500' : 'text-gray-300'}`}
                    title={t.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}>
                    {t.is_active ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                  </button>
                  <button onClick={() => navigate(`/templates/${t.id}`)}
                    className="p-2 text-gray-400 hover:text-primary-600">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
