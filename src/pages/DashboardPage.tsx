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

  const [allInspections, setAllInspections] = useState<Inspection[]>([]);
  const [techs, setTechs] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [statusFilter, setStatusFilter] = useState('all');
  const [techFilter, setTechFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [search]);

  useEffect(() => { loadInspections(); }, [showArchived]);
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
    } finally {
      setAssigning(false);
      setAssigningId(null);
    }
  }

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

  const needsCheckin = filtered.filter(i => !i.checkin_complete);
  const groupedItems = filtered.filter(i => i.checkin_complete !== false);

  const groups: { key: string; label: string; icon: typeof Clock; color: string; items: Inspection[] }[] = [
    { key: 'unassigned', label: 'Unassigned', icon: UserPlus, color: 'text-warning-600',
      items: groupedItems.filter(i => i.status === 'not_started' && !i.assigned_tech_id) },
    { key: 'inProgress', label: 'In Progress', icon: Clock, color: 'text-accent-600',
      items: groupedItems.filter(i => i.status === 'in_progress') },
    { key: 'awaitingReview', label: 'Awaiting Review', icon: AlertCircle, color: 'text-warning-500',
      items: groupedItems.filter(i => i.status === 'pending_review') },
    { key: 'approved', label: 'Approved — Ready to Send', icon: CheckCircle, color: 'text-success-500',
      items: groupedItems.filter(i => i.status === 'approved') },
    { key: 'sent', label: 'Sent', icon: Send, color: 'text-primary-500',
      items: groupedItems.filter(i => i.status === 'sent') },
  ];

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

  if (!profile) return null;
  if (!isManager && !isOwner) return <Navigate to="/my-inspections" replace />;

  const statCards = [
    { icon: AlertCircle, label: 'Pending Review', value: stats.pendingReview, color: 'text-warning-600', bg: 'bg-warning-50', ring: 'ring-warning-100' },
    { icon: Clock, label: 'In Progress', value: stats.inProgress, color: 'text-accent-600', bg: 'bg-accent-50', ring: 'ring-accent-100' },
    { icon: ClipboardList, label: 'Awaiting Check-In', value: stats.awaitingCheckin, color: 'text-primary-600', bg: 'bg-primary-50', ring: 'ring-primary-100' },
    { icon: Send, label: 'Sent Today', value: stats.sentToday, color: 'text-success-600', bg: 'bg-success-50', ring: 'ring-success-100' },
  ];

  const showGrouped = !hasActiveFilters && !showArchived;

  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-6 animate-slide-up">
        <h1 className="font-display text-3xl tracking-wide text-primary-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-0.5">Welcome back, {profile?.full_name}</p>
      </div>

      {/* Stat Cards */}
      {!showArchived && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6 animate-slide-up">
          {statCards.map(s => (
            <div
              key={s.label}
              className={`bg-white rounded-2xl p-4 shadow-card border border-gray-100 ring-1 ${s.ring} card-transition hover:shadow-card-hover`}
            >
              <div className={`w-9 h-9 rounded-xl ${s.bg} flex items-center justify-center mb-2.5`}>
                <s.icon className={`w-5 h-5 ${s.color}`} />
              </div>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{s.value}</p>
              <p className="text-xs text-gray-500 font-medium mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search + Filters */}
      <div className="mb-4 space-y-2 animate-fade-in">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer, vehicle, or VIN..."
              className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-accent-400 focus:border-accent-400 transition-all text-sm"
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
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
              showArchived
                ? 'bg-primary-800 border-primary-800 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
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
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-accent-400 focus:border-accent-400 transition-all"
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
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-accent-400 focus:border-accent-400 transition-all"
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

      {/* Resume Check-In Section */}
      {!showArchived && !hasActiveFilters && needsCheckin.length > 0 && (
        <div className="mb-6 space-y-2 animate-fade-in">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
            <RotateCw className="w-3.5 h-3.5 text-accent-500" /> Resume Check-In ({needsCheckin.length})
          </p>
          {needsCheckin.map(i => (
            <button
              key={i.id}
              onClick={() => navigate(`/checkin/${i.id}`)}
              className="w-full bg-accent-50 border border-accent-200 rounded-2xl p-3.5 text-left hover:border-accent-300 hover:bg-accent-100/50 transition-all flex items-center gap-3 card-transition"
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
              <span className="flex-shrink-0 px-3 py-1.5 bg-accent-500 text-white text-xs font-semibold rounded-lg shadow-sm">
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
          className="w-full bg-accent-500 hover:bg-accent-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 mb-6 transition-all active:scale-[0.98] shadow-card hover:shadow-card-hover"
        >
          <Plus className="w-5 h-5" /> New Check-In
        </button>
      )}

      {/* Archived Banner */}
      {showArchived && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-gray-100 rounded-xl border border-gray-200">
          <Archive className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600 font-medium">Archived Inspections</span>
        </div>
      )}

      {/* Main Inspection List */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100">
              <div className="h-5 w-1/2 rounded-lg skeleton mb-2" />
              <div className="h-4 w-1/3 rounded-lg skeleton" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="text-center py-12">
          <AlertTriangle className="w-12 h-12 text-danger-300 mx-auto mb-3" />
          <p className="text-gray-600 mb-4">Unable to load inspections. Check your connection and try again.</p>
          <button
            onClick={() => loadInspections()}
            className="px-6 py-2.5 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl transition-colors"
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
        <div className="space-y-6">
          {groups.map(g => g.items.length > 0 && (
            <div key={g.key} className="space-y-2 animate-fade-in">
              <p className={`text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 ${g.color}`}>
                <g.icon className="w-3.5 h-3.5" /> {g.label} ({g.items.length})
              </p>
              {g.items.map(i => renderCard(i))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(i => renderCard(i))}
        </div>
      )}

      {/* Recent Activity */}
      {!showArchived && !loading && !loadError && recentActivity.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5 mb-3">
            <Activity className="w-3.5 h-3.5 text-accent-500" /> Recent Activity
          </p>
          <div className="bg-white rounded-2xl shadow-card border border-gray-100 divide-y divide-gray-50">
            {recentActivity.map(i => (
              <button
                key={i.id}
                onClick={() => navigate(cardRoute(i))}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-xl bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <Car className="w-4 h-4 text-primary-400" />
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

  function renderCard(i: Inspection) {
    const tech = i.assigned_tech_id ? techMap.get(i.assigned_tech_id) : null;
    const isUnassigned = i.checkin_complete !== false && i.status === 'not_started' && !i.assigned_tech_id;
    const route = cardRoute(i);

    return (
      <div
        key={i.id}
        onClick={() => { setAssigningId(null); navigate(route); }}
        className={`w-full bg-white rounded-2xl p-4 shadow-card border text-left cursor-pointer card-transition hover:shadow-card-hover ${
          i.checkin_complete === false ? 'border-accent-200 bg-accent-50/20' : 'border-gray-100 hover:border-accent-200'
        }`}
      >
        <div className="flex justify-between items-start mb-2.5">
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
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-2">
            <StatusBadge status={i.status} size="sm" />
            {i.correction_requested_at && (
              <span className="text-xs bg-danger-50 text-danger-700 px-2 py-0.5 rounded-full font-medium border border-danger-100">
                Correction Requested
              </span>
            )}
            {showArchived && i.archived_at && (
              <span className="text-xs text-gray-400">{format(new Date(i.archived_at), 'MMM d, yyyy')}</span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-3 text-sm text-gray-500 min-w-0">
            <span className="flex-shrink-0 font-medium">{format(new Date(i.created_at), 'MMM d')}</span>
            <span className="flex items-center gap-1 flex-shrink-0">
              <Car className="w-3.5 h-3.5" /> {i.vehicle_mileage.toLocaleString()} mi
            </span>
          </div>

          {tech ? (
            <span className="flex items-center gap-1 text-xs text-gray-600 flex-shrink-0">
              <Wrench className="w-3 h-3 text-accent-500" /> {tech.full_name}
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
                className="flex items-center gap-1 px-2.5 py-1 bg-accent-50 text-accent-700 text-xs font-semibold rounded-lg hover:bg-accent-100 transition-colors"
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
                    className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-elevated z-20 min-w-[180px] py-1 max-h-60 overflow-y-auto"
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
                          className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
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
