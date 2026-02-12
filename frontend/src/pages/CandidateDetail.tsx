import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceDot,
  PieChart,
  Pie,
  Cell,
  Brush,
} from 'recharts';
import { dashboardApi, type CandidateDetail as CandidateDetailType, type ProctoringLog, type CodeSubmission, type CharBreakdown } from '../lib/api';

// ============================================
// Types
// ============================================

interface ParsedBullet {
  text: string;
  evidence?: string;
}

interface ParsedRationale {
  verdict: 'HIRE' | 'NO_HIRE' | 'REVIEW' | null;
  strengths: ParsedBullet[];
  risks: ParsedBullet[];
  summary: string;
}

interface ChartDataPoint {
  time: number;
  level: number;
  event: string;
  eventType: string;
  severity: 'LOW' | 'MED' | 'MEDIUM' | 'HIGH';
}

// ============================================
// AI Text Parser - Professional Audit Report
// ============================================

/**
 * Parse AI report text using bracket headers.
 */
function parseAIReport(text: string | null): ParsedRationale {
  if (!text) {
    return {
      verdict: null,
      strengths: ['Assessment data pending'],
      risks: ['No analysis available yet'],
      summary: 'Awaiting assessment completion for AI analysis.',
    };
  }

  const getSection = (label: string) => {
    const regex = new RegExp(`\\[${label}\\]:\\s*([\\s\\S]*?)(?=\\n\\[[A-Z ]+\\]:|$)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
  };

  const parseBullets = (section: string): ParsedBullet[] => {
    return section
      .split('\n')
      .map((line) => line.replace(/^[\\-•]\\s*/, '').trim())
      .filter(Boolean)
      .map((line) => {
        const evidenceMatch = line.match(/EVIDENCE:\s*([A-Za-z0-9._-]+)/i);
        const evidence = evidenceMatch ? evidenceMatch[1] : undefined;
        const text = line.replace(/EVIDENCE:\s*[A-Za-z0-9._-]+/i, '').replace(/\s+$/, '').trim();
        return { text, evidence };
      });
  };

  const verdictMatch = text.match(/\[VERDICT\]:\s*(HIRE|NO_HIRE|REVIEW)/i);
  const verdict = verdictMatch ? (verdictMatch[1].toUpperCase() as ParsedRationale['verdict']) : null;

  const strengths = parseBullets(getSection('STRENGTHS'));
  const risks = parseBullets(getSection('RISKS'));
  const summary = getSection('SUMMARY');

  return {
    verdict,
    strengths: strengths.length ? strengths : [{ text: 'Technical assessment completed' }],
    risks: risks.length ? risks : [{ text: 'No major risks highlighted' }],
    summary: summary || 'Awaiting assessment completion for AI analysis.',
  };
}

function mergeStrengthsWithResume(
  strengths: ParsedBullet[],
  resumeSkills: string[],
  resumeExperience: string
): ParsedBullet[] {
  const merged: ParsedBullet[] = [];
  const normalized = new Set<string>();

  const add = (value: ParsedBullet) => {
    const key = value.text.toLowerCase();
    if (!normalized.has(key)) {
      merged.push(value);
      normalized.add(key);
    }
  };

  if (resumeSkills.length > 0) {
    add({
      text: `Resume skills: ${resumeSkills.slice(0, 6).join(', ')}.`,
      evidence: 'resume.skills',
    });
  }

  if (resumeExperience) {
    const trimmed = resumeExperience.replace(/\s+/g, ' ').trim();
    const snippet = trimmed.length > 140 ? `${trimmed.slice(0, 140)}...` : trimmed;
    add({ text: `Experience highlight: ${snippet}`, evidence: 'resume.experience' });
  }

  strengths.forEach(add);

  return merged.slice(0, 3);
}

const detectResumeConsistency = (
  resumeSkills: string[],
  experienceYears: number | null,
  technicalScore: number,
  passedSubmissions: number
) => {
  if ((experienceYears ?? 0) >= 5 && (technicalScore < 60 || passedSubmissions === 0)) {
    return 'MISMATCH';
  }

  const highSignalSkills = [
    'python',
    'java',
    'javascript',
    'sql',
    'c++',
    'c#',
    'fastapi',
    'react',
    'node',
    'nodejs',
  ];

  const normalizedSkills = resumeSkills.map((skill) => skill.toLowerCase());
  if (normalizedSkills.some((skill) => highSignalSkills.includes(skill)) && technicalScore < 50) {
    return 'MISMATCH';
  }

  return 'ALIGNED';
};

// ============================================
// Chart Data Transformation
// ============================================

function transformLogsToChartData(logs: ProctoringLog[]): ChartDataPoint[] {
  if (logs.length === 0) return [];

  const severityToLevel: Record<string, number> = {
    LOW: 1,
    MED: 2,
    MEDIUM: 2,
    HIGH: 3,
  };

  const sortedLogs = [...logs].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const startTime = new Date(sortedLogs[0].timestamp).getTime();

  return sortedLogs.map((log) => {
    const severityKey = String(log.severity || '').toUpperCase();
    const level = severityToLevel[severityKey] ?? 1;
    const elapsedSeconds = Math.max(
      0,
      Math.min(2700, Math.round((new Date(log.timestamp).getTime() - startTime) / 1000))
    );

    return {
      time: elapsedSeconds,
      level,
      event: log.event_type ? log.event_type.replace(/_/g, ' ') : 'Event',
      eventType: String(log.event_type || '').toUpperCase(),
      severity: severityKey as ChartDataPoint['severity'],
    };
  });
}

const INTEGRITY_RULES: Record<string, string> = {
  TAB_SWITCH: 'Tab switch detected. Frequent switches in a short window raise severity.',
  COPY_PASTE_DETECTED: 'Large paste detected in the editor (possible copy/paste).',
  MULTIPLE_FACES: 'Multiple faces detected in the camera frame.',
  FACE_NOT_DETECTED: 'Face not detected for a sustained period.',
  SUSPICIOUS_BEHAVIOR: 'Unusual motion detected in the camera feed.',
  WEBCAM_DISABLED: 'Camera disabled during assessment.',
  WEB_CAM_DISABLED: 'Camera disabled during assessment.',
};

const getIntegrityRationale = (eventType: string, severity: ChartDataPoint['severity']) => {
  const key = (eventType || '').toUpperCase();
  const base = INTEGRITY_RULES[key] || 'Integrity event recorded based on proctoring signals.';

  if (key === 'TAB_SWITCH' && severity === 'HIGH') {
    return `${base} Multiple rapid switches triggered HIGH severity.`;
  }
  if (key === 'TAB_SWITCH' && (severity === 'MED' || severity === 'MEDIUM')) {
    return `${base} Repeated switching flagged as MED severity.`;
  }
  if (key === 'FACE_NOT_DETECTED' && severity === 'HIGH') {
    return `${base} Extended absence escalated to HIGH.`;
  }
  return base;
};

// ============================================
// Sub-Components
// ============================================

/**
 * Animated Circular Progress - Premium Design
 */
function CircularProgress({
  value,
  label,
  color,
  size = 'md'
}: {
  value: number;
  label: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const sizes = {
    sm: { width: 80, radius: 32, stroke: 6, textSize: 'text-lg' },
    md: { width: 120, radius: 48, stroke: 8, textSize: 'text-2xl' },
    lg: { width: 160, radius: 64, stroke: 10, textSize: 'text-3xl' },
  };

  const { width, radius, stroke, textSize } = sizes[size];
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const center = width / 2;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width={width} height={width} className="-rotate-90">
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="var(--aero-border-subtle)"
            strokeWidth={stroke}
          />
          {/* Progress circle */}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 1, ease: 'easeOut' }}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 8px ${color}40)` }}
          />
        </svg>
        {/* Center text */}
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.span
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.3 }}
            className={`${textSize} font-bold text-aero-text`}
          >
            {value}%
          </motion.span>
        </div>
      </div>
      <span className="mt-3 text-sm font-medium text-aero-muted">{label}</span>
    </div>
  );
}

/**
 * Verdict Badge - Large Prominent Style
 */
function VerdictBadge({ verdict, confidence }: { verdict: 'HIRE' | 'NO_HIRE' | 'REVIEW' | null; confidence: number | null }) {
  const config = {
    HIRE: {
      label: 'HIRE',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      className: 'verdict-hire',
      barColor: 'bg-gradient-to-r from-aero-green to-emerald-400',
    },
    NO_HIRE: {
      label: 'NO HIRE',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      className: 'verdict-no-hire',
      barColor: 'bg-gradient-to-r from-aero-red to-rose-400',
    },
    REVIEW: {
      label: 'REVIEW',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
      className: 'verdict-review',
      barColor: 'bg-gradient-to-r from-aero-orange to-amber-400',
    },
    null: {
      label: 'PENDING',
      icon: (
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      className: 'verdict-pending',
      barColor: 'bg-gradient-to-r from-aero-cyan to-sky-400',
    },
  };

  const { label, icon, className, barColor } = config[verdict ?? 'null'];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="mb-6"
    >
      <div className={`${className} rounded-2xl px-6 py-5 flex items-center gap-4`}>
        {icon}
        <div className="flex-1">
          <p className="text-2xl font-bold tracking-wide">{label}</p>
          {confidence !== null && (
            <div className="flex items-center gap-3 mt-2">
              <div className="flex-1 h-2 bg-aero-bg/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${confidence}%` }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                  className={`h-full rounded-full ${barColor}`}
                />
              </div>
              <span className="font-mono text-sm font-semibold opacity-80">
                {confidence}% confident
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Audit Item - Strength or Risk
 */
function AuditItem({
  item,
  type,
  index
}: {
  item: ParsedBullet;
  type: 'strength' | 'risk';
  index: number;
}) {
  const isStrength = type === 'strength';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.1 * index }}
      className={`flex items-start gap-3 p-3 rounded-lg ${
        isStrength
          ? 'bg-aero-green/5 border border-aero-green/20'
          : 'bg-aero-red/5 border border-aero-red/20'
      }`}
    >
      <div className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
        isStrength ? 'bg-aero-green/20' : 'bg-aero-red/20'
      }`}>
        {isStrength ? (
          <svg className="w-3 h-3 text-aero-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg className="w-3 h-3 text-aero-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 9v2m0 4h.01" />
          </svg>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className={`text-sm leading-relaxed ${isStrength ? 'text-aero-green' : 'text-aero-red'}`}>
          {item.text}
        </span>
        {item.evidence && (
          <span className="text-xs text-aero-muted">Evidence: {item.evidence}</span>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Stat Box Component
 */
function StatBox({
  label,
  value,
  color
}: {
  label: string;
  value: number | string;
  color: string;
}) {
  return (
    <div className="flex-1 bg-aero-bg/50 rounded-xl p-4 border border-aero-border-subtle">
      <p className="text-aero-muted text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

/**
 * Innovation Trinity: Code Playback Component
 */
function CodePlayback({ submission }: { submission: CodeSubmission }) {
  const [sliderValue, setSliderValue] = useState(100);

  const codeHistory = submission.code_history || [];
  const hasHistory = codeHistory.length > 0;

  // Get the code at the current slider position
  const displayCode = (() => {
    if (!hasHistory) return submission.submitted_code || '';

    const idx = Math.floor((sliderValue / 100) * (codeHistory.length - 1));
    return codeHistory[Math.max(0, Math.min(idx, codeHistory.length - 1))]?.code || '';
  })();

  if (!hasHistory && !submission.submitted_code) {
    return null;
  }

  return (
    <div className="mt-4 bg-aero-bg/30 rounded-xl border border-aero-border-subtle p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-aero-text flex items-center gap-2">
          <svg className="w-4 h-4 text-aero-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Code Playback
        </h4>
        {hasHistory && (
          <span className="text-xs text-aero-muted">
            {codeHistory.length} snapshots
          </span>
        )}
      </div>

      {/* Code Display */}
      <div className="bg-aero-bg rounded-lg border border-aero-border p-3 mb-3 max-h-48 overflow-y-auto">
        <pre className="text-xs text-aero-text font-mono whitespace-pre-wrap">
          {displayCode || 'No code available'}
        </pre>
      </div>

      {/* Playback Slider */}
      {hasHistory && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-aero-muted">Start</span>
          <input
            type="range"
            min="0"
            max="100"
            value={sliderValue}
            onChange={(e) => setSliderValue(Number(e.target.value))}
            className="flex-1 h-2 bg-aero-border rounded-lg appearance-none cursor-pointer accent-aero-cyan"
          />
          <span className="text-xs text-aero-muted">End</span>
        </div>
      )}
    </div>
  );
}

/**
 * Innovation Trinity: Originality Donut Chart
 */
function OriginalityChart({ charBreakdown }: { charBreakdown: CharBreakdown }) {
  const total = charBreakdown.typed + charBreakdown.pasted;

  const typedPercent = total > 0 ? Math.round((charBreakdown.typed / total) * 100) : 0;
  const pastedPercent = total > 0 ? 100 - typedPercent : 0;

  const data = [
    { name: 'Typed', value: charBreakdown.typed, color: 'var(--aero-green)' },
    { name: 'Pasted', value: charBreakdown.pasted, color: 'var(--aero-orange)' },
  ];

  return (
    <div className="bg-aero-bg/30 rounded-xl border border-aero-border-subtle p-4">
      <h4 className="text-sm font-semibold text-aero-text mb-3 flex items-center gap-2">
        <svg className="w-4 h-4 text-aero-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        Code Originality
      </h4>

      {total > 0 ? (
        <div className="flex items-center gap-4">
          {/* Donut Chart */}
          <div className="w-24 h-24">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={40}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {data.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Legend */}
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-aero-green" />
                <span className="text-aero-text">Typed</span>
              </span>
              <span className="font-mono text-aero-green">{typedPercent}%</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-aero-orange" />
                <span className="text-aero-text">Pasted</span>
              </span>
              <span className="font-mono text-aero-orange">{pastedPercent}%</span>
            </div>
            <div className="pt-1 border-t border-aero-border-subtle text-xs text-aero-muted">
              Total: {total.toLocaleString()} chars
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4 text-xs text-aero-muted">
          <div className="w-24 h-24 rounded-full border border-aero-border-subtle bg-aero-bg/40 flex items-center justify-center">
            <span>No data</span>
          </div>
          <div>
            <p>No typing data captured yet.</p>
            <p className="text-aero-dim">Once code is typed or pasted, this chart will populate.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Innovation Trinity: Chat Analysis Display
 */
function CultureFitCard({ submission }: { submission?: CodeSubmission | null }) {
  if (!submission?.chat_response) {
    return (
      <div className="bg-aero-bg/30 rounded-xl border border-aero-border-subtle p-4">
        <h4 className="text-sm font-semibold text-aero-text mb-2 flex items-center gap-2">
          <svg className="w-4 h-4 text-aero-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.8L3 20l1.4-3.6A7.8 7.8 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Culture Fit
        </h4>
        <p className="text-xs text-aero-muted">No teammate response captured for this candidate yet.</p>
      </div>
    );
  }

  const teamworkScore = submission.teamwork_score || 0;
  const scoreColor = teamworkScore >= 70 ? 'text-aero-green' : teamworkScore >= 40 ? 'text-aero-orange' : 'text-aero-red';

  return (
    <div className="bg-aero-indigo/10 rounded-xl border border-aero-indigo/30 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-aero-indigo flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 01-4-.8L3 20l1.4-3.6A7.8 7.8 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          Culture Fit
        </h4>
        <div className={`text-sm font-bold ${scoreColor}`}>
          {teamworkScore}% Teamwork
        </div>
      </div>

      <div className="bg-aero-bg/50 rounded-lg p-3 border border-aero-border/50">
        <p className="text-xs text-aero-muted mb-2">Response to "Alex" (Junior Dev):</p>
        <p className="text-sm text-aero-text leading-relaxed">
          "{submission.chat_response}"
        </p>
      </div>
    </div>
  );
}

// ============================================
// Animation Variants
// ============================================

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.4, 0, 0.2, 1] },
  },
};

// ============================================
// Main Component
// ============================================

export default function CandidateDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [candidate, setCandidate] = useState<CandidateDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resetApproving, setResetApproving] = useState(false);
  const [resetActionError, setResetActionError] = useState<string | null>(null);
  const [showResumeModal, setShowResumeModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'assessment' | 'audit'>('assessment');
  const [zoomStart, setZoomStart] = useState<number | null>(null);
  const [zoomEnd, setZoomEnd] = useState<number | null>(null);
  const [decisionNote, setDecisionNote] = useState('');
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  useEffect(() => {
    const fetchCandidate = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const data = await dashboardApi.getCandidate(parseInt(id, 10));
        setCandidate(data);
        setDecisionNote(data.decision_note || '');
      } catch (err) {
        console.error('Failed to fetch candidate:', err);
        setError('Failed to load candidate details.');
      } finally {
        setLoading(false);
      }
    };

    fetchCandidate();
  }, [id]);

  const handleApproveReset = async () => {
    if (!candidate) return;
    setResetApproving(true);
    setResetActionError(null);

    try {
      await dashboardApi.approveAssessmentReset(candidate.id);
      setCandidate({
        ...candidate,
        status: 'Registered',
        technical_score: 0,
        psychometric_score: 0,
        hiring_recommendation: null,
        ai_rationale: null,
        confidence_score: null,
        reset_requested: false,
        reset_reason: null,
        submissions: [],
        recent_logs: [],
        total_proctoring_events: 0,
        high_severity_events: 0,
        integrity_score: 100,
      });
    } catch (err) {
      console.error('Failed to approve reset:', err);
      setResetActionError('Failed to approve reset. Please try again.');
    } finally {
      setResetApproving(false);
    }
  };

  const handleSaveDecisionNote = async (statusOverride?: string) => {
    if (!candidate) return;
    setDecisionSaving(true);
    setDecisionError(null);
    try {
      const response = await dashboardApi.updateCandidateStatus(
        candidate.id,
        statusOverride ?? candidate.status,
        decisionNote
      );
      setCandidate({
        ...candidate,
        status: response.status ?? candidate.status,
        decision_note: response.decision_note ?? decisionNote,
        decision_updated_at: response.decision_updated_at ?? candidate.decision_updated_at,
      });
    } catch (err) {
      console.error('Failed to save decision note:', err);
      setDecisionError('Failed to save decision note. Please try again.');
    } finally {
      setDecisionSaving(false);
    }
  };

  // Parse AI rationale
  const parsedRationale = candidate
    ? parseAIReport(candidate.ai_rationale)
    : parseAIReport(null);

  // Use parsed verdict or candidate's recommendation
  const displayVerdict = candidate?.hiring_recommendation || parsedRationale.verdict;

  // Transform logs for chart
  const chartData = candidate ? transformLogsToChartData(candidate.recent_logs) : [];
  const highSeverityPoints = chartData.filter((d) => d.severity === 'HIGH');

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center"
        >
          <div className="inline-block w-12 h-12 border-3 border-aero-cyan border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-aero-muted">Loading candidate report...</p>
        </motion.div>
      </div>
    );
  }

  // Error state
  if (error || !candidate) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center bg-aero-surface rounded-2xl border border-aero-red/30 p-12 max-w-md"
        >
          <div className="w-16 h-16 mx-auto rounded-full bg-aero-red/10 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-aero-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-aero-red text-lg font-medium mb-2">Error Loading Report</p>
          <p className="text-aero-muted mb-6">{error || 'Candidate not found'}</p>
          <button
            onClick={() => navigate('/recruiter/dashboard')}
            className="btn btn-primary"
          >
            Back to Pipeline
          </button>
        </motion.div>
      </div>
    );
  }

  let resumeData: Record<string, unknown> | null = null;
  if (candidate.resume_parsed_data) {
    if (typeof candidate.resume_parsed_data === 'string') {
      try {
        resumeData = JSON.parse(candidate.resume_parsed_data) as Record<string, unknown>;
      } catch {
        resumeData = null;
      }
    } else {
      resumeData = candidate.resume_parsed_data as Record<string, unknown>;
    }
  }

  const resumeSkills = Array.isArray(resumeData?.skills) ? (resumeData?.skills as string[]) : [];
  const resumeExperience = typeof resumeData?.experience_zone === 'string' ? resumeData.experience_zone : '';
  const resumeExperienceYears = typeof resumeData?.experience_years === 'number'
    ? resumeData.experience_years
    : typeof resumeData?.experience_years === 'string'
    ? Number.parseInt(resumeData.experience_years, 10) || null
    : null;
  const resumeRawText = candidate.resume_text_raw || '';
  const mergedStrengths = mergeStrengthsWithResume(
    parsedRationale.strengths,
    resumeSkills,
    resumeExperience
  );
  const chatSubmission = candidate.submissions.find((submission) => submission.chat_response);
  const originalityBreakdown = candidate.submissions.reduce<CharBreakdown>(
    (acc, submission) => {
      const breakdown = submission.char_breakdown || { typed: 0, pasted: 0 };
      acc.typed += breakdown.typed || 0;
      acc.pasted += breakdown.pasted || 0;
      return acc;
    },
    { typed: 0, pasted: 0 }
  );
  const codeSubmissions = candidate.submissions.filter(
    (submission) => (submission.tests_total ?? 0) > 0
  );
  const timeTicks = Array.from({ length: 16 }, (_, index) => index * 180);

  const resolveTimeTicks = (start: number, end: number) => {
    const span = Math.max(1, end - start);
    const tickStep =
      span <= 60 ? 5 :
      span <= 180 ? 10 :
      span <= 300 ? 30 :
      span <= 900 ? 60 :
      span <= 1800 ? 120 :
      span <= 3600 ? 300 : 600;
    const ticks: number[] = [];
    for (let tick = Math.ceil(start); tick <= end; tick += tickStep) {
      ticks.push(Math.round(tick));
    }
    return ticks.length ? ticks : [start, end];
  };

  const visibleStart = zoomStart ?? 0;
  const visibleEnd = zoomEnd ?? 2700;
  const visibleTicks = resolveTimeTicks(visibleStart, visibleEnd);

  const formatDuration = (seconds: number) => {
    const total = Math.max(0, Math.round(seconds));
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const resumeConsistency = detectResumeConsistency(
    resumeSkills,
    resumeExperienceYears,
    candidate.technical_score,
    codeSubmissions.filter((submission) => submission.is_passed).length
  );

  const baselineChecks = candidate.baseline_summary?.checks || [];
  const baselineRole = candidate.baseline_summary?.role || 'Role baseline';
  const baselineMeta = candidate.baseline_summary;

  const baselineStatusStyles: Record<string, { badge: string; text: string }> = {
    met: { badge: 'bg-aero-green/15 text-aero-green border-aero-green/40', text: 'Met' },
    partial: { badge: 'bg-aero-orange/15 text-aero-orange border-aero-orange/40', text: 'Partial' },
    missing: { badge: 'bg-aero-red/15 text-aero-red border-aero-red/40', text: 'Missing' },
    unknown: { badge: 'bg-aero-border/40 text-aero-muted border-aero-border-subtle', text: 'Unknown' },
  };

  const renderIntegrityTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    payload?: Array<{ payload: ChartDataPoint }>;
    label?: number | string;
  }) => {
    if (!active || !payload || payload.length === 0) {
      return null;
    }
    const data = payload[0].payload;
    const severity = data.severity === 'MEDIUM' ? 'MED' : data.severity;
    const reason = getIntegrityRationale(data.eventType, data.severity);
    const timeLabel = typeof label === 'number' ? formatDuration(label) : label;

    return (
      <div className="rounded-xl border border-aero-border-subtle bg-aero-surface p-3 shadow-lg">
        <p className="text-xs text-aero-muted">Time: {timeLabel}</p>
        <p className="text-sm font-semibold text-aero-text mt-1">{data.event}</p>
        <p className="text-xs mt-1 text-aero-muted">
          Severity: <span className="text-aero-text font-semibold">{severity}</span>
        </p>
        <p className="text-xs text-aero-muted mt-2 leading-relaxed">{reason}</p>
      </div>
    );
  };

  const formatDecisionTimestamp = (value?: string | null) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-8"
        >
          {/* Back Button */}
          <motion.button
            whileHover={{ x: -4 }}
            onClick={() => navigate('/recruiter/dashboard')}
            className="flex items-center gap-2 text-aero-muted hover:text-aero-cyan transition-colors mb-6"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Pipeline
          </motion.button>

          {/* Title Row */}
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-aero-cyan/20 to-aero-indigo/20 flex items-center justify-center border border-aero-cyan/30">
              <span className="text-aero-cyan font-bold text-xl">
                {candidate.full_name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-aero-text">{candidate.full_name}</h1>
              <p className="text-aero-muted">{candidate.email}</p>
            </div>
            {/* Status Dropdown - Recruiter Pipeline Control */}
            <div className="ml-auto relative">
              <select
                value={candidate.status}
                onChange={async (e) => {
                  const newStatus = e.target.value;
                  try {
                    const response = await dashboardApi.updateCandidateStatus(
                      candidate.id,
                      newStatus,
                      decisionNote
                    );
                    setCandidate({
                      ...candidate,
                      status: newStatus,
                      decision_note: response.decision_note ?? decisionNote,
                      decision_updated_at: response.decision_updated_at ?? candidate.decision_updated_at,
                    });
                  } catch (err) {
                    console.error('Failed to update status:', err);
                  }
                }}
                className="px-4 py-1.5 rounded-full text-sm font-semibold bg-aero-cyan/10 text-aero-cyan border border-aero-cyan/30 cursor-pointer focus:outline-none focus:ring-2 focus:ring-aero-cyan/50 appearance-none pr-8"
              >
                <option value="Registered">Registered</option>
                <option value="Assessment Started">Assessment Started</option>
                <option value="Completed">Completed</option>
                <option value="Under Review">Under Review</option>
                <option value="Interview Scheduled">Interview Scheduled</option>
                <option value="Hired">Hired</option>
                <option value="Rejected">Rejected</option>
              </select>
              {/* Dropdown Arrow */}
              <svg className="w-4 h-4 absolute right-2 top-1/2 -translate-y-1/2 text-aero-cyan pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 bg-aero-surface/80 border border-aero-border-subtle rounded-2xl p-5"
        >
          <div className="flex flex-col lg:flex-row lg:items-start gap-4">
            <div className="flex-1">
              <p className="text-sm font-semibold text-aero-text mb-2">Recruiter Decision Note</p>
              <p className="text-xs text-aero-muted mb-3">
                This optional note is visible to the candidate on their application status page.
              </p>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                rows={3}
                className="w-full rounded-xl bg-aero-bg/60 border border-aero-border-subtle p-3 text-sm text-aero-text focus:outline-none focus:ring-2 focus:ring-aero-cyan/40"
                placeholder="Share a short, respectful explanation for this decision..."
              />
              {candidate.decision_updated_at && (
                <p className="text-xs text-aero-muted mt-2">
                  Last updated: {formatDecisionTimestamp(candidate.decision_updated_at)}
                </p>
              )}
              {decisionError && (
                <p className="text-xs text-aero-red mt-2">{decisionError}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleSaveDecisionNote()}
                disabled={decisionSaving}
                className="px-4 py-2 rounded-lg bg-aero-cyan text-aero-bg text-sm font-semibold hover:bg-aero-cyan/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {decisionSaving ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        </motion.div>

        {candidate.reset_requested && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-aero-orange/10 border border-aero-orange/30 rounded-xl p-4"
          >
            <div>
              <p className="text-sm text-aero-orange font-semibold">Reset Request</p>
              <p className="text-sm text-aero-muted mt-1">
                {candidate.reset_reason || 'No reason provided.'}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {resetActionError && (
                <span className="text-sm text-aero-red">{resetActionError}</span>
              )}
              <button
                onClick={handleApproveReset}
                disabled={resetApproving}
                className="px-4 py-2 bg-aero-cyan text-aero-bg font-semibold rounded-lg hover:bg-aero-cyan/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {resetApproving ? 'Approving...' : 'Approve Reset'}
              </button>
            </div>
          </motion.div>
        )}

        {/* Tabs */}
        <div className="mb-8 flex flex-wrap items-center gap-3">
          <div className="inline-flex bg-aero-surface/80 border border-aero-border-subtle rounded-full p-1">
            <button
              onClick={() => setActiveTab('assessment')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                activeTab === 'assessment'
                  ? 'bg-aero-cyan text-aero-bg'
                  : 'text-aero-muted hover:text-aero-text'
              }`}
            >
              Assessment
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
                activeTab === 'audit'
                  ? 'bg-aero-cyan text-aero-bg'
                  : 'text-aero-muted hover:text-aero-text'
              }`}
            >
              AI Audit
            </button>
          </div>
        </div>

        {activeTab === 'assessment' && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 lg:grid-cols-[1.05fr_1.45fr] gap-6"
          >
            {/* Left Column: Scores + Submissions */}
            <motion.div variants={cardVariants} className="space-y-6">
              {/* Scores Card */}
              <div className="bg-aero-surface rounded-2xl border border-aero-border-subtle p-6">
                <h3 className="text-lg font-semibold text-aero-text mb-6 flex items-center gap-2">
                  <svg className="w-5 h-5 text-aero-cyan" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Assessment Scores
                </h3>

                {/* Score Circles */}
                <div className="flex justify-around mb-6">
                  <CircularProgress
                    value={candidate.technical_score}
                    label="Technical"
                    color="var(--aero-cyan)"
                  />
                  <CircularProgress
                    value={candidate.psychometric_score}
                    label="Behavioral"
                    color="var(--aero-purple)"
                  />
                </div>

                {/* Resume Download */}
                {candidate.has_resume && (
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowResumeModal(true)}
                      className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-aero-cyan text-aero-bg font-semibold rounded-xl hover:bg-aero-cyan/90 transition-colors"
                    >
                      📄 View Resume
                    </button>
                  </div>
                )}
              </div>

              {/* Code Submissions */}
              {codeSubmissions.length > 0 && (
                <div className="bg-aero-surface rounded-2xl border border-aero-border-subtle p-6">
                  <h3 className="text-lg font-semibold text-aero-text mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-aero-indigo" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    Code Submissions
                  </h3>
                  <div className="space-y-2">
                  {codeSubmissions.map((submission, index) => (
                      <motion.div
                        key={submission.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={`flex items-center justify-between p-3 rounded-xl border ${
                          submission.is_passed
                            ? 'bg-aero-green/5 border-aero-green/20'
                            : 'bg-aero-red/5 border-aero-red/20'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            submission.is_passed ? 'bg-aero-green/20' : 'bg-aero-red/20'
                          }`}>
                            {submission.is_passed ? (
                              <svg className="w-4 h-4 text-aero-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-4 h-4 text-aero-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-aero-text">Question {submission.question_id}</p>
                            <p className="text-xs text-aero-muted">
                              {submission.tests_passed}/{submission.tests_total} tests passed
                            </p>
                          </div>
                        </div>
                        {submission.execution_time_ms && (
                          <span className="text-xs font-mono text-aero-dim">
                            {submission.execution_time_ms}ms
                          </span>
                        )}
                      </motion.div>
                    ))}
                  </div>

                  {/* Innovation Trinity: Code Playback for first submission */}
                  {codeSubmissions[0] && (
                    <CodePlayback submission={codeSubmissions[0]} />
                  )}
                </div>
              )}

              {/* Innovation Trinity: Originality & Culture Fit */}
              {(codeSubmissions.length > 0 || chatSubmission) && (
                <div className="space-y-4">
                  <OriginalityChart charBreakdown={originalityBreakdown} />
                  <CultureFitCard submission={chatSubmission} />
                </div>
              )}
            </motion.div>

            {/* Right Column: Session Integrity */}
            <motion.div variants={cardVariants} className="space-y-6">
              <div className="bg-aero-surface rounded-2xl border border-aero-border-subtle p-6 h-full">
                <h3 className="text-lg font-semibold text-aero-text mb-6 flex items-center gap-2">
                  <svg className="w-5 h-5 text-aero-orange" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Session Integrity
                </h3>

                {/* Stats Row */}
                <div className="flex gap-3 mb-6">
                  <StatBox
                    label="Total Events"
                    value={candidate.total_proctoring_events}
                    color="text-aero-text"
                  />
                  <StatBox
                    label="High Severity"
                    value={candidate.high_severity_events}
                    color={candidate.high_severity_events > 0 ? 'text-aero-red' : 'text-aero-green'}
                  />
                  <StatBox
                    label="Integrity"
                    value={candidate.integrity_score}
                    color={
                      candidate.integrity_score >= 80 ? 'text-aero-green' :
                      candidate.integrity_score >= 60 ? 'text-aero-orange' : 'text-aero-red'
                    }
                  />
                </div>

                {/* Chart */}
                {chartData.length > 0 ? (
                  <div className="h-72 lg:h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={chartData}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <XAxis
                          dataKey="time"
                          type="number"
                          domain={[visibleStart, visibleEnd]}
                          ticks={zoomStart !== null && zoomEnd !== null ? visibleTicks : timeTicks}
                          tickFormatter={(value) => formatDuration(value as number)}
                          stroke="var(--aero-muted)"
                          fontSize={11}
                        />
                        <YAxis
                          domain={[0, 4]}
                          ticks={[1, 2, 3]}
                          tickFormatter={(value) => ({ 1: 'LOW', 2: 'MED', 3: 'HIGH' }[value] || '')}
                          stroke="var(--aero-muted)"
                          fontSize={11}
                        />
                        <Tooltip
                          content={renderIntegrityTooltip}
                          cursor={{ stroke: 'var(--aero-border-subtle)', strokeDasharray: '3 3' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="level"
                          stroke="var(--aero-cyan)"
                          strokeWidth={2}
                          dot={{ r: 4, fill: '#38bdf8' }}
                          connectNulls={true}
                          activeDot={{ r: 6, fill: 'var(--aero-cyan)' }}
                        />
                        <Brush
                          dataKey="time"
                          height={20}
                          stroke="var(--aero-cyan)"
                          travellerWidth={10}
                          startIndex={0}
                          endIndex={chartData.length - 1}
                          onChange={(range) => {
                            if (!range || range.startIndex === undefined || range.endIndex === undefined) {
                              setZoomStart(null);
                              setZoomEnd(null);
                              return;
                            }
                            const startPoint = chartData[range.startIndex];
                            const endPoint = chartData[range.endIndex];
                            if (startPoint && endPoint) {
                              setZoomStart(Math.min(startPoint.time, endPoint.time));
                              setZoomEnd(Math.max(startPoint.time, endPoint.time));
                            }
                          }}
                        />
                        {highSeverityPoints.map((point, index) => (
                          <ReferenceDot
                            key={index}
                            x={point.time}
                            y={point.level}
                            r={6}
                            fill="var(--aero-red)"
                            stroke="var(--aero-red)"
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-72 lg:h-80 flex items-center justify-center bg-aero-bg/30 rounded-xl border border-aero-border-subtle">
                    <div className="text-center">
                      <svg className="w-10 h-10 mx-auto text-aero-muted mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                      <p className="text-aero-muted text-sm">No events recorded</p>
                      <p className="text-aero-dim text-xs">Clean session</p>
                    </div>
                  </div>
                )}

                {/* Legend */}
                <div className="flex flex-wrap items-center justify-center gap-4 mt-4 text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-0.5 bg-aero-cyan rounded" />
                    <span className="text-aero-muted">Activity Level</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-aero-red" />
                    <span className="text-aero-muted">High Severity</span>
                  </div>
                  {zoomStart !== null && zoomEnd !== null && (
                    <button
                      onClick={() => {
                        setZoomStart(null);
                        setZoomEnd(null);
                      }}
                      className="text-aero-cyan hover:text-aero-cyan/80 transition-colors"
                    >
                      Reset Zoom
                    </button>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-aero-muted">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-aero-green">LOW</span>
                    <span>Minor anomaly (low risk)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-aero-orange">MED</span>
                    <span>Suspicious pattern (review)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-aero-red">HIGH</span>
                    <span>Serious integrity violation</span>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {activeTab === 'audit' && (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="space-y-6"
          >
            <motion.div variants={cardVariants}>
              <div className="glass-panel p-8">
                <h3 className="text-lg font-semibold text-aero-cyan mb-6 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI Audit Report
                </h3>

                <VerdictBadge
                  verdict={displayVerdict}
                  confidence={candidate.confidence_score}
                />

                <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-aero-border-subtle bg-aero-bg/40 px-3 py-1 text-xs">
                  <span className="text-aero-muted">Resume Consistency</span>
                  {resumeConsistency === 'MISMATCH' ? (
                    <span className="text-aero-red font-semibold">⚠️ Possible Inflation</span>
                  ) : (
                    <span className="text-aero-green font-semibold">✅ Aligned</span>
                  )}
                </div>

                {baselineChecks.length > 0 && (
                  <div className="mb-6 rounded-2xl border border-aero-border-subtle bg-aero-bg/30 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                      <div>
                        <p className="text-sm font-semibold text-aero-text">Role Baseline Checklist</p>
                        <p className="text-xs text-aero-muted mt-1">
                          Benchmarking against {baselineRole}
                        </p>
                      </div>
                      <div className="text-xs text-aero-muted">
                        {baselineMeta?.min_code_score !== undefined && (
                          <span className="mr-3">Min Tech: {baselineMeta.min_code_score}%</span>
                        )}
                        {baselineMeta?.min_integrity !== undefined && (
                          <span>Min Integrity: {baselineMeta.min_integrity}%</span>
                        )}
                      </div>
                    </div>
                    <div className="space-y-3">
                      {baselineChecks.map((check) => {
                        const statusStyle = baselineStatusStyles[check.status] || baselineStatusStyles.unknown;
                        return (
                          <div
                            key={check.key}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl border border-aero-border-subtle bg-aero-surface/70 px-4 py-3"
                          >
                            <div>
                              <p className="text-sm text-aero-text font-semibold">{check.label}</p>
                              {check.detail && (
                                <p className="text-xs text-aero-muted mt-1">{check.detail}</p>
                              )}
                            </div>
                            <span
                              className={`inline-flex items-center justify-center rounded-full border px-3 py-1 text-[11px] font-semibold ${statusStyle.badge}`}
                            >
                              {statusStyle.text}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {baselineMeta?.required_skills && baselineMeta.required_skills.length > 0 && (
                      <p className="text-[11px] text-aero-muted mt-4">
                        Required: {baselineMeta.required_skills.join(', ')}
                        {baselineMeta?.preferred_skills && baselineMeta.preferred_skills.length > 0 && (
                          <>
                            {' '}• Preferred: {baselineMeta.preferred_skills.join(', ')}
                          </>
                        )}
                      </p>
                    )}
                  </div>
                )}

                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-aero-text mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-aero-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Key Strengths
                  </h4>
                  <div className="space-y-2">
                    {mergedStrengths.map((strength, index) => (
                      <AuditItem key={index} item={strength} type="strength" index={index} />
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <h4 className="text-sm font-semibold text-aero-text mb-3 flex items-center gap-2">
                    <svg className="w-4 h-4 text-aero-red" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    Risk Factors
                  </h4>
                  <div className="space-y-2">
                    {parsedRationale.risks.length > 0 ? (
                      parsedRationale.risks.map((risk, index) => (
                        <AuditItem key={index} item={risk} type="risk" index={index} />
                      ))
                    ) : (
                      <p className="text-sm text-aero-green/80 p-3 bg-aero-green/5 rounded-lg border border-aero-green/20">
                        No significant risk factors identified
                      </p>
                    )}
                  </div>
                </div>

                <div className="p-4 bg-aero-bg/30 rounded-xl border border-aero-border-subtle">
                  <p className="text-xs font-semibold text-aero-muted uppercase tracking-wider mb-2">Summary</p>
                  <p className="text-sm text-aero-text leading-relaxed">
                    {parsedRationale.summary}
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Resume Viewer Modal */}
        {showResumeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md px-4">
            <div className="bg-aero-surface border border-aero-border rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden shadow-2xl">
              <div className="flex items-center justify-between px-6 py-4 border-b border-aero-border-subtle">
                <div>
                  <h3 className="text-lg font-semibold text-white">Resume Viewer</h3>
                  <p className="text-xs text-aero-muted">Parsed insights and raw content</p>
                </div>
                <button
                  onClick={() => setShowResumeModal(false)}
                  className="text-aero-muted hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="p-6 overflow-y-auto max-h-[75vh] space-y-6">
                {/* Skills */}
                <div>
                  <h4 className="text-sm font-semibold text-aero-muted mb-3 uppercase tracking-wider">
                    Skills
                  </h4>
                  {resumeSkills.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {resumeSkills.map((skill, index) => (
                        <span
                          key={`${skill}-${index}`}
                          className="px-3 py-1.5 rounded-full text-sm font-medium bg-aero-cyan/20 text-aero-cyan border border-aero-cyan/30"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-aero-muted">No skills parsed.</p>
                  )}
                </div>

                {/* Experience Timeline */}
                <div>
                  <h4 className="text-sm font-semibold text-aero-muted mb-3 uppercase tracking-wider">
                    Experience
                  </h4>
                  {resumeExperience ? (
                    <div className="border-l border-aero-border pl-4 space-y-3">
                      {resumeExperience.split('\n').filter(Boolean).map((line, index) => (
                        <div key={`${line}-${index}`} className="text-sm text-aero-text leading-relaxed">
                          <span className="inline-block w-2 h-2 rounded-full bg-aero-cyan mr-3 align-middle" />
                          {line}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-aero-muted">No experience section found.</p>
                  )}
                </div>

                {/* Raw Resume */}
                <div>
                  <h4 className="text-sm font-semibold text-aero-muted mb-3 uppercase tracking-wider">
                    Raw Resume Text
                  </h4>
                  <div className="bg-aero-bg/60 border border-aero-border rounded-xl p-4 max-h-64 overflow-y-auto">
                    <pre className="text-xs text-aero-text whitespace-pre-wrap leading-relaxed">
                      {resumeRawText || 'No raw text available.'}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
