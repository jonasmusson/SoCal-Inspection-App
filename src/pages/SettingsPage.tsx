import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { UserProfile, UserRole, EmailTemplate, ShopSetting } from '../types';
import {
  Users, Clock, CheckCircle, Mail, ChevronDown, Save, Store, Wrench,
} from 'lucide-react';

type Tab = 'pending' | 'team' | 'email' | 'shop';

export function SettingsPage() {
  const { isOwner, isManager } = useAuth();
  const canAccess = isOwner || isManager;

  const [tab, setTab] = useState<Tab>('pending');
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [activeUsers, setActiveUsers] = useState<UserProfile[]>([]);
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({});
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');

  // Shop settings
  const [shopSettings, setShopSettings] = useState<Record<string, string>>({});
  const [savingShop, setSavingShop] = useState(false);
  const [shopSaved, setShopSaved] = useState(false);

  useEffect(() => {
    if (canAccess) loadAll();
  }, [canAccess]);

  async function loadAll() {
    setLoading(true);
    const [pendingRes, activeRes, templateRes, shopRes] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('user_profiles').select('*').eq('status', 'active').order('full_name'),
      isOwner ? supabase.from('email_templates').select('*').eq('type', 'welcome_new_user').single() : Promise.resolve({ data: null }),
      isOwner ? supabase.from('shop_settings').select('*') : Promise.resolve({ data: null }),
    ]);
    setPendingUsers(pendingRes.data || []);
    setActiveUsers(activeRes.data || []);
    if (templateRes.data) {
      setEmailTemplate(templateRes.data);
      setEditSubject(templateRes.data.subject);
      setEditBody(templateRes.data.body);
    }
    if (shopRes.data) {
      const map: Record<string, string> = {};
      (shopRes.data as ShopSetting[]).forEach(s => { map[s.key] = s.value; });
      setShopSettings(map);
    }
    const roles: Record<string, UserRole> = {};
    (pendingRes.data || []).forEach((u: UserProfile) => { roles[u.id] = 'tech'; });
    setPendingRoles(roles);
    setLoading(false);
  }

  async function approveUser(user: UserProfile) {
    setApprovingId(user.id);
    const role = pendingRoles[user.id] ?? 'tech';
    await supabase.from('user_profiles').update({ status: 'active', role }).eq('id', user.id);
    await supabase.functions.invoke('send-welcome-email', { body: { userId: user.id } });
    setPendingUsers(prev => prev.filter(u => u.id !== user.id));
    setActiveUsers(prev => [...prev, { ...user, status: 'active' as const, role }].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setApprovingId(null);
  }

  async function changeRole(userId: string, role: UserRole) {
    await supabase.from('user_profiles').update({ role }).eq('id', userId);
    setActiveUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
  }

  async function saveEmailTemplate() {
    if (!emailTemplate) return;
    setSavingEmail(true);
    await supabase.from('email_templates').update({
      subject: editSubject,
      body: editBody,
      updated_at: new Date().toISOString(),
    }).eq('id', emailTemplate.id);
    setSavingEmail(false);
    setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 2500);
  }

  async function saveShopSettings() {
    setSavingShop(true);
    const keys = ['shop_name', 'app_url', 'checkin_required_photos', 'checkin_video_required'];
    await Promise.all(keys.map(key =>
      supabase.from('shop_settings').upsert({ key, value: shopSettings[key] ?? '' }, { onConflict: 'key' })
    ));
    setSavingShop(false);
    setShopSaved(true);
    setTimeout(() => setShopSaved(false), 2500);
  }

  if (!canAccess) return <div className="p-4 text-center text-gray-500">Access denied</div>;

  const tabs: { id: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { id: 'pending', label: 'Pending', icon: Clock, count: pendingUsers.length },
    { id: 'team', label: 'Team', icon: Users },
    ...(isOwner ? [
      { id: 'email' as Tab, label: 'Emails', icon: Mail },
      { id: 'shop' as Tab, label: 'Shop', icon: Store },
    ] : []),
  ];

  return (
    <div className="p-4 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your team and notifications</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-5">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="bg-warning-500 text-white text-xs font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* ── Pending Approvals ── */}
          {tab === 'pending' && (
            <div className="space-y-3">
              {pendingUsers.length === 0 ? (
                <div className="bg-white rounded-xl p-8 border border-gray-200 text-center">
                  <CheckCircle className="w-10 h-10 text-success-400 mx-auto mb-2" />
                  <p className="font-medium text-gray-700">All caught up</p>
                  <p className="text-sm text-gray-400 mt-1">No pending account requests</p>
                </div>
              ) : (
                pendingUsers.map(u => (
                  <div key={u.id} className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{u.full_name}</p>
                        <p className="text-sm text-gray-500">{u.email}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Requested {new Date(u.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className="px-2 py-0.5 bg-warning-100 text-warning-700 text-xs font-medium rounded-full flex-shrink-0">
                        Pending
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <select
                          value={pendingRoles[u.id] ?? 'tech'}
                          onChange={e => setPendingRoles(prev => ({ ...prev, [u.id]: e.target.value as UserRole }))}
                          className="w-full appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg text-sm">
                          <option value="tech">Tech</option>
                          <option value="manager">Manager</option>
                          {isOwner && <option value="owner">Owner</option>}
                        </select>
                        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                      <button
                        onClick={() => approveUser(u)}
                        disabled={approvingId === u.id}
                        className="flex items-center gap-1.5 px-4 py-2 bg-success-600 hover:bg-success-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
                        <CheckCircle className="w-4 h-4" />
                        {approvingId === u.id ? 'Approving...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── Team ── */}
          {tab === 'team' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200">
              {activeUsers.length === 0 ? (
                <div className="p-8 text-center text-gray-400">No active team members</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {activeUsers.map(u => (
                    <div key={u.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary-700 font-semibold text-sm">
                          {u.full_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{u.full_name}</p>
                        <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      </div>
                      {isOwner ? (
                        <div className="relative">
                          <select
                            value={u.role}
                            onChange={e => changeRole(u.id, e.target.value as UserRole)}
                            className="appearance-none pl-3 pr-7 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-gray-50">
                            <option value="tech">Tech</option>
                            <option value="manager">Manager</option>
                            <option value="owner">Owner</option>
                          </select>
                          <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          u.role === 'owner' ? 'bg-primary-100 text-primary-700' :
                          u.role === 'manager' ? 'bg-success-100 text-success-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Email Templates (owner only) ── */}
          {tab === 'email' && isOwner && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-1">
                  <Mail className="w-4 h-4 text-primary-500" />
                  <h3 className="font-semibold text-gray-900">New User Welcome Email</h3>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  Sent automatically when a pending account is approved.
                </p>

                <div className="p-3 bg-blue-50 rounded-lg border border-blue-100 mb-4">
                  <p className="text-xs text-blue-700 font-medium mb-1">Available variables</p>
                  <div className="flex flex-wrap gap-1.5">
                    {['{{first_name}}', '{{last_name}}', '{{email}}', '{{app_url}}'].map(v => (
                      <code key={v} className="px-2 py-0.5 bg-white border border-blue-200 rounded text-xs text-blue-800">{v}</code>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject Line</label>
                    <input
                      value={editSubject}
                      onChange={e => setEditSubject(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                      placeholder="Email subject..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Body (HTML)</label>
                    <textarea
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      rows={12}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-primary-500 outline-none resize-y"
                      placeholder="HTML email body..."
                    />
                  </div>
                </div>

                <button
                  onClick={saveEmailTemplate}
                  disabled={savingEmail}
                  className={`mt-3 w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
                    emailSaved ? 'bg-success-600 text-white' : 'bg-primary-600 hover:bg-primary-700 text-white'
                  } disabled:opacity-50`}>
                  {emailSaved ? (
                    <><CheckCircle className="w-4 h-4" /> Saved</>
                  ) : (
                    <><Save className="w-4 h-4" /> {savingEmail ? 'Saving...' : 'Save Template'}</>
                  )}
                </button>
              </div>

              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench className="w-4 h-4 text-gray-400" />
                  <h3 className="font-semibold text-gray-900">Business</h3>
                </div>
                <p className="text-gray-600 text-sm">SoCal Autoworks Inspection System</p>
                <p className="text-xs text-gray-400 mt-1">
                  To set your app URL in welcome emails, update the <code className="bg-gray-100 px-1 rounded">APP_URL</code> environment variable or include it directly in the template body.
                </p>
              </div>
            </div>
          )}

          {/* ── Shop Settings (owner only) ── */}
          {tab === 'shop' && isOwner && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <Store className="w-4 h-4 text-primary-500" />
                  <h3 className="font-semibold text-gray-900">Shop Settings</h3>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shop Name</label>
                    <input value={shopSettings['shop_name'] ?? ''}
                      onChange={e => setShopSettings(prev => ({ ...prev, shop_name: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                      placeholder="e.g. SoCal Autoworks" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">App URL</label>
                    <p className="text-xs text-gray-500 mb-1.5">Used in welcome emails and tech notifications.</p>
                    <input value={shopSettings['app_url'] ?? ''}
                      onChange={e => setShopSettings(prev => ({ ...prev, app_url: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                      placeholder="https://your-app.com" />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Required Check-in Photos</label>
                    <p className="text-xs text-gray-500 mb-1.5">Minimum photos required before submitting a check-in.</p>
                    <input type="number" min={0} max={20}
                      value={shopSettings['checkin_required_photos'] ?? '3'}
                      onChange={e => setShopSettings(prev => ({ ...prev, checkin_required_photos: e.target.value }))}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-primary-500 outline-none" />
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Require Walk-around Video</p>
                      <p className="text-xs text-gray-500">Tech must record a walk-around video during check-in.</p>
                    </div>
                    <button
                      onClick={() => setShopSettings(prev => ({
                        ...prev,
                        checkin_video_required: prev['checkin_video_required'] === 'true' ? 'false' : 'true',
                      }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        shopSettings['checkin_video_required'] === 'true' ? 'bg-primary-600' : 'bg-gray-300'
                      }`}>
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                        shopSettings['checkin_video_required'] === 'true' ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>
                </div>

                <button onClick={saveShopSettings} disabled={savingShop}
                  className={`mt-4 w-full py-2.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors ${
                    shopSaved ? 'bg-success-600 text-white' : 'bg-primary-600 hover:bg-primary-700 text-white'
                  } disabled:opacity-50`}>
                  {shopSaved ? (
                    <><CheckCircle className="w-4 h-4" /> Saved</>
                  ) : (
                    <><Save className="w-4 h-4" /> {savingShop ? 'Saving...' : 'Save Settings'}</>
                  )}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
