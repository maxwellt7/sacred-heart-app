import { useState, useEffect, useCallback } from 'react';
import { useUser, useAuth } from '@clerk/clerk-react';

const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

// Allow access if user email matches or ends with these domains
const ADMIN_EMAILS = ['maxwellmayes@gmail.com', 'maxwell@sovereignty.app'];
const ADMIN_DOMAINS = ['sovereignty.app', 'maxwellmayes.com'];

interface OverviewData {
  period: { days: number; since: string };
  funnel: {
    quizLeads: number;
    quizLeadsTotal: number;
    quizLeadsByDay: { day: string; count: number }[];
    tierDistribution: { tier: string; count: number }[];
    breakdown: {
      key: string;
      label: string;
      description: string;
      count: number;
      conversionFromPrevious: number | null;
      dropOffFromPrevious: number | null;
      dropOffRateFromPrevious: number | null;
    }[];
    purchases: number;
    quizTraffic: number;
    offerClicks: number;
  };
  users: { total: number; recent: number };
  sessions: {
    total: number;
    recent: number;
    byDay: { day: string; count: number }[];
  };
  engagement: {
    avgStreak: number;
    maxStreak: number;
    totalCompleted: number;
    activeUsers: number;
  };
  gamification: {
    levelDistribution: { level: number; count: number }[];
  };
  content: { totalScripts: number; recentScripts: number };
  events: { event_type: string; count: number }[];
  pageViews: {
    total: number;
    byPath: { path: string; count: number }[];
  };
  recentLeads: {
    email: string;
    name: string;
    score: number;
    tier: string;
    created_at: string;
  }[];
}

interface LeadData {
  id: number;
  email: string;
  name: string;
  score: number;
  tier: string;
  source_url: string;
  created_at: string;
}

interface UserData {
  id: string;
  created_at: string;
  current_streak: number;
  longest_streak: number;
  total_sessions: number;
  last_session_date: string;
  level: number;
  total_xp: number;
  title: string;
}

export default function Admin() {
  const { user, isLoaded: isUserLoaded } = useUser();
  const { isLoaded: isAuthLoaded, getToken } = useAuth();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [leads, setLeads] = useState<LeadData[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [usersTotal, setUsersTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'leads' | 'users' | 'ghl'>('overview');
  const [days, setDays] = useState(30);
  const [ghlStatus, setGhlStatus] = useState<{ configured: boolean } | null>(null);

  // Check admin access — wait for Clerk to load first
  const email = user?.primaryEmailAddress?.emailAddress || '';
  const emailDomain = email.split('@')[1] || '';
  const isAdmin = isUserLoaded && isAuthLoaded && user && (
    ADMIN_EMAILS.includes(email) ||
    ADMIN_DOMAINS.includes(emailDomain)
  );
  const isStillLoading = !isUserLoaded || !isAuthLoaded;

  const authedFetch = useCallback(async (url: string) => {
    const token = await getToken();
    return fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }, [getToken]);

  const fetchOverview = useCallback(async () => {
    try {
      const res = await authedFetch(`${BASE}/analytics/overview?days=${days}`);
      const data = await res.json();
      setOverview(data);
    } catch (err) {
      console.error('Failed to load overview:', err);
    }
  }, [days, authedFetch]);

  const fetchLeads = useCallback(async () => {
    try {
      const res = await authedFetch(`${BASE}/analytics/leads?limit=100`);
      const data = await res.json();
      setLeads(data.leads || []);
      setLeadsTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load leads:', err);
    }
  }, [authedFetch]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await authedFetch(`${BASE}/analytics/users?limit=100`);
      const data = await res.json();
      setUsers(data.users || []);
      setUsersTotal(data.total || 0);
    } catch (err) {
      console.error('Failed to load users:', err);
    }
  }, [authedFetch]);

  const fetchGhlStatus = useCallback(async () => {
    try {
      const res = await authedFetch(`${BASE}/ghl/status`);
      const data = await res.json();
      setGhlStatus(data);
    } catch {
      setGhlStatus({ configured: false });
    }
  }, [authedFetch]);

  useEffect(() => {
    if (!isAdmin) return;
    setLoading(true);
    setError(null);
    Promise.all([fetchOverview(), fetchLeads(), fetchUsers(), fetchGhlStatus()])
      .catch((err) => setError(err?.message || 'Failed to load data'))
      .finally(() => setLoading(false));
  }, [isAdmin, fetchOverview, fetchLeads, fetchUsers, fetchGhlStatus]);

  useEffect(() => {
    if (isAdmin) fetchOverview();
  }, [days, isAdmin, fetchOverview]);

  // Show loading while Clerk is still initializing
  if (isStillLoading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100dvh', background: '#0B0F19', color: '#D4A853',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, border: '3px solid rgba(212,168,83,0.2)',
            borderTopColor: '#D4A853', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
          }} />
          Loading...
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        height: '100dvh', background: '#0B0F19', color: '#ef4444',
        fontFamily: 'Inter, sans-serif', fontSize: 18, gap: 12,
      }}>
        <div>Access Denied</div>
        <div style={{ color: '#64748b', fontSize: 13 }}>
          Signed in as: {email || 'unknown'}
        </div>
        <a href="/" style={{ color: '#D4A853', fontSize: 14, marginTop: 8 }}>← Back to App</a>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        height: '100dvh', background: '#0B0F19', color: '#D4A853',
        fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, border: '3px solid rgba(212,168,83,0.2)',
            borderTopColor: '#D4A853', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
          }} />
          Loading Analytics...
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
        height: '100dvh', background: '#0B0F19', color: '#ef4444',
        fontFamily: 'Inter, sans-serif', fontSize: 16, gap: 12,
      }}>
        <div>Failed to load analytics</div>
        <div style={{ color: '#64748b', fontSize: 13 }}>{error}</div>
        <button onClick={() => window.location.reload()} style={{
          background: '#1e293b', color: '#D4A853', border: '1px solid #334155',
          borderRadius: 8, padding: '8px 16px', cursor: 'pointer', marginTop: 8,
        }}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#0B0F19', color: '#e2e8f0',
      fontFamily: 'Inter, sans-serif', padding: '24px', overflowY: 'auto',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 32, flexWrap: 'wrap', gap: 16,
      }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, color: '#D4A853', margin: 0 }}>
            Admin Dashboard
          </h1>
          <p style={{ color: '#64748b', fontSize: 14, margin: '4px 0 0' }}>
            Sovereignty App Analytics
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            style={{
              background: '#1e293b', color: '#e2e8f0', border: '1px solid #334155',
              borderRadius: 8, padding: '8px 12px', fontSize: 14,
            }}
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
          <a href="/" style={{
            background: '#1e293b', color: '#94a3b8', border: '1px solid #334155',
            borderRadius: 8, padding: '8px 16px', fontSize: 14, textDecoration: 'none',
          }}>
            ← Back to App
          </a>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 24, borderBottom: '1px solid #1e293b',
        paddingBottom: 0,
      }}>
        {(['overview', 'leads', 'users', 'ghl'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: activeTab === tab ? '#1e293b' : 'transparent',
              color: activeTab === tab ? '#D4A853' : '#64748b',
              border: 'none', borderBottom: activeTab === tab ? '2px solid #D4A853' : '2px solid transparent',
              padding: '10px 20px', fontSize: 14, fontWeight: 500, cursor: 'pointer',
              borderRadius: '8px 8px 0 0', textTransform: 'capitalize',
            }}
          >
            {tab === 'ghl' ? 'GHL Integration' : tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && overview && <OverviewTab data={overview} />}
      {activeTab === 'leads' && <LeadsTab leads={leads} total={leadsTotal} />}
      {activeTab === 'users' && <UsersTab users={users} total={usersTotal} />}
      {activeTab === 'ghl' && <GhlTab status={ghlStatus} />}
    </div>
  );
}

// ── Stat Card ──
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#111827', border: '1px solid #1e293b', borderRadius: 12,
      padding: '20px', flex: '1 1 200px', minWidth: 180,
    }}>
      <div style={{ color: '#64748b', fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || '#e2e8f0', marginTop: 4 }}>
        {value}
      </div>
      {sub && <div style={{ color: '#475569', fontSize: 13, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Mini Bar Chart ──
function MiniChart({ data, label }: { data: { day: string; count: number }[]; label: string }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.count), 1);

  return (
    <div style={{
      background: '#111827', border: '1px solid #1e293b', borderRadius: 12,
      padding: '20px', marginTop: 16,
    }}>
      <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 500, marginBottom: 12 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
        {data.map((d, i) => (
          <div
            key={i}
            title={`${d.day}: ${d.count}`}
            style={{
              flex: 1, background: '#D4A853', borderRadius: '4px 4px 0 0',
              height: `${(d.count / max) * 100}%`, minHeight: d.count > 0 ? 4 : 1,
              opacity: d.count > 0 ? 1 : 0.2,
            }}
          />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ color: '#475569', fontSize: 11 }}>{data[0]?.day?.slice(5)}</span>
        <span style={{ color: '#475569', fontSize: 11 }}>{data[data.length - 1]?.day?.slice(5)}</span>
      </div>
    </div>
  );
}

function FunnelBreakdown({ stages }: { stages: OverviewData['funnel']['breakdown'] }) {
  if (!stages || stages.length === 0) return null;

  const maxCount = Math.max(...stages.map(stage => stage.count), 1);

  return (
    <div style={{
      background: '#111827', border: '1px solid #1e293b', borderRadius: 12,
      padding: '20px', marginTop: 16,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 500 }}>Funnel Breakdown</div>
          <div style={{ color: '#475569', fontSize: 12, marginTop: 4 }}>
            Traffic and conversion through quiz visit, email capture, offer click, and purchase.
          </div>
        </div>
        <div style={{ color: '#64748b', fontSize: 12, maxWidth: 320, textAlign: 'right' }}>
          Offer-click tracking uses internal quiz events and may undercount historical periods before this update.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {stages.map((stage, index) => (
          <div key={stage.key} style={{
            border: '1px solid #1e293b',
            borderRadius: 10,
            padding: '14px 16px',
            background: '#0f172a',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ color: '#e2e8f0', fontWeight: 600, fontSize: 15 }}>{index + 1}. {stage.label}</div>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>{stage.description}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#D4A853', fontWeight: 700, fontSize: 24 }}>{stage.count.toLocaleString()}</div>
                <div style={{ color: '#64748b', fontSize: 12 }}>in selected period</div>
              </div>
            </div>

            <div style={{
              marginTop: 12,
              height: 10,
              width: '100%',
              background: '#1e293b',
              borderRadius: 999,
              overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 4 : 0)}%`,
                background: index === 0 ? '#D4A853' : '#22c55e',
              }} />
            </div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
              <div style={pillStyle}>
                <span style={{ color: '#64748b' }}>Stage count</span>
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{stage.count.toLocaleString()}</span>
              </div>
              {stage.conversionFromPrevious !== null && (
                <div style={pillStyle}>
                  <span style={{ color: '#64748b' }}>Conversion</span>
                  <span style={{ color: '#22c55e', fontWeight: 600 }}>{stage.conversionFromPrevious}%</span>
                </div>
              )}
              {stage.dropOffFromPrevious !== null && (
                <div style={pillStyle}>
                  <span style={{ color: '#64748b' }}>Drop-off</span>
                  <span style={{ color: '#f87171', fontWeight: 600 }}>{stage.dropOffFromPrevious.toLocaleString()}</span>
                </div>
              )}
              {stage.dropOffRateFromPrevious !== null && (
                <div style={pillStyle}>
                  <span style={{ color: '#64748b' }}>Drop-off rate</span>
                  <span style={{ color: '#f87171', fontWeight: 600 }}>{stage.dropOffRateFromPrevious}%</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Overview Tab ──
function OverviewTab({ data }: { data: OverviewData }) {
  const conversionRate = data.funnel.quizLeadsTotal > 0 && data.users.total > 0
    ? ((data.users.total / data.funnel.quizLeadsTotal) * 100).toFixed(1)
    : '0';

  return (
    <div>
      {/* Funnel Metrics */}
      <h2 style={{ color: '#D4A853', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
        Quiz Funnel
      </h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <StatCard label="Quiz Traffic" value={data.funnel.quizTraffic} color="#06b6d4" />
        <StatCard label="Quiz Leads (Period)" value={data.funnel.quizLeads} color="#22c55e" />
        <StatCard label="Offer Clicks" value={data.funnel.offerClicks} color="#f59e0b" />
        <StatCard label="Purchases" value={data.funnel.purchases} color="#D4A853" />
        <StatCard label="Signed Up Users" value={data.users.total} color="#3b82f6" />
        <StatCard label="Lead → Signup Rate" value={`${conversionRate}%`} color="#a855f7" />
      </div>

      <FunnelBreakdown stages={data.funnel.breakdown} />
      <MiniChart data={data.funnel.quizLeadsByDay} label="Quiz Leads by Day" />

      {/* Tier Distribution */}
      {data.funnel.tierDistribution.length > 0 && (
        <div style={{
          background: '#111827', border: '1px solid #1e293b', borderRadius: 12,
          padding: '20px', marginTop: 16,
        }}>
          <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
            Archetype Distribution
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {data.funnel.tierDistribution.map(t => (
              <div key={t.tier} style={{
                background: '#1e293b', borderRadius: 8, padding: '8px 16px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{ color: '#D4A853', fontWeight: 600 }}>{t.count}</span>
                <span style={{ color: '#94a3b8', fontSize: 13 }}>{t.tier}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Engagement Metrics */}
      <h2 style={{ color: '#D4A853', fontSize: 18, fontWeight: 600, margin: '32px 0 16px' }}>
        User Engagement
      </h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <StatCard label="Sessions (Period)" value={data.sessions.recent} color="#22c55e" />
        <StatCard label="Total Sessions" value={data.sessions.total} />
        <StatCard label="Active Users" value={data.engagement.activeUsers} color="#3b82f6" />
        <StatCard label="Avg Streak" value={Math.round(data.engagement.avgStreak)} sub={`Max: ${data.engagement.maxStreak}`} />
      </div>

      <MiniChart data={data.sessions.byDay} label="Sessions by Day" />

      {/* Content & Gamification */}
      <h2 style={{ color: '#D4A853', fontSize: 18, fontWeight: 600, margin: '32px 0 16px' }}>
        Content & Gamification
      </h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 8 }}>
        <StatCard label="Scripts Generated" value={data.content.totalScripts} color="#f59e0b" />
        <StatCard label="Recent Scripts" value={data.content.recentScripts} sub="This period" />
        <StatCard label="Page Views" value={data.pageViews.total} sub="This period" color="#06b6d4" />
      </div>

      {/* Level Distribution */}
      {data.gamification.levelDistribution.length > 0 && (
        <div style={{
          background: '#111827', border: '1px solid #1e293b', borderRadius: 12,
          padding: '20px', marginTop: 16,
        }}>
          <div style={{ color: '#94a3b8', fontSize: 14, fontWeight: 500, marginBottom: 12 }}>
            User Level Distribution
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {data.gamification.levelDistribution.map(l => (
              <div key={l.level} style={{
                background: '#1e293b', borderRadius: 8, padding: '8px 16px', textAlign: 'center',
              }}>
                <div style={{ color: '#D4A853', fontWeight: 700, fontSize: 18 }}>{l.count}</div>
                <div style={{ color: '#64748b', fontSize: 11 }}>Lvl {l.level}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Leads */}
      <h2 style={{ color: '#D4A853', fontSize: 18, fontWeight: 600, margin: '32px 0 16px' }}>
        Recent Leads
      </h2>
      <div style={{
        background: '#111827', border: '1px solid #1e293b', borderRadius: 12,
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#1e293b' }}>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Score</th>
              <th style={thStyle}>Archetype</th>
              <th style={thStyle}>Date</th>
            </tr>
          </thead>
          <tbody>
            {data.recentLeads.map((lead, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={tdStyle}>{lead.email}</td>
                <td style={tdStyle}>{lead.name || '—'}</td>
                <td style={tdStyle}>{lead.score || '—'}</td>
                <td style={tdStyle}>
                  <span style={{
                    background: '#1e293b', color: '#D4A853', padding: '2px 8px',
                    borderRadius: 4, fontSize: 12,
                  }}>
                    {lead.tier || '—'}
                  </span>
                </td>
                <td style={tdStyle}>{formatDate(lead.created_at)}</td>
              </tr>
            ))}
            {data.recentLeads.length === 0 && (
              <tr><td colSpan={5} style={{ ...tdStyle, textAlign: 'center', color: '#475569' }}>No leads yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Leads Tab ──
function LeadsTab({ leads, total }: { leads: LeadData[]; total: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: '#D4A853', fontSize: 18, fontWeight: 600, margin: 0 }}>
          All Quiz Leads ({total})
        </h2>
      </div>
      <div style={{
        background: '#111827', border: '1px solid #1e293b', borderRadius: 12,
        overflow: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 600 }}>
          <thead>
            <tr style={{ background: '#1e293b' }}>
              <th style={thStyle}>#</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Score</th>
              <th style={thStyle}>Archetype</th>
              <th style={thStyle}>Date</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead, i) => (
              <tr key={lead.id || i} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={tdStyle}>{lead.id}</td>
                <td style={tdStyle}>{lead.email}</td>
                <td style={tdStyle}>{lead.name || '—'}</td>
                <td style={tdStyle}>{lead.score || '—'}</td>
                <td style={tdStyle}>
                  <span style={{
                    background: '#1e293b', color: '#D4A853', padding: '2px 8px',
                    borderRadius: 4, fontSize: 12,
                  }}>
                    {lead.tier || '—'}
                  </span>
                </td>
                <td style={tdStyle}>{formatDate(lead.created_at)}</td>
              </tr>
            ))}
            {leads.length === 0 && (
              <tr><td colSpan={6} style={{ ...tdStyle, textAlign: 'center', color: '#475569' }}>No leads yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Users Tab ──
function UsersTab({ users, total }: { users: UserData[]; total: number }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ color: '#D4A853', fontSize: 18, fontWeight: 600, margin: 0 }}>
          All Users ({total})
        </h2>
      </div>
      <div style={{
        background: '#111827', border: '1px solid #1e293b', borderRadius: 12,
        overflow: 'auto',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 700 }}>
          <thead>
            <tr style={{ background: '#1e293b' }}>
              <th style={thStyle}>User ID</th>
              <th style={thStyle}>Level</th>
              <th style={thStyle}>Title</th>
              <th style={thStyle}>XP</th>
              <th style={thStyle}>Sessions</th>
              <th style={thStyle}>Streak</th>
              <th style={thStyle}>Last Active</th>
              <th style={thStyle}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => (
              <tr key={u.id || i} style={{ borderBottom: '1px solid #1e293b' }}>
                <td style={tdStyle}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11 }}>
                    {u.id?.slice(0, 16)}...
                  </span>
                </td>
                <td style={tdStyle}>
                  <span style={{
                    background: '#D4A853', color: '#0B0F19', padding: '2px 8px',
                    borderRadius: 4, fontSize: 12, fontWeight: 700,
                  }}>
                    {u.level}
                  </span>
                </td>
                <td style={tdStyle}>{u.title}</td>
                <td style={tdStyle}>{u.total_xp?.toLocaleString()}</td>
                <td style={tdStyle}>{u.total_sessions}</td>
                <td style={tdStyle}>
                  {u.current_streak}
                  {u.longest_streak > 0 && (
                    <span style={{ color: '#475569', fontSize: 11 }}> (best: {u.longest_streak})</span>
                  )}
                </td>
                <td style={tdStyle}>{u.last_session_date || '—'}</td>
                <td style={tdStyle}>{formatDate(u.created_at)}</td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: '#475569' }}>No users yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── GHL Integration Tab ──
function GhlTab({ status }: { status: { configured: boolean } | null }) {
  return (
    <div>
      <h2 style={{ color: '#D4A853', fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
        GoHighLevel Integration
      </h2>

      <div style={{
        background: '#111827', border: '1px solid #1e293b', borderRadius: 12,
        padding: '24px', marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{
            width: 12, height: 12, borderRadius: '50%',
            background: status?.configured ? '#22c55e' : '#ef4444',
          }} />
          <span style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 500 }}>
            {status?.configured ? 'Connected' : 'Not Connected'}
          </span>
        </div>
        <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6 }}>
          {status?.configured
            ? 'GHL is connected. Quiz leads and signups are automatically synced to your CRM pipeline.'
            : 'Set the GHL_API_KEY environment variable in Railway to enable CRM integration.'}
        </p>
      </div>

      <div style={{
        background: '#111827', border: '1px solid #1e293b', borderRadius: 12,
        padding: '24px',
      }}>
        <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
          Integration Flow
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { step: '1', label: 'Quiz Completed', desc: 'Lead captured → GHL contact created with quiz-lead tag → Pipeline: Quiz Lead stage' },
            { step: '2', label: 'Clerk Signup', desc: 'User creates account → GHL contact updated with signed-up tag → Pipeline: Signed Up stage' },
            { step: '3', label: 'Subscription', desc: 'User subscribes → GHL contact updated with subscribed tag → Pipeline: Subscribed ($19/mo) stage → Lead value: $19' },
            { step: '4', label: 'Churn', desc: 'User cancels → GHL contact updated with churned tag → Pipeline: Churned stage' },
          ].map(item => (
            <div key={item.step} style={{
              display: 'flex', gap: 16, alignItems: 'flex-start',
              background: '#1e293b', borderRadius: 8, padding: '12px 16px',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', background: '#D4A853',
                color: '#0B0F19', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700, fontSize: 14, flexShrink: 0,
              }}>
                {item.step}
              </div>
              <div>
                <div style={{ color: '#e2e8f0', fontWeight: 500, fontSize: 14 }}>{item.label}</div>
                <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{item.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        background: '#111827', border: '1px solid #1e293b', borderRadius: 12,
        padding: '24px', marginTop: 24,
      }}>
        <h3 style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          GHL Workflows (Automations)
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { name: 'Quiz Lead Nurture', status: 'Draft', trigger: 'quiz-lead tag added' },
            { name: 'Signup Welcome Sequence', status: 'Draft', trigger: 'signed-up tag added' },
            { name: 'Abandoned Signup Recovery', status: 'Off', trigger: 'abandoned-signup tag (7 day delay)' },
            { name: 'Subscription Confirmation', status: 'Draft', trigger: 'subscribed tag added' },
            { name: 'Churn Prevention', status: 'Off', trigger: 'churned tag added' },
          ].map(wf => (
            <div key={wf.name} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              background: '#1e293b', borderRadius: 8, padding: '10px 16px',
            }}>
              <div>
                <span style={{ color: '#e2e8f0', fontSize: 14 }}>{wf.name}</span>
                <span style={{ color: '#475569', fontSize: 12, marginLeft: 8 }}>({wf.trigger})</span>
              </div>
              <span style={{
                fontSize: 12, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
                background: wf.status === 'Draft' ? '#1e3a5f' : '#1e293b',
                color: wf.status === 'Draft' ? '#60a5fa' : '#64748b',
              }}>
                {wf.status}
              </span>
            </div>
          ))}
        </div>
        <p style={{ color: '#475569', fontSize: 13, marginTop: 12 }}>
          Publish workflows in GHL Dashboard → Automation → Workflows
        </p>
      </div>
    </div>
  );
}

// ── Styles ──
const thStyle: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left', color: '#94a3b8',
  fontSize: 12, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '10px 12px', color: '#e2e8f0',
};

const pillStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderRadius: 999,
  background: '#111827',
  border: '1px solid #1e293b',
  fontSize: 12,
};

function formatDate(dateStr: string) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}
