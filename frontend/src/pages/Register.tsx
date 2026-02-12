import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../lib/api';

/**
 * Register Page Component
 *
 * Design: F1 Cockpit Theme - Centered card on dark background
 * Allows new users to create an account as either Candidate or Recruiter
 */
export default function Register() {
  const navigate = useNavigate();

  // Form state
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<'candidate' | 'recruiter'>('candidate');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Handle form submission
   * 1. Validate inputs
   * 2. Register user
   * 3. Auto-login and navigate to dashboard
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    // Validate password length
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      // Register the user
      await authApi.register({
        full_name: fullName,
        email,
        password,
        role,
      });

      // Auto-login after registration
      await authApi.login(email, password);

      // Navigate based on role
      if (role === 'candidate') {
        navigate('/candidate/dashboard');
      } else {
        navigate('/recruiter/dashboard');
      }
    } catch (err: unknown) {
      console.error('Registration failed:', err);
      // Check for specific error messages
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: { detail?: string } } };
        if (axiosError.response?.data?.detail) {
          setError(axiosError.response.data.detail);
        } else {
          setError('Registration failed. Email may already be in use.');
        }
      } else {
        setError('Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Register Card */}
      <div className="card-elevated w-full max-w-md">
        {/* Logo & Tagline */}
        <div className="text-center mb-8">
          <h1 className="text-display text-aero-cyan tracking-wider mb-2">
            AEROHIRE
          </h1>
          <p className="text-small text-aero-muted">
            Create your account
          </p>
        </div>

        {/* Register Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Full Name Field */}
          <div>
            <label htmlFor="fullName" className="block text-small text-aero-muted mb-2">
              Full Name
            </label>
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
              placeholder="Enter your full name"
              required
              disabled={loading}
            />
          </div>

          {/* Email Field */}
          <div>
            <label htmlFor="email" className="block text-small text-aero-muted mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="Enter your email"
              required
              disabled={loading}
            />
          </div>

          {/* Password Field */}
          <div>
            <label htmlFor="password" className="block text-small text-aero-muted mb-2">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="Create a password"
              required
              disabled={loading}
              minLength={6}
            />
          </div>

          {/* Confirm Password Field */}
          <div>
            <label htmlFor="confirmPassword" className="block text-small text-aero-muted mb-2">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input"
              placeholder="Confirm your password"
              required
              disabled={loading}
            />
          </div>

          {/* Role Selection */}
          <div>
            <label className="block text-small text-aero-muted mb-3">
              I am a...
            </label>
            <div className="grid grid-cols-2 gap-3">
              {/* Candidate Option */}
              <button
                type="button"
                onClick={() => setRole('candidate')}
                disabled={loading}
                className={`
                  p-4 rounded-lg border-2 transition-all duration-200
                  flex flex-col items-center gap-2
                  ${role === 'candidate'
                    ? 'border-aero-cyan bg-aero-cyan/10'
                    : 'border-aero-border hover:border-aero-cyan/50 bg-transparent'
                  }
                `}
              >
                {/* User Icon */}
                <svg
                  className={`w-6 h-6 ${role === 'candidate' ? 'text-aero-cyan' : 'text-aero-muted'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                  />
                </svg>
                <span className={`text-sm font-medium ${role === 'candidate' ? 'text-aero-cyan' : 'text-aero-muted'}`}>
                  Candidate
                </span>
                <span className="text-caption text-aero-dim">
                  Take assessments
                </span>
              </button>

              {/* Recruiter Option */}
              <button
                type="button"
                onClick={() => setRole('recruiter')}
                disabled={loading}
                className={`
                  p-4 rounded-lg border-2 transition-all duration-200
                  flex flex-col items-center gap-2
                  ${role === 'recruiter'
                    ? 'border-aero-cyan bg-aero-cyan/10'
                    : 'border-aero-border hover:border-aero-cyan/50 bg-transparent'
                  }
                `}
              >
                {/* Briefcase Icon */}
                <svg
                  className={`w-6 h-6 ${role === 'recruiter' ? 'text-aero-cyan' : 'text-aero-muted'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                <span className={`text-sm font-medium ${role === 'recruiter' ? 'text-aero-cyan' : 'text-aero-muted'}`}>
                  Recruiter
                </span>
                <span className="text-caption text-aero-dim">
                  Review candidates
                </span>
              </button>
            </div>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="flex items-start gap-3 p-4 rounded-lg"
                 style={{
                   backgroundColor: 'rgba(248, 81, 73, 0.1)',
                   border: '1px solid rgba(248, 81, 73, 0.3)'
                 }}>
              <span className="text-aero-red flex-shrink-0">⚠</span>
              <p className="text-sm text-aero-red">{error}</p>
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="btn-primary w-full py-3"
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Creating Account...
              </span>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        {/* Login Link */}
        <div className="mt-6 text-center">
          <p className="text-small text-aero-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-aero-cyan hover:underline">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
