"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  // Check if already logged in
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    if (role === "admin") {
      router.push("/admin");
    } else if (role === "employee") {
      router.push("/employee");
    } else {
      setIsCheckingAuth(false);
    }
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    const trimmedUsername = username.trim();
    const trimmedPassword = password.trim();

    try {
      // Query our custom users table
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("username", trimmedUsername)
        .eq("password", trimmedPassword)
        .single();

      if (error || !data) {
        setError("Invalid username or password");
        setIsLoading(false);
        return;
      }

      // Successful login
      localStorage.setItem("userRole", data.role);
      localStorage.setItem("userName", data.username);

      if (data.role === "admin") {
        router.push("/admin");
      } else {
        router.push("/employee");
      }
    } catch (err) {
      setError("An error occurred during login.");
      setIsLoading(false);
    }
  };

  if (isCheckingAuth) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Background gradients - Unified and GPU-friendly */}
      <div className="fixed inset-0 bg-slate-950 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,0.08),_transparent_45%),_radial-gradient(circle_at_bottom_left,_rgba(168,85,247,0.06),_transparent_45%)] -z-10" />
      
      <div className="relative group max-w-md w-full">
        {/* Glass container glow */}
        <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/30 to-purple-600/30 rounded-[2rem] blur opacity-50 group-hover:opacity-70 transition duration-500"></div>
        
        <div className="relative bg-slate-900/95 border border-white/10 rounded-[2rem] shadow-2xl p-8 md:p-10">
          
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 text-transparent bg-clip-text drop-shadow-sm pb-1">
              WFH Monitor
            </h1>
            <p className="text-slate-400 mt-2 text-sm md:text-base font-medium tracking-wide">
              Sign in to continue
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm text-center font-medium">
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Username</label>
              <input 
                type="text" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white placeholder-slate-500 transition-all"
                placeholder="Enter your username"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider ml-1">Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-800/50 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-white placeholder-slate-500 transition-all"
                placeholder="Enter your password"
              />
            </div>

            <button 
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white rounded-xl shadow-lg shadow-indigo-500/25 transition-all font-semibold tracking-wide disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Signing In...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  );
}
