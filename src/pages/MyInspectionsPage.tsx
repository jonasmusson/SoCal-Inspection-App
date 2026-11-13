import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Inspection, STATUS_LABELS } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { ProgressBar } from '../components/common/ProgressBar';
import { Clock, Car, Pause, AlertTriangle, ClipboardList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { withTimeout } from '../lib/async';

export function MyInspectionsPage() {
  const { profile, isManager } = useAuth();
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => { loadInspections(); }, [profile, statusFilter]);

  async function loadInspections() {
    if (!profile) { setLoading(false); return; }
    setLoading(true);
    setLoadError(false);
    try {
      let query = supabase.from('inspections').select('*').eq('archived', false).order('created_at', { ascending: false });
      if (!isManager) query = query.eq('assigned_tech_id', profile.id);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);
      const { data } = await withTimeout(query);
      setInspections(data || []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  function handleCardClick(i: Inspection) {
    if (i.status === 'not_started') {
      navigate(`/inspect/${i.id}`);
    } else {
      navigate(`/inspection/${i.id}`);
    }
  }

  const filters = ['all', 'not_started', 'in_progress', 'pending_review', 'approved', 'sent'] as const;

  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 max-w-5xl mx-auto">
      <div className="mb-6 animate-slide-up">
        <h1 className="font-display text-3xl tracking-wide text-primary-900">My Work</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {profile?.role === 'tech' ? 'Your assigned inspections' : 'All shop inspections'}
        </p>
      </div>

      {/* Filter pills */}
      <div className="mb-5 overflow-x-auto animate-fade-in">
        <div className="flex gap-2 pb-2">
          {filters.map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all active:scale-[0.96] ${
                statusFilter === s
                  ? 'bg-accent-500 text-white shadow-card'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {s === 'all' ? 'All' : STATUS_LABELS[s as keyof typeof STATUS_LABELS]}
            </button>
          ))}
        </div>
      </div>

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
          <p className="text-gray-600 mb-4">Unable to load your inspections. Check your connection and try again.</p>
          <button onClick={() => loadInspections()}
            className="px-6 py-2.5 bg-accent-500 hover:bg-accent-600 text-white font-semibold rounded-xl transition-colors">
            Try Again
          </button>
        </div>
      ) : inspections.length === 0 ? (
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 mb-4">
            <ClipboardList className="w-7 h-7 text-gray-300" />
          </div>
          <p className="text-gray-500 font-medium">No inspections found</p>
          <p className="text-gray-400 text-sm mt-1">
            {statusFilter === 'all' ? 'Check back later or ask a manager to assign you an inspection' : 'Try a different status filter'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {inspections.map((i, idx) => {
            const isPaused = i.status === 'in_progress' && !!i.paused_at;
            return (
              <button
                key={i.id}
                onClick={() => handleCardClick(i)}
                className="w-full bg-white rounded-2xl p-4 shadow-card border border-gray-100 text-left hover:border-accent-200 card-transition hover:shadow-card-hover animate-fade-in"
                style={{ animationDelay: `${Math.min(idx * 40, 200)}ms` }}
              >
                <div className="flex justify-between items-start mb-2.5">
                  <h3 className="font-semibold text-gray-900">{i.vehicle_year} {i.vehicle_make} {i.vehicle_model}</h3>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {isPaused && (
                      <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium border border-amber-200">
                        <Pause className="w-3 h-3" /> Paused
                      </span>
                    )}
                    <StatusBadge status={i.status} size="sm" />
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-500 mb-3">
                  <span className="font-medium">{format(new Date(i.created_at), 'MMM d')}</span>
                  <span className="flex items-center gap-1">
                    <Car className="w-3.5 h-3.5" /> {i.vehicle_mileage.toLocaleString()} mi
                  </span>
                </div>
                {(i.status === 'in_progress' || i.status === 'not_started') && <ProgressBar percent={i.progress_percent} />}
                {isPaused && (
                  <p className="text-xs text-accent-600 mt-2 font-medium flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Tap to view progress and resume
                  </p>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
