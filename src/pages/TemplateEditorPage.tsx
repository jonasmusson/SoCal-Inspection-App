import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { InspectionTemplate, TemplateSection, TemplateItem, MediaMode } from '../types';
import {
  ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2,
  Camera, Video, StickyNote, ChevronDown, ChevronRight, ClipboardCheck,
} from 'lucide-react';

type SectionWithItems = TemplateSection & { items: TemplateItem[] };
type SectionQueryRow = TemplateSection & { template_items?: TemplateItem[] };
type ModeField = 'photo_mode' | 'video_mode' | 'notes_mode';

function toKey(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function nextMode(m: MediaMode): MediaMode {
  if (m === 'hidden') return 'optional';
  if (m === 'optional') return 'required';
  return 'hidden';
}

function modeStyle(m: MediaMode) {
  if (m === 'hidden')   return 'bg-gray-100 text-gray-300';
  if (m === 'optional') return 'bg-blue-50 text-blue-500 ring-1 ring-blue-200';
  return 'bg-primary-600 text-white';
}

const MODE_LABELS: Record<MediaMode, string> = { hidden: 'Hidden', optional: 'Optional', required: 'Required' };

export function TemplateEditorPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isOwner } = useAuth();

  const [template, setTemplate] = useState<InspectionTemplate | null>(null);
  const [sections, setSections] = useState<SectionWithItems[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id && isOwner) load(id); }, [id, isOwner]);

  async function load(tId: string) {
    setLoading(true);
    const [{ data: tmpl }, { data: secs }] = await Promise.all([
      supabase.from('inspection_templates').select('*').eq('id', tId).single(),
      supabase.from('template_sections').select('*, template_items(*)').eq('template_id', tId).order('sort_order'),
    ]);
    if (tmpl) setTemplate(tmpl);
    if (secs) {
      setSections((secs as SectionQueryRow[]).map(s => ({
        ...s,
        items: [...(s.template_items ?? [])].sort((a: TemplateItem, b: TemplateItem) => a.sort_order - b.sort_order),
      })));
    }
    setLoading(false);
  }

  async function saveTemplateName(name: string) {
    if (!template || !name.trim()) return;
    await supabase.from('inspection_templates').update({ name: name.trim(), updated_at: new Date().toISOString() }).eq('id', template.id);
    setTemplate(t => t ? { ...t, name: name.trim() } : t);
  }

  async function saveTemplateDesc(description: string) {
    if (!template) return;
    await supabase.from('inspection_templates').update({ description: description || null, updated_at: new Date().toISOString() }).eq('id', template.id);
    setTemplate(t => t ? { ...t, description: description || null } : t);
  }

  async function addSection() {
    if (!template) return;
    const sort_order = sections.length; // checkin is 0, new sections go after existing
    const { data } = await supabase
      .from('template_sections')
      .insert({ template_id: template.id, section_name: 'New Section', sort_order, is_checkin: false })
      .select('*').single();
    if (data) {
      setSections(prev => [...prev, { ...data, items: [] }]);
      setExpanded(prev => new Set([...prev, data.id]));
    }
  }

  async function saveSectionName(secId: string, name: string) {
    if (!name.trim()) return;
    await supabase.from('template_sections').update({ section_name: name.trim() }).eq('id', secId);
    setSections(prev => prev.map(s => s.id === secId ? { ...s, section_name: name.trim() } : s));
  }

  async function toggleSectionActive(sec: SectionWithItems) {
    await supabase.from('template_sections').update({ is_active: !sec.is_active }).eq('id', sec.id);
    setSections(prev => prev.map(s => s.id === sec.id ? { ...s, is_active: !sec.is_active } : s));
  }

  async function deleteSection(secId: string) {
    if (!confirm('Delete this section and all its items?')) return;
    await supabase.from('template_sections').delete().eq('id', secId);
    setSections(prev => prev.filter(s => s.id !== secId));
  }

  async function moveSectionUp(idx: number) {
    if (idx === 0) return;
    // Prevent moving a regular section above the check-in section (idx 0)
    if (idx === 1 && sections[0]?.is_checkin) return;
    const next = [...sections];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    const updates = [{ id: next[idx - 1].id, sort_order: idx - 1 }, { id: next[idx].id, sort_order: idx }];
    setSections(next.map((s, i) => ({ ...s, sort_order: i })));
    await Promise.all(updates.map(u => supabase.from('template_sections').update({ sort_order: u.sort_order }).eq('id', u.id)));
  }

  async function moveSectionDown(idx: number) {
    if (idx === sections.length - 1) return;
    const next = [...sections];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    const updates = [{ id: next[idx].id, sort_order: idx }, { id: next[idx + 1].id, sort_order: idx + 1 }];
    setSections(next.map((s, i) => ({ ...s, sort_order: i })));
    await Promise.all(updates.map(u => supabase.from('template_sections').update({ sort_order: u.sort_order }).eq('id', u.id)));
  }

  async function addItem(secId: string) {
    const sec = sections.find(s => s.id === secId);
    if (!sec) return;
    const sort_order = sec.items.length;
    const { data } = await supabase
      .from('template_items')
      .insert({ section_id: secId, item_name: 'New Item', item_key: `item_${Date.now()}`, sort_order })
      .select('*').single();
    if (data) setSections(prev => prev.map(s => s.id === secId ? { ...s, items: [...s.items, data] } : s));
  }

  async function saveItemName(secId: string, itemId: string, name: string) {
    if (!name.trim()) return;
    const key = toKey(name.trim());
    await supabase.from('template_items').update({ item_name: name.trim(), item_key: key }).eq('id', itemId);
    setSections(prev => prev.map(s => s.id === secId
      ? { ...s, items: s.items.map(i => i.id === itemId ? { ...i, item_name: name.trim(), item_key: key } : i) }
      : s));
  }

  async function cycleItemMode(secId: string, item: TemplateItem, field: ModeField) {
    const next = nextMode(item[field]);
    await supabase.from('template_items').update({ [field]: next }).eq('id', item.id);
    setSections(prev => prev.map(s => s.id === secId
      ? { ...s, items: s.items.map(i => i.id === item.id ? { ...i, [field]: next } : i) }
      : s));
  }

  async function toggleItemActive(secId: string, item: TemplateItem) {
    await supabase.from('template_items').update({ is_active: !item.is_active }).eq('id', item.id);
    setSections(prev => prev.map(s => s.id === secId
      ? { ...s, items: s.items.map(i => i.id === item.id ? { ...i, is_active: !item.is_active } : i) }
      : s));
  }

  async function deleteItem(secId: string, itemId: string) {
    await supabase.from('template_items').delete().eq('id', itemId);
    setSections(prev => prev.map(s => s.id === secId ? { ...s, items: s.items.filter(i => i.id !== itemId) } : s));
  }

  async function moveItemUp(secId: string, idx: number) {
    if (idx === 0) return;
    const sec = sections.find(s => s.id === secId);
    if (!sec) return;
    const next = [...sec.items];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    const updates = [{ id: next[idx - 1].id, sort_order: idx - 1 }, { id: next[idx].id, sort_order: idx }];
    setSections(prev => prev.map(s => s.id === secId ? { ...s, items: next.map((item, i) => ({ ...item, sort_order: i })) } : s));
    await Promise.all(updates.map(u => supabase.from('template_items').update({ sort_order: u.sort_order }).eq('id', u.id)));
  }

  async function moveItemDown(secId: string, idx: number, total: number) {
    if (idx === total - 1) return;
    const sec = sections.find(s => s.id === secId);
    if (!sec) return;
    const next = [...sec.items];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    const updates = [{ id: next[idx].id, sort_order: idx }, { id: next[idx + 1].id, sort_order: idx + 1 }];
    setSections(prev => prev.map(s => s.id === secId ? { ...s, items: next.map((item, i) => ({ ...item, sort_order: i })) } : s));
    await Promise.all(updates.map(u => supabase.from('template_items').update({ sort_order: u.sort_order }).eq('id', u.id)));
  }

  if (!isOwner) return <div className="p-4 text-center text-gray-500">Access denied</div>;
  if (loading) return <div className="p-4 text-center text-gray-500">Loading...</div>;
  if (!template) return <div className="p-4 text-center text-gray-500">Template not found</div>;

  const activeSections = sections.filter(s => s.is_active);
  const totalItems = sections.reduce((n, s) => n + s.items.filter(i => i.is_active).length, 0);

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-3 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/templates')} className="text-gray-500 hover:text-gray-800" aria-label="Back to templates">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div className="flex-1">
            <input
              defaultValue={template.name}
              onBlur={e => saveTemplateName(e.target.value)}
              className="text-lg font-bold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 outline-none w-full"
            />
          </div>
        </div>
        <div className="ml-9 mt-1 flex gap-4 text-xs text-gray-400">
          <span>{activeSections.length} active sections</span>
          <span>{totalItems} active items</span>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Description */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Description</label>
          <input
            defaultValue={template.description ?? ''}
            onBlur={e => saveTemplateDesc(e.target.value)}
            placeholder="Brief description of this inspection type..."
            className="mt-1 w-full text-sm text-gray-700 bg-transparent border-b border-gray-200 focus:border-primary-500 outline-none py-1"
          />
        </div>

        {/* Mode legend */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
          <p className="text-xs font-medium text-blue-700 mb-2">Media &amp; Notes modes — click to cycle</p>
          <div className="flex gap-3 text-xs text-blue-600 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded bg-gray-100 text-gray-300 flex items-center justify-center"><Camera className="w-3 h-3" /></span>
              Hidden — not shown
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded bg-blue-50 ring-1 ring-blue-200 text-blue-500 flex items-center justify-center"><Camera className="w-3 h-3" /></span>
              Optional — shown if issue
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded bg-primary-600 text-white flex items-center justify-center"><Camera className="w-3 h-3" /></span>
              Required — must complete
            </span>
          </div>
        </div>

        {/* Sections */}
        {sections.map((sec, sIdx) => {
          const isOpen = expanded.has(sec.id);
          const isCheckin = sec.is_checkin;
          return (
            <div key={sec.id} className={`bg-white rounded-xl shadow-sm border ${sec.is_active ? (isCheckin ? 'border-blue-200' : 'border-gray-200') : 'border-gray-100 opacity-60'}`}>
              {/* Section header */}
              <div className="flex items-center px-4 py-3 gap-2">
                <button onClick={() => setExpanded(prev => {
                  const next = new Set(prev);
                  if (isOpen) next.delete(sec.id);
                  else next.add(sec.id);
                  return next;
                })} className="text-gray-400">
                  {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {isCheckin ? (
                  <div className="flex-1 flex items-center gap-2 min-w-0">
                    <ClipboardCheck className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <span className="font-semibold text-gray-900 text-sm truncate">{sec.section_name}</span>
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full flex-shrink-0">Check-In</span>
                  </div>
                ) : (
                  <input
                    defaultValue={sec.section_name}
                    onBlur={e => saveSectionName(sec.id, e.target.value)}
                    className="flex-1 font-semibold text-gray-900 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 outline-none text-sm"
                  />
                )}
                <span className="text-xs text-gray-400">{sec.items.filter(i => i.is_active).length} items</span>
                <div className="flex items-center gap-1">
                  <button onClick={() => moveSectionUp(sIdx)} disabled={sIdx === 0 || isCheckin}
                    className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20">
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button onClick={() => moveSectionDown(sIdx)} disabled={sIdx === sections.length - 1 || isCheckin}
                    className="p-1 text-gray-300 hover:text-gray-600 disabled:opacity-20">
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleSectionActive(sec)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${sec.is_active ? 'bg-success-100 text-success-700' : 'bg-gray-100 text-gray-500'}`}>
                    {sec.is_active ? 'On' : 'Off'}
                  </button>
                  <button onClick={() => !isCheckin && deleteSection(sec.id)}
                    disabled={isCheckin}
                    className="p-1 text-gray-300 hover:text-danger-500 disabled:opacity-20 disabled:cursor-not-allowed">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Items */}
              {isOpen && (
                <div className="border-t border-gray-100">
                  {/* Column headers */}
                  <div className="flex items-center px-4 py-1.5 bg-gray-50 text-xs text-gray-400 font-medium gap-2">
                    <span className="flex-1">Item</span>
                    <span className="w-5 text-center" title="Photo mode"><Camera className="w-3 h-3 inline" /></span>
                    <span className="w-5 text-center" title="Video mode"><Video className="w-3 h-3 inline" /></span>
                    <span className="w-5 text-center" title="Notes mode"><StickyNote className="w-3 h-3 inline" /></span>
                    <span className="w-14" />
                  </div>

                  {sec.items.map((item, iIdx) => (
                    <div key={item.id} className={`flex items-center px-4 py-2.5 gap-2 border-b border-gray-50 last:border-0 ${!item.is_active ? 'opacity-40' : ''}`}>
                      <input
                        defaultValue={item.item_name}
                        onBlur={e => saveItemName(sec.id, item.id, e.target.value)}
                        className="flex-1 text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 outline-none min-w-0"
                      />

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Photo mode */}
                        <button onClick={() => cycleItemMode(sec.id, item, 'photo_mode')}
                          title={`Photo: ${MODE_LABELS[item.photo_mode]} — click to cycle`}
                          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${modeStyle(item.photo_mode)}`}>
                          <Camera className="w-3.5 h-3.5" />
                        </button>

                        {/* Video mode */}
                        <button onClick={() => cycleItemMode(sec.id, item, 'video_mode')}
                          title={`Video: ${MODE_LABELS[item.video_mode]} — click to cycle`}
                          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${modeStyle(item.video_mode)}`}>
                          <Video className="w-3.5 h-3.5" />
                        </button>

                        {/* Notes mode */}
                        <button onClick={() => cycleItemMode(sec.id, item, 'notes_mode')}
                          title={`Notes: ${MODE_LABELS[item.notes_mode]} — click to cycle`}
                          className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${modeStyle(item.notes_mode)}`}>
                          <StickyNote className="w-3.5 h-3.5" />
                        </button>

                        {/* Reorder */}
                        <button onClick={() => moveItemUp(sec.id, iIdx)} disabled={iIdx === 0}
                          className="text-gray-300 hover:text-gray-600 disabled:opacity-20">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => moveItemDown(sec.id, iIdx, sec.items.length)} disabled={iIdx === sec.items.length - 1}
                          className="text-gray-300 hover:text-gray-600 disabled:opacity-20">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>

                        {/* Active toggle */}
                        <button onClick={() => toggleItemActive(sec.id, item)}
                          className={`px-1.5 py-0.5 rounded-full text-xs font-medium ${item.is_active ? 'bg-success-100 text-success-700' : 'bg-gray-100 text-gray-500'}`}>
                          {item.is_active ? 'On' : 'Off'}
                        </button>

                        {/* Delete */}
                        <button onClick={() => deleteItem(sec.id, item.id)} className="text-gray-300 hover:text-danger-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}

                  <button onClick={() => addItem(sec.id)}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-primary-600 hover:bg-primary-50 font-medium">
                    <Plus className="w-4 h-4" /> Add Item
                  </button>
                </div>
              )}
            </div>
          );
        })}

        <button onClick={addSection}
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-primary-400 hover:text-primary-600 font-medium text-sm">
          <Plus className="w-4 h-4" /> Add Section
        </button>
      </div>
    </div>
  );
}
