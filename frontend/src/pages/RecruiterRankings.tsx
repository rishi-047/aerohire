import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { dashboardApi, type RankingListItem } from '../lib/api';

function scoreColor(score: number): string {
  if (score >= 80) return 'text-aero-green';
  if (score >= 60) return 'text-aero-orange';
  return 'text-aero-red';
}

function scoreBarColor(score: number): string {
  if (score >= 80) return 'bg-gradient-to-r from-aero-green to-emerald-400';
  if (score >= 60) return 'bg-gradient-to-r from-aero-orange to-amber-400';
  return 'bg-gradient-to-r from-aero-red to-rose-400';
}

export default function RecruiterRankings() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RankingListItem[]>([]);
  const [availableRoleTags, setAvailableRoleTags] = useState<string[]>([]);
  const [availableSkills, setAvailableSkills] = useState<string[]>([]);
  const [roleTag, setRoleTag] = useState('');
  const [skills, setSkills] = useState('');
  const [skillDropdownValue, setSkillDropdownValue] = useState('');
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [roleRankingFor, setRoleRankingFor] = useState<string | null>(null);

  const topCandidate = rows.length > 0 ? rows[0] : null;
  const avgCompositeScore = useMemo(() => {
    if (!rows.length) return 0;
    return Math.round(rows.reduce((acc, row) => acc + row.overall_rank_score, 0) / rows.length);
  }, [rows]);

  const fetchRankings = async (params?: { role_tag?: string; skills?: string }) => {
    try {
      setLoading(true);
      setError(null);
      const data = await dashboardApi.getRankings({
        role_tag: params?.role_tag || undefined,
        skills: params?.skills || undefined,
        limit: 200,
      });
      setRows(data.ranking || []);
      setAvailableRoleTags(data.available_role_tags || []);
      setAvailableSkills(data.available_skills || []);
      setGeneratedAt(data.generated_at || null);
      setRoleRankingFor(data.role_ranking_for || null);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load rankings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRankings();
  }, []);

  const applyFilters = async () => {
    await fetchRankings({
      role_tag: roleTag.trim() || undefined,
      skills: skills.trim() || undefined,
    });
  };

  const clearFilters = async () => {
    setRoleTag('');
    setSkills('');
    setSkillDropdownValue('');
    await fetchRankings();
  };

  const appendSkillToQuery = (value: string) => {
    const nextSkill = value.trim();
    if (!nextSkill) return;
    const existing = skills
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    const existingLower = new Set(existing.map((item) => item.toLowerCase()));
    if (existingLower.has(nextSkill.toLowerCase())) return;
    setSkills(existing.concat(nextSkill).join(', '));
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="mb-8"
        >
          <h1 className="text-3xl font-bold text-aero-text mb-2 tracking-tight">Candidate Rankings</h1>
          <p className="text-aero-muted">
            Global leaderboard with role-tag intelligence and score-level explainability
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="bg-aero-surface rounded-2xl border border-aero-border-subtle p-5 mb-8"
        >
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs text-aero-muted uppercase tracking-wider mb-2 block">
                Role Tag
              </label>
              <select
                value={roleTag}
                onChange={(e) => setRoleTag(e.target.value)}
                className="w-full bg-aero-bg border border-aero-border-subtle rounded-xl px-3 py-2 text-sm text-aero-text focus:outline-none focus:ring-2 focus:ring-aero-cyan/40"
              >
                <option value="">All role tags</option>
                {availableRoleTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-aero-muted uppercase tracking-wider mb-2 block">
                Skills Filter
              </label>
              <input
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
                placeholder="Python, SQL"
                className="w-full bg-aero-bg border border-aero-border-subtle rounded-xl px-3 py-2 text-sm text-aero-text placeholder:text-aero-dim focus:outline-none focus:ring-2 focus:ring-aero-cyan/40"
              />
            </div>
            <div>
              <label className="text-xs text-aero-muted uppercase tracking-wider mb-2 block">
                Skill Dropdown
              </label>
              <select
                value={skillDropdownValue}
                onChange={(e) => {
                  const selected = e.target.value;
                  if (selected) appendSkillToQuery(selected);
                  setSkillDropdownValue('');
                }}
                className="w-full bg-aero-bg border border-aero-border-subtle rounded-xl px-3 py-2 text-sm text-aero-text focus:outline-none focus:ring-2 focus:ring-aero-cyan/40"
              >
                <option value="">Pick a detected skill</option>
                {availableSkills.map((skill) => (
                  <option key={skill} value={skill}>
                    {skill}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={applyFilters}
                className="px-4 py-2 rounded-lg bg-aero-cyan text-aero-bg text-sm font-semibold hover:opacity-90"
              >
                Apply
              </button>
              <button
                onClick={clearFilters}
                className="px-4 py-2 rounded-lg bg-aero-bg border border-aero-border-subtle text-aero-muted text-sm font-semibold hover:text-aero-text"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-4">
            {roleRankingFor && (
              <span className="px-2.5 py-1 rounded-full text-xs bg-aero-indigo/15 border border-aero-indigo/40 text-aero-indigo">
                Role ranking: {roleRankingFor}
              </span>
            )}
            {generatedAt && (
              <span className="text-xs text-aero-dim">Generated: {new Date(generatedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8"
        >
          <div className="rounded-2xl border border-aero-border-subtle bg-aero-surface p-5">
            <p className="text-aero-muted text-xs uppercase tracking-wider mb-2">Top Candidate</p>
            <p className="text-aero-text text-xl font-semibold">{topCandidate?.full_name || '-'}</p>
            <p className="text-aero-cyan text-sm mt-1">
              {topCandidate ? `${topCandidate.overall_rank_score.toFixed(1)} composite` : 'No data'}
            </p>
          </div>
          <div className="rounded-2xl border border-aero-border-subtle bg-aero-surface p-5">
            <p className="text-aero-muted text-xs uppercase tracking-wider mb-2">Average Composite</p>
            <p className={`text-xl font-semibold ${scoreColor(avgCompositeScore)}`}>{avgCompositeScore}</p>
            <p className="text-aero-dim text-sm mt-1">Across visible candidates</p>
          </div>
          <div className="rounded-2xl border border-aero-border-subtle bg-aero-surface p-5">
            <p className="text-aero-muted text-xs uppercase tracking-wider mb-2">Candidates Ranked</p>
            <p className="text-aero-text text-xl font-semibold">{rows.length}</p>
            <p className="text-aero-dim text-sm mt-1">Global + role intelligent ranking</p>
          </div>
        </motion.div>

        {loading && (
          <div className="bg-aero-surface rounded-2xl border border-aero-border-subtle p-16 text-center">
            <div className="inline-block w-10 h-10 border-2 border-aero-cyan border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-aero-muted">Calculating rankings...</p>
          </div>
        )}

        {!loading && error && (
          <div className="bg-aero-surface rounded-2xl border border-aero-red/30 p-16 text-center">
            <p className="text-aero-red">{error}</p>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="bg-aero-surface rounded-2xl border border-aero-border-subtle p-16 text-center">
            <p className="text-aero-muted text-lg">No candidates match the current ranking filters.</p>
          </div>
        )}

        {!loading && !error && rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((row) => (
              <motion.div
                key={row.candidate_id}
                whileHover={{ y: -2, scale: 1.004 }}
                whileTap={{ scale: 0.996 }}
                onClick={() => navigate(`/recruiter/candidate/${row.candidate_id}`)}
                className="cursor-pointer bg-aero-surface rounded-xl border border-aero-border-subtle p-5 hover:border-aero-cyan/50 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3),0_0_0_1px_rgba(56,189,248,0.2)] transition-all duration-300"
              >
                <div className="flex items-center gap-5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-aero-cyan/20 to-aero-indigo/20 border border-aero-cyan/30 flex items-center justify-center">
                    <span className="text-aero-cyan font-bold">#{row.overall_rank_position}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-aero-text font-semibold truncate">{row.full_name}</h3>
                      {row.role_rank_position != null && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] bg-aero-indigo/15 border border-aero-indigo/35 text-aero-indigo">
                          Role Rank #{row.role_rank_position}
                        </span>
                      )}
                    </div>
                    <p className="text-aero-muted text-sm truncate">{row.email}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {row.role_tags.slice(0, 4).map((tag) => (
                        <span
                          key={`${row.candidate_id}-${tag}`}
                          className="px-2 py-0.5 rounded-md text-[10px] bg-aero-indigo/15 border border-aero-indigo/35 text-aero-indigo"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="w-60">
                    <p className="text-xs text-aero-muted uppercase tracking-wider mb-1">Composite Score</p>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-aero-bg rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${scoreBarColor(row.overall_rank_score)}`}
                          style={{ width: `${Math.max(0, Math.min(100, row.overall_rank_score))}%` }}
                        />
                      </div>
                      <span className={`font-mono font-semibold ${scoreColor(row.overall_rank_score)}`}>
                        {row.overall_rank_score.toFixed(1)}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2 text-[10px] text-aero-dim">
                      <span>T {row.technical_score}</span>
                      <span>P {row.psychometric_score}</span>
                      <span>I {row.integrity_score}</span>
                      <span>TW {row.teamwork_score}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/recruiter/candidate/${row.candidate_id}`);
                    }}
                    className="px-4 py-2 rounded-lg bg-aero-cyan/10 text-aero-cyan text-sm font-semibold border border-aero-cyan/30 hover:bg-aero-cyan hover:text-aero-bg transition-all"
                  >
                    View
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

