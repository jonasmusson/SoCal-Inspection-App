import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Inspection, STATUS_LABELS } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { ProgressBar } from '../components/common/ProgressBar';
import { Clock, Car, Pause, AlertTriangle } from 'lucide-react';
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

  return (
    <div className="p-4 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">My Inspections</h1>
      </div>

      <div className="mb-4 overflow-x-auto">
        <div className="flex gap-2 pb-2">
          {['all', 'not_started', 'in_progress', 'pending_review', 'approved', 'sent'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${statusFilter === s ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-700'}`}>
              {s === 'all' ? 'All' : STATUS_LABELS[s as keyof typeof STATUS_LABELS]}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-center py-8 text-gray-500">Loading...</div> :
        loadError ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-danger-300 mx-auto mb-3" />
            <p className="text-gray-600 mb-4">Unable to load your inspections. Check your connection and try again.</p>
            <button onClick={() => loadInspections()}
              className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl">
              Try Again
            </button>
          </div>
        ) :
        inspections.length === 0 ? (
          <div className="text-center py-12">
            <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No inspections found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {inspections.map(i => {
              const isPaused = i.status === 'in_progress' && !!i.paused_at;
              return (
                <button key={i.id} onClick={() => handleCardClick(i)}
                  className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-200 text-left hover:border-primary-300">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900">{i.vehicle_year} {i.vehicle_make} {i.vehicle_model}</h3>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isPaused && (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                          <Pause className="w-3 h-3" /> Paused
                        </span>
                      )}
                      <StatusBadge status={i.status} size="sm" />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                    <span>{format(new Date(i.created_at), 'MMM d')}</span>
                    <span className="flex items-center gap-1"><Car className="w-4 h-4" /> {i.vehicle_mileage.toLocaleString()} mi</span>
                  </div>
                  {(i.status === 'in_progress' || i.status === 'not_started') && <ProgressBar percent={i.progress_percent} />}
                  {isPaused && (
                    <p className="text-xs text-amber-600 mt-2 font-medium">Tap to view progress and resume</p>
                  )}
                </button>
              );
            })}
          </div>
        )
      }
    </div>
  );
}
