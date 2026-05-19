"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';
import { Clock, Activity, Target, Laptop, CalendarDays } from 'lucide-react';

// ==========================================
// CATEGORY MAPPINGS
// ==========================================
const PRODUCTIVITY_COLORS = {
  Productive: "#10b981",    // Emerald
  Unproductive: "#f43f5e",  // Rose
  Idle: "#64748b",          // Slate
  Neutral: "#6366f1"        // Indigo
};

export default function EmployeeDashboard() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"daily" | "weekly" | "monthly" | "all">("daily");

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    const name = localStorage.getItem("userName");

    if (role !== "employee" || !name) {
      router.push("/");
    } else {
      setEmployeeName(name);
      fetchActivityLogs(name);
    }
  }, [router]);

  async function fetchActivityLogs(name: string) {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .eq("employee_name", name)
      .order("start_time", { ascending: false });

    if (!error && data) {
      setLogs(data);
    }
    setIsLoading(false);
  }

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };

  // ==========================================
  // DATA PROCESSING
  // ==========================================
  const filteredLogs = useMemo(() => {
    if (timeFilter === "all") return logs;

    const now = new Date();
    const cutoffDate = new Date();

    if (timeFilter === "daily") {
      cutoffDate.setHours(0, 0, 0, 0); // Start of today
    } else if (timeFilter === "weekly") {
      cutoffDate.setDate(now.getDate() - 7);
    } else if (timeFilter === "monthly") {
      cutoffDate.setMonth(now.getMonth() - 1);
    }

    return logs.filter(log => new Date(log.start_time) >= cutoffDate);
  }, [logs, timeFilter]);

  const productivityData = useMemo(() => {
    let productive = 0;
    let unproductive = 0;
    let idle = 0;
    let neutral = 0;

    filteredLogs.forEach(log => {
      const cat = log.category || "Neutral";
      const duration = log.duration_seconds || 0;

      if (cat === "Idle") {
        idle += duration;
      } else if (cat.includes("Productive") || cat.includes("Work")) {
        productive += duration;
      } else if (cat.includes("Distracting") || cat.includes("Entertainment")) {
        unproductive += duration;
      } else {
        neutral += duration;
      }
    });

    const total = productive + unproductive + idle + neutral;
    if (total === 0) return [];

    return [
      { name: 'Productive', value: Math.round((productive / total) * 100), raw: productive },
      { name: 'Unproductive', value: Math.round((unproductive / total) * 100), raw: unproductive },
      { name: 'Neutral', value: Math.round((neutral / total) * 100), raw: neutral },
      { name: 'Idle', value: Math.round((idle / total) * 100), raw: idle },
    ].filter(d => d.value > 0);
  }, [filteredLogs]);

  const topApps = useMemo(() => {
    const appMap: Record<string, { duration: number, category: string }> = {};
    filteredLogs.forEach(log => {
      // Clean app name (e.g. "chrome.exe | YouTube" -> "chrome.exe")
      const appName = log.app_name.split(' | ')[0] || log.app_name;
      if (!appMap[appName]) {
        appMap[appName] = { duration: 0, category: log.category };
      }
      appMap[appName].duration += (log.duration_seconds || 0);
    });

    return Object.entries(appMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5); // Top 5
  }, [filteredLogs]);

  const hourlyProductivity = useMemo(() => {
    // Group by hour of the day
    const hoursMap: Record<string, number> = {};

    // Initialize 24 hours
    for (let i = 0; i < 24; i++) {
      hoursMap[`${i.toString().padStart(2, '0')}:00`] = 0;
    }

    filteredLogs.forEach(log => {
      if (log.category && (log.category.includes("Productive") || log.category.includes("Work"))) {
        const date = new Date(log.start_time);
        const hourKey = `${date.getHours().toString().padStart(2, '0')}:00`;
        hoursMap[hourKey] += (log.productivity_score || 0);
      }
    });

    return Object.entries(hoursMap)
      .map(([time, score]) => ({ time, score }))
      .filter(item => item.score > 0 || parseInt(item.time.split(':')[0]) > 6 && parseInt(item.time.split(':')[0]) < 20) // Filter active hours roughly
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [filteredLogs]);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m`;
  };

  if (isLoading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center"><div className="text-white">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans selection:bg-indigo-500/30 overflow-x-hidden relative">
      {/* Background gradients */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 -z-10" />
      <div className="fixed -top-[20rem] -left-[20rem] w-[40rem] h-[40rem] bg-indigo-500/10 blur-[100px] rounded-full -z-10" />
      <div className="fixed -bottom-[20rem] -right-[20rem] w-[40rem] h-[40rem] bg-purple-500/10 blur-[100px] rounded-full -z-10" />

      <div className="max-w-7xl mx-auto space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 text-transparent bg-clip-text drop-shadow-sm pb-1">
              Personal Analytics
            </h1>
            <p className="text-slate-400 mt-2 text-lg font-medium tracking-wide">
              Welcome back, {employeeName}
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* TIME FILTER */}
            <div className="flex items-center gap-2 bg-slate-900/80 p-1 rounded-xl border border-white/10 backdrop-blur-md">
              <CalendarDays className="w-4 h-4 text-slate-400 ml-2" />
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value as any)}
                className="bg-transparent text-sm font-semibold text-slate-200 outline-none cursor-pointer focus:ring-0 py-2 pr-4 pl-1"
              >
                <option value="daily" className="bg-slate-900">Today</option>
                <option value="weekly" className="bg-slate-900">This Week</option>
                <option value="monthly" className="bg-slate-900">This Month</option>
                <option value="all" className="bg-slate-900">All Time</option>
              </select>
            </div>

            <button
              onClick={handleLogout}
              className="px-5 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-xl shadow-inner backdrop-blur-md transition-colors text-sm font-semibold tracking-wide"
            >
              Logout
            </button>
          </div>
        </header>

        {/* DASHBOARD GRID */}
        {filteredLogs.length === 0 ? (
          <div className="text-center py-20 bg-slate-900/50 rounded-3xl border border-white/5 backdrop-blur-xl">
            <Activity className="w-16 h-16 text-slate-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-300">No data found</h2>
            <p className="text-slate-500 mt-2">Start tracking your work to see analytics here.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* PIE CHART: Productivity Breakdown */}
            <div className="relative group col-span-1 lg:col-span-1">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/30 to-teal-500/30 rounded-[2rem] blur opacity-30 transition duration-500"></div>
              <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-emerald-500/20 rounded-xl">
                    <Target className="w-5 h-5 text-emerald-400" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-200">Activity Breakdown</h2>
                </div>

                <div className="flex-1 min-h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={productivityData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        stroke="none"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {productivityData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={PRODUCTIVITY_COLORS[entry.name as keyof typeof PRODUCTIVITY_COLORS]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                        itemStyle={{ color: '#f8fafc' }}
                        formatter={(value: number, name: string, props: any) => [`${formatDuration(props.payload.raw)}`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* AREA CHART: Productivity Over Time */}
            <div className="relative group col-span-1 lg:col-span-2">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/30 to-purple-500/30 rounded-[2rem] blur opacity-30 transition duration-500"></div>
              <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-indigo-500/20 rounded-xl">
                    <Clock className="w-5 h-5 text-indigo-400" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-200">When are you most productive?</h2>
                </div>

                <div className="flex-1 min-h-[250px] -ml-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={hourlyProductivity}>
                      <defs>
                        <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#818cf8" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis dataKey="time" stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                      <YAxis stroke="#64748b" tick={{ fill: '#64748b', fontSize: 12 }} tickLine={false} axisLine={false} />
                      <RechartsTooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', borderRadius: '12px' }}
                        itemStyle={{ color: '#818cf8', fontWeight: 'bold' }}
                        labelStyle={{ color: '#cbd5e1', marginBottom: '4px' }}
                      />
                      <Area type="monotone" dataKey="score" stroke="#818cf8" strokeWidth={3} fillOpacity={1} fill="url(#colorScore)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* LIST: Top Applications */}
            <div className="relative group col-span-1 lg:col-span-3">
              <div className="absolute -inset-0.5 bg-gradient-to-r from-slate-600/30 to-slate-500/30 rounded-[2rem] blur opacity-30 transition duration-500"></div>
              <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[2rem] p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-slate-800 rounded-xl border border-white/5">
                    <Laptop className="w-5 h-5 text-slate-300" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-200">Most Used Apps</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                  {topApps.map((app, index) => (
                    <div key={app.name} className="bg-slate-800/50 border border-white/5 rounded-2xl p-4 hover:bg-slate-800 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-bold text-slate-500 bg-slate-900 px-2 py-1 rounded-md">#{index + 1}</span>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider
                          ${app.category.includes('Productive') || app.category.includes('Work') ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                            app.category === 'Idle' ? 'bg-slate-500/10 text-slate-400 border border-slate-500/20' :
                              app.category.includes('Distracting') ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                                'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'}`}
                        >
                          {app.category}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-200 truncate" title={app.name}>{app.name}</h3>
                      <p className="text-2xl font-bold text-white mt-3 bg-gradient-to-br from-white to-slate-400 bg-clip-text text-transparent">
                        {formatDuration(app.duration)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
