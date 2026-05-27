"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Dashboard() {
  const [activities, setActivities] = useState<any[]>([]);

  const [analytics, setAnalytics] = useState({
    productiveTime: 0,
    distractingTime: 0,
    idleTime: 0,
    productivityPercent: 0,
    taskSwitches: 0,
    focusSessions: 0,
    topApp: "N/A",
    topWebsite: "N/A"
  });

  const [aiInsight, setAiInsight] = useState("");

  // =================================================
  // FETCH INITIAL DATA
  // =================================================
  async function fetchActivities() {
    const { data, error } = await supabase
      .from("activity_logs")
      .select("*")
      .order("start_time", { ascending: false });

    if (!error && data) {
      setActivities(data);
      calculateAnalytics(data, true);
    }
  }

  // =================================================
  // ANALYTICS CALCULATOR
  // =================================================
  function calculateAnalytics(logs: any[], shouldGenerateInsight = false) {

    let productive = 0;
    let distracting = 0;
    let idle = 0;
    let neutral = 0;
    let focusSessions = 0;

    const appCounter: Record<string, number> = {};
    const websiteCounter: Record<string, number> = {};

    logs.forEach((log) => {

      const duration = log.duration_seconds || 0;
      const category = log.category || "";

      // CATEGORY TIME
      if (category === "Productive") {
        productive += duration;
      } else if (category === "Distracting") {
        distracting += duration;
      } else if (category === "Idle") {
        idle += duration;
      } else {
        neutral += duration;
      }

      // FOCUS SESSION
      if (category === "Productive" && duration >= 1800) {
        focusSessions++;
      }

      // APP COUNTER
      appCounter[log.app_name] =
        (appCounter[log.app_name] || 0) + duration;

      websiteCounter[log.website] =
        (websiteCounter[log.website] || 0) + duration;
    });

    // PRODUCTIVITY %
    const totalTime = productive + distracting + neutral;
    const productivityPercent =
      totalTime > 0
        ? Math.floor((productive / totalTime) * 100)
        : 0;

    // TOP APP
    const topApp =
      Object.keys(appCounter).length > 0
        ? Object.keys(appCounter).reduce((a, b) =>
            appCounter[a] > appCounter[b] ? a : b
          )
        : "N/A";

    // TOP WEBSITE
    const topWebsite =
      Object.keys(websiteCounter).length > 0
        ? Object.keys(websiteCounter).reduce((a, b) =>
            websiteCounter[a] > websiteCounter[b] ? a : b
          )
        : "N/A";

    setAnalytics({
      productiveTime: productive,
      distractingTime: distracting,
      idleTime: idle,
      productivityPercent,
      taskSwitches: logs.length,
      focusSessions,
      topApp,
      topWebsite
    });

    if (shouldGenerateInsight) {
      generateAIInsight({
        productiveTime: productive,
        distractingTime: distracting,
        idleTime: idle,
        productivityPercent,
        focusSessions,
        topApp,
        topWebsite
      });
    }
  }

  // =================================================
  // GENERATE AI INSIGHT
  // =================================================
  async function generateAIInsight(analyticsData: any) {
    try {
      const response = await fetch("/api/ai-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          employee_name: "Alvin",
          productiveTime: analyticsData.productiveTime,
          distractingTime: analyticsData.distractingTime,
          idleTime: analyticsData.idleTime,
          productivityPercent: analyticsData.productivityPercent,
          focusSessions: analyticsData.focusSessions,
          topApp: analyticsData.topApp,
          topWebsite: analyticsData.topWebsite
        })
      });

      const data = await response.json();
      setAiInsight(data.insight);
    } catch (error) {
      console.log(error);
    }
  }

  // =================================================
  // REALTIME SUBSCRIPTION
  // =================================================
  useEffect(() => {
    fetchActivities();

    const channel = supabase
      .channel("activity-channel")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_logs" },
        (payload) => {
          console.log("New Activity:", payload);
          setActivities((prev) => {
            const newActivities = [payload.new, ...prev];
            calculateAnalytics(newActivities, false);
            return newActivities;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // =================================================
  // UI
  // =================================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12 font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      {/* Background gradients */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 -z-10" />
      <div className="fixed -top-[20rem] -left-[20rem] w-[40rem] h-[40rem] bg-indigo-500/10 blur-[100px] rounded-full -z-10" />
      <div className="fixed -bottom-[20rem] -right-[20rem] w-[40rem] h-[40rem] bg-purple-500/10 blur-[100px] rounded-full -z-10" />
      
      <div className="max-w-7xl mx-auto space-y-8 relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-1000 ease-out">
        {/* ============================================= */}
        {/* ANALYTICS CARDS                                */}
        {/* ============================================= */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">

          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-lg">
            <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Productive Time</h2>
            <p className="text-3xl font-bold mt-2 bg-gradient-to-r from-emerald-400 to-emerald-300 text-transparent bg-clip-text">
              {Math.floor(analytics.productiveTime / 3600)}h {Math.floor((analytics.productiveTime % 3600) / 60)}m
            </p>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-lg">
            <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Distracting Time</h2>
            <p className="text-3xl font-bold mt-2 bg-gradient-to-r from-rose-400 to-rose-300 text-transparent bg-clip-text">
              {Math.floor(analytics.distractingTime / 3600)}h {Math.floor((analytics.distractingTime % 3600) / 60)}m
            </p>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-lg">
            <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Productivity %</h2>
            <p className="text-3xl font-bold mt-2 bg-gradient-to-r from-indigo-400 to-purple-400 text-transparent bg-clip-text">
              {analytics.productivityPercent}%
            </p>
          </div>

          <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-lg">
            <h2 className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Focus Sessions</h2>
            <p className="text-3xl font-bold mt-2 bg-gradient-to-r from-amber-400 to-amber-300 text-transparent bg-clip-text">
              {analytics.focusSessions}
            </p>
          </div>

        </div>

        {/* ============================================= */}
        {/* AI INSIGHT CARD                                */}
        {/* ============================================= */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-indigo-500/30 p-8 rounded-3xl shadow-2xl mb-8 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 opacity-50 group-hover:opacity-100 transition-opacity duration-500"></div>
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-300 to-purple-300 text-transparent bg-clip-text">
                AI Productivity Insight
              </h2>
            </div>
            
            <div className="text-slate-300 leading-relaxed text-lg whitespace-pre-wrap font-medium">
              {aiInsight || (
                <div className="flex items-center gap-3 text-slate-400 animate-pulse">
                  <div className="w-5 h-5 border-2 border-indigo-400/30 border-t-indigo-400 rounded-full animate-spin"></div>
                  Generating AI insight...
                </div>
              )}
            </div>
          </div>
        </div>

        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-white/5 pb-6">
          <div>
            <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 text-transparent bg-clip-text drop-shadow-sm pb-1">
              Employee Dashboard
            </h1>
            <p className="text-slate-400 mt-2 text-lg font-medium tracking-wide">
              Live workforce activity & productivity analytics
            </p>
          </div>
          <div className="flex items-center gap-3 px-5 py-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-full shadow-inner backdrop-blur-md">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
            <span className="text-sm font-semibold text-emerald-400 tracking-wide">Live Updates</span>
          </div>
        </header>

        <div className="relative group">
          {/* Glass container glow */}
          <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500/30 to-purple-600/30 rounded-[2rem] blur opacity-50 group-hover:opacity-70 transition duration-500"></div>
          
          <div className="relative bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="text-xs uppercase tracking-wider text-slate-400 bg-slate-800/50 border-b border-white/5">
                  <tr>
                    <th className="px-6 py-5 font-semibold">Employee</th>
                    <th className="px-6 py-5 font-semibold">Activity</th>
                    <th className="px-6 py-5 font-semibold">Category</th>
                    <th className="px-6 py-5 font-semibold">Duration</th>
                    <th className="px-6 py-5 font-semibold text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {activities.map((item, index) => (
                    <tr 
                      key={index} 
                      className="group/row hover:bg-white/[0.04] transition-colors duration-300"
                    >
                      <td className="px-6 py-4 font-medium text-slate-200">
                        <div className="flex items-center gap-4">
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-lg ring-2 ring-slate-800/50">
                            {item.employee_name?.charAt(0) || '?'}
                          </div>
                          {item.employee_name}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-300 group-hover/row:text-indigo-300 transition-colors">
                          {item.app_name}
                        </div>
                        <div className="text-xs text-slate-500 truncate max-w-[250px] md:max-w-sm mt-0.5">
                          {item.website}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border shadow-sm
                          ${item.category === 'Productive' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 
                            item.category?.includes('Communication') ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            item.category === 'Distracting' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' :
                            'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                          {item.category || 'Unknown'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-slate-400 font-mono text-xs">
                        {item.duration_seconds}s
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-bold font-mono text-sm inline-flex items-center justify-end min-w-[3rem] ${
                          (item.productivity_score || 0) > 0 ? 'text-emerald-400' : 
                          (item.productivity_score || 0) < 0 ? 'text-rose-400' : 
                          'text-slate-400'
                        }`}>
                          {(item.productivity_score || 0) > 0 ? '+' : ''}{item.productivity_score || 0}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {activities.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center space-y-4">
                          <div className="relative w-12 h-12">
                            <div className="absolute inset-0 rounded-full border-2 border-indigo-500/20"></div>
                            <div className="absolute inset-0 rounded-full border-2 border-t-indigo-500 animate-spin"></div>
                          </div>
                          <p className="tracking-wide animate-pulse">Waiting for live activity data...</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
