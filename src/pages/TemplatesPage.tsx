import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { withTimeout } from '../lib/async';
import { useAuth } from '../hooks/useAuth';
import { InspectionTemplate } from '../types';
import { Plus, ChevronRight, Layers, ToggleLeft, ToggleRight, Download, Copy, Trash2, Search, Loader2 } from 'lucide-react';

type TemplateListRow = InspectionTemplate & {
  template_sections?: Array<{ id: string; template_items?: Array<{ id: string }> }>;
};

type CsvItem = { item_name: string; item_key: string; sort_order: number; photo_mode: string; video_mode: string; notes_mode: string };
type CsvSection = { section_name: string; sort_order: number; template_items?: CsvItem[] };
type CsvTemplate = { name: string; template_sections?: CsvSection[] };

type FullTemplateRow = InspectionTemplate & {
  template_sections?: Array<{
    id: string;
    section_name: string;
    sort_order: number;
    is_active: boolean;
    is_checkin: boolean;
    template_items?: Array<{
      id: string;
      item_name: string;
      item_key: string;
      sort_order: number;
      is_active: boolean;
      photo_mode: string;
      video_mode: string;
      notes_mode: string;
      photo_required: boolean;
      video_required: boolean;
      notes_required: boolean;
    }>;
  }>;
};

export function TemplatesPage() {
  const { isOwner } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<(InspectionTemplate & { sectionCount: number; itemCount: number; inspectionCount: number })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InspectionTemplate | null>(null);
  const [deletingId, setDeletingId] = useState(false);

  useEffect(() => { if (isOwner) load(); }, [isOwner]);

  async function load() {
    setLoading(true);
    const [{ data }, { data: counts }] = await withTimeout(Promise.all([
      supabase
        .from('inspection_templates')
        .select('*, template_sections(id, template_items(id))')
        .order('sort_order'),
      supabase
        .from('inspections')
        .select('template_id'),
    ]));
    if (data) {
      const countMap = new Map<string, number>();
      for (const row of (counts ?? []) as Array<{ template_id: string | null }>) {
        if (row.template_id) countMap.set(row.template_id, (countMap.get(row.template_id) ?? 0) + 1);
      }
      setTemplates((data as TemplateListRow[]).map(t => ({
        ...t,
        sectionCount: t.template_sections?.length ?? 0,
        itemCount: (t.template_sections ?? []).reduce((n, section) => n + (section.template_items?.length ?? 0), 0),
        inspectionCount: countMap.get(t.id) ?? 0,
      })));
    }
    setLoading(false);
  }

  async function duplicateTemplate(t: InspectionTemplate) {
    setDuplicatingId(t.id);
    try {
      const { data: full } = await withTimeout(
        supabase
          .from('inspection_templates')
          .select('*, template_sections(*, template_items(*))')
          .eq('id', t.id)
          .single(),
      ) as { data: FullTemplateRow | null };
      if (!full) return;

      const { data: copy } = await withTimeout(
        supabase
          .from('inspection_templates')
          .insert({ name: `${full.name} (Copy)`, description: full.description, sort_order: templates.length, is_active: false })
          .select('id')
          .single(),
      );
      if (!copy) return;

      for (const section of (full.template_sections ?? [])) {
        const { data: newSec } = await withTimeout(
          supabase
            .from('template_sections')
            .insert({ template_id: copy.id, section_name: section.section_name, sort_order: section.sort_order, is_active: section.is_active, is_checkin: section.is_checkin })
            .select('id')
            .single(),
        );
        if (!newSec) continue;

        const items = section.template_items ?? [];
        if (items.length) {
          await withTimeout(
            supabase.from('template_items').insert(
              items.map(item => ({
                section_id: newSec.id,
                item_name: item.item_name,
                item_key: item.item_key,
                sort_order: item.sort_order,
                is_active: item.is_active,
                photo_mode: item.photo_mode,
                video_mode: item.video_mode,
                notes_mode: item.notes_mode,
                photo_required: item.photo_required,
                video_required: item.video_required,
                notes_required: item.notes_required,
              })),
            ),
          );
        }
      }

      await load();
    } finally {
      setDuplicatingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeletingId(true);
    try {
      const id = deleteTarget.id;
      await withTimeout(supabase.from('template_items').delete().in('section_id',
        (await withTimeout(supabase.from('template_sections').select('id').eq('template_id', id))).data?.map((s: { id: string }) => s.id) ?? []));
      await withTimeout(supabase.from('template_sections').delete().eq('template_id', id));
      await withTimeout(supabase.from('inspection_templates').delete().eq('id', id));
      setDeleteTarget(null);
      await load();
    } finally {
      setDeletingId(false);
    }
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
    const { data } = await withTimeout(
      supabase
        .from('inspection_templates')
        .select('name, template_sections(section_name, sort_order, template_items(item_name, item_key, sort_order, photo_mode, video_mode, notes_mode))')
        .order('name'),
    );
    if (!data) return;

    const rows = ['Template,Section #,Section Name,Item #,Item Name,Item Key,Photo Mode,Video Mode,Notes Mode'];
    for (const t of data as CsvTemplate[]) {
      const sections = [...(t.template_sections ?? [])].sort((a, b) => a.sort_order - b.sort_order);
      sections.forEach((s, si) => {
        const items = [...(s.template_items ?? [])].sort((a, b) => a.sort_order - b.sort_order);
        items.forEach((item, ii) => {
          rows.push([t.name, si + 1, s.section_name, ii + 1, item.item_name, item.item_key,
            item.photo_mode, item.video_mode, item.notes_mode].join(','));
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
    await withTimeout(supabase.from('inspection_templates').update({ is_active: !t.is_active }).eq('id', t.id));
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

      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search templates by name..."
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-primary-400"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-gray-500">No templates yet</div>
      ) : (
        <div className="space-y-3">
          {templates.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase())).map(t => (
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
                    <span className="text-xs text-gray-400">{t.inspectionCount} {t.inspectionCount === 1 ? 'inspection' : 'inspections'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {t.inspectionCount === 0 ? (
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(t); }}
                      className="p-2 text-gray-400 hover:text-red-500"
                      title="Delete template">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 text-xs font-medium" title="In use by existing inspections">
                      In Use
                    </span>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); duplicateTemplate(t); }}
                    disabled={duplicatingId === t.id}
                    className="p-2 text-gray-400 hover:text-primary-600 disabled:opacity-50"
                    title="Duplicate template">
                    {duplicatingId === t.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                  </button>
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

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete template?</h3>
            <p className="text-sm text-gray-500 mb-1">
              This will permanently delete <span className="font-medium text-gray-700">{deleteTarget.name}</span> and all of its sections and items.
            </p>
            <p className="text-sm text-gray-500 mb-6">This action cannot be undone.</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium text-sm">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deletingId}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 text-white font-medium text-sm disabled:opacity-50">
                {deletingId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
