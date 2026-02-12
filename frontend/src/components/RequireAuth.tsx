import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { isAuthenticated, authApi, type UserResponse } from '../lib/api';

interface RequireAuthProps {
  children: React.ReactNode;
  allowedRoles?: ('candidate' | 'recruiter')[];
}

/**
 * RequireAuth Component - Route Protection Guard
 *
 * Protects routes from unauthorized access:
 * - Redirects to login if no token exists
 * - Optionally checks for specific user roles
 * - Shows loading state while verifying auth
 */
export default function RequireAuth({ children, allowedRoles }: RequireAuthProps) {
  const location = useLocation();
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<UserResponse | null>(null);
  const [authError, setAuthError] = useState(false);

  useEffect(() => {
    const verifyAuth = async () => {
      // Quick check for token existence
      if (!isAuthenticated()) {
        setAuthError(true);
        setIsLoading(false);
        return;
      }

      // Verify token is valid by fetching user profile
      try {
        const userData = await authApi.me();
        setUser(userData);
        setIsLoading(false);
      } catch (err) {
        console.error('Auth verification failed:', err);
        setAuthError(true);
        setIsLoading(false);
      }
    };

    verifyAuth();
  }, []);

  // Show loading spinner while verifying auth
  if (isLoading) {
    return (
      <div className="min-h-screen bg-aero-bg flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-10 h-10 border-2 border-aero-cyan border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-aero-muted">Verifying authentication...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (authError || !isAuthenticated()) {
    // Save the attempted URL for redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check role-based access if allowedRoles is specified
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    // Redirect to appropriate dashboard based on actual role
    if (user.role === 'candidate') {
      return <Navigate to="/candidate/dashboard" replace />;
    } else if (user.role === 'recruiter') {
      return <Navigate to="/recruiter/dashboard" replace />;
    }
    // Fallback to login if role is unknown
    return <Navigate to="/login" replace />;
  }

  // Auth verified, render children
  return <>{children}</>;
}
