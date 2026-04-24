import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

export default function Signup() {
  const getStudentRedirectPath = (profileCompleted?: boolean) => (
    profileCompleted ? '/dashboard' : '/profile'
  );

  const handleGoogleSignup = async () => {
    try {
      const response = await fetch(`/api/auth/google/url?flow=student_signup&ts=${Date.now()}`, {
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error('Failed to get auth URL');
      }

      const { url } = await response.json();
      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');

      if (!authWindow) {
        toast.error('Please allow popups for this site to connect your account.');
      }
    } catch (error) {
      console.error('OAuth error:', error);
      toast.error('Failed to initiate Google sign-up');
    }
  };

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        localStorage.setItem('token', event.data.token);
        toast.success('Google verification complete');
        window.location.href = getStudentRedirectPath(event.data.profileCompleted);
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        toast.error(event.data.error || 'Authentication failed');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <div className="page-shell section-light-alt min-h-[calc(100vh-8rem)]">
      <div className="mx-auto max-w-md px-4 py-24">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="auth-card"
      >
        <div className="text-center mb-10">
          <h1 className="section-heading text-3xl font-serif mb-4">Student Sign Up</h1>
          <div className="editorial-divider mb-6"></div>
          <p className="auth-subtitle">
            Use your BITS Pilani Google account first. Right after verification, we&apos;ll ask for your phone number before your account is fully active.
          </p>
        </div>

        <button
          onClick={handleGoogleSignup}
          className="editorial-btn editorial-btn-dark w-full py-4"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
            <path d="M1 1h22v22H1z" fill="none" />
          </svg>
          Verify BITS Google Account
        </button>

        <div className="mt-8 space-y-2 text-center text-sm text-[color:var(--text-muted-dark)]">
          <div>
            Already registered? <Link to="/login" className="border-b border-[color:var(--accent-gold)] pb-1 text-[color:var(--text-dark)]">Sign in here</Link>
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--text-secondary)]">
            Only `@pilani.bits-pilani.ac.in` student email IDs are allowed.
          </p>
        </div>
      </motion.div>
      </div>
    </div>
  );
}
