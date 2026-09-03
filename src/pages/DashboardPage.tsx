import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { Inspection } from '../types';
import { StatusBadge } from '../components/common/StatusBadge';
import { ProgressBar } from '../components/common/ProgressBar';
import { Plus, Search, Car, AlertCircle, Clock, CheckCircle, Archive, AlertTriangle } from 'lucide-react';
import { useNavigate, Navigate } from 'react-router-dom';
import { format } from 'date-fns';
import { withTimeout } from '../lib/async';

export function DashboardPage() {
  const { profile, isManager, isOwner } = useAuth();
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<Inspection[]>([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    loadInspections();

  }, [statusFilter, search, showArchived]);

  async function loadInspections() {
    setLoading(true);
    setLoadError(false);
    try {
      let query = supabase.from('inspections').select('*').order('created_at', { ascending: false });
      query = query.eq('archived', showArchived);
      if (!showArchived && statusFilter !== 'all') query = query.eq('status', statusFilter);
      if (search) query = query.or(`customer_first_name.ilike.%${search}%,customer_last_name.ilike.%${search}%,vehicle_make.ilike.%${search}%,vehicle_model.ilike.%${search}%`);
      const { data } = await withTimeout(query);
      setInspections(data || []);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  const stats = {
    pending: inspections.filter(i => i.status === 'pending_review').length,
    inProgress: inspections.filter(i => i.status === 'in_progress').length,
    completed: inspections.filter(i => i.status === 'sent' && i.report_sent_at &&
      format(new Date(i.report_sent_at), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')).length,
  };

  if (!profile) return null;
  if (!isManager && !isOwner) return <Navigate to="/my-inspections" replace />;

  return (
    <div className="p-4 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500">Welcome back, {profile?.full_name}</p>
      </div>

      {!showArchived && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[{ icon: AlertCircle, label: 'Pending', value: stats.pending, color: 'text-warning-500' },
            { icon: Clock, label: 'In Progress', value: stats.inProgress, color: 'text-primary-500' },
            { icon: CheckCircle, label: 'Done Today', value: stats.completed, color: 'text-success-500' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl p-3 shadow-sm border border-gray-200 text-center">
              <s.icon className={`w-5 h-5 ${s.color} mx-auto mb-1`} />
              <p className="text-xl font-bold text-gray-900">{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-xl" />
        </div>
        {!showArchived && (
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-xl">
            <option value="all">All</option>
            <option value="not_started">Not Started</option>
            <option value="in_progress">In Progress</option>
            <option value="pending_review">Pending Review</option>
            <option value="approved">Approved</option>
            <option value="sent">Sent</option>
          </select>
        )}
        <button onClick={() => { setShowArchived(v => !v); setStatusFilter('all'); }}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${showArchived ? 'bg-gray-700 border-gray-700 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}
          title={showArchived ? 'Back to active' : 'View archived'}>
          <Archive className="w-4 h-4" />
        </button>
      </div>

      {!showArchived && (
        <button onClick={() => navigate('/checkin')}
          className="w-full bg-primary-600 hover:bg-primary-700 text-white font-medium py-3 rounded-xl flex items-center justify-center gap-2 mb-6">
          <Plus className="w-5 h-5" /> New Check-In
        </button>
      )}

      {showArchived && (
        <div className="flex items-center gap-2 mb-4 p-3 bg-gray-100 rounded-xl">
          <Archive className="w-4 h-4 text-gray-500" />
          <span className="text-sm text-gray-600 font-medium">Archived Inspections</span>
        </div>
      )}

      {loading ? <div className="text-center py-8 text-gray-500">Loading...</div> :
        loadError ? (
          <div className="text-center py-12">
            <AlertTriangle className="w-12 h-12 text-danger-300 mx-auto mb-3" />
            <p className="text-gray-600 mb-4">Unable to load inspections. Check your connection and try again.</p>
            <button onClick={() => loadInspections()}
              className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-xl">
              Try Again
            </button>
          </div>
        ) :
        inspections.length === 0 ? (
          <div className="text-center py-12">
            <Archive className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">{showArchived ? 'No archived inspections' : 'No inspections found'}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {inspections.map(i => (
              <button key={i.id} onClick={() => navigate(i.status === 'pending_review' ? `/review/${i.id}` : `/inspection/${i.id}`)}
                className="w-full bg-white rounded-xl p-4 shadow-sm border border-gray-200 text-left hover:border-primary-300">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">{i.vehicle_year} {i.vehicle_make} {i.vehicle_model}</h3>
                    <p className="text-sm text-gray-500">{i.customer_first_name} {i.customer_last_name}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <StatusBadge status={i.status} size="sm" />
                    {!i.assigned_tech_id && i.status === 'not_started' && !showArchived && (
                      <span className="text-xs bg-warning-100 text-warning-700 px-2 py-0.5 rounded-full font-medium">Unassigned</span>
                    )}
                    {showArchived && i.archived_at && (
                      <span className="text-xs text-gray-400">{format(new Date(i.archived_at), 'MMM d, yyyy')}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                  <span>{format(new Date(i.created_at), 'MMM d')}</span>
                  <span className="flex items-center gap-1"><Car className="w-4 h-4" /> {i.vehicle_mileage.toLocaleString()} mi</span>
                </div>
                {!showArchived && <ProgressBar percent={i.progress_percent} />}
              </button>
            ))}
          </div>
        )
      }
    </div>
  );
}
