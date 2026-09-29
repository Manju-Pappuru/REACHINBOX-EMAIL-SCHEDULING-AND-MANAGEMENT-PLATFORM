import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Clock, ShieldCheck, Zap, ArrowRight } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/Button';

export const Login: React.FC = () => {
  const { user, loading, loginWithGoogle, devLogin } = useAuth();
  const navigate = useNavigate();
  const [devLoading, setDevLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (user && !loading) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, loading, navigate]);

  const handleDevLogin = async () => {
    setDevLoading(true);
    try {
      await devLogin('demo@reachinbox.ai', 'ReachInbox Demo User');
      navigate('/dashboard');
    } catch (err) {
      console.error('Dev login failed:', err);
    } finally {
      setDevLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
      navigate('/dashboard');
    } catch (err) {
      console.error('Google login failed:', err);
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-violet-600/10 blur-[100px] rounded-full pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md z-10 text-center">
        {/* Logo */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-xl shadow-indigo-500/25 mb-4">
          <Mail className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">ReachInbox</h1>
        <p className="mt-2 text-sm text-slate-400">
          High-performance distributed email scheduler with Redis rate limiting
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md z-10 px-4 sm:px-0">
        <div className="bg-slate-900/90 border border-slate-800 py-8 px-6 sm:px-10 rounded-2xl shadow-2xl backdrop-blur-xl">
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 text-center">
                Sign in to your account
              </h2>
              <p className="mt-1 text-xs text-slate-400 text-center">
                Authenticate securely to manage and dispatch scheduled campaigns
              </p>
            </div>

            {/* Google OAuth Button */}
            <div>
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl text-sm font-semibold text-slate-900 bg-white hover:bg-slate-100 active:bg-slate-200 transition-all shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 group disabled:opacity-50"
              >
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
                <ArrowRight className="w-4 h-4 ml-auto text-slate-400 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-slate-900 px-3 text-slate-400">Or use instant demo mode</span>
              </div>
            </div>

            {/* Quick Demo Login */}
            <div>
              <Button
                variant="secondary"
                size="md"
                onClick={handleDevLogin}
                loading={devLoading}
                className="w-full justify-center"
              >
                Instant Demo Login (Single Click)
              </Button>
              <p className="text-[11px] text-slate-400 text-center mt-2">
                Simulates real authenticated session with default sender &amp; database access
              </p>
            </div>
          </div>
        </div>

        {/* Feature badges */}
        <div className="mt-8 grid grid-cols-3 gap-3 text-center">
          <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
            <Clock className="w-4 h-4 text-indigo-400 mx-auto mb-1" />
            <span className="text-[11px] font-medium text-slate-400">Delayed Queues</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
            <Zap className="w-4 h-4 text-amber-400 mx-auto mb-1" />
            <span className="text-[11px] font-medium text-slate-400">Atomic Limits</span>
          </div>
          <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800/60">
            <ShieldCheck className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <span className="text-[11px] font-medium text-slate-400">Session Guard</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
