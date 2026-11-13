import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { UserProfile, UserRole, EmailTemplate, ShopSetting } from '../types';
import {
  Users, Clock, CheckCircle, Mail, ChevronDown, Save, Store, Wrench,
  UserX, AlertCircle,
} from 'lucide-react';
import { withTimeout } from '../lib/async';

type Tab = 'pending' | 'team' | 'email' | 'shop';

export function SettingsPage() {
  const { isOwner, isManager, profile } = useAuth();
  const canAccess = isOwner || isManager;

  const [tab, setTab] = useState<Tab>('pending');
  const [pendingUsers, setPendingUsers] = useState<UserProfile[]>([]);
  const [activeUsers, setActiveUsers] = useState<UserProfile[]>([]);
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({});
  const [savingEmail, setSavingEmail] = useState(false);
  const [emailSaved, setEmailSaved] = useState(false);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);

  // Shop settings
  const [shopSettings, setShopSettings] = useState<Record<string, string>>({});
  const [savingShop, setSavingShop] = useState(false);
  const [shopSaved, setShopSaved] = useState(false);
  const [shopError, setShopError] = useState(false);
  const [emailError, setEmailError] = useState(false);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [roleError, setRoleError] = useState<string | null>(null);

  useEffect(() => {
    if (canAccess) loadAll();
  }, [canAccess]);

  async function loadAll() {
    setLoading(true);
    setLoadError(false);
    try {
    const [pendingRes, activeRes, templateRes, shopRes] = await withTimeout(Promise.all([
      supabase.from('user_profiles').select('*').eq('status', 'pending').order('created_at'),
      supabase.from('user_profiles').select('*').eq('status', 'active').order('full_name'),
      isOwner ? supabase.from('email_templates').select('*').eq('type', 'welcome_new_user').single() : Promise.resolve({ data: null }),
      isOwner ? supabase.from('shop_settings').select('*') : Promise.resolve({ data: null }),
    ]));
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
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function approveUser(user: UserProfile) {
    setApprovingId(user.id);
    setDeliveryNotice(null);
    const role = pendingRoles[user.id] ?? 'tech';
    // Activate the user (status pending → active) via SECURITY DEFINER function
    const { error: updateError } = await supabase.rpc('set_user_status', {
      target_user_id: user.id,
      new_status: 'active',
    });
    if (updateError) {
      setDeliveryNotice(`Account approval failed: ${updateError.message}`);
      setApprovingId(null);
      return;
    }
    // Set role via SECURITY DEFINER function (enforces last-owner protection at DB level)
    if (role !== 'tech') {
      const { error: roleError } = await supabase.rpc('set_user_role', {
        target_user_id: user.id,
        new_role: role,
      });
      if (roleError) {
        setDeliveryNotice(`Account activated but role could not be set: ${roleError.message}`);
      }
    }
    const { data: emailResult, error: emailError } = await supabase.functions.invoke('send-welcome-email', { body: { userId: user.id } });
    if (emailError || emailResult?.emailSent !== true) {
      setDeliveryNotice('Account approved, but the welcome email was not delivered. Check the deployed email function and RESEND_API_KEY configuration.');
    } else {
      setDeliveryNotice(`Account approved and welcome email sent to ${user.email}.`);
    }
    setPendingUsers(prev => prev.filter(u => u.id !== user.id));
    setActiveUsers(prev => [...prev, { ...user, status: 'active' as const, role }].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    setApprovingId(null);
  }

  async function changeRole(userId: string, role: UserRole) {
    if (profile?.id === userId && role !== 'owner' && isOwner) {
      setRoleError('You cannot demote yourself from owner. Ask another owner to change your role.');
      return;
    }
    const ownerCount = activeUsers.filter(u => u.role === 'owner').length;
    if (ownerCount <= 1 && activeUsers.find(u => u.id === userId)?.role === 'owner' && role !== 'owner') {
      setRoleError('Cannot demote the last owner. Promote another user to owner first.');
      return;
    }
    setRoleError(null);
    // Role change via SECURITY DEFINER function (enforces authorization + last-owner at DB level)
    const { error } = await supabase.rpc('set_user_role', {
      target_user_id: userId,
      new_role: role,
    });
    if (error) {
      setRoleError(`Failed to update role: ${error.message}`);
      return;
    }
    setActiveUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
  }

  async function toggleDeactivate(userId: string, currentlyActive: boolean) {
    setDeactivatingId(userId);
    // Deactivate/reactivate via SECURITY DEFINER function (enforces last-owner + self-protection at DB level)
    const { error } = await supabase.rpc('set_user_status', {
      target_user_id: userId,
      new_status: currentlyActive ? 'pending' : 'active',
    });
    if (!error) {
      const now = currentlyActive ? new Date().toISOString() : null;
      setActiveUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, deactivated_at: now, status: currentlyActive ? 'pending' as const : 'active' as const } : u
      ));
    } else {
      setRoleError(`Failed to ${currentlyActive ? 'deactivate' : 'reactivate'} user: ${error.message}`);
    }
    setDeactivatingId(null);
  }

  async function saveEmailTemplate() {
    if (!emailTemplate) return;
    setSavingEmail(true);
    setEmailError(false);
    const { error } = await supabase.from('email_templates').update({
      subject: editSubject,
      body: editBody,
      updated_at: new Date().toISOString(),
    }).eq('id', emailTemplate.id);
    setSavingEmail(false);
    if (error) {
      setEmailError(true);
      return;
    }
    setEmailSaved(true);
    setTimeout(() => setEmailSaved(false), 2500);
  }

  async function saveShopSettings() {
    setSavingShop(true);
    setShopError(false);
    const laborRate = Number(shopSettings['labor_rate']);
    if (!Number.isFinite(laborRate) || laborRate < 0) {
      setShopError(true);
      setSavingShop(false);
      return;
    }
    const keys = ['shop_name', 'app_url', 'labor_rate', 'checkin_required_photos', 'checkin_video_required'];
    const results = await Promise.all(keys.map(key =>
      supabase.from('shop_settings').upsert({ key, value: shopSettings[key] ?? '' }, { onConflict: 'key' })
    ));
    setSavingShop(false);
    if (results.some(r => r.error)) {
      setShopError(true);
      return;
    }
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

      {roleError && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-warning-200 bg-warning-50 p-3 text-sm text-warning-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          {roleError}
        </div>
      )}

      {deliveryNotice && (
        <div className={`mb-4 rounded-xl border p-3 text-sm ${deliveryNotice.includes('sent to') ? 'bg-success-50 border-success-200 text-success-700' : 'bg-warning-50 border-warning-200 text-warning-700'}`}>
          {deliveryNotice}
        </div>
      )}

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
      ) : loadError ? (
        <div className="text-center py-12"><p className="text-gray-600 mb-3">Settings could not be loaded.</p><button onClick={loadAll} className="px-4 py-2 rounded-xl bg-primary-600 text-white font-medium">Try Again</button></div>
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
                  {activeUsers.map(u => {
                    const isDeactivated = !!u.deactivated_at;
                    const isSelf = profile?.id === u.id;
                    const isLastOwner = u.role === 'owner' && activeUsers.filter(a => a.role === 'owner' && !a.deactivated_at).length <= 1;
                    return (
                    <div key={u.id} className={`flex items-center gap-3 px-4 py-3 ${isDeactivated ? 'opacity-50' : ''}`}>
                      <div className="w-9 h-9 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                        <span className="text-primary-700 font-semibold text-sm">
                          {u.full_name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {u.full_name}
                          {isSelf && <span className="text-xs text-gray-400 ml-1">(you)</span>}
                          {isDeactivated && <span className="text-xs text-gray-400 ml-1">— deactivated</span>}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{u.email}</p>
                      </div>
                      {isOwner ? (
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <select
                              value={u.role}
                              onChange={e => changeRole(u.id, e.target.value as UserRole)}
                              disabled={isDeactivated}
                              className="appearance-none pl-3 pr-7 py-1.5 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-gray-50 disabled:opacity-50">
                              <option value="tech">Tech</option>
                              <option value="manager">Manager</option>
                              <option value="owner">Owner</option>
                            </select>
                            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                          </div>
                          {isOwner && !isSelf && !isLastOwner && (
                            <button
                              onClick={() => toggleDeactivate(u.id, !isDeactivated)}
                              disabled={deactivatingId === u.id}
                              title={isDeactivated ? 'Reactivate user' : 'Deactivate user'}
                              className="p-1.5 rounded-lg text-gray-400 hover:text-danger-500 hover:bg-danger-50 disabled:opacity-50">
                              <UserX className="w-4 h-4" />
                            </button>
                          )}
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
                    );
                  })}
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
                    emailError ? 'bg-danger-600 text-white' : emailSaved ? 'bg-success-600 text-white' : 'bg-primary-600 hover:bg-primary-700 text-white'
                  } disabled:opacity-50`}>
                  {emailError ? (
                    <><AlertCircle className="w-4 h-4" /> Save failed — try again</>
                  ) : emailSaved ? (
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Shop Labor Rate</label>
                    <p className="text-xs text-gray-500 mb-1.5">Used only to calculate preliminary planning ranges in the customer report.</p>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-sm text-gray-500">$</span>
                      <input type="number" min={1} step={1}
                        value={shopSettings['labor_rate'] ?? '175'}
                        onChange={e => setShopSettings(prev => ({ ...prev, labor_rate: e.target.value }))}
                        className="w-full rounded-xl border border-gray-300 py-2.5 pl-7 pr-16 text-sm outline-none focus:ring-2 focus:ring-primary-500" />
                      <span className="absolute right-3 top-2.5 text-xs text-gray-400">/ hour</span>
                    </div>
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
                    shopError ? 'bg-danger-600 text-white' : shopSaved ? 'bg-success-600 text-white' : 'bg-primary-600 hover:bg-primary-700 text-white'
                  } disabled:opacity-50`}>
                  {shopError ? (
                    <><AlertCircle className="w-4 h-4" /> Save failed — check values</>
                  ) : shopSaved ? (
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
