import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

// Page components
import Login from './pages/Login';
import Register from './pages/Register';
import CandidateDashboard from './pages/CandidateDashboard';
import ApplicationStatus from './pages/ApplicationStatus';
import Assessment from './pages/Assessment';
import RecruiterDashboard from './pages/RecruiterDashboard';
import RecruiterRankings from './pages/RecruiterRankings';
import CandidateDetail from './pages/CandidateDetail';
import AdminDashboard from './pages/AdminDashboard';

// Layout and Auth components
import Layout from './components/Layout';
import RequireAuth from './components/RequireAuth';

/**
 * 404 Not Found Page
 */
const NotFoundPage = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-display text-aero-red mb-4">404</h1>
      <p className="text-aero-muted mb-4">Page not found</p>
      <a href="/login" className="btn-primary">
        Go to Login
      </a>
    </div>
  </div>
);

/**
 * Protected Route Wrapper - Combines RequireAuth with Layout
 */
interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: ('candidate' | 'recruiter')[];
}

const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => (
  <RequireAuth allowedRoles={allowedRoles}>
    <Layout>{children}</Layout>
  </RequireAuth>
);

/**
 * Main App Component
 *
 * Route Structure:
 * - Public routes: /login, /register
 * - Protected candidate routes: /candidate/*
 * - Protected recruiter routes: /recruiter/*
 * - Protected assessment routes: /assessment/*
 */
function App() {
  return (
    <Router>
      <Routes>
        {/* Redirect root to login */}
        <Route path="/" element={<Navigate to="/login" replace />} />

        {/* Public Auth Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Protected Candidate Routes */}
        <Route
          path="/candidate/dashboard"
          element={
            <ProtectedRoute allowedRoles={['candidate']}>
              <CandidateDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/candidate/status"
          element={
            <ProtectedRoute allowedRoles={['candidate']}>
              <ApplicationStatus />
            </ProtectedRoute>
          }
        />

        {/* Protected Recruiter Routes */}
        <Route
          path="/recruiter/dashboard"
          element={
            <ProtectedRoute allowedRoles={['recruiter']}>
              <RecruiterDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recruiter/candidate/:id"
          element={
            <ProtectedRoute allowedRoles={['recruiter']}>
              <CandidateDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/recruiter/rankings"
          element={
            <ProtectedRoute allowedRoles={['recruiter']}>
              <RecruiterRankings />
            </ProtectedRoute>
          }
        />

        {/* Protected Assessment Routes (Candidates only) - No Layout wrapper for focused IDE experience */}
        <Route
          path="/assessment/start"
          element={
            <RequireAuth allowedRoles={['candidate']}>
              <Assessment />
            </RequireAuth>
          }
        />
        <Route
          path="/assessment/:id"
          element={
            <RequireAuth allowedRoles={['candidate']}>
              <Assessment />
            </RequireAuth>
          }
        />

        {/* Secret Admin Route */}
        <Route path="/admin/aerohire-internal-ops-2026" element={<AdminDashboard />} />

        {/* 404 Fallback */}
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Router>
  );
}

export default App;
