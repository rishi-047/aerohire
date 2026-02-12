import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authApi } from '../lib/api';

/**
 * Login Page Component
 *
 * Design: F1 Cockpit Theme - Centered card on dark background
 */
export default function Login() {
  const navigate = useNavigate();

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  /**
   * Handle form submission
   * 1. Login with credentials
   * 2. Get user profile to determine role
   * 3. Navigate to appropriate dashboard
   */
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Login and get token (automatically saved by authApi)
      await authApi.login(email, password);

      // Get user profile to determine role
      const user = await authApi.me();

      // Navigate based on role
      if (user.role === 'candidate') {
        navigate('/candidate/dashboard');
      } else if (user.role === 'recruiter') {
        navigate('/recruiter/dashboard');
      } else {
        navigate('/candidate/dashboard'); // Default fallback
      }
    } catch (err) {
      console.error('Login failed:', err);
      setError('Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      {/* Login Card */}
      <div className="card-elevated w-full max-w-md">
        {/* Logo & Tagline */}
        <div className="text-center mb-8">
          <h1 className="text-display text-aero-cyan tracking-wider mb-2">
            AEROHIRE
          </h1>
          <p className="text-small text-aero-muted">
            Precision Hiring. Zero Black Boxes.
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
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
              placeholder="Enter your password"
              required
              disabled={loading}
            />
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
            className="btn-primary w-full"
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
                Signing In...
              </span>
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        {/* Register Link */}
        <div className="mt-6 text-center">
          <p className="text-small text-aero-muted">
            Don't have an account?{' '}
            <Link to="/register" className="text-aero-cyan hover:underline">
              Register
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
}
