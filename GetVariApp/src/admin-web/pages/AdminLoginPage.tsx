import React, { FormEvent, useState } from 'react';
import { LockKeyhole, ShieldCheck, UserRound, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../../services/SupabaseClient';

const AdminLoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);

    // Map 'admin' username to the specific verified admin email
    const email = username.trim() === 'admin'
      ? 'anjalismishra05@gmail.com'
      : username.trim();

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
    } else if (data.user && data.user.user_metadata?.is_admin !== true) {
      setError('Access denied: This account does not have administrator privileges.');
      await supabase.auth.signOut();
    }

    setSubmitting(false);
  };

  return (
    <main className="min-h-screen bg-[#fcfdfe] flex items-center justify-center p-6 relative overflow-hidden">
      {/* Premium Background Mesh */}
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-50/50 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-indigo-50/50 rounded-full blur-[140px] pointer-events-none" />

      <section className="w-full max-w-[360px] bg-white border-2 border-slate-200 rounded-[28px] p-8 shadow-[0_20px_50px_rgba(0,0,0,0.04)] relative z-10 animate-fadeIn">
        <div className="w-11 h-11 rounded-[16px] bg-gradient-to-br from-blue-600 to-indigo-600 text-white flex items-center justify-center mb-6 shadow-lg shadow-blue-200/40">
          <ShieldCheck size={22} strokeWidth={2.5} />
        </div>

        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-[0.3em] text-blue-600/80">GetVari Command Center</p>
          <h1 className="text-2xl font-black text-slate-900 tracking-[-0.03em] leading-tight">Admin sign in</h1>
          <p className="text-[12px] font-medium text-slate-500 leading-relaxed">
            Enter your credentials to continue.
          </p>
        </div>

        <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-1.5">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
              Username
            </label>
            <div className="relative group">
              <UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
              <input
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={event => setUsername(event.target.value)}
                placeholder="enter username"
                className="w-full bg-slate-50/30 rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-xs font-bold text-slate-900 outline-none transition-all focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100/30 placeholder:text-slate-300"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">
              Password
            </label>
            <div className="relative group">
              <LockKeyhole className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 group-focus-within:text-blue-500 transition-colors" />
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="enter password"
                className="w-full bg-slate-50/30 rounded-xl border border-slate-300 py-2.5 pl-10 pr-10 text-xs font-bold text-slate-900 outline-none transition-all focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-100/30 placeholder:text-slate-300"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-300 hover:text-blue-600 transition-all"
              >
                {showPassword ? <EyeOff size={14} strokeWidth={2.5} /> : <Eye size={14} strokeWidth={2.5} />}
              </button>
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-red-50/50 border border-red-100/50 px-3 py-2 animate-shake">
              <p className="text-[10px] font-bold text-red-600 leading-tight">{error}</p>
            </div>
          )}

          <button
            disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3.5 text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-blue-200/50 transition-all hover:shadow-blue-300/60 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:cursor-wait disabled:opacity-70"
          >
            {submitting ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest">
          Enterprise Node <span className="text-blue-500">v2.4.0</span>
        </p>
      </section>
    </main>
  );
};

export default AdminLoginPage;
