import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, Mail, CheckCircle, X, Pencil } from 'lucide-react';
import { supabase, callDealRoomAdmin } from '../../supabase';
import { Card } from '../../components/ui';

const AdminDealInterests = ({ onRefresh }) => {
  const [deals, setDeals] = useState([]);
  const [responsesByDeal, setResponsesByDeal] = useState({});
  const [sb2UsersById, setSb2UsersById] = useState({});
  const [localMembers, setLocalMembers] = useState([]);
  const [expandedDeals, setExpandedDeals] = useState({});
  const [loading, setLoading] = useState(true);
  const [sendingReminder, setSendingReminder] = useState({});
  const [toast, setToast] = useState(null);
  const [dealLogos, setDealLogos] = useState({});
  const [sessionReminders, setSessionReminders] = useState({}); // key: `${dealId}-${email}` -> count sent this session
  const [editingRowId, setEditingRowId] = useState(null);
  const [editDecision, setEditDecision] = useState('invest');
  const [editAmount, setEditAmount] = useState('');
  const [savingEditId, setSavingEditId] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Fetch LOCAL deals that have a source_deal_id (imported from deal room)
      const [localDealsRes, dealRoomRes, membersRes, avTeamRes] = await Promise.all([
        supabase.from('deals').select('*').not('source_deal_id', 'is', null).order('created_at', { ascending: false }),
        callDealRoomAdmin('listAllResponsesAndUsers'),
        supabase.from('members').select('id, full_name, email, is_manager'),
        supabase.from('av_team').select('email'),
      ]);

      if (localDealsRes.error) throw localDealsRes.error;

      const usersMap = {};
      (dealRoomRes.users || []).forEach(u => { usersMap[u.id] = u; });

      // Build set of AV-team emails so we can exclude them from member responses
      const avTeamEmails = new Set();
      (avTeamRes.data || []).forEach(t => {
        if (t.email) avTeamEmails.add(t.email.toLowerCase());
      });

      // Members for this club, excluding anyone on the AV team
      const clubMembers = (membersRes.data || []).filter(m => {
        if (!m.email) return false;
        if (m.is_manager) return false;
        if (avTeamEmails.has(m.email.toLowerCase())) return false;
        return true;
      });

      const memberEmails = new Set();
      clubMembers.forEach(m => memberEmails.add(m.email.toLowerCase()));

      // Map responses by supabase2 deal_id — only include club members
      const respMap = {};
      (dealRoomRes.responses || []).forEach(r => {
        const user = usersMap[r.user_id];
        if (!user) return;
        if (!memberEmails.has(user.email?.toLowerCase())) return;
        if (!respMap[r.deal_id]) respMap[r.deal_id] = [];
        respMap[r.deal_id].push({ ...r, user });
      });

      const localDeals = localDealsRes.data || [];

      // Preload company logos from supabase2 before rendering, to avoid fallback flash
      const sourceIds = localDeals.map(d => d.source_deal_id).filter(Boolean);
      const logoMap = {};
      if (sourceIds.length > 0) {
        const results = await Promise.all(sourceIds.map(async (id) => {
          try {
            const { terms } = await callDealRoomAdmin('getDealDetail', { sourceDealId: id });
            return { id, logo: terms?.company_image_path || null };
          } catch {
            return { id, logo: null };
          }
        }));
        results.forEach(r => { logoMap[r.id] = r.logo; });
      }

      // Use local deals but key responses by source_deal_id
      setDealLogos(logoMap);
      setDeals(localDeals);
      setResponsesByDeal(respMap);
      setSb2UsersById(usersMap);
      setLocalMembers(clubMembers);
    } catch (err) {
      console.error('Error loading deal data:', err);
      showToast(`Error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const toggleDeal = (dealId) => {
    setExpandedDeals(prev => ({ ...prev, [dealId]: !prev[dealId] }));
  };

  const timeAgo = (dateStr) => {
    if (!dateStr) return '—';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
    const days = Math.floor(hrs / 24);
    return `${days} day${days > 1 ? 's' : ''} ago`;
  };

  const formatAmount = (amount, decision) => {
    // Invest with no amount = max allocation requested.
    if (decision === 'invest' && (amount == null || amount === '')) return 'Max';
    if (!amount) return '—';
    const num = Number(amount);
    if (isNaN(num)) return '—';
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${Math.round(num / 1000)}K`;
    return `$${num.toLocaleString()}`;
  };

  const getMemberRows = (dealId, sourceDealId) => {
    // Use source_deal_id to look up responses in supabase2
    const dealResponses = responsesByDeal[sourceDealId] || [];
    const respondedEmails = new Set();

    const rows = dealResponses.map(r => {
      const email = r.user?.email?.toLowerCase();
      if (email) respondedEmails.add(email);
      return {
        id: r.id,
        name: r.user ? `${r.user.first_name || ''} ${r.user.last_name || ''}`.trim() || 'Unknown' : 'Unknown',
        email: r.user?.email || '',
        decision: r.decision || 'pending',
        amount: r.desired_amount,
        reason: r.reason || null,
        submitted: r.submitted_at,
        remindersSent: r.reminders_sent || 0,
      };
    });

    // Add pending local members who haven't responded
    localMembers.forEach(m => {
      if (m.email && !respondedEmails.has(m.email.toLowerCase())) {
        rows.push({
          id: `pending-${m.id}`,
          name: m.full_name || 'Unknown',
          email: m.email,
          decision: 'pending',
          amount: null,
          reason: null,
          submitted: null,
          remindersSent: 0,
        });
      }
    });

    // Sort: Invest first, then Pass, then Pending
    const order = { 'invest': 0, 'pass': 1, 'pending': 2 };
    rows.sort((a, b) => (order[a.decision] ?? 3) - (order[b.decision] ?? 3));

    return rows;
  };

  const sendReminder = async (row, deal, dealName) => {
    const { email, name } = row;
    setSendingReminder(prev => ({ ...prev, [email]: true }));
    try {
      const { data: settings } = await supabase
        .from('site_settings')
        .select('club_name')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const clubName = settings?.club_name || 'Nuclear Energy Venture Club';

      const res = await fetch('/.netlify/functions/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [email],
          subject: `${clubName} - Action Required: ${dealName}`,
          html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;line-height:1.6;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden;">
        <tr><td style="padding:32px 32px 8px 32px;">
          <p style="margin:0 0 20px 0;font-size:16px;color:#111827;">Hi ${name},</p>
          <p style="margin:0 0 16px 0;font-size:15px;color:#374151;">A deal opportunity for <strong style="color:#111827;">${dealName}</strong> is awaiting your response.</p>
          <p style="margin:0 0 28px 0;font-size:15px;color:#374151;">Please log in to the portal to review and submit your investment decision.</p>
          <p style="margin:0 0 24px 0;">
            <a href="${window.location.origin}/deals" style="display:inline-block;padding:12px 28px;background-color:#1B4D5C;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:500;font-size:14px;">View Deal</a>
          </p>
        </td></tr>
        <tr><td style="padding:16px 32px 24px 32px;border-top:1px solid #f3f4f6;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">This message was sent by ${clubName}. If you no longer wish to receive deal notifications, contact your club administrator.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`,
          text: `Hi ${name},\n\nA deal opportunity for ${dealName} is awaiting your response.\n\nPlease log in to the portal to review and submit your investment decision:\n${window.location.origin}/deals\n\n— ${clubName}`,
        }),
      });

      if (!res.ok) throw new Error('Failed to send email');

      // Bump session counter for instant UI feedback
      const key = `${deal.id}-${email.toLowerCase()}`;
      setSessionReminders(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));

      // Persist to supabase2 if this is a real response row (not a synthetic pending-X id)
      if (row.id && !String(row.id).startsWith('pending-')) {
        try {
          await callDealRoomAdmin('incrementReminder', { responseId: row.id });
        } catch (err) {
          console.warn('Failed to persist reminder count:', err);
        }
      }

      showToast(`Reminder sent to ${name}`);
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    } finally {
      setSendingReminder(prev => ({ ...prev, [email]: false }));
    }
  };

  const sendBulkReminders = async (deal, dealName) => {
    const pending = getMemberRows(deal.id, deal.source_deal_id).filter(r => r.decision === 'pending');
    if (pending.length === 0) return;

    const key = `bulk-${deal.id}`;
    setSendingReminder(prev => ({ ...prev, [key]: true }));

    let sent = 0;
    for (const row of pending) {
      try {
        await sendReminder(row, deal, dealName);
        sent++;
      } catch {}
    }

    setSendingReminder(prev => ({ ...prev, [key]: false }));
    showToast(`Sent ${sent} of ${pending.length} reminders`);
  };

  const startEdit = (row) => {
    setEditingRowId(row.id);
    setEditDecision(row.decision === 'pass' ? 'pass' : 'invest');
    setEditAmount(row.amount != null ? String(row.amount) : '');
  };

  const cancelEdit = () => {
    setEditingRowId(null);
  };

  const saveEdit = async (row) => {
    let desiredAmount = null;
    if (editDecision === 'invest') {
      const parsed = parseFloat(editAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        alert('Enter a valid interest amount (greater than 0) for an Invest decision.');
        return;
      }
      desiredAmount = parsed;
    }
    setSavingEditId(row.id);
    try {
      await callDealRoomAdmin('updateResponse', {
        responseId: row.id,
        decision: editDecision,
        desiredAmount,
      });
      showToast(`Updated ${row.name}'s response`);
      setEditingRowId(null);
      await loadData();
    } catch (err) {
      alert(`Failed to update: ${err.message || err}`);
    } finally {
      setSavingEditId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-gray-300 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading deals...</p>
        </div>
      </div>
    );
  }

  if (deals.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <p className="text-gray-500">No deals found in the deal room database.</p>
          <p className="text-sm text-gray-400 mt-1">Deals will appear here when they are synced from the spreadsheet.</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {deals.map(deal => {
        const isExpanded = expandedDeals[deal.id];
        const rows = getMemberRows(deal.id, deal.source_deal_id);
        const pendingCount = rows.filter(r => r.decision === 'pending').length;
        const investCount = rows.filter(r => r.decision === 'invest').length;
        const passCount = rows.filter(r => r.decision === 'pass').length;
        const dealName = deal.company_name || 'Unnamed Deal';

        return (
          <Card key={deal.id} className="overflow-hidden !p-0">
            {/* Deal header — clickable accordion */}
            <div
              onClick={() => toggleDeal(deal.id)}
              className="flex items-center justify-between cursor-pointer px-6 py-5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                {isExpanded ? (
                  <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                )}
                <div className="w-11 h-11 rounded-lg border border-gray-200 bg-white flex items-center justify-center overflow-hidden flex-shrink-0">
                  {dealLogos[deal.source_deal_id] || deal.company_logo ? (
                    <img
                      src={dealLogos[deal.source_deal_id] || deal.company_logo}
                      alt={dealName}
                      className="w-full h-full object-contain"
                      onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/av-logo.png'; e.currentTarget.className = 'w-6 h-6 object-contain'; }}
                    />
                  ) : (
                    <img src="/av-logo.png" alt="AV" className="w-6 h-6 object-contain" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-semibold text-gray-900 truncate">{dealName}</h3>
                    {deal.company_url && (
                      <a
                        href={deal.company_url.startsWith('http') ? deal.company_url : `https://${deal.company_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {deal.company_url.replace(/^https?:\/\//, '')} ↗
                      </a>
                    )}
                    {deal.status && (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">
                        {deal.status}
                      </span>
                    )}
                  </div>
                  {deal.headline && (
                    <p className="text-sm text-gray-600 mt-0.5 truncate">{deal.headline}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm flex-shrink-0">
                <span className="text-green-600 font-medium">{investCount} invest</span>
                <span className="text-gray-500">{passCount} pass</span>
                <span className="text-amber-600">{pendingCount} pending</span>
              </div>
            </div>

            {/* Expanded: member responses table */}
            {isExpanded && (
              <div className="border-t border-gray-200">
                {/* Section header */}
                <div className="flex items-center justify-between px-6 py-4">
                  <h4 className="font-semibold text-gray-900">Member Responses</h4>
                  {pendingCount > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!confirm(`Send a reminder email to ${pendingCount} pending member${pendingCount === 1 ? '' : 's'} for ${dealName}?`)) return;
                        sendBulkReminders(deal, dealName);
                      }}
                      disabled={sendingReminder[`bulk-${deal.id}`]}
                      className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                    >
                      {sendingReminder[`bulk-${deal.id}`]
                        ? 'Sending...'
                        : `Send Reminder to Pending (${pendingCount})`}
                    </button>
                  )}
                </div>

                {/* Table */}
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-t border-b border-gray-200 bg-gray-50">
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                          Member
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                          Decision
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                          Interest Amount
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                          Why
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                          Submitted
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                          Reminders
                        </th>
                        <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(row => {
                        const totalReminders = (row.remindersSent || 0) + (sessionReminders[`${deal.id}-${row.email.toLowerCase()}`] || 0);
                        return (
                        <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                          <td className="px-6 py-4">
                            <span className="font-medium text-gray-900">{row.name}</span>
                          </td>
                          <td className="px-6 py-4">
                            {editingRowId === row.id ? (
                              <select
                                value={editDecision}
                                onChange={(e) => setEditDecision(e.target.value)}
                                disabled={savingEditId === row.id}
                                className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                              >
                                <option value="invest">Invest</option>
                                <option value="pass">Pass</option>
                              </select>
                            ) : (
                              <>
                                {row.decision === 'invest' && (
                                  <span className="text-gray-900 font-medium">Invest</span>
                                )}
                                {row.decision === 'pass' && (
                                  <span className="text-gray-600">Pass</span>
                                )}
                                {row.decision === 'pending' && (
                                  <span className="text-amber-600 font-medium">Pending</span>
                                )}
                                {!['invest', 'pass', 'pending'].includes(row.decision) && (
                                  <span className="text-gray-500">{row.decision}</span>
                                )}
                              </>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {editingRowId === row.id ? (
                              editDecision === 'invest' ? (
                                <div className="relative inline-block">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                  <input
                                    type="number"
                                    value={editAmount}
                                    onChange={(e) => setEditAmount(e.target.value)}
                                    disabled={savingEditId === row.id}
                                    min="0"
                                    step="1000"
                                    placeholder="0"
                                    className="pl-5 pr-2 py-1 border border-gray-300 rounded text-sm w-28 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                                  />
                                </div>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )
                            ) : (
                              formatAmount(row.amount, row.decision)
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-700 max-w-xs">
                            {row.reason ? (
                              <span className="text-sm line-clamp-2" title={row.reason}>{row.reason}</span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-500">
                            {timeAgo(row.submitted)}
                          </td>
                          <td className="px-6 py-4 text-gray-700">
                            {totalReminders}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              {editingRowId === row.id ? (
                                <>
                                  <button
                                    onClick={() => saveEdit(row)}
                                    disabled={savingEditId === row.id}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                                    style={{ backgroundColor: 'var(--primary-color, #1B4D5C)' }}
                                  >
                                    {savingEditId === row.id ? 'Saving...' : 'Save'}
                                  </button>
                                  <button
                                    onClick={cancelEdit}
                                    disabled={savingEditId === row.id}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  {!String(row.id).startsWith('pending-') && (row.decision === 'invest' || row.decision === 'pass') && (
                                    <button
                                      onClick={() => startEdit(row)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                                      title={`Edit ${row.name}'s response`}
                                    >
                                      <Pencil className="w-4 h-4" />
                                      <span>Edit</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      if (!confirm(`Send a reminder email to ${row.name} (${row.email}) for ${dealName}?`)) return;
                                      sendReminder(row, deal, dealName);
                                    }}
                                    disabled={sendingReminder[row.email]}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                                    title={`Send reminder to ${row.name}`}
                                  >
                                    {sendingReminder[row.email] ? (
                                      <span className="text-xs text-gray-500">Sending...</span>
                                    ) : (
                                      <>
                                        <Mail className="w-4 h-4" />
                                        <span>Remind</span>
                                      </>
                                    )}
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                      {rows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                            No responses yet
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-4 right-4 z-50">
          <div className={`px-6 py-3 rounded-lg shadow-lg text-white flex items-center gap-2 ${
            toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
          }`}>
            {toast.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <X className="w-5 h-5" />}
            <span>{toast.msg}</span>
          </div>
        </div>
      )}

    </div>
  );
};

export default AdminDealInterests;
