import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { dashboardApi, type CandidateListItem } from '../lib/api';

/**
 * Get status badge styling - Titanium Theme
 */
function getStatusBadge(status: string) {
  const normalizedStatus = status.toLowerCase();

  if (['completed', 'hired', 'assessment_completed'].includes(normalizedStatus)) {
    return {
      bg: 'bg-gradient-to-r from-aero-green/15 to-aero-green/5',
      border: 'border-aero-green/30',
      text: 'text-aero-green',
      glow: 'shadow-[0_0_12px_rgba(74,222,128,0.2)]',
    };
  }
  if (
    ['in_progress', 'assessment_started'].includes(normalizedStatus) ||
    normalizedStatus.includes('progress') ||
    normalizedStatus.includes('started') ||
    normalizedStatus.includes('review')
  ) {
    return {
      bg: 'bg-gradient-to-r from-aero-orange/15 to-aero-orange/5',
      border: 'border-aero-orange/30',
      text: 'text-aero-orange',
      glow: 'shadow-[0_0_12px_rgba(251,146,60,0.2)]',
    };
  }
  if (['rejected', 'failed', 'no_hire'].includes(normalizedStatus)) {
    return {
      bg: 'bg-gradient-to-r from-aero-red/15 to-aero-red/5',
      border: 'border-aero-red/30',
      text: 'text-aero-red',
      glow: 'shadow-[0_0_12px_rgba(248,113,113,0.2)]',
    };
  }
  return {
    bg: 'bg-gradient-to-r from-aero-cyan/15 to-aero-cyan/5',
    border: 'border-aero-cyan/30',
    text: 'text-aero-cyan',
    glow: 'shadow-[0_0_12px_rgba(56,189,248,0.2)]',
  };
}

/**
 * Get score color based on value
 */
function getScoreColor(score: number): string {
  if (score >= 80) return 'text-aero-green';
  if (score >= 60) return 'text-aero-orange';
  return 'text-aero-red';
}

/**
 * Get score bar color
 */
function getScoreBarColor(score: number): string {
  if (score >= 80) return 'bg-gradient-to-r from-aero-green to-emerald-400';
  if (score >= 60) return 'bg-gradient-to-r from-aero-orange to-amber-400';
  return 'bg-gradient-to-r from-aero-red to-rose-400';
}

/**
 * Format status for display
 */
function formatStatus(status: string): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: [0.4, 0, 0.2, 1],
    },
  },
};

/**
 * Stat Card Component - Premium Design
 */
function StatCard({
  label,
  value,
  icon,
  color,
  accentColor,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  accentColor: string;
}) {
  return (
    <motion.div
      variants={itemVariants}
      className="relative bg-aero-surface rounded-2xl border border-aero-border-subtle p-6 overflow-hidden group hover:border-aero-border transition-all duration-300"
    >
      {/* Top accent line */}
      <div
        className={`absolute top-0 left-0 right-0 h-1 ${accentColor} opacity-80`}
      />

      {/* Background gradient */}
      <div
        className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 ${accentColor} blur-3xl`}
        style={{ transform: 'scale(0.5)', opacity: 0.1 }}
      />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-aero-muted text-sm font-medium uppercase tracking-wider mb-2">
            {label}
          </p>
          <p className={`text-3xl font-bold ${color}`}>{value}</p>
        </div>
        <div
          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${accentColor} bg-opacity-20 flex items-center justify-center`}
        >
          {icon}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Recruiter Dashboard - Candidate Pipeline View
 *
 * Titanium Slate Theme with:
 * - Premium stat cards with gradients
 * - Floating row design
 * - Smooth animations
 * - Professional data presentation
 */
export default function RecruiterDashboard() {
  const navigate = useNavigate();

  const [candidates, setCandidates] = useState<CandidateListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [skillQuery, setSkillQuery] = useState('');
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  const [skillDropdownValue, setSkillDropdownValue] = useState('');
  const [skillRankingFor, setSkillRankingFor] = useState<string | null>(null);
  const [matchMode, setMatchMode] = useState<'any' | 'all'>('any');
  const [minMatch, setMinMatch] = useState(0);
  const [filtersActive, setFiltersActive] = useState(false);
  const [actionModal, setActionModal] = useState<{
    open: boolean;
    candidateId: number | null;
    candidateName: string;
    action: 'ACCEPT' | 'REJECT' | 'REVIEW' | null;
  }>({
    open: false,
    candidateId: null,
    candidateName: '',
    action: null,
  });
  const [actionNote, setActionNote] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    inProgress: 0,
    flagged: 0,
    avgScore: 0,
  });

  const appendSkillToQuery = (skill: string) => {
    const nextSkill = skill.trim();
    if (!nextSkill) return;

    const existing = skillQuery
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const lowerExisting = new Set(existing.map((s) => s.toLowerCase()));
    if (lowerExisting.has(nextSkill.toLowerCase())) return;

    const next = existing.concat(nextSkill).join(', ');
    setSkillQuery(next);
  };

  useEffect(() => {
    const fetchCandidates = async (params?: {
      skills?: string;
      match_mode?: 'any' | 'all';
      min_skill_match?: number;
    }) => {
      try {
        setLoading(true);
        console.log('[RecruiterDashboard] Fetching candidates...');

        const response = await dashboardApi.listCandidates(params);
        console.log('[RecruiterDashboard] Response received:', response);

        // Handle empty or undefined candidates array gracefully
        const candidatesList = response.candidates || [];
        setCandidates(candidatesList);
        setAvailableSkills(response.available_skills || []);
        setSkillRankingFor(response.skill_ranking_for || null);

        // Calculate stats with null safety
        const inProgress = candidatesList.filter(
          (c) =>
            c.status?.toLowerCase().includes('progress') ||
            c.status?.toLowerCase().includes('started')
        ).length;
        const flagged = candidatesList.filter((c) => (c.total_flags || 0) > 0).length;
        const avgScore =
          candidatesList.length > 0
            ? Math.round(
                candidatesList.reduce((acc, c) => acc + (c.technical_score || 0), 0) /
                  candidatesList.length
              )
            : 0;

        setStats({
          total: response.total || candidatesList.length,
          inProgress,
          flagged,
          avgScore,
        });

        console.log('[RecruiterDashboard] Stats calculated:', { total: response.total, inProgress, flagged, avgScore });
      } catch (err: any) {
        // Enhanced error logging
        console.error('[RecruiterDashboard] Failed to fetch candidates:', err);

        // Log specific error details
        if (err.response) {
          // Server responded with error status
          console.error('[RecruiterDashboard] Error response:', {
            status: err.response.status,
            statusText: err.response.statusText,
            data: err.response.data,
            headers: err.response.headers,
          });
          setError(`Server error (${err.response.status}): ${err.response.data?.detail || 'Unknown error'}`);
        } else if (err.request) {
          // Request was made but no response received (network error)
          console.error('[RecruiterDashboard] Network error - no response received:', err.request);
          setError('Network error: Unable to reach the server. Please check if the backend is running.');
        } else {
          // Error in setting up the request
          console.error('[RecruiterDashboard] Request setup error:', err.message);
          setError(`Error: ${err.message}`);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  }, []);

  const handleViewCandidate = (candidateId: number) => {
    navigate(`/recruiter/candidate/${candidateId}`);
  };

  const handleApplyFilters = async () => {
    const trimmed = skillQuery.trim();
    const params =
      trimmed.length > 0
        ? {
            skills: trimmed,
            match_mode: matchMode,
            min_skill_match: minMatch > 0 ? minMatch : undefined,
          }
        : undefined;

    setFiltersActive(Boolean(trimmed));
    try {
      setError(null);
      setLoading(true);
      const response = await dashboardApi.listCandidates(params);
      const candidatesList = response.candidates || [];
      setCandidates(candidatesList);
      setAvailableSkills(response.available_skills || []);
      setSkillRankingFor(response.skill_ranking_for || null);

      const inProgress = candidatesList.filter(
        (c) =>
          c.status?.toLowerCase().includes('progress') ||
          c.status?.toLowerCase().includes('started')
      ).length;
      const flagged = candidatesList.filter((c) => (c.total_flags || 0) > 0).length;
      const avgScore =
        candidatesList.length > 0
          ? Math.round(
              candidatesList.reduce((acc, c) => acc + (c.technical_score || 0), 0) /
                candidatesList.length
            )
          : 0;
      setStats({
        total: response.total || candidatesList.length,
        inProgress,
        flagged,
        avgScore,
      });
    } catch (err: any) {
      console.error('[RecruiterDashboard] Failed to apply filters:', err);
      setError(err?.message || 'Failed to apply filters');
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = async () => {
    setSkillQuery('');
    setMinMatch(0);
    setMatchMode('any');
    setFiltersActive(false);
    try {
      setError(null);
      setLoading(true);
      const response = await dashboardApi.listCandidates();
      const candidatesList = response.candidates || [];
      setCandidates(candidatesList);
      setAvailableSkills(response.available_skills || []);
      setSkillRankingFor(response.skill_ranking_for || null);

      const inProgress = candidatesList.filter(
        (c) =>
          c.status?.toLowerCase().includes('progress') ||
          c.status?.toLowerCase().includes('started')
      ).length;
      const flagged = candidatesList.filter((c) => (c.total_flags || 0) > 0).length;
      const avgScore =
        candidatesList.length > 0
          ? Math.round(
              candidatesList.reduce((acc, c) => acc + (c.technical_score || 0), 0) /
                candidatesList.length
            )
          : 0;
      setStats({
        total: response.total || candidatesList.length,
        inProgress,
        flagged,
        avgScore,
      });
    } catch (err: any) {
      console.error('[RecruiterDashboard] Failed to clear filters:', err);
      setError(err?.message || 'Failed to clear filters');
    } finally {
      setLoading(false);
    }
  };

  const openActionModal = (
    candidateId: number,
    candidateName: string,
    action: 'ACCEPT' | 'REJECT' | 'REVIEW'
  ) => {
    setActionModal({ open: true, candidateId, candidateName, action });
    setActionNote('');
    setActionError(null);
  };

  const closeActionModal = () => {
    setActionModal({ open: false, candidateId: null, candidateName: '', action: null });
    setActionNote('');
    setActionError(null);
    setActionLoading(false);
  };

  const submitAction = async () => {
    if (!actionModal.candidateId || !actionModal.action) return;
    if (actionModal.action === 'REJECT' && actionNote.trim().length === 0) {
      setActionError('Reject requires a brief note.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      await dashboardApi.quickAction(
        actionModal.candidateId,
        actionModal.action,
        actionNote.trim() || undefined
      );
      closeActionModal();
      await handleApplyFilters();
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || err?.message || 'Action failed');
      setActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-aero-text mb-2 tracking-tight">
            Candidate Pipeline
          </h1>
          <p className="text-aero-muted">
            Review assessments, analyze integrity metrics, and make informed hiring decisions
          </p>
        </motion.div>

        {/* Skill Filter Bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="bg-aero-surface rounded-2xl border border-aero-border-subtle p-5 mb-8"
        >
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-end">
            <div className="flex-1 w-full">
              <label className="text-xs text-aero-muted uppercase tracking-wider mb-2 block">
                Required Skills
              </label>
              <input
                value={skillQuery}
                onChange={(e) => setSkillQuery(e.target.value)}
                placeholder="Python, SQL, FastAPI"
                className="w-full bg-aero-bg border border-aero-border-subtle rounded-xl px-4 py-2 text-aero-text placeholder:text-aero-dim focus:outline-none focus:ring-2 focus:ring-aero-cyan/40"
              />
              <div className="mt-2">
                <select
                  value={skillDropdownValue}
                  onChange={(e) => {
                    const selected = e.target.value;
                    if (selected) appendSkillToQuery(selected);
                    setSkillDropdownValue('');
                  }}
                  className="w-full bg-aero-bg border border-aero-border-subtle rounded-xl px-3 py-2 text-sm text-aero-text focus:outline-none focus:ring-2 focus:ring-aero-cyan/40"
                >
                  <option value="">Pick from detected skills</option>
                  {availableSkills.map((skill) => (
                    <option key={skill} value={skill}>
                      {skill}
                    </option>
                  ))}
                </select>
              </div>
              {filtersActive && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {skillQuery
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                    .map((s) => (
                      <span
                        key={s}
                        className="px-2.5 py-1 text-xs rounded-full bg-aero-cyan/10 border border-aero-cyan/30 text-aero-cyan"
                      >
                        {s}
                      </span>
                    ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-xs text-aero-muted uppercase tracking-wider">
                Match Mode
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMatchMode('any')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                    matchMode === 'any'
                      ? 'bg-aero-cyan/20 text-aero-cyan border-aero-cyan/40'
                      : 'bg-aero-bg text-aero-muted border-aero-border-subtle'
                  }`}
                >
                  Any
                </button>
                <button
                  onClick={() => setMatchMode('all')}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold border ${
                    matchMode === 'all'
                      ? 'bg-aero-cyan/20 text-aero-cyan border-aero-cyan/40'
                      : 'bg-aero-bg text-aero-muted border-aero-border-subtle'
                  }`}
                >
                  All
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-2 w-full lg:w-56">
              <label className="text-xs text-aero-muted uppercase tracking-wider">
                Min Match
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={10}
                  value={minMatch}
                  onChange={(e) => setMinMatch(Number(e.target.value))}
                  className="w-full accent-aero-cyan"
                />
                <span className="text-aero-text text-xs font-mono w-12 text-right">
                  {minMatch}%
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleApplyFilters}
                className="px-4 py-2 rounded-lg bg-aero-cyan text-aero-bg text-sm font-semibold hover:opacity-90"
              >
                Apply
              </button>
              <button
                onClick={handleClearFilters}
                className="px-4 py-2 rounded-lg bg-aero-bg border border-aero-border-subtle text-aero-muted text-sm font-semibold hover:text-aero-text"
              >
                Clear
              </button>
            </div>
          </div>
        </motion.div>

        {/* Stat Cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8"
        >
          <StatCard
            label="Total Candidates"
            value={stats.total}
            color="text-aero-text"
            accentColor="from-aero-cyan/20 to-aero-indigo/20"
            icon={
              <svg className="w-6 h-6 text-aero-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          />
          <StatCard
            label="In Progress"
            value={stats.inProgress}
            color="text-aero-cyan"
            accentColor="from-aero-cyan/20 to-sky-400/20"
            icon={
              <svg className="w-6 h-6 text-aero-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            }
          />
          <StatCard
            label="Critical Flags"
            value={stats.flagged}
            color={stats.flagged > 0 ? 'text-aero-red' : 'text-aero-green'}
            accentColor={stats.flagged > 0 ? 'from-aero-red/20 to-rose-400/20' : 'from-aero-green/20 to-emerald-400/20'}
            icon={
              <svg className={`w-6 h-6 ${stats.flagged > 0 ? 'text-aero-red' : 'text-aero-green'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            }
          />
          <StatCard
            label="Avg. Score"
            value={`${stats.avgScore}%`}
            color={getScoreColor(stats.avgScore)}
            accentColor="from-aero-indigo/20 to-violet-400/20"
            icon={
              <svg className="w-6 h-6 text-aero-indigo" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            }
          />
        </motion.div>

        {/* Candidate List Header */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-between mb-4"
        >
          <h2 className="text-lg font-semibold text-aero-text">All Candidates</h2>
          <div className="flex items-center gap-3">
            {skillRankingFor && (
              <span className="text-xs px-2.5 py-1 rounded-full bg-aero-indigo/15 border border-aero-indigo/40 text-aero-indigo">
                Skill rank: {skillRankingFor}
              </span>
            )}
            <span className="text-sm text-aero-muted">
              {candidates.length} candidate{candidates.length !== 1 ? 's' : ''}
            </span>
          </div>
        </motion.div>

        {/* Loading State */}
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-aero-surface rounded-2xl border border-aero-border-subtle p-16 text-center"
          >
            <div className="inline-block w-10 h-10 border-2 border-aero-cyan border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-aero-muted">Loading candidates...</p>
          </motion.div>
        )}

        {/* Error State */}
        {error && !loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-aero-surface rounded-2xl border border-aero-red/30 p-16 text-center"
          >
            <svg
              className="w-14 h-14 mx-auto text-aero-red mb-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-aero-red mb-6">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="btn btn-primary"
            >
              Retry
            </button>
          </motion.div>
        )}

        {/* Empty State */}
        {!loading && !error && candidates.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-aero-surface rounded-2xl border border-aero-border-subtle p-16 text-center"
          >
            <div className="w-16 h-16 mx-auto rounded-full bg-aero-border-subtle/50 flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-aero-muted"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <p className="text-aero-muted text-lg">No candidates yet</p>
            <p className="text-aero-dim text-sm mt-1">
              Candidates will appear here once they start their assessments
            </p>
          </motion.div>
        )}

        {/* Floating Rows - Candidate Cards */}
        {!loading && !error && candidates.length > 0 && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-3"
          >
            {candidates.map((candidate, index) => {
              const statusStyle = getStatusBadge(candidate.status);
              return (
                <motion.div
                  key={candidate.id}
                  variants={itemVariants}
                  custom={index}
                  onClick={() => handleViewCandidate(candidate.id)}
                  whileHover={{ y: -2, scale: 1.005 }}
                  whileTap={{ scale: 0.995 }}
                  className="bg-aero-surface rounded-xl border border-aero-border-subtle p-5 cursor-pointer group hover:border-aero-cyan/50 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3),0_0_0_1px_rgba(56,189,248,0.2)] transition-all duration-300"
                >
                  <div className="flex items-center gap-6">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-aero-cyan/20 to-aero-indigo/20 flex items-center justify-center border border-aero-cyan/20 group-hover:border-aero-cyan/40 transition-colors">
                      <span className="text-aero-cyan font-semibold text-lg">
                        {candidate.full_name.charAt(0).toUpperCase()}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-aero-text font-semibold group-hover:text-aero-cyan transition-colors truncate">
                          {candidate.full_name}
                        </h3>
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold border ${statusStyle.bg} ${statusStyle.border} ${statusStyle.text}`}
                        >
                          {formatStatus(candidate.status)}
                        </span>
                      </div>
                      <p className="text-aero-muted text-sm truncate">{candidate.email}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {candidate.overall_rank_position != null && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-aero-indigo/15 text-aero-indigo border border-aero-indigo/35">
                            Overall Rank #{candidate.overall_rank_position}
                          </span>
                        )}
                        {skillRankingFor && candidate.skill_rank_position != null && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-aero-cyan/15 text-aero-cyan border border-aero-cyan/35">
                            {skillRankingFor} Rank #{candidate.skill_rank_position}
                          </span>
                        )}
                        {candidate.overall_rank_score != null && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono bg-aero-bg border border-aero-border-subtle text-aero-muted">
                            Score {candidate.overall_rank_score.toFixed(1)}
                          </span>
                        )}
                      </div>
                      {(candidate.candidate_skills || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(candidate.candidate_skills || []).slice(0, 6).map((skill) => (
                            <span
                              key={`${candidate.id}-skill-${skill}`}
                              className="px-2 py-0.5 rounded-md text-[10px] bg-aero-bg border border-aero-border-subtle text-aero-muted"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                      {(candidate.role_tags || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(candidate.role_tags || []).slice(0, 4).map((tag) => (
                            <span
                              key={`${candidate.id}-role-${tag}`}
                              className="px-2 py-0.5 rounded-md text-[10px] bg-aero-indigo/15 border border-aero-indigo/35 text-aero-indigo"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      {candidate.last_action && (
                        <p className="text-xs text-aero-dim mt-1">
                          Last action: {candidate.last_action}
                        </p>
                      )}
                      {filtersActive && candidate.skill_match_percent != null && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-aero-cyan/15 text-aero-cyan border border-aero-cyan/30">
                            Match {candidate.skill_match_percent ?? 0}%
                          </span>
                          {(candidate.matched_skills || []).slice(0, 4).map((skill) => (
                            <span
                              key={`${candidate.id}-match-${skill}`}
                              className="px-2 py-0.5 rounded-full text-[11px] bg-aero-green/10 text-aero-green border border-aero-green/30"
                            >
                              {skill}
                            </span>
                          ))}
                          {(candidate.missing_skills || []).slice(0, 3).map((skill) => (
                            <span
                              key={`${candidate.id}-miss-${skill}`}
                              className="px-2 py-0.5 rounded-full text-[11px] bg-aero-red/10 text-aero-red border border-aero-red/30"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Score */}
                    <div className="w-32 text-center">
                      <p className="text-xs text-aero-muted uppercase tracking-wider mb-1">
                        Tech Score
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-aero-bg rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${candidate.technical_score}%` }}
                            transition={{ duration: 0.8, delay: 0.2 + index * 0.1 }}
                            className={`h-full rounded-full ${getScoreBarColor(candidate.technical_score)}`}
                          />
                        </div>
                        <span
                          className={`font-mono font-bold text-sm ${getScoreColor(
                            candidate.technical_score
                          )}`}
                        >
                          {candidate.technical_score}%
                        </span>
                      </div>
                    </div>

                    {/* Flags */}
                    <div className="w-24 text-center">
                      <p className="text-xs text-aero-muted uppercase tracking-wider mb-1">
                        Flags
                      </p>
                      {candidate.total_flags > 0 ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-aero-red/10 border border-aero-red/30">
                          <svg
                            className="w-4 h-4 text-aero-red"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                            />
                          </svg>
                          <span className="font-semibold text-aero-red">
                            {candidate.total_flags}
                          </span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-aero-green/10 border border-aero-green/30">
                          <svg
                            className="w-4 h-4 text-aero-green"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          <span className="font-semibold text-aero-green">Clear</span>
                        </div>
                      )}
                    </div>

                    {/* Quick Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openActionModal(candidate.id, candidate.full_name, 'ACCEPT');
                        }}
                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-aero-green/15 text-aero-green border border-aero-green/30 hover:bg-aero-green hover:text-aero-bg"
                      >
                        Accept
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openActionModal(candidate.id, candidate.full_name, 'REVIEW');
                        }}
                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-aero-orange/15 text-aero-orange border border-aero-orange/30 hover:bg-aero-orange hover:text-aero-bg"
                      >
                        Review
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openActionModal(candidate.id, candidate.full_name, 'REJECT');
                        }}
                        className="px-3 py-2 rounded-lg text-xs font-semibold bg-aero-red/15 text-aero-red border border-aero-red/30 hover:bg-aero-red hover:text-aero-bg"
                      >
                        Reject
                      </button>
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewCandidate(candidate.id);
                      }}
                      className="px-4 py-2 rounded-lg bg-aero-cyan/10 text-aero-cyan text-sm font-semibold border border-aero-cyan/30 hover:bg-aero-cyan hover:text-aero-bg transition-all duration-200 opacity-0 group-hover:opacity-100"
                    >
                      View Report
                    </button>

                    {/* Chevron */}
                    <svg
                      className="w-5 h-5 text-aero-muted group-hover:text-aero-cyan group-hover:translate-x-1 transition-all"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </div>

      {actionModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-aero-border-subtle bg-aero-surface p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-aero-text">
                  {actionModal.action} candidate
                </h3>
                <p className="text-sm text-aero-muted">
                  {actionModal.candidateName}
                </p>
              </div>
              <button
                onClick={closeActionModal}
                className="text-aero-muted hover:text-aero-text"
              >
                X
              </button>
            </div>

            <label className="text-xs text-aero-muted uppercase tracking-wider">
              Note {actionModal.action === 'REJECT' ? '(required)' : '(optional)'}
            </label>
            <textarea
              value={actionNote}
              onChange={(e) => setActionNote(e.target.value)}
              rows={4}
              className="w-full mt-2 bg-aero-bg border border-aero-border-subtle rounded-xl px-3 py-2 text-aero-text placeholder:text-aero-dim focus:outline-none focus:ring-2 focus:ring-aero-cyan/40"
              placeholder="Add context for this decision"
            />

            {actionError && (
              <p className="mt-2 text-sm text-aero-red">{actionError}</p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={closeActionModal}
                className="px-4 py-2 rounded-lg bg-aero-bg border border-aero-border-subtle text-aero-muted text-sm font-semibold hover:text-aero-text"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={submitAction}
                className="px-4 py-2 rounded-lg bg-aero-cyan text-aero-bg text-sm font-semibold hover:opacity-90 disabled:opacity-60"
                disabled={actionLoading}
              >
                {actionLoading ? 'Submitting...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
