import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

// API Base URL - FastAPI backend (env-driven for deployment)
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || (
  import.meta.env.PROD
    ? 'https://aerohire-backend.onrender.com/api/v1'
    : 'http://localhost:8000/api/v1'
);
const ADMIN_SECRET = import.meta.env.VITE_ADMIN_SECRET || 'aerohire-internal-ops-2026';

// LocalStorage key for JWT token
const TOKEN_KEY = 'aerohire_token';

/**
 * Axios instance configured for AeroHire API
 */
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000, // 30 second timeout
});

/**
 * Request interceptor - Adds JWT token to requests
 */
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem(TOKEN_KEY);

    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

/**
 * Response interceptor - Handles common errors
 */
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error: AxiosError) => {
    // Handle 401 Unauthorized - Token expired or invalid
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem(TOKEN_KEY);

      // Only redirect if not already on login page
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // Handle 403 Forbidden
    if (error.response?.status === 403) {
      console.error('Access forbidden:', error.response.data);
    }

    // Handle 500 Server Error
    if (error.response?.status === 500) {
      console.error('Server error:', error.response.data);
    }

    return Promise.reject(error);
  }
);

// ============================================
// Auth Token Helpers
// ============================================

/**
 * Store JWT token in localStorage
 */
export const setToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

/**
 * Get JWT token from localStorage
 */
export const getToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

/**
 * Remove JWT token from localStorage
 */
export const removeToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
};

/**
 * Check if user is authenticated (has token)
 */
export const isAuthenticated = (): boolean => {
  return !!getToken();
};

// ============================================
// API Response Types
// ============================================

export interface ApiError {
  detail: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: number;
  email: string;
  full_name: string;
  role: 'recruiter' | 'candidate';
  candidate_id: number | null;  // Candidate profile ID (if role is candidate)
}

export interface RegisterRequest {
  email: string;
  password: string;
  full_name: string;
  role: 'recruiter' | 'candidate';
}

export interface CandidateDetail {
  id: number;
  user_id: number;
  email: string;
  full_name: string;
  status: string;
  reset_requested: boolean;
  reset_reason: string | null;
  decision_note?: string | null;
  decision_updated_at?: string | null;
  recommended_role_tags?: string[] | null;
  resume_parsed_data: Record<string, unknown> | string | null;
  has_resume: boolean;
  resume_text_raw: string | null;
  technical_score: number;
  psychometric_score: number;
  ai_rationale: string | null;
  hiring_recommendation: 'HIRE' | 'NO_HIRE' | 'REVIEW' | null;
  confidence_score: number | null;
  resume_consistency?: 'ALIGNED' | 'MISMATCH';
  baseline_summary?: {
    role?: string;
    required_skills?: string[];
    preferred_skills?: string[];
    min_code_score?: number;
    min_integrity?: number;
    experience_level?: string;
    checks?: Array<{
      key: string;
      label: string;
      status: 'met' | 'partial' | 'missing' | 'unknown';
      detail?: string;
      evidence?: string;
    }>;
  };
  total_proctoring_events: number;
  high_severity_events: number;
  integrity_score: number;
  submissions: CodeSubmission[];
  recent_logs: ProctoringLog[];
}

export interface CodeHistoryEntry {
  timestamp: number;  // epoch milliseconds
  code: string;
}

export interface CharBreakdown {
  typed: number;
  pasted: number;
}

export interface CodeSubmission {
  id: number;
  question_id: number;
  is_passed: boolean;
  tests_passed: number;
  tests_total: number;
  execution_time_ms: number | null;
  // Innovation Trinity fields
  code_history?: CodeHistoryEntry[];
  char_breakdown?: CharBreakdown;
  chat_response?: string | null;
  teamwork_score?: number | null;
  submitted_code?: string | null;
}

export interface ProctoringLog {
  id: number;
  event_type: string;
  severity: 'LOW' | 'MED' | 'MEDIUM' | 'HIGH';
  timestamp: string;
  has_evidence: boolean;
}

export interface CandidateListItem {
  id: number;
  email: string;
  full_name: string;
  status: string;
  technical_score: number;
  psychometric_score: number;
  hiring_recommendation: 'HIRE' | 'NO_HIRE' | 'REVIEW' | null;
  total_submissions: number;
  total_flags: number;
  skill_match_percent?: number | null;
  matched_skills?: string[] | null;
  missing_skills?: string[] | null;
  candidate_skills?: string[] | null;
  overall_rank_score?: number | null;
  overall_rank_position?: number | null;
  skill_rank_position?: number | null;
  role_tags?: string[] | null;
  last_action?: string | null;
  last_action_at?: string | null;
}

export interface CandidateListResponse {
  total: number;
  limit: number;
  offset: number;
  candidates: CandidateListItem[];
  available_skills?: string[];
  available_role_tags?: string[];
  skill_ranking_for?: string | null;
}

export interface RankingListItem {
  candidate_id: number;
  email: string;
  full_name: string;
  status: string;
  hiring_recommendation: 'HIRE' | 'NO_HIRE' | 'REVIEW' | null;
  technical_score: number;
  psychometric_score: number;
  integrity_score: number;
  teamwork_score: number;
  overall_rank_score: number;
  overall_rank_position: number;
  role_rank_position?: number | null;
  role_tags: string[];
  candidate_skills: string[];
}

export interface RankingsResponse {
  total: number;
  limit: number;
  offset: number;
  ranking: RankingListItem[];
  role_ranking_for?: string | null;
  available_role_tags?: string[];
  available_skills?: string[];
  generated_at?: string;
}

export interface AdminCandidate {
  candidate_id: number;
  user_id: number;
  full_name: string;
  email: string;
  status: string;
  has_resume: boolean;
}

export interface AdminRecruiter {
  user_id: number;
  full_name: string;
  email: string;
}

export interface CodeSubmitRequest {
  code: string;
  question_id: number;
  candidate_id: number;
  test_cases: TestCase[];
  // Innovation Trinity fields
  code_history?: CodeHistoryEntry[];
  char_breakdown?: CharBreakdown;
  chat_response?: string | null;
}

export interface TestCase {
  input: unknown;
  expected: unknown;
  function?: string;
  unpack?: boolean;
}

export interface CodeSubmitResponse {
  submission_id: number;
  status: 'success' | 'partial' | 'error';
  tests_passed: number;
  tests_total: number;
  execution_time_ms: number;
  results: TestResult[];
  is_passed: boolean;
  mock_mode: boolean;
  error: string | null;
}

export interface TestResult {
  test: number;
  status: 'passed' | 'failed' | 'error';
  expected?: unknown;
  got?: unknown;
  message?: string;
}

export interface TelemetryLogRequest {
  candidate_id: number;
  event_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  evidence_snapshot?: string;
}

export interface CompleteAssessmentResponse {
  candidate_id: number;
  status: string;
  technical_score: number;
  psychometric_score: number;
  integrity_flags: number;
  hiring_recommendation: 'HIRE' | 'NO_HIRE' | 'REVIEW';
  confidence_score: number;
  ai_rationale: string;
  message: string;
}

// ============================================
// API Endpoints
// ============================================

export const authApi = {
  /**
   * Login with email and password
   */
  login: async (email: string, password: string): Promise<LoginResponse> => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await api.post<LoginResponse>('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    // Store token on successful login
    if (response.data.access_token) {
      setToken(response.data.access_token);
    }

    return response.data;
  },

  /**
   * Register a new user
   */
  register: async (data: RegisterRequest): Promise<UserResponse> => {
    const response = await api.post<UserResponse>('/auth/register', data);
    return response.data;
  },

  /**
   * Get current user profile
   */
  me: async (): Promise<UserResponse> => {
    const response = await api.get<UserResponse>('/auth/me');
    return response.data;
  },

  /**
   * Logout - Clear token
   */
  logout: (): void => {
    removeToken();
    window.location.href = '/login';
  },
};

export const assessmentApi = {
  /**
   * Submit code for execution
   */
  submit: async (data: CodeSubmitRequest): Promise<CodeSubmitResponse> => {
    const response = await api.post<CodeSubmitResponse>('/assessment/submit', data);
    return response.data;
  },

  /**
   * Get available questions
   */
  getQuestions: async () => {
    const response = await api.get('/assessment/questions');
    return response.data;
  },

  /**
   * Save teammate chat response
   */
  submitChatResponse: async (candidateId: number, questionId: number, chatResponse: string) => {
    const response = await api.post('/assessment/chat-response', {
      candidate_id: candidateId,
      question_id: questionId,
      chat_response: chatResponse,
    });
    return response.data;
  },

  /**
   * Get specific question with test cases
   */
  getQuestion: async (questionId: number) => {
    const response = await api.get(`/assessment/questions/${questionId}`);
    return response.data;
  },

  /**
   * Check sandbox status
   */
  getStatus: async () => {
    const response = await api.get('/assessment/status');
    return response.data;
  },

  /**
   * Complete assessment and generate AI recommendation
   */
  complete: async (candidateId: number, behavioralScore?: number): Promise<CompleteAssessmentResponse> => {
    const response = await api.post<CompleteAssessmentResponse>('/assessment/complete', {
      candidate_id: candidateId,
      behavioral_score: behavioralScore ?? 0,
    });
    return response.data;
  },
};

export const telemetryApi = {
  /**
   * Log a proctoring event
   */
  log: async (data: TelemetryLogRequest) => {
    const response = await api.post('/telemetry/log', data);
    return response.data;
  },

  /**
   * Get candidate telemetry logs
   */
  getLogs: async (candidateId: number) => {
    const response = await api.get(`/telemetry/candidate/${candidateId}/logs`);
    return response.data;
  },

  /**
   * Get candidate telemetry summary
   */
  getSummary: async (candidateId: number) => {
    const response = await api.get(`/telemetry/candidate/${candidateId}/summary`);
    return response.data;
  },
};

export const dashboardApi = {
  /**
   * Get full candidate detail
   */
  getCandidate: async (candidateId: number): Promise<CandidateDetail> => {
    const response = await api.get<CandidateDetail>(`/dashboard/candidate/${candidateId}`);
    return response.data;
  },

  /**
   * List all candidates
   */
  listCandidates: async (params?: {
    status?: string;
    recommendation?: string;
    skills?: string;
    match_mode?: 'any' | 'all';
    min_skill_match?: number;
  }): Promise<CandidateListResponse> => {
    const response = await api.get<CandidateListResponse>('/dashboard/candidates', { params });
    return response.data;
  },

  /**
   * Get candidate rankings (global + role-tag focused)
   */
  getRankings: async (params?: {
    role_tag?: string;
    skills?: string;
    limit?: number;
    offset?: number;
  }): Promise<RankingsResponse> => {
    const response = await api.get<RankingsResponse>('/dashboard/rankings', { params });
    return response.data;
  },

  /**
   * Get dashboard stats
   */
  getStats: async () => {
    const response = await api.get('/dashboard/stats');
    return response.data;
  },

  /**
   * Update candidate status (Recruiter only)
   */
  updateCandidateStatus: async (candidateId: number, status: string, decisionNote?: string | null) => {
    const response = await api.put(`/dashboard/candidate/${candidateId}/status`, {
      status,
      decision_note: decisionNote ?? undefined,
    });
    return response.data;
  },

  /**
   * Quick recruiter action on candidate (Accept/Reject/Review)
   */
  quickAction: async (candidateId: number, action: 'ACCEPT' | 'REJECT' | 'REVIEW', note?: string | null) => {
    const response = await api.post(`/dashboard/candidate/${candidateId}/action`, {
      action,
      note: note ?? undefined,
    });
    return response.data;
  },

  /**
   * Get current candidate's status (Candidate only)
   */
  getMyStatus: async (): Promise<{
    status: string;
    candidate_id: number;
    has_resume: boolean;
    decision_note?: string | null;
    decision_updated_at?: string | null;
    baseline_gate?: {
      allowed: boolean;
      reason?: string;
      blocking?: Array<{
        label: string;
        detail: string;
        evidence?: string;
      }>;
    } | null;
  }> => {
    const response = await api.get<{
      status: string;
      candidate_id: number;
      has_resume: boolean;
      decision_note?: string | null;
      decision_updated_at?: string | null;
      baseline_gate?: {
        allowed: boolean;
        reason?: string;
        blocking?: Array<{
          label: string;
          detail: string;
          evidence?: string;
        }>;
      } | null;
    }>('/dashboard/candidate/me/status');
    return response.data;
  },

  /**
   * Request assessment reset (Candidate only)
   */
  requestAssessmentReset: async (reason: string) => {
    const response = await api.post('/dashboard/candidate/request-reset', { reason });
    return response.data;
  },

  /**
   * Approve assessment reset (Recruiter only)
   */
  approveAssessmentReset: async (candidateId: number) => {
    const response = await api.post(`/dashboard/candidate/${candidateId}/approve-reset`);
    return response.data;
  },
};

export const adminApi = {
  listCandidates: async (): Promise<{ total: number; candidates: AdminCandidate[] }> => {
    const response = await api.get<{ total: number; candidates: AdminCandidate[] }>(
      `/admin/${ADMIN_SECRET}/candidates`
    );
    return response.data;
  },
  listRecruiters: async (): Promise<{ total: number; recruiters: AdminRecruiter[] }> => {
    const response = await api.get<{ total: number; recruiters: AdminRecruiter[] }>(
      `/admin/${ADMIN_SECRET}/recruiters`
    );
    return response.data;
  },
  deleteCandidate: async (candidateId: number) => {
    const response = await api.delete(`/admin/${ADMIN_SECRET}/candidates/${candidateId}`);
    return response.data;
  },
  deleteRecruiter: async (userId: number) => {
    const response = await api.delete(`/admin/${ADMIN_SECRET}/recruiters/${userId}`);
    return response.data;
  },
  deleteAllCandidates: async () => {
    const response = await api.delete(`/admin/${ADMIN_SECRET}/candidates`);
    return response.data;
  },
  deleteAllRecruiters: async () => {
    const response = await api.delete(`/admin/${ADMIN_SECRET}/recruiters`);
    return response.data;
  },
};

export const resumeApi = {
  /**
   * Upload and parse resume PDF
   */
  upload: async (file: File, candidateId?: number) => {
    const formData = new FormData();
    formData.append('file', file);
    if (candidateId) {
      formData.append('candidate_id', candidateId.toString());
    }

    const response = await api.post('/resume/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },
};

// Export the axios instance for custom requests
export default api;
