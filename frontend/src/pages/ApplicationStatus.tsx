import { useEffect, useMemo, useState } from 'react';
import { dashboardApi } from '../lib/api';

interface TimelineStep {
  key: string;
  label: string;
  description: string;
}

const TIMELINE_STEPS: TimelineStep[] = [
  {
    key: 'Registered',
    label: 'Registered',
    description: 'Your profile is created and ready for the next stage.',
  },
  {
    key: 'Assessment',
    label: 'Assessment',
    description: 'Complete the technical and behavioral assessment.',
  },
  {
    key: 'Review',
    label: 'Review',
    description: 'Our team reviews your results and experience.',
  },
  {
    key: 'Interview',
    label: 'Interview',
    description: 'Meet the team for deeper technical and culture alignment.',
  },
  {
    key: 'Decision',
    label: 'Decision',
    description: 'Final hiring decision and next steps.',
  },
];

const getStepIndexForStatus = (status: string): number => {
  const normalized = status.replace(/_/g, ' ');

  if (normalized === 'Registered') return 0;
  if (normalized === 'Assessment Started' || normalized === 'Completed') return 1;
  if (normalized === 'Under Review') return 2;
  if (normalized === 'Interview Scheduled') return 3;
  if (normalized === 'Hired' || normalized === 'Rejected') return 4;

  return 0;
};

export default function ApplicationStatus() {
  const [status, setStatus] = useState<string>('Registered');
  const [decisionNote, setDecisionNote] = useState<string | null>(null);
  const [decisionUpdatedAt, setDecisionUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await dashboardApi.getMyStatus();
        setStatus(response.status);
        setDecisionNote(response.decision_note ?? null);
        setDecisionUpdatedAt(response.decision_updated_at ?? null);
      } catch (err) {
        console.error('Failed to fetch status:', err);
        setError('Unable to load your application status.');
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
  }, []);

  const normalizedStatus = useMemo(() => status.replace(/_/g, ' '), [status]);
  const currentStepIndex = useMemo(() => getStepIndexForStatus(status), [status]);
  const decisionColor =
    normalizedStatus === 'Hired'
      ? 'text-aero-green border-aero-green/30 bg-aero-green/10'
      : normalizedStatus === 'Rejected'
      ? 'text-aero-red border-aero-red/30 bg-aero-red/10'
      : 'text-aero-cyan border-aero-cyan/30 bg-aero-cyan/10';

  const formatDecisionTimestamp = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-h1 text-white mb-2">Application Status</h1>
          <p className="text-aero-muted">
            Track where you are in the hiring journey.
          </p>
        </div>

        <div className="bg-aero-surface rounded-2xl border border-aero-border p-6">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-aero-muted">
              Loading status...
            </div>
          ) : error ? (
            <div className="p-4 rounded-lg border border-aero-red/30 bg-aero-red/10 text-aero-red">
              {error}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p className="text-sm text-aero-muted">Current Stage</p>
                  <p className="text-xl font-semibold text-white">
                    {normalizedStatus}
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-full text-sm font-semibold border ${decisionColor}`}>
                  {normalizedStatus}
                </div>
              </div>

              {decisionNote && (
                <div className="mb-6 rounded-xl border border-aero-cyan/20 bg-aero-cyan/10 p-4">
                  <p className="text-sm font-semibold text-aero-cyan mb-2">Recruiter Note</p>
                  <p className="text-sm text-aero-text">{decisionNote}</p>
                  {decisionUpdatedAt && (
                    <p className="text-xs text-aero-muted mt-2">
                      Updated: {formatDecisionTimestamp(decisionUpdatedAt)}
                    </p>
                  )}
                </div>
              )}

              <div className="relative">
                <div className="absolute left-4 top-0 bottom-0 w-px bg-aero-border" />
                <div className="space-y-8">
                  {TIMELINE_STEPS.map((step, index) => {
                    const isCompleted = index < currentStepIndex;
                    const isCurrent = index === currentStepIndex;
                    const isDecision = step.key === 'Decision';

                    const indicatorColor = isDecision
                      ? normalizedStatus === 'Hired'
                        ? 'bg-aero-green border-aero-green/40'
                        : normalizedStatus === 'Rejected'
                        ? 'bg-aero-red border-aero-red/40'
                        : isCompleted || isCurrent
                        ? 'bg-aero-cyan border-aero-cyan/40'
                        : 'bg-aero-border border-aero-border'
                      : isCompleted || isCurrent
                      ? 'bg-aero-cyan border-aero-cyan/40'
                      : 'bg-aero-border border-aero-border';

                    return (
                      <div key={step.key} className="flex gap-6">
                        <div className="relative">
                          <div
                            className={`w-8 h-8 rounded-full border-2 flex items-center justify-center ${indicatorColor}`}
                          >
                            {isCompleted ? (
                              <svg className="w-4 h-4 text-aero-bg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <span className="text-xs font-semibold text-aero-bg">
                                {index + 1}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-white">
                              {step.label}
                            </h3>
                            {isCurrent && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-aero-cyan/20 text-aero-cyan">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-aero-muted mt-1">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
