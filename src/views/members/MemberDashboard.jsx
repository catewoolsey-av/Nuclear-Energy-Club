import React, { useState, useEffect } from 'react';
import { Calendar, TrendingUp, Bell, ChevronRight, Users, Clock, DollarSign, ExternalLink } from 'lucide-react';
import { formatDate, formatTime, getTimeUntil } from '../../utils/formatters';
import { Button, Card, Badge, Avatar, Modal } from '../../components/ui';
import { callDealRoomMember } from '../../supabase';
import { resolveStorageUrl } from '../../utils/storageUrl';

const MemberDashboard = ({ members, sessions, deals, announcements, avTeam, content, onNavigate, onViewMember, currentUser, onRefresh, siteSettings }) => {
  // Filter and sort upcoming sessions by date, get the most upcoming one
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcomingSessions = sessions
    .filter(s => {
      if (!s.date) return false;
      const sessionDate = new Date(s.date);
      sessionDate.setHours(0, 0, 0, 0);
      return sessionDate >= today;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 1);
  
  // Select featured deal in priority order: pending > active > closed > passed.
  // Exclude deals whose closes_at deadline has elapsed — those live in the
  // Past tab and shouldn't surface as the "Current Deal" on the dashboard.
  const isPastDealForDashboard = (d) => !!(d.closes_at && new Date(d.closes_at).getTime() < Date.now());
  const activeDealsOnly = deals.filter(d => !isPastDealForDashboard(d));
  const rawFeaturedDeal = activeDealsOnly.find(d => d.status === 'pending')
    || activeDealsOnly.find(d => d.status === 'active')
    || activeDealsOnly.find(d => d.status === 'closed')
    || activeDealsOnly.find(d => d.status === 'passed');

  // Pull deal-room enrichment (image, terms, description) for the featured deal
  const [dealRoomInfo, setDealRoomInfo] = useState({});
  const [dealRoomLoading, setDealRoomLoading] = useState(!!rawFeaturedDeal?.source_deal_id);
  useEffect(() => {
    if (!rawFeaturedDeal?.source_deal_id) {
      setDealRoomLoading(false);
      return;
    }
    let cancelled = false;
    setDealRoomLoading(true);
    callDealRoomMember('getDealsInfo', { sourceDealIds: [rawFeaturedDeal.source_deal_id] })
      .then(({ byId }) => { if (!cancelled) setDealRoomInfo(byId || {}); })
      .catch(err => console.error('Failed to load deal-room info for dashboard:', err))
      .finally(() => { if (!cancelled) setDealRoomLoading(false); });
    return () => { cancelled = true; };
  }, [rawFeaturedDeal?.source_deal_id]);

  const featuredDealInfo = rawFeaturedDeal?.source_deal_id ? dealRoomInfo[rawFeaturedDeal.source_deal_id] : null;
  const featuredDeal = rawFeaturedDeal && featuredDealInfo
    ? { ...rawFeaturedDeal, ...(featuredDealInfo.terms || {}) }
    : rawFeaturedDeal;
  
  // Get 4 most recent content items
  const recentContent = content?.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 4) || [];
  
  // Get top 3 pinned announcements, or fill with most recent
  const pinnedAnnouncements = announcements?.filter(a => a.is_pinned).slice(0, 3) || [];
  const remainingSlots = 3 - pinnedAnnouncements.length;
  const recentAnnouncements = remainingSlots > 0 
    ? announcements?.filter(a => !a.is_pinned).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, remainingSlots) || []
    : [];
  const displayAnnouncements = [...pinnedAnnouncements, ...recentAnnouncements];
  
  const cohortMembers = members
    .filter(m => !m.is_manager)
    .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  const memberPreviewCount = 18;
  const [expandedDescription, setExpandedDescription] = useState(null);
  const [expandedTitle, setExpandedTitle] = useState('');

  const isDescriptionTooLong = (description) => {
    if (!description) return false;
    const lineCount = description.split(/\r\n|\r|\n/).length;
    return lineCount > 6 || description.length > 500;
  };
  
  return (
    <div className="space-y-6">
      {/* Welcome Banner */}
      <div className="rounded-xl p-6 text-white relative overflow-hidden" style={{ backgroundColor: siteSettings?.primary_color || '#1B4D5C' }}>
        {siteSettings?.cohort_number ? (
          <div className="absolute top-4 right-4 text-right">
            <div className="flex items-baseline gap-1">
              <span className="text-white/60 text-xs uppercase tracking-wider">Cohort</span>
              <span className="text-4xl font-bold" style={{ fontFamily: 'Georgia, serif', color: siteSettings?.accent_color || '#C9A227' }}>
                {siteSettings.cohort_number}
              </span>
            </div>
          </div>
        ) : null}
        
        <div className="mb-4">
          <h1 className="text-2xl font-bold">{siteSettings?.club_name || 'Next Generation'} {siteSettings?.club_subtitle || 'Venture Club'}</h1>
          <p className="text-white/70 text-sm">{cohortMembers.length} members</p>
        </div>
        
        {/* Member Grid */}
        <div className="flex flex-nowrap gap-4 overflow-hidden">
          {cohortMembers.slice(0, memberPreviewCount).map((member) => (
            <div 
              key={member.id} 
              className="flex flex-col items-center cursor-pointer" 
              style={{ width: '60px' }}
              onClick={() => onViewMember(member.id)}
            >
              <div className="hover:ring-2 hover:ring-white/50 transition-all rounded-full">
                <Avatar 
                  fullName={member.full_name}
                  photoUrl={member.photo_url}
                  emoji={member.emoji}
                  showEmoji={member.emoji && member.emoji !== '👤' && member.emoji !== 'initials'}
                  backgroundColor="rgba(255,255,255,0.15)"
                  size="md"
                />
              </div>
              <span className="text-xs mt-1 text-white/70 truncate w-full text-center">
                {member.full_name?.split(' ')[0]}
              </span>
            </div>
          ))}
          {cohortMembers.length > memberPreviewCount && (
            <button 
              onClick={() => onNavigate('community')}
              className="flex flex-col items-center justify-center" 
              style={{ width: '60px' }}
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium bg-white/20 text-white">
                +{cohortMembers.length - memberPreviewCount}
              </div>
              <span className="text-xs mt-1 text-white/70">more</span>
            </button>
          )}
        </div>

        {/* AV Team Row - inside blue box */}
        {avTeam.length > 0 && (
          <>
            <div className="border-t border-white/20 my-4"></div>
            <div className="flex flex-wrap gap-6">
              {avTeam.map((member) => (
                <div 
                  key={member.id} 
                  className="flex flex-col items-center cursor-pointer"
                  style={{ width: '90px' }}
                  onClick={() => onViewMember(member.id)}
                >
                  <div className="hover:ring-2 hover:ring-amber-400 transition-all rounded-full">
                    <Avatar 
                      fullName={member.full_name}
                      photoUrl={member.photo_url}
                      emoji={member.emoji}
                      showEmoji={member.emoji && member.emoji !== '👤' && member.emoji !== 'initials'}
                      backgroundColor="var(--accent-color, #C9A227)"
                      size="md"
                    />
                  </div>
                  <span className="text-xs mt-1.5 text-white truncate w-full text-center font-medium">
                    {member.full_name?.split(' ')[0]}
                  </span>
                  <span className="text-xs text-white/60 mt-0.5 text-center leading-tight">
                    AV: {member.club_role}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Sessions */}
        <Card className="flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Upcoming Meeting</h3>
            <button onClick={() => onNavigate('sessions')} className="text-sm font-medium" style={{ color: 'var(--primary-color, #1B4D5C)' }}>
              All meetings →
            </button>
          </div>
          <div className="space-y-3 flex-1 flex flex-col">
            {upcomingSessions.length === 0 ? (
              <p className="text-gray-500 text-sm">No upcoming meetings</p>
            ) : (
              upcomingSessions.map((session) => {
                return (
                <div key={session.id} className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer bg-white flex flex-col h-full" onClick={() => onNavigate('sessions')}>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant={session.type === 'seminar' ? 'default' : 'success'}>
                      {session.type === 'seminar' ? 'Seminar' : 'Deal Review'}
                    </Badge>
                    <span className="text-xs text-gray-500">{formatDate(session.date)}</span>
                  </div>
                  <h4 className="font-semibold text-gray-900 mb-4 text-md leading-tight">{session.title}</h4>
                  {session.description && (
                    <div className="mb-3">
                      <div className={`text-xs text-gray-600 leading-relaxed whitespace-pre-wrap break-words ${isDescriptionTooLong(session.description) ? 'max-h-20 overflow-hidden' : ''}`}>
                        {session.description}
                      </div>
                      {isDescriptionTooLong(session.description) && (
                        <button
                          type="button"
                          className="mt-2 text-xs font-semibold"
                          style={{ color: 'var(--primary-color, #1B4D5C)' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedTitle(session.title || 'Meeting Description');
                            setExpandedDescription(session.description);
                          }}
                        >
                          Expand
                        </button>
                      )}
                    </div>
                  )}
                  
                  {session.host_name && (
                    <div className="text-xs text-gray-500 mb-2">
                      Host: <span className="font-medium text-gray-700">{session.host_name}</span>
                    </div>
                  )}

                  {session.google_calendar_link && (
                    <div className="text-xs text-gray-600 mt-6 mb-2 p-2 rounded bg-gray-50 border border-gray-200">
                      You should receive a Google invite in your email inbox for this meeting. Please accept or decline there.
                    </div>
                  )}

                </div>
              )})
            )}
          </div>
        </Card>

        <Modal
          isOpen={!!expandedDescription}
          onClose={() => setExpandedDescription(null)}
          title={expandedTitle || 'Meeting Description'}
          size="lg"
        >
          <div className="text-sm text-gray-700 whitespace-pre-wrap break-words">
            {expandedDescription}
          </div>
        </Modal>
        
        {/* Current Deal */}
        <Card className="flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Current Deal</h3>
            <button onClick={() => onNavigate('deals')} className="text-sm font-medium" style={{ color: 'var(--primary-color, #1B4D5C)' }}>
              All deals →
            </button>
          </div>
          <div className="flex-1 flex flex-col">
          {dealRoomLoading ? (
            <div className="flex-1 flex items-center justify-center py-8">
              <div className="w-8 h-8 border-2 border-gray-200 border-t-gray-400 rounded-full animate-spin"></div>
            </div>
          ) : featuredDeal ? (
            <div className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all bg-white flex flex-col h-full">
              <div className="flex gap-3 mb-4">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden bg-white border border-gray-200 flex-shrink-0">
                  {(() => {
                    const logoSrc = featuredDeal.company_image_path || featuredDeal.company_logo;
                    return logoSrc ? (
                      <img
                        src={logoSrc}
                        alt={featuredDeal.company_name}
                        className="w-full h-full object-contain"
                        onError={(e) => { e.currentTarget.onerror = null; e.currentTarget.src = '/av-logo.png'; e.currentTarget.className = 'w-7 h-7 object-contain'; }}
                      />
                    ) : (
                      <img src="/av-logo.png" alt="AV" className="w-7 h-7 object-contain" />
                    );
                  })()}
                </div>
                <div className="flex-1 ml-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-gray-900 text-lg">{featuredDeal.company_name}</h4>
                    {featuredDeal.status === 'pending' && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-medium">Coming Soon</span>
                    )}
                    {featuredDeal.status === 'voting' && (
                      <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs font-medium">Voting</span>
                    )}
                    {featuredDeal.status === 'reviewing' && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">Reviewing</span>
                    )}
                    {featuredDeal.status === 'active' && (
                      <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">Active</span>
                    )}
                    {featuredDeal.status === 'passed' && (
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs font-medium">Passed</span>
                    )}
                    {featuredDeal.status === 'closed' && (
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded text-xs font-medium">Closed</span>
                    )}
                  </div>
                  {featuredDeal.headline && (
                    <p className="text-sm text-gray-600 mt-1 leading-relaxed">{featuredDeal.headline}</p>
                  )}
                </div>
              </div>
              
              <div className="mb-4 text-sm leading-relaxed">
                {(featuredDeal.sector || featuredDeal.stage) && (
                  <div className="mb-1.5">
                    {featuredDeal.sector && (
                      <span className="mr-9">
                        <span className="text-xs uppercase tracking-wider font-bold text-gray-700 mr-1.5">Sector:</span>
                        <span className="text-gray-800">{featuredDeal.sector}</span>
                      </span>
                    )}
                    {featuredDeal.stage && (
                      <span>
                        <span className="text-xs uppercase tracking-wider font-bold text-gray-700 mr-1.5">Stage:</span>
                        <span className="text-gray-800">{featuredDeal.stage}</span>
                      </span>
                    )}
                  </div>
                )}
                {featuredDeal.lead_investor && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs uppercase tracking-wider font-bold text-gray-700 flex-shrink-0">Lead:</span>
                    <span className="text-gray-800 truncate min-w-0" title={featuredDeal.lead_investor}>{featuredDeal.lead_investor}</span>
                  </div>
                )}
              </div>
              
              {(featuredDeal.deal_deadline || featuredDeal.voting_deadline) && (
                <p className="text-xs text-amber-600 mb-4 font-medium">
                  Deadline: {new Date(featuredDeal.deal_deadline || featuredDeal.voting_deadline).toLocaleDateString()}
                </p>
              )}
              
              <div className="flex justify-center gap-3 mt-auto pt-6">
                <Button variant="primary" size="sm" className="px-3 py-1.5 text-xs" icon={ExternalLink} onClick={() => onNavigate('deals')}>Deal Room</Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <TrendingUp size={40} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">No deals right now</p>
              <p className="text-sm text-gray-400">Check back soon!</p>
            </div>
          )}
          </div>
        </Card>
      </div>
      
      {/* Announcements */}
      {displayAnnouncements.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Announcements</h3>
          </div>
          <div className="space-y-4">
            {displayAnnouncements.map((announcement) => (
              <div key={announcement.id} className="p-4 border border-gray-200 rounded-lg bg-gray-50/50">
                {announcement.is_pinned && (
                  <Badge variant="primary" className="mb-4">Pinned</Badge>
                )}
                <h4 className="font-semibold text-gray-900 mb-2 ml-2">{announcement.title}</h4>
                <p className="text-sm text-gray-600 mb-3 leading-relaxed ml-2 whitespace-pre-wrap">{announcement.content}</p>
                <p className="text-xs text-gray-400 ml-2">
                  {announcement.author} · {new Date(announcement.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}
      
      {/* Recent Content */}
      {recentContent.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Recent Content</h3>
            <button onClick={() => onNavigate('content')} className="text-sm font-medium" style={{ color: 'var(--primary-color, #1B4D5C)' }}>
              All content →
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {recentContent.map((item) => (
              <div 
                key={item.id} 
                className="p-4 border border-gray-200 rounded-lg hover:border-gray-300 hover:shadow-sm transition-all cursor-pointer bg-white"
                onClick={() => window.open(resolveStorageUrl(item.file_url || item.url, 'content-files'), '_blank')}
              >
                <Badge variant="primary" className="mb-4 text-xs">{item.category}</Badge>
                <h4 className="font-semibold text-gray-900 mb-2 text-sm line-clamp-1 leading-tight ml-2">{item.title}</h4>
                <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed ml-2">{item.description}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};
// Member Sessions

export default MemberDashboard;
