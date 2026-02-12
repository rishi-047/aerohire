import { useState, useCallback, useEffect, type DragEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { resumeApi, authApi, dashboardApi, type UserResponse } from '../lib/api';

/**
 * Parsed resume data structure from backend
 */
interface ParsedResumeData {
  skills: string[];
  experience: string;
  education: string;
  summary: string;
  name?: string;
  email?: string;
}

/**
 * Upload state machine
 */
type UploadState = 'idle' | 'dragging' | 'uploading' | 'success' | 'error';

/**
 * Candidate Dashboard - Resume Upload & Profile View
 *
 * F1 Cockpit Theme with:
 * - Drag-and-drop resume upload zone
 * - Pulsing progress bar during upload
 * - Skill tags display after parsing
 * - Start Assessment CTA
 */
export default function CandidateDashboard() {
  const navigate = useNavigate();

  // User state
  const [user, setUser] = useState<UserResponse | null>(null);

  // Upload state machine
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedResumeData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);

  // Candidate status for ATS tracking
  const [candidateStatus, setCandidateStatus] = useState<string>('Registered');
  const [candidateId, setCandidateId] = useState<number | null>(null);
  const [baselineGate, setBaselineGate] = useState<{
    allowed: boolean;
    reason?: string;
    blocking?: Array<{ label: string; detail: string; evidence?: string }>;
  } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetReason, setResetReason] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');

  // Fetch user and status on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authApi.me();
        setUser(userData);
      } catch (err) {
        console.error('Failed to fetch user:', err);
      }
    };
    fetchUser();
  }, []);

  // Fetch candidate status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const { status, candidate_id, baseline_gate } = await dashboardApi.getMyStatus();
        setCandidateStatus(status);
        setCandidateId(candidate_id);
        setBaselineGate(baseline_gate ?? null);
      } catch (err) {
        // Default to Registered if not found (new candidate)
        console.log('Status fetch skipped - likely new candidate');
      }
    };
    fetchStatus();
  }, []);

  /**
   * Handle file selection (drag-drop or click)
   */
  const handleFile = useCallback(async (selectedFile: File) => {
    // Validate file type
    if (!selectedFile.type.includes('pdf')) {
      setErrorMessage('Please upload a PDF file');
      setUploadState('error');
      return;
    }

    // Validate file size (max 10MB)
    if (selectedFile.size > 10 * 1024 * 1024) {
      setErrorMessage('File size must be less than 10MB');
      setUploadState('error');
      return;
    }

    setFile(selectedFile);
    setUploadState('uploading');
    setErrorMessage('');

    // Simulate progress for UX
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => Math.min(prev + 10, 90));
    }, 200);

    try {
      const response = await resumeApi.upload(selectedFile, candidateId ?? undefined);

      clearInterval(progressInterval);
      setUploadProgress(100);

      // Backend returns parsed data
      const rawText = typeof response.raw_text === 'string' ? response.raw_text : '';
      const summarySnippet = rawText ? `${rawText.slice(0, 240)}${rawText.length > 240 ? '...' : ''}` : '';

      setParsedData({
        skills: response.extracted_skills || [],
        experience: response.experience_zone || '',
        education: response.education_zone || '',
        summary: summarySnippet,
        name: response.name,
        email: response.email,
      });

      setUploadState('success');
      try {
        const { status, candidate_id, baseline_gate } = await dashboardApi.getMyStatus();
        setCandidateStatus(status);
        setCandidateId(candidate_id);
        setBaselineGate(baseline_gate ?? null);
      } catch (err) {
        console.error('Failed to refresh status after resume upload:', err);
      }
    } catch (err) {
      clearInterval(progressInterval);
      console.error('Upload failed:', err);
      setErrorMessage('Failed to parse resume. Please try again.');
      setUploadState('error');
    }
  }, []);

  /**
   * Drag event handlers
   */
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState('dragging');
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setUploadState('idle');
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFile(droppedFile);
    }
  }, [handleFile]);

  /**
   * Click-to-upload handler
   */
  const handleInputChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFile(selectedFile);
    }
  }, [handleFile]);

  /**
   * Reset to try again
   */
  const handleReset = useCallback(() => {
    setFile(null);
    setParsedData(null);
    setUploadState('idle');
    setUploadProgress(0);
    setErrorMessage('');
  }, []);

  /**
   * Navigate to assessment
   */
  const handleStartAssessment = useCallback(() => {
    navigate('/assessment/start');
  }, [navigate]);

  const normalizedStatus = candidateStatus.replace(/_/g, ' ');
  const baselineAllowed = baselineGate?.allowed !== false;
  const canStartAssessment =
    baselineAllowed && (normalizedStatus === 'Registered' || normalizedStatus === 'Assessment Started');

  const handleRequestReset = useCallback(async () => {
    if (!resetReason.trim()) {
      setResetError('Please share a brief reason so we can review your request.');
      return;
    }

    setResetSubmitting(true);
    setResetError('');

    try {
      await dashboardApi.requestAssessmentReset(resetReason.trim());
      setResetSuccess('Reset request submitted. A recruiter will review it shortly.');
      setShowResetModal(false);
      setResetReason('');
    } catch (err) {
      console.error('Failed to request assessment reset:', err);
      setResetError('Unable to submit reset request. Please try again.');
    } finally {
      setResetSubmitting(false);
    }
  }, [resetReason]);

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-h1 text-white mb-2">
            Welcome{user?.full_name ? `, ${user.full_name.split(' ')[0]}` : ''}
          </h1>
          <p className="text-aero-muted">
            Upload your resume to begin the assessment process
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-aero-surface rounded-xl border border-aero-border p-8">

          {/* Step 1: Upload Zone (shown when idle, dragging, uploading, or error) */}
          {(uploadState === 'idle' || uploadState === 'dragging' || uploadState === 'uploading' || uploadState === 'error') && (
            <div className="space-y-6">
              {/* Section Header */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-aero-cyan/20 flex items-center justify-center">
                  <span className="text-aero-cyan font-semibold text-sm">1</span>
                </div>
                <h2 className="text-lg font-semibold text-white">Upload Resume</h2>
              </div>

              {/* Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  relative border-2 border-dashed rounded-xl p-12
                  transition-all duration-200 cursor-pointer
                  ${uploadState === 'dragging'
                    ? 'border-aero-cyan bg-aero-cyan/5'
                    : uploadState === 'error'
                    ? 'border-aero-red/50 bg-aero-red/5'
                    : 'border-aero-border hover:border-aero-cyan/50 hover:bg-aero-cyan/5'
                  }
                `}
              >
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleInputChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  disabled={uploadState === 'uploading'}
                />

                {uploadState === 'uploading' ? (
                  /* Uploading State */
                  <div className="text-center">
                    <div className="mb-4">
                      <svg className="w-12 h-12 mx-auto text-aero-cyan animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>
                    <p className="text-aero-muted mb-4">Parsing resume...</p>

                    {/* Progress Bar */}
                    <div className="w-full max-w-xs mx-auto h-2 bg-aero-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-aero-cyan rounded-full transition-all duration-200 animate-pulse"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                    <p className="text-caption text-aero-dim mt-2">{file?.name}</p>
                  </div>
                ) : (
                  /* Idle/Dragging State */
                  <div className="text-center">
                    <div className="mb-4">
                      <svg className={`w-12 h-12 mx-auto transition-colors ${uploadState === 'dragging' ? 'text-aero-cyan' : 'text-aero-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <p className="text-white font-medium mb-1">
                      {uploadState === 'dragging' ? 'Drop your resume here' : 'Drag and drop your resume'}
                    </p>
                    <p className="text-aero-muted text-sm">
                      or <span className="text-aero-cyan">click to browse</span>
                    </p>
                    <p className="text-caption text-aero-dim mt-4">
                      Supported format: PDF (max 10MB)
                    </p>
                  </div>
                )}
              </div>

              {/* Error Message */}
              {uploadState === 'error' && errorMessage && (
                <div className="flex items-center gap-3 p-4 rounded-lg bg-aero-red/10 border border-aero-red/30">
                  <svg className="w-5 h-5 text-aero-red flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-sm text-aero-red">{errorMessage}</p>
                  <button
                    onClick={handleReset}
                    className="ml-auto text-aero-red hover:text-white transition-colors text-sm"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Parsed Data Display (shown on success) */}
          {uploadState === 'success' && parsedData && (
            <div className="space-y-8">
              {/* Success Header */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-aero-green/20 flex items-center justify-center">
                  <svg className="w-5 h-5 text-aero-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Resume Parsed</h2>
                  <p className="text-caption text-aero-muted">{file?.name}</p>
                </div>
                <button
                  onClick={handleReset}
                  className="ml-auto text-sm text-aero-muted hover:text-aero-cyan transition-colors"
                >
                  Upload different
                </button>
              </div>

              {/* Extracted Skills */}
              {parsedData.skills.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-aero-muted mb-3 uppercase tracking-wider">
                    Extracted Skills
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {parsedData.skills.map((skill, index) => (
                      <span
                        key={index}
                        className="px-3 py-1.5 rounded-full text-sm font-medium bg-aero-cyan/20 text-aero-cyan border border-aero-cyan/30"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Experience Summary */}
              {parsedData.experience && (
                <div>
                  <h3 className="text-sm font-medium text-aero-muted mb-3 uppercase tracking-wider">
                    Experience
                  </h3>
                  <p className="text-white text-sm leading-relaxed">
                    {parsedData.experience}
                  </p>
                </div>
              )}

              {/* Summary */}
              {parsedData.summary && (
                <div>
                  <h3 className="text-sm font-medium text-aero-muted mb-3 uppercase tracking-wider">
                    Profile Summary
                  </h3>
                  <p className="text-aero-muted text-sm leading-relaxed">
                    {parsedData.summary}
                  </p>
                </div>
              )}

              {/* Divider */}
              <div className="border-t border-aero-border" />

              {/* Start Assessment CTA */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-white font-medium">Ready for Assessment</h3>
                  <p className="text-caption text-aero-muted">
                    {baselineAllowed
                      ? canStartAssessment
                      ? 'Complete a technical challenge to showcase your skills'
                      : 'Assessment is locked. You can request a reset if you had technical issues.'
                      : 'Assessment access is blocked until baseline requirements are met.'}
                  </p>
                </div>
                {baselineAllowed && canStartAssessment ? (
                  <button
                    onClick={handleStartAssessment}
                    className="px-6 py-3 bg-aero-cyan text-aero-bg font-semibold rounded-lg hover:bg-aero-cyan/90 transition-colors flex items-center gap-2"
                  >
                    Start Assessment
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </button>
                ) : baselineAllowed ? (
                  <button
                    onClick={() => {
                      setShowResetModal(true);
                      setResetError('');
                      setResetSuccess('');
                    }}
                    className="px-6 py-3 bg-aero-surface text-aero-cyan font-semibold rounded-lg border border-aero-cyan/40 hover:border-aero-cyan hover:bg-aero-cyan/10 transition-colors"
                  >
                    Request Assessment Reset
                  </button>
                ) : (
                  <button
                    className="px-6 py-3 bg-aero-surface text-aero-muted font-semibold rounded-lg border border-aero-border cursor-not-allowed"
                    disabled
                  >
                    Assessment Locked
                  </button>
                )}
              </div>
              {baselineGate?.allowed === false && baselineGate.blocking?.length ? (
                <div className="mt-4 rounded-lg border border-aero-red/30 bg-aero-red/10 p-4 text-sm text-aero-red">
                  <div className="font-semibold mb-2">Baseline requirements not met</div>
                  {baselineGate.blocking.map((item, idx) => (
                    <div key={`${item.label}-${idx}`}>
                      - {item.label}: {item.detail}
                    </div>
                  ))}
                </div>
              ) : null}
              {resetSuccess && (
                <div className="mt-4 p-4 rounded-lg bg-aero-green/10 border border-aero-green/30 text-sm text-aero-green">
                  {resetSuccess}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Request Reset Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-aero-surface border border-aero-border rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-white mb-2">
              Request Assessment Reset
            </h3>
            <p className="text-sm text-aero-muted mb-4">
              Tell us what went wrong so the team can review your request.
            </p>
            <textarea
              value={resetReason}
              onChange={(e) => setResetReason(e.target.value)}
              placeholder="Briefly describe the technical issue you encountered..."
              className="w-full h-32 p-3 bg-aero-bg border border-aero-border rounded-lg text-aero-text text-sm resize-none focus:outline-none focus:ring-2 focus:ring-aero-cyan/40"
            />
            {resetError && (
              <div className="mt-3 text-sm text-aero-red">{resetError}</div>
            )}
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setShowResetModal(false);
                  setResetReason('');
                  setResetError('');
                }}
                className="px-4 py-2 text-aero-muted hover:text-white transition-colors"
                disabled={resetSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleRequestReset}
                disabled={resetSubmitting}
                className="px-4 py-2 bg-aero-cyan text-aero-bg font-semibold rounded-lg hover:bg-aero-cyan/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {resetSubmitting ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
