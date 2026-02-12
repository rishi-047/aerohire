import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { authApi, type UserResponse } from '../lib/api';

interface LayoutProps {
  children: React.ReactNode;
}

// Sidebar width constants
const SIDEBAR_EXPANDED = 260;
const SIDEBAR_COLLAPSED = 80;

/**
 * Layout Component - Premium Collapsible Sidebar
 *
 * Titanium Slate Theme with:
 * - Animated collapsible sidebar using framer-motion
 * - Floating toggle button on the border
 * - Glass morphism effects
 * - Role-based navigation
 */
export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserResponse | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    // Persist sidebar state in localStorage
    const saved = localStorage.getItem('aerohire_sidebar_collapsed');
    return saved === 'true';
  });

  // Fetch user data on mount
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authApi.me();
        setUser(userData);
      } catch (err) {
        console.error('Failed to fetch user:', err);
        navigate('/login');
      }
    };
    fetchUser();
  }, [navigate]);

  // Persist sidebar state
  useEffect(() => {
    localStorage.setItem('aerohire_sidebar_collapsed', String(isCollapsed));
  }, [isCollapsed]);

  const handleLogout = () => {
    authApi.logout();
  };

  const isActive = (path: string) => {
    return location.pathname.startsWith(path);
  };

  const getNavItems = () => {
    if (user?.role === 'recruiter') {
      return [
        {
          path: '/recruiter/dashboard',
          label: 'Pipeline',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          ),
        },
        {
          path: '/recruiter/rankings',
          label: 'Rankings',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 17h3v4H3v-4zm5-6h3v10H8V11zm5-4h3v14h-3V7zm5 8h3v6h-3v-6z" />
            </svg>
          ),
        },
      ];
    } else {
      return [
        {
          path: '/candidate/dashboard',
          label: 'Dashboard',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          ),
        },
        {
          path: '/candidate/status',
          label: 'Application Status',
          icon: (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7M5 7h14M5 17h9" />
            </svg>
          ),
        },
      ];
    }
  };

  const sidebarWidth = isCollapsed ? SIDEBAR_COLLAPSED : SIDEBAR_EXPANDED;

  return (
    <div className="min-h-screen bg-aero-bg flex">
      {/* Animated Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: sidebarWidth }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="fixed left-0 top-0 h-full z-50 sidebar flex flex-col"
      >
        {/* Logo Section */}
        <div className="p-4 border-b border-aero-border-subtle">
          <Link to="/" className="flex items-center gap-3">
            {/* Animated Logo Container */}
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-10 h-10 rounded-xl bg-gradient-to-br from-aero-cyan/20 to-aero-indigo/20 flex items-center justify-center flex-shrink-0 border border-aero-cyan/30"
            >
              <svg className="w-5 h-5 text-aero-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </motion.div>
            <AnimatePresence mode="wait">
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.2 }}
                  className="text-lg font-bold bg-gradient-to-r from-aero-cyan to-aero-indigo bg-clip-text text-transparent tracking-wider"
                >
                  AEROHIRE
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </div>

        {/* User Info */}
        <AnimatePresence mode="wait">
          {user && (
            <motion.div
              initial={false}
              animate={{ height: 'auto', opacity: 1 }}
              className="p-4 border-b border-aero-border-subtle"
            >
              <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-aero-cyan/20 to-aero-indigo/20 flex items-center justify-center border border-aero-cyan/30"
                >
                  <span className="text-aero-cyan font-semibold">
                    {user.full_name.charAt(0).toUpperCase()}
                  </span>
                </motion.div>
                <AnimatePresence mode="wait">
                  {!isCollapsed && (
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      transition={{ duration: 0.2 }}
                      className="flex-1 min-w-0"
                    >
                      <p className="text-sm font-medium text-aero-text truncate">
                        {user.full_name}
                      </p>
                      <p className="text-xs text-aero-muted capitalize tracking-wide">
                        {user.role}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-2">
          {getNavItems().map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className="block"
              >
                <motion.div
                  whileHover={{ x: 4 }}
                  whileTap={{ scale: 0.98 }}
                  className={`
                    flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200
                    ${isCollapsed ? 'justify-center' : ''}
                    ${active
                      ? 'bg-gradient-to-r from-aero-cyan/15 to-aero-cyan/5 text-aero-cyan border border-aero-cyan/30 shadow-[0_0_20px_rgba(56,189,248,0.15)]'
                      : 'text-aero-muted hover:text-aero-text hover:bg-aero-surface-elevated'
                    }
                  `}
                >
                  <span className={active ? 'text-aero-cyan' : ''}>{item.icon}</span>
                  <AnimatePresence mode="wait">
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.15 }}
                        className="font-medium"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              </Link>
            );
          })}
        </nav>

        {/* Logout Button */}
        <div className="p-3 border-t border-aero-border-subtle">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleLogout}
            className={`
              w-full flex items-center gap-3 px-3 py-3 rounded-xl
              bg-gradient-to-r from-aero-red/10 to-aero-red/5 text-aero-red border border-aero-red/30
              hover:from-aero-red/20 hover:to-aero-red/10 transition-all duration-200
              ${isCollapsed ? 'justify-center' : ''}
            `}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <AnimatePresence mode="wait">
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.15 }}
                  className="font-medium"
                >
                  Logout
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        </div>

        {/* Floating Toggle Button */}
        <motion.button
          onClick={() => setIsCollapsed(!isCollapsed)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-aero-surface border border-aero-border flex items-center justify-center text-aero-muted hover:text-aero-cyan hover:border-aero-cyan/50 transition-colors shadow-lg z-10"
        >
          <motion.svg
            animate={{ rotate: isCollapsed ? 180 : 0 }}
            transition={{ duration: 0.3 }}
            className="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </motion.svg>
        </motion.button>
      </motion.aside>

      {/* Main Content Area */}
      <motion.main
        initial={false}
        animate={{ marginLeft: sidebarWidth }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="flex-1 min-h-screen"
      >
        {children}
      </motion.main>
    </div>
  );
}
