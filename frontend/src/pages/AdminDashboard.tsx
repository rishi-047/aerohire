import { useCallback, useEffect, useState } from 'react';
import { adminApi, type AdminCandidate, type AdminRecruiter } from '../lib/api';

const ADMIN_PATH = '/admin/aerohire-internal-ops-2026';

export default function AdminDashboard() {
  const [candidates, setCandidates] = useState<AdminCandidate[]>([]);
  const [recruiters, setRecruiters] = useState<AdminRecruiter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [candidateResponse, recruiterResponse] = await Promise.all([
        adminApi.listCandidates(),
        adminApi.listRecruiters(),
      ]);
      setCandidates(candidateResponse.candidates);
      setRecruiters(recruiterResponse.recruiters);
    } catch (err) {
      console.error('Failed to load admin data:', err);
      setError('Failed to load admin data. Check secret URL or backend status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteCandidate = async (candidate: AdminCandidate) => {
    const confirmed = window.confirm(
      `Delete candidate ${candidate.full_name || candidate.email}? This removes login, submissions, and logs.`
    );
    if (!confirmed) return;
    await adminApi.deleteCandidate(candidate.candidate_id);
    await loadData();
  };

  const handleDeleteRecruiter = async (recruiter: AdminRecruiter) => {
    const confirmed = window.confirm(
      `Delete recruiter ${recruiter.full_name || recruiter.email}? This removes login.`
    );
    if (!confirmed) return;
    await adminApi.deleteRecruiter(recruiter.user_id);
    await loadData();
  };

  const handleDeleteAllCandidates = async () => {
    const confirmed = window.confirm(
      'Delete ALL candidates and their data? This is destructive and cannot be undone.'
    );
    if (!confirmed) return;
    await adminApi.deleteAllCandidates();
    await loadData();
  };

  const handleDeleteAllRecruiters = async () => {
    const confirmed = window.confirm(
      'Delete ALL recruiters? This is destructive and cannot be undone.'
    );
    if (!confirmed) return;
    await adminApi.deleteAllRecruiters();
    await loadData();
  };

  return (
    <div className="min-h-screen bg-aero-bg text-aero-text p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-widest text-aero-red">Secret Admin Console</p>
          <h1 className="text-3xl font-semibold text-white">AeroHire Admin Reset</h1>
          <p className="text-sm text-aero-muted">
            URL: <span className="text-aero-cyan">{ADMIN_PATH}</span>
          </p>
        </div>

        {error && (
          <div className="p-4 rounded-lg border border-aero-red/30 bg-aero-red/10 text-aero-red">
            {error}
          </div>
        )}

        {loading ? (
          <div className="p-6 bg-aero-surface rounded-2xl border border-aero-border-subtle">
            Loading admin data...
          </div>
        ) : (
          <>
            <div className="bg-aero-surface rounded-2xl border border-aero-border-subtle p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Candidates</h2>
                  <p className="text-sm text-aero-muted">Total: {candidates.length}</p>
                </div>
                <button
                  onClick={handleDeleteAllCandidates}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-aero-red/20 text-aero-red border border-aero-red/40 hover:bg-aero-red/30"
                >
                  Delete All Candidates
                </button>
              </div>

              <div className="space-y-3">
                {candidates.length === 0 && (
                  <p className="text-sm text-aero-muted">No candidates found.</p>
                )}
                {candidates.map((candidate) => (
                  <div
                    key={candidate.candidate_id}
                    className="flex items-center justify-between gap-4 p-4 rounded-xl border border-aero-border-subtle bg-aero-bg/40"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white">
                        {candidate.full_name || 'Unnamed Candidate'}
                      </span>
                      <span className="text-xs text-aero-muted">{candidate.email}</span>
                      <span className="text-xs text-aero-muted">Status: {candidate.status}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteCandidate(candidate)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-aero-red/20 text-aero-red border border-aero-red/40 hover:bg-aero-red/30"
                    >
                      Delete Candidate
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-aero-surface rounded-2xl border border-aero-border-subtle p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-white">Recruiters</h2>
                  <p className="text-sm text-aero-muted">Total: {recruiters.length}</p>
                </div>
                <button
                  onClick={handleDeleteAllRecruiters}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-aero-red/20 text-aero-red border border-aero-red/40 hover:bg-aero-red/30"
                >
                  Delete All Recruiters
                </button>
              </div>

              <div className="space-y-3">
                {recruiters.length === 0 && (
                  <p className="text-sm text-aero-muted">No recruiters found.</p>
                )}
                {recruiters.map((recruiter) => (
                  <div
                    key={recruiter.user_id}
                    className="flex items-center justify-between gap-4 p-4 rounded-xl border border-aero-border-subtle bg-aero-bg/40"
                  >
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-white">
                        {recruiter.full_name || 'Unnamed Recruiter'}
                      </span>
                      <span className="text-xs text-aero-muted">{recruiter.email}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteRecruiter(recruiter)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-aero-red/20 text-aero-red border border-aero-red/40 hover:bg-aero-red/30"
                    >
                      Delete Recruiter
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
