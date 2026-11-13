import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Inspection, UserProfile } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { ProgressBar } from '../components/common/ProgressBar';
import {
  Plus, Search, Car, AlertCircle, Clock, CheckCircle, Archive,
  AlertTriangle, RotateCw, UserPlus, Wrench, Send, ClipboardList,
  Activity, ChevronDown,
} from 'lucide-react';
import { useNavigate, Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { withTimeout } from '../lib/async';

export function DashboardPage() {
  const { profile, isManager, isOwner } = useAuth();
  const navigate = useNavigate();

  // All inspections (loaded unfiltered for accurate stats, filtered client-side)
  const [allInspections, setAllInspections] = useState<Inspection[]>([]);
  const [techs, setTechs] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Search with debounce (300ms timer ref, no library)
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Display filters (applied client-side after loading all)
  const [statusFilter, setStatusFilter] = useState('all');
  const [techFilter, setTechFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  // Quick-assign tech state
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Debounce search input — 300ms
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  // Reload inspections when archive toggle changes (only filter applied server-side)
  useEffect(() => { loadInspections(); }, [showArchived]);

  // Load tech list once on mount
  useEffect(() => { loadTechs(); }, []);

  async function loadInspections() {
    setLoading(true);
    setLoadError(false);
    try {
      const { data } = await withTimeout(
        supabase
          .from('inspections')
          .select('*')
          .eq('archived', showArchived)
          .order('created_at', { ascending: false }),
      );
      setAllInspections(data || []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function loadTechs() {
    try {
      const { data } = await withTimeout(
        supabase
          .from('user_profiles')
          .select('*')
          .eq('role', 'tech')
          .eq('status', 'active')
          .order('full_name'),
      );
      setTechs(data || []);
    } catch {
      // Tech list is non-critical — dropdown just shows fewer options
    }
  }

  async function assignTech(inspectionId: string, techId: string) {
    setAssigning(true);
    try {
      await supabase
        .from('inspections')
        .update({ assigned_tech_id: techId })
        .eq('id', inspectionId);
      setAllInspections(prev =>
        prev.map(i => (i.id === inspectionId ? { ...i, assigned_tech_id: techId } : i)),
      );
    } catch {
      // silent — card remains unassigned, user can retry
    } finally {
      setAssigning(false);
      setAssigningId(null);
    }
  }

  // ── Derived values ──────────────────────────────────────────────

  const techMap = new Map(techs.map(t => [t.id, t]));

  const stats = {
    pendingReview: allInspections.filter(i => i.status === 'pending_review').length,
    inProgress: allInspections.filter(i => i.status === 'in_progress').length,
    awaitingCheckin: allInspections.filter(i => !i.checkin_complete).length,
    sentToday: allInspections.filter(
      i => i.status === 'sent' && i.report_sent_at &&
        format(new Date(i.report_sent_at), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd'),
    ).length,
  };

  const hasActiveFilters = debouncedSearch !== '' || statusFilter !== 'all' || techFilter !== 'all';

  // Client-side display filters (search, status, tech)
  const filtered = allInspections.filter(i => {
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      const matches =
        `${i.customer_first_name} ${i.customer_last_name}`.toLowerCase().includes(q) ||
        `${i.vehicle_make} ${i.vehicle_model}`.toLowerCase().includes(q) ||
        (i.vehicle_vin || '').toLowerCase().includes(q);
      if (!matches) return false;
    }
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    if (techFilter !== 'all') {
      if (techFilter === 'unassigned' && i.assigned_tech_id) return false;
      if (techFilter !== 'unassigned' && i.assigned_tech_id !== techFilter) return false;
    }
    return true;
  });

  // Needs check-in — shown in the Resume Check-In section, excluded from grouped list
  const needsCheckin = filtered.filter(i => !i.checkin_complete);

  // Remaining items for operational category grouping
  const groupedItems = filtered.filter(i => i.checkin_complete !== false);

  const groups: { key: string; label: string; icon: typeof Clock; color: string; items: Inspection[] }[] = [
    { key: 'unassigned', label: 'Unassigned', icon: UserPlus, color: 'text-warning-600',
      items: groupedItems.filter(i => i.status === 'not_started' && !i.assigned_tech_id) },
    { key: 'inProgress', label: 'In Progress', icon: Clock, color: 'text-primary-500',
      items: groupedItems.filter(i => i.status === 'in_progress') },
    { key: 'awaitingReview', label: 'Awaiting Review', icon: AlertCircle, color: 'text-warning-500',
      items: groupedItems.filter(i => i.status === 'pending_review') },
    { key: 'approved', label: 'Approved — Ready to Send', icon: CheckCircle, color: 'text-success-500',
      items: groupedItems.filter(i => i.status === 'approved') },
    { key: 'sent', label: 'Sent', icon: Send, color: 'text-primary-500',
      items: groupedItems.filter(i => i.status === 'sent') },
  ];

  // Recent activity — last 5 inspections by updated_at
  const recentActivity = [...allInspections]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  function activityDescription(i: Inspection): string {
    if (i.correction_requested_at) return 'Correction requested';
    if (i.status === 'sent' && i.report_sent_at) return 'Report sent';
    if (i.status === 'approved' && i.approved_at) return 'Approved';
    if (i.status === 'pending_review') return 'Submitted for review';
    if (i.status === 'in_progress') return 'Inspection in progress';
    if (i.status === 'not_started' && i.checkin_complete) return 'Check-in completed';
    if (i.status === 'not_started' && !i.checkin_complete) return 'Check-in started';
    return 'Updated';
  }

  function cardRoute(i: Inspection): string {
    if (i.checkin_complete === false) return `/checkin/${i.id}`;
    if (i.status === 'pending_review') return `/review/${i.id}`;
    return `/inspection/${i.id}`;
  }

  // ── Guard returns ───────────────────────────────────────────────

  if (!profile) return null;
  if (!isManager && !isOwner) return <Navigate to="/my-inspections" replace />;

  // ── Render ──────────────────────────────────────────────────────

  const statCards = [
    { icon: AlertCircle, label: 'Pending Review', value: stats.pendingReview, color: 'text-warning-500' },
    { icon: Clock, label: 'In Progress', value: stats.inProgress, color: 'text-primary-500' },
    { icon: ClipboardList, label: 'Awaiting Check-In', value: stats.awaitingCheckin, color: 'text-warning-600' },
    { icon: Send, label: 'Sent Today', value: stats.sentToday, color: 'text-success-500' },
  ];

  const showGrouped = !hasActiveFilters && !showArchived;

  return (
    <div className="p-4 pb-24">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome back, {profile?.full_name}</p>
      </div>

      {/* Stat Cards — 2 cols mobile, 4 cols desktop */}
      {!showArchived && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {statCards.map(s => (
            <div key={s.label} className="bg-white rounded-xl p-3 shadow-sm border border-gray-200 text-center">
              <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-1`} />
              <p className="text-xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search + Filters */}
      <div className="mb-4 space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, vehicle, or VIN..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl"
            />
          </div>
          <button
            onClick={() => {
              setShowArchived(v => !v);
              setStatusFilter('all');
              setTechFilter('all');
              setSearch('');
              setAssigningId(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${showArchived ? 'bg-gray-700 border-gray-700 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
            title={showArchived ? 'Back to active' : 'View archived'}
          >
            <Archive className="w-4 h-4" />
          </button>
        </div>

        {!showArchived && (
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm"
            >
              <option value="all">All Statuses</option>
              <option value="not_started">Not Started</option>
              <option value="in_progress">In Progress</option>
              <option value="pending_review">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="sent">Sent</option>
            </select>
            <select
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm"
            >
              <option value="all">All Techs</option>
              <option value="unassigned">Unassigned</option>
              {techs.map(t => (
                <option key={t.id} value={t.id}>{t.full_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Resume Check-In Section — incomplete check-ins */}
      {!showArchived && !hasActiveFilters && needsCheckin.length > 0 && (
        <div className="mb-6 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <RotateCw className="w-3 h-3" /> Resume Check-In ({needsCheckin.length})
          </p>
          {needsCheckin.map(i => (
            <button
              key={i.id}
              onClick={() => navigate(`/checkin/${i.id}`)}
              className="w-full bg-warning-50 border border-warning-200 rounded-xl p-3 text-left hover:border-warning-300 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm truncate">
                  {i.vehicle_make || i.vehicle_model
                    ? `${i.vehicle_year} ${i.vehicle_make} ${i.vehicle_model}`
                    : 'New check-in'}
                </h3>
                <p className="text-xs text-gray-500 truncate">
                  {i.customer_first_name || i.customer_last_name
                    ? `${i.customer_first_name} ${i.customer_last_name}`
                    : 'No customer yet'} · {format(new Date(i.created_at), 'MMM d, h:mm a')}
                </p>
              </div>
              <span className="flex-shrink-0 px-3 py-1.5 bg-warning-500 text-white text-xs font-semibold rounded-lg">
                Resume
              </span>
            </button>
          ))}
        </div>
      )}

      {/* New Check-In Button */}
      {!showArchived && (
        <button
          onClick={() => navigate('/checkin')}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 mb-6"
        >
          <Plus className="w-5 h-5" /> New Check-In
        </button>
      )}

      {/* Archived Banner */}
      {showArchived && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-gray-100 rounded-xl">
          <Archive className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600 font-medium">Archived Inspections</span>
        </div>
      )}

      {/* Main Inspection List */}
      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : loadError ? (
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-danger-300 mx-auto mb-3" />
          <p className="text-gray-600 mb-4">Unable to load inspections. Check your connection and try again.</p>
          <button
            onClick={() => loadInspections()}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl"
          >
            Try Again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Archive className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{showArchived ? 'No archived inspections' : 'No inspections found'}</p>
        </div>
      ) : showGrouped ? (
        /* Grouped by operational category */
        <div className="space-y-6">
          {groups.map(g => g.items.length > 0 && (
            <div key={g.key} className="space-y-2">
              <p className={`text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5 ${g.color}`}>
                <g.icon className="w-3.5 h-3.5" /> {g.label} ({g.items.length})
              </p>
              {g.items.map(i => renderCard(i))}
            </div>
          ))}
        </div>
      ) : (
        /* Flat list when search/filter is active or viewing archived */
        <div className="space-y-3">
          {filtered.map(i => renderCard(i))}
        </div>
      )}

      {/* Recent Activity — last 5 updated inspections */}
      {!showArchived && !loading && !loadError && recentActivity.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
            <Activity className="w-3.5 h-3.5" /> Recent Activity
          </p>
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
            {recentActivity.map(i => (
              <button
                key={i.id}
                onClick={() => navigate(cardRoute(i))}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Car className="w-4 h-4 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {i.vehicle_make || i.vehicle_model
                      ? `${i.vehicle_year} ${i.vehicle_make} ${i.vehicle_model}`
                      : 'New check-in'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">
                    {activityDescription(i)} · {format(new Date(i.updated_at), 'MMM d, h:mm a')}
                  </p>
                </div>
                <StatusBadge status={i.status} size="sm" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  // ── Card renderer ───────────────────────────────────────────────

  function renderCard(i: Inspection) {
    const tech = i.assigned_tech_id ? techMap.get(i.assigned_tech_id) : null;
    const isUnassigned = i.checkin_complete !== false && i.status === 'not_started' && !i.assigned_tech_id;
    const route = cardRoute(i);

    return (
      <div
        key={i.id}
        onClick={() => { setAssigningId(null); navigate(route); }}
        className={`w-full bg-white rounded-xl p-4 shadow-sm border text-left hover:border-primary-300 cursor-pointer ${i.checkin_complete === false ? 'border-warning-200 bg-warning-50/30' : 'border-gray-200'}`}
      >
        <div className="flex justify-between items-start mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-gray-900 truncate">
              {i.vehicle_make || i.vehicle_model
                ? `${i.vehicle_year} ${i.vehicle_make} ${i.vehicle_model}`
                : 'New check-in'}
            </h3>
            <p className="text-sm text-gray-500 truncate">
              {i.customer_first_name || i.customer_last_name
                ? `${i.customer_first_name} ${i.customer_last_name}`
                : 'No customer yet'}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0 ml-2">
            <StatusBadge status={i.status} size="sm" />
            {i.correction_requested_at && (
              <span className="text-xs bg-danger-100 text-danger-700 px-2 py-0.5 rounded-full font-medium">
                Correction Requested
              </span>
            )}
            {showArchived && i.archived_at && (
              <span className="text-xs text-gray-400">{format(new Date(i.archived_at), 'MMM d, yyyy')}</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-4 text-sm text-gray-600 min-w-0">
            <span className="flex-shrink-0">{format(new Date(i.created_at), 'MMM d')}</span>
            <span className="flex items-center gap-1 flex-shrink-0">
              <Car className="w-4 h-4" /> {i.vehicle_mileage.toLocaleString()} mi
            </span>
          </div>

          {tech ? (
            <span className="flex items-center gap-1 text-xs text-gray-600 flex-shrink-0">
              <Wrench className="w-3 h-3" /> {tech.full_name}
            </span>
          ) : i.assigned_tech_id ? (
            <span className="text-xs text-gray-400 flex-shrink-0">Assigned</span>
          ) : isUnassigned && !showArchived ? (
            <div className="relative flex-shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setAssigningId(assigningId === i.id ? null : i.id);
                }}
                className="flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 text-xs font-medium rounded-lg hover:bg-primary-100"
              >
                <UserPlus className="w-3 h-3" /> Assign
                <ChevronDown className="w-3 h-3" />
              </button>
              {assigningId === i.id && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={(e) => { e.stopPropagation(); setAssigningId(null); }}
                  />
                  <div
                    className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[180px] py-1 max-h-60 overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {techs.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-gray-400">No techs available</p>
                    ) : (
                      techs.map(t => (
                        <button
                          key={t.id}
                          onClick={(e) => { e.stopPropagation(); assignTech(i.id, t.id); }}
                          disabled={assigning}
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                        >
                          {t.full_name}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>

        {!showArchived && (
          <ProgressBar
            percent={['pending_review', 'approved', 'sent'].includes(i.status) ? 100 : i.progress_percent}
          />
        )}
      </div>
    );
  }
}
