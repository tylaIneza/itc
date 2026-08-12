'use client';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  Eye, EyeOff, ShieldCheck, TrendingUp,
  ShoppingCart, DollarSign, BarChart3, Package, ArrowRight, Zap,
} from 'lucide-react';

const STATS = [
  { icon: TrendingUp,   color: 'from-emerald-500 to-teal-500',   label: 'Revenue Tracked',    value: 'Real-time' },
  { icon: ShoppingCart, color: 'from-blue-600 to-violet-500',  label: 'Sales Managed',      value: 'All in one' },
  { icon: DollarSign,   color: 'from-amber-500 to-orange-500',   label: 'Expenses',           value: 'Fully tracked' },
  { icon: BarChart3,    color: 'from-pink-500 to-rose-500',      label: 'Analytics',          value: 'Live insights' },
  { icon: Package,      color: 'from-cyan-500 to-blue-500',      label: 'Stock Control',      value: 'Auto alerts' },
];

const FEATURES = [
  'Real-time sales tracking',
  'Expense management',
  'Multi-role access control',
  'Live analytics & reports',
  'Stock & inventory alerts',
];

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword]     = useState('');
  const [showPass, setShowPass]     = useState(false);
  const [loading, setLoading]       = useState(false);
  const [shake, setShake]           = useState(false);
  const [focused, setFocused]       = useState<'id' | 'pw' | null>(null);
  const [activeStat, setActiveStat] = useState(0);
  const [featIdx, setFeatIdx]       = useState(0);
  const { login }  = useAuth();
  const router     = useRouter();
  const formRef    = useRef<HTMLFormElement>(null);

  // Cycle stats card
  useEffect(() => {
    const t = setInterval(() => setActiveStat(p => (p + 1) % STATS.length), 2800);
    return () => clearInterval(t);
  }, []);

  // Cycle feature text
  useEffect(() => {
    const t = setInterval(() => setFeatIdx(p => (p + 1) % FEATURES.length), 2200);
    return () => clearInterval(t);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(identifier, password);
      toast.success(`Welcome back, ${user.name}!`, { icon: '👋' });
      router.replace(
        user.role === 'superadmin' ? '/superadmin' :
        user.role === 'seller'     ? '/seller'      : '/admin'
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Invalid credentials');
      setShake(true);
      setTimeout(() => setShake(false), 600);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">

      {/* ── LEFT PANEL ─────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-[55%] relative overflow-hidden bg-gray-950 flex-col">

        {/* Animated gradient blobs */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="animate-blob absolute -top-32 -left-32 w-96 h-96 bg-blue-700/20 rounded-full blur-3xl" />
          <div className="animate-blob absolute top-1/2 -right-20 w-80 h-80 bg-emerald-500/15 rounded-full blur-3xl" style={{ animationDelay: '3s' }} />
          <div className="animate-blob absolute -bottom-20 left-1/3 w-72 h-72 bg-violet-600/15 rounded-full blur-3xl" style={{ animationDelay: '6s' }} />
        </div>

        {/* Grid overlay */}
        <div className="absolute inset-0"
          style={{ backgroundImage: 'linear-gradient(rgba(29,78,216,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(29,78,216,0.05) 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col h-full p-12">

          {/* Logo */}
          <div className="flex items-center gap-3 mb-auto">
            <div className="w-10 h-10 rounded-xl bg-blue-700 flex items-center justify-center shadow-lg shadow-blue-700/40">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">Tyla Shop</p>
              <p className="text-gray-500 text-[11px] mt-0.5 tracking-wide">MIS System</p>
            </div>
          </div>

          {/* Hero text */}
          <div className="my-auto">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-600/10 border border-blue-600/20 mb-6">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-emerald-400 text-xs font-semibold tracking-wide">System Active</span>
            </div>

            <h2 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight mb-4">
              Manage your<br />
              <span className="bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">
                business smarter
              </span>
            </h2>
            <p className="text-gray-400 text-base mb-10 leading-relaxed max-w-sm">
              Complete management system for sales, expenses, and analytics — all in one place.
            </p>

            {/* Dynamic feature ticker */}
            <div className="flex items-center gap-3 mb-10 h-7 overflow-hidden">
              <div className="w-5 h-5 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                <ArrowRight className="w-3 h-3 text-blue-400" />
              </div>
              <p key={featIdx} className="text-gray-300 text-sm font-medium animate-slide-up">
                {FEATURES[featIdx]}
              </p>
            </div>

            {/* Animated stats card */}
            <div className="relative h-28">
              {STATS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <div key={i}
                    className="absolute inset-0 transition-all duration-700"
                    style={{ opacity: activeStat === i ? 1 : 0, transform: activeStat === i ? 'translateY(0)' : 'translateY(12px)', pointerEvents: activeStat === i ? 'auto' : 'none' }}>
                    <div className="flex items-center gap-4 p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm">
                      <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${s.color} flex items-center justify-center shadow-lg flex-shrink-0`}>
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <p className="text-gray-400 text-xs uppercase tracking-widest mb-0.5">{s.label}</p>
                        <p className="text-white text-xl font-bold">{s.value}</p>
                      </div>
                      {/* Dot indicators */}
                      <div className="flex gap-1.5 ml-auto">
                        {STATS.map((_, j) => (
                          <span key={j} className={`block rounded-full transition-all duration-300 ${j === activeStat ? 'w-4 h-1.5 bg-blue-400' : 'w-1.5 h-1.5 bg-white/20'}`} />
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Floating mini-cards */}
          <div className="absolute top-24 right-10 animate-float">
            <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 backdrop-blur-sm">
              <p className="text-emerald-400 text-xs font-semibold">↑ Sales Today</p>
              <p className="text-white text-sm font-bold">Live</p>
            </div>
          </div>
          <div className="absolute bottom-32 right-16 animate-float2">
            <div className="px-3 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 backdrop-blur-sm">
              <p className="text-violet-400 text-xs font-semibold">Analytics</p>
              <p className="text-white text-sm font-bold">Live insights</p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-gray-600 text-xs">© 2025 Tyla Shop MIS · All rights reserved</p>
        </div>
      </div>

      {/* ── RIGHT PANEL (form) ──────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center bg-gray-950 lg:bg-gray-900/50 p-6 relative">

        {/* Mobile background blobs */}
        <div className="lg:hidden absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 -right-20 w-72 h-72 bg-blue-700/15 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-72 h-72 bg-emerald-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-sm">

          {/* Mobile logo */}
          <div className="flex lg:hidden flex-col items-center mb-10">
            <div className="w-14 h-14 rounded-2xl bg-blue-700 flex items-center justify-center shadow-xl shadow-blue-700/30 mb-4" style={{ animation: 'pulse-ring 2s ease-out infinite' }}>
              <Zap className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">Tyla Shop</h1>
            <p className="text-gray-500 text-sm mt-1">Management Information System</p>
          </div>

          {/* Form card */}
          <div className={`bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl transition-all duration-150 ${shake ? 'animate-shake' : ''}`}>

            <div className="mb-8">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span className="text-blue-400 text-xs font-semibold uppercase tracking-wider">Secure Login</span>
              </div>
              <h2 className="text-2xl font-bold text-white">Welcome back</h2>
              <p className="text-gray-500 text-sm mt-1">Sign in to your account to continue</p>
            </div>

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-5">

              {/* Identifier field */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Email or Phone
                </label>
                <div className={`relative rounded-xl transition-all duration-200 ${focused === 'id' ? 'ring-2 ring-blue-600/50' : ''}`}>
                  <input
                    type="text"
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    onFocus={() => setFocused('id')}
                    onBlur={() => setFocused(null)}
                    className="w-full bg-gray-800/80 border border-gray-700 text-white placeholder-gray-600 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-blue-600 transition-all duration-200"
                    placeholder="admin@example.com or +250..."
                    autoComplete="username"
                    required
                  />
                  {identifier && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    </div>
                  )}
                </div>
              </div>

              {/* Password field */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Password
                </label>
                <div className={`relative rounded-xl transition-all duration-200 ${focused === 'pw' ? 'ring-2 ring-blue-600/50' : ''}`}>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onFocus={() => setFocused('pw')}
                    onBlur={() => setFocused(null)}
                    className="w-full bg-gray-800/80 border border-gray-700 text-white placeholder-gray-600 rounded-xl px-4 py-3.5 text-sm pr-12 focus:outline-none focus:border-blue-600 transition-all duration-200"
                    placeholder="••••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(p => !p)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors p-1"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading || !identifier || !password}
                className="w-full relative overflow-hidden rounded-xl py-3.5 font-semibold text-sm text-white transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed group"
                style={{ background: 'linear-gradient(135deg, #1d4ed8 0%, #1d4ed8 100%)' }}
              >
                {/* Hover shine effect */}
                <span className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12" />

                <span className="relative flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                    </>
                  )}
                </span>
              </button>
            </form>

            {/* Divider hint */}
            <div className="mt-6 pt-6 border-t border-gray-800 flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600/10 flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-gray-600 text-xs leading-relaxed">
                Protected by secure authentication. Contact your admin if you've lost access.
              </p>
            </div>
          </div>

          {/* Mobile footer */}
          <p className="lg:hidden text-center text-gray-700 text-xs mt-6">
            © 2025 Tyla Shop MIS · All rights reserved
          </p>
        </div>
      </div>
    </div>
  );
}
