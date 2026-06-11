"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  ReferenceArea, ReferenceLine, Tooltip as ReTooltip
} from 'recharts';
import {
  Clock, Activity, Target, Laptop, CalendarDays,
  Sliders, ChevronDown, RefreshCw, Sparkles, Brain
} from 'lucide-react';
import { classifyActivityWithAI, PRODUCTIVITY_COLORS, FALLBACK_ROLES, getNormalizedRoleName } from "../../lib/classifier";
import { calculateSessionMetrics } from "../../lib/sessionEngine";
import Dropdown from "../components/Dropdown";
import { fetchGeminiClassification, getGeminiCacheKey, GeminiClassificationResult } from "../../lib/geminiClassifier";
import ReactMarkdown from "react-markdown";

// ==========================================
// HELPERS & CUSTOM COMPONENTS
// ==========================================
const CATEGORY_COLORS: Record<string, string> = PRODUCTIVITY_COLORS;

const formatDuration = (seconds?: number | null): string => {
  if (seconds === null || seconds === undefined || seconds === 0) return "0s";
  if (seconds < 60) return `${seconds}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
};

const formatTime = (isoString?: string): string => {
  if (!isoString) return "-";
  try {
    const date = new Date(isoString);
    const datePart = date.toLocaleDateString([], { month: "short", day: "numeric" });
    const timePart = date.toLocaleTimeString([], {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
    });
    return `${datePart}, ${timePart}`;
  } catch { return "-"; }
};

const formatTimeCompact = (isoString?: string): string => {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
    }
    return date.toLocaleDateString([], { month: "short", day: "numeric" }) + ", " + 
      date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  } catch { return "—"; }
};

const getCategoryColor = (cat: string): string =>
  CATEGORY_COLORS[cat] || CATEGORY_COLORS.Neutral;

function CompactStatWidget({ label, value, sub, colorClass }: {
  label: string; value: string; sub?: string; colorClass?: string;
}) {
  return (
    <div className="bg-[#121826] border border-slate-800 rounded p-2.5 flex flex-col justify-center min-w-0 shadow-sm hover:bg-[#121826]/80 transition-colors">
      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <span className={`text-xl font-bold font-mono tracking-tight mt-0.5 ${colorClass || "text-slate-100"}`}>{value}</span>
      {sub && <span className="text-[9px] text-slate-500 font-medium mt-0.5 leading-snug">{sub}</span>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#121826] border border-white/5 rounded-lg p-3.5 shadow-lg text-xs backdrop-blur-md">
      {label && <p className="text-slate-400 mb-1.5 font-bold uppercase tracking-wider">{label}</p>}
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 mt-1">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color || entry.fill }} />
          <span className="text-slate-400 font-medium">{entry.name}:</span>
          <span className="font-semibold text-slate-100">
            {typeof entry.value === "number" && ["productive", "neutral", "unproductive", "idle"].includes(String(entry.name).toLowerCase())
              ? formatDuration(entry.value)
              : typeof entry.value === "number" && entry.name?.toLowerCase().includes("score")
                ? (entry.value > 0 ? `+${entry.value}` : entry.value)
                : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
};

const TimelineTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-[#121826] border border-slate-800 rounded p-2.5 shadow-lg text-xs font-mono">
      <p className="text-slate-200 font-bold border-b border-slate-800 pb-1 mb-1.5 uppercase text-[10px]">{data.time}</p>
      <div className="space-y-1">
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Focus Score:</span>
          <span className="text-blue-400 font-semibold">{data["Focus Score"]}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Activity Level:</span>
          <span className="text-emerald-400 font-semibold">{data["Activity Score"]}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-400">Productivity:</span>
          <span className="text-indigo-400 font-semibold">{data["Productivity Score"]}%</span>
        </div>
        <div className="border-t border-slate-800 pt-1 mt-1 text-[9px] text-slate-505">
          <span className="block font-semibold uppercase text-[8px] text-slate-400 mb-0.5">Active Apps:</span>
          <span className="block text-slate-300 break-words max-w-[200px] leading-normal">{data["Active Apps"]}</span>
        </div>
      </div>
    </div>
  );
};

const MarkdownRenderer = ({ content }: { content: string }) => {
  return (
    <div className="text-slate-300 text-xs leading-relaxed space-y-3 max-h-[480px] overflow-y-auto pr-2 custom-markdown border border-white/5 rounded-lg p-4 bg-[#111827]/40">
      <ReactMarkdown
        components={{
          h1: ({node, ...props}) => <h1 className="text-sm font-bold text-slate-100 mt-4 mb-2 border-b border-white/5 pb-1 uppercase tracking-wide" {...props} />,
          h2: ({node, ...props}) => <h2 className="text-xs font-bold text-slate-200 mt-3.5 mb-1.5 flex items-center gap-1.5 border-l-2 border-blue-500 pl-2" {...props} />,
          h3: ({node, ...props}) => <h3 className="text-[11px] font-bold text-slate-300 mt-3 mb-1" {...props} />,
          p: ({node, ...props}) => <p className="mb-2.5 text-slate-300 leading-normal" {...props} />,
          ul: ({node, ...props}) => <ul className="list-disc pl-4.5 mb-3 space-y-1 text-slate-400" {...props} />,
          ol: ({node, ...props}) => <ol className="list-decimal pl-4.5 mb-3 space-y-1 text-slate-400" {...props} />,
          li: ({node, ...props}) => <li className="text-slate-300" {...props} />,
          code: ({node, ...props}) => <code className="bg-[#111827] border border-white/5 px-1.5 py-0.5 rounded text-[10px] text-blue-400 font-mono" {...props} />,
          strong: ({node, ...props}) => <strong className="font-semibold text-slate-100" {...props} />,
          blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-blue-500 bg-blue-500/5 px-3 py-1.5 rounded-r-lg italic my-2 text-slate-400" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

const getBrowserName = (proc: string) => {
  const p = (proc || "").toLowerCase();
  if (p.includes("chrome")) return "Google Chrome";
  if (p.includes("msedge") || p.includes("edge")) return "Microsoft Edge";
  if (p.includes("firefox")) return "Mozilla Firefox";
  if (p.includes("opera")) return "Opera";
  if (p.includes("safari")) return "Safari";
  return "Web Browser";
};

// ==========================================
// MAIN DASHBOARD COMPONENT
// ==========================================
export default function EmployeeDashboard() {
  const router = useRouter();
  const [employeeName, setEmployeeName] = useState<string | null>(null);
  const [roleName, setRoleName] = useState<string>("Knowledge Worker");
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"daily" | "yesterday" | "weekly" | "monthly" | "all" | "custom">("daily");
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().split("T")[0]);
  const [userStatus, setUserStatus] = useState<string>("online");
  const [geminiClassifications, setGeminiClassifications] = useState<Record<string, GeminiClassificationResult>>({});

  // Stream UI states
  const [visibleLogsCount, setVisibleLogsCount] = useState(10);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  // AI Daily Summary States
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const statusOptions = useMemo(() => [
    { value: "online", label: "Online" },
    { value: "dnd", label: "DND (Do Not Disturb)" },
    { value: "idle", label: "Idle" },
    { value: "offline", label: "Offline" }
  ], []);

  const timeFilterOptions = useMemo(() => [
    { value: "daily", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "weekly", label: "This Week" },
    { value: "monthly", label: "This Month" },
    { value: "custom", label: "Custom Date" },
    { value: "all", label: "All Time" }
  ], []);

  const getSummaryCacheKey = (name: string): string => {
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    return `ai_summary::${name}::${dateStr}`;
  };

  useEffect(() => {
    const role = localStorage.getItem("userRole");
    const name = localStorage.getItem("userName");
    if (role !== "employee" || !name) {
      router.push("/");
    } else {
      setEmployeeName(name);
      fetchEmployeeRole(name);
      const localStatus = localStorage.getItem("userStatus") || "online";
      setUserStatus(localStatus);
    }
  }, [router]);

  useEffect(() => {
    if (employeeName) {
      fetchActivityLogs(employeeName, timeFilter, customDate);
    }
  }, [employeeName, timeFilter, customDate]);

  // Real-Time Postgres listener (zero-polling)
  useEffect(() => {
    if (isLoading || !employeeName) return;

    const channel = supabase
      .channel("activity-channel-employee")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs", filter: `employee_name=eq.${employeeName}` }, (payload) => {
        fetchActivityLogs(employeeName, timeFilter, customDate);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isLoading, employeeName, timeFilter, customDate]);

  // Load and fetch Gemini classifications for all unique activities
  useEffect(() => {
    if (!logs.length) return;

    const newClassifications: Record<string, GeminiClassificationResult> = { ...geminiClassifications };
    let stateChanged = false;
    const pendingFetches: Array<{ appName: string; website: string; key: string }> = [];

    logs.forEach(log => {
      if (log.app_name === "IDLE" || log.app_name === "Unknown" || log.app_name?.startsWith("STATUS_CHANGE")) return;

      const cacheKey = getGeminiCacheKey(log.app_name, log.website, roleName);
      if (newClassifications[cacheKey]) return;

      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          newClassifications[cacheKey] = JSON.parse(cached);
          stateChanged = true;
        } catch (e) {
          localStorage.removeItem(cacheKey);
        }
      } else {
        pendingFetches.push({ appName: log.app_name, website: log.website, key: cacheKey });
      }
    });

    if (stateChanged) {
      setGeminiClassifications(newClassifications);
    }

    if (pendingFetches.length > 0) {
      const fetchAll = async () => {
        for (const item of pendingFetches) {
          const result = await fetchGeminiClassification(item.appName, item.website, roleName);
          if (result) {
            localStorage.setItem(item.key, JSON.stringify(result));
            setGeminiClassifications(prev => ({ ...prev, [item.key]: result }));
          }
        }
      };
      fetchAll();
    }
  }, [logs, roleName]);

  // Load cache of AI summary for the day
  useEffect(() => {
    if (employeeName) {
      const cacheKey = getSummaryCacheKey(employeeName);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setAiSummary(cached);
      } else {
        setAiSummary(null);
      }
      setSummaryError(null);
    }
  }, [employeeName]);

  const handleStatusChange = async (newStatus: string) => {
    setUserStatus(newStatus);
    localStorage.setItem("userStatus", newStatus);
    const name = employeeName || localStorage.getItem("userName");
    if (!name) return;

    try {
      await supabase.from("activity_logs").insert([{
        employee_name: name,
        app_name: `STATUS_CHANGE | ${newStatus}`,
        website: "status",
        start_time: new Date().toISOString(),
        end_time: new Date().toISOString(),
        duration_seconds: 0,
        category: "Neutral",
        productivity_score: 0
      }]);
      // Immediately fetch logs to show status change
      fetchActivityLogs(name, timeFilter, customDate);
    } catch (err) {
      console.warn("Could not sync status change log to Supabase.", err);
    }
  };

  const fetchEmployeeRole = async (name: string) => {
    try {
      const { data: empData } = await supabase
        .from("employees")
        .select("department")
        .eq("name", name)
        .single();
      if (empData && empData.department) {
        setRoleName(getNormalizedRoleName(empData.department));
      } else {
        const { data: userData } = await supabase
          .from("users")
          .select("id")
          .eq("username", name)
          .single();
        if (userData) {
          const { data: roleData } = await supabase
            .from("employee_roles")
            .select("role_id, roles(name)")
            .eq("employee_id", userData.id)
            .single();
          if (roleData && (roleData as any).roles) {
            setRoleName(getNormalizedRoleName((roleData as any).roles.name));
            return;
          }
        }
        setRoleName("Knowledge Worker");
      }
    } catch (e) {
      setRoleName("Knowledge Worker");
    }
  };

  async function fetchActivityLogs(name: string, filter: string, targetDateStr?: string) {
    setIsLoading(true);
    let query = supabase
      .from("activity_logs")
      .select("*")
      .eq("employee_name", name);

    if (filter === "custom" && targetDateStr) {
      const [year, month, day] = targetDateStr.split("-").map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);

      query = query
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfDay.toISOString());
    } else if (filter === "yesterday") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);

      query = query
        .gte("start_time", startOfYesterday.toISOString())
        .lt("start_time", startOfToday.toISOString());
    } else if (filter === "weekly") {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const startOfWeek = new Date(today);
      startOfWeek.setDate(today.getDate() - dayOfWeek);
      startOfWeek.setHours(0, 0, 0, 0);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      endOfWeek.setHours(23, 59, 59, 999);

      query = query
        .gte("start_time", startOfWeek.toISOString())
        .lte("start_time", endOfWeek.toISOString());
    } else if (filter === "monthly") {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

      query = query
        .gte("start_time", startOfMonth.toISOString())
        .lte("start_time", endOfMonth.toISOString());
    } else if (filter === "daily") {
      const cutoffDate = new Date();
      cutoffDate.setHours(0, 0, 0, 0);
      query = query.gte("start_time", cutoffDate.toISOString());
    }

    const { data, error } = await query
      .order("start_time", { ascending: false })
      .limit(500);

    if (!error && data) {
      setLogs(data);
    }
    setIsLoading(false);
  }

  const handleRefresh = async () => {
    if (!employeeName) return;
    setIsRefreshing(true);
    try {
      await fetchActivityLogs(employeeName, timeFilter, customDate);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };

  const handleGenerateAISummary = async () => {
    if (!employeeName) return;
    setIsSummaryLoading(true);
    setSummaryError(null);

    try {
      const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
      if (!apiKey || apiKey === "your_gemini_api_key" || apiKey.includes("your_actual")) {
        throw new Error("Gemini API key is not configured or is a placeholder.");
      }

      // Group and aggregate activities
      const aggregationMap: Record<string, { app: string; context: string; category: string; totalDurationSeconds: number; occurrences: number }> = {};
      
      classifiedLogs.forEach(l => {
        const app = l.ai?.cleanName || l.app_name;
        const context = l.website || l.app_name;
        const category = l.ai?.category || l.category;
        const key = `${app}::${context}::${category}`;
        
        if (!aggregationMap[key]) {
          aggregationMap[key] = {
            app,
            context,
            category,
            totalDurationSeconds: 0,
            occurrences: 0
          };
        }
        aggregationMap[key].totalDurationSeconds += l.duration_seconds;
        aggregationMap[key].occurrences += 1;
      });

      const logsSummary = Object.values(aggregationMap)
        .sort((a, b) => b.totalDurationSeconds - a.totalDurationSeconds)
        .map(item => ({
          app: item.app,
          context: item.context,
          category: item.category,
          totalDuration: formatDuration(item.totalDurationSeconds),
          sessionsCount: item.occurrences
        }));

      const prompt = `You are a corporate AI workforce analyst.
Analyze the following WFH activity logs for employee "${employeeName}" (Role: ${roleName}) for today.

WFH Activity Logs:
${JSON.stringify(logsSummary, null, 2)}

Please generate a single, very short paragraph (maximum 3 sentences) summarizing the employee's daily productivity, key work achievements, and main distractions.
**Strict Formatting Constraints**:
- Return ONLY a single short paragraph.
- Do NOT use headings, titles, lists, or bullet points.
- Do NOT include any efficiency scores, tips, advice, or recommendations.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              temperature: 0.2,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const summaryText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!summaryText) {
        throw new Error("Failed to receive content from Gemini API.");
      }

      const cacheKey = getSummaryCacheKey(employeeName);
      localStorage.setItem(cacheKey, summaryText);
      setAiSummary(summaryText);
    } catch (err: any) {
      console.error(err);
      setSummaryError(err.message || "An unexpected error occurred during summary generation.");
    } finally {
      setIsSummaryLoading(false);
    }
  };

  // Sort and classify logs chronologically exactly once
  const classifiedLogs = useMemo(() => {
    const sorted = [...logs].sort(
      (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
    );

    return sorted.map((log, index) => {
      const contextHistory = sorted.slice(Math.max(0, index - 4), index).map(l => ({
        app_name: l.app_name,
        website: l.website,
        timestamp: l.start_time
      }));

      const cacheKey = getGeminiCacheKey(log.app_name, log.website, roleName);
      const geminiCls = geminiClassifications[cacheKey] || null;

      const ai = classifyActivityWithAI(
        log.app_name,
        log.website,
        log.category || "Neutral",
        roleName,
        log.duration_seconds || 0,
        contextHistory,
        geminiCls
      );

      return {
        ...log,
        ai
      };
    });
  }, [logs, roleName, geminiClassifications]);

  // Descending logs list for table view (latest first)
  const tableLogs = useMemo(() => {
    return [...classifiedLogs].reverse();
  }, [classifiedLogs]);

  const totalDuration = useMemo(() => {
    return classifiedLogs
      .filter(l => !l.app_name?.startsWith("STATUS_CHANGE"))
      .reduce((sum, log) => sum + (log.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const productivityRate = useMemo(() => {
    let productive = 0;
    let total = 0;
    classifiedLogs
      .filter(l => !l.app_name?.startsWith("STATUS_CHANGE"))
      .forEach(log => {
        const duration = log.duration_seconds || 0;
        const cat = log.ai.category;
        if (cat !== "Idle") {
          if (cat === "Productive" || cat === "Neutral") {
            productive += duration;
          }
          total += duration;
        }
      });
    return total > 0 ? Math.round((productive / total) * 100) : 0;
  }, [classifiedLogs]);

  const productivityData = useMemo(() => {
    let productive = 0;
    let unproductive = 0;
    let idle = 0;
    let neutral = 0;

    classifiedLogs.forEach(log => {
      const duration = log.duration_seconds || 0;
      const cat = log.ai.category;

      if (cat === "Idle") {
        idle += duration;
      } else if (cat === "Productive") {
        productive += duration;
      } else if (cat === "Unproductive") {
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
  }, [classifiedLogs]);

  const topApps = useMemo(() => {
    const appMap: Record<string, { duration: number, category: string }> = {};
    classifiedLogs.forEach(log => {
      const appName = log.ai.cleanName;
      if (!appMap[appName]) {
        appMap[appName] = { duration: 0, category: log.ai.category };
      }
      appMap[appName].duration += (log.duration_seconds || 0);
    });

    return Object.entries(appMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 5); // Top 5
  }, [classifiedLogs]);

  // Hourly focus and trend data formatted for Recharts
  const hourlyFocusTrend = useMemo(() => {
    const hoursMap: Record<number, { 
      activeDuration: number; 
      productiveDuration: number;
      scoreSum: number;
      scoreCount: number;
      apps: Set<string>;
    }> = {};
    
    for (let i = 0; i <= 23; i++) {
      hoursMap[i] = {
        activeDuration: 0,
        productiveDuration: 0,
        scoreSum: 0,
        scoreCount: 0,
        apps: new Set<string>()
      };
    }

    classifiedLogs.forEach(a => {
      if (!a.start_time) return;
      const date = new Date(a.start_time);
      const hour = date.getHours();
      if (hour >= 0 && hour <= 23) {
        const duration = a.duration_seconds || 0;
        const cat = a.ai.category;
        const app = a.ai.cleanName;
        
        if (cat !== "Idle" && !a.app_name?.startsWith("STATUS_CHANGE")) {
          hoursMap[hour].activeDuration += duration;
          if (cat === "Productive" || cat === "Neutral") {
            hoursMap[hour].productiveDuration += duration;
          }
          hoursMap[hour].scoreSum += a.ai.score;
          hoursMap[hour].scoreCount++;
          if (app && app !== "Unknown" && app !== "Web Browser") {
            hoursMap[hour].apps.add(app);
          }
        }
      }
    });

    return Object.entries(hoursMap).map(([hourStr, val]) => {
      const hour = parseInt(hourStr);
      const period = hour >= 12 ? "PM" : "AM";
      const formatHour = hour % 12 === 0 ? 12 : hour % 12;
      const timeLabel = `${formatHour} ${period}`;
      
      const focusScore = val.scoreCount > 0 
        ? Math.max(0, Math.min(100, Math.round(((val.scoreSum / val.scoreCount) + 10) * 5))) 
        : 0;
        
      const activityScore = Math.min(100, Math.round((val.activeDuration / 3600) * 100));
      
      const productivityScore = val.activeDuration > 0 
        ? Math.round((val.productiveDuration / val.activeDuration) * 100) 
        : 0;
        
      const activeAppsList = Array.from(val.apps).slice(0, 3);
      const activeAppsStr = activeAppsList.length > 0 ? activeAppsList.join(", ") : "None";

      return {
        time: timeLabel,
        hour: hour,
        "Focus Score": focusScore,
        "Activity Score": activityScore,
        "Productivity Score": productivityScore,
        "Active Apps": activeAppsStr
      };
    });
  }, [classifiedLogs]);

  const totalIdleTime = useMemo(() => {
    return classifiedLogs
      .filter(a => a.ai.category === "Idle")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const totalDailyTime = useMemo(() => {
    return classifiedLogs.reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const totalNonIdleTime = useMemo(() => {
    return classifiedLogs
      .filter(a => a.ai.category !== "Idle")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [classifiedLogs]);

  const longestIdlePeriod = useMemo(() => {
    const idleLogs = classifiedLogs.filter(a => a.ai.category === "Idle");
    if (idleLogs.length === 0) return 0;
    return Math.max(...idleLogs.map(l => l.duration_seconds || 0));
  }, [classifiedLogs]);

  const timelineSummaryStats = useMemo(() => {
    const activeHours = hourlyFocusTrend.filter(h => h["Activity Score"] > 0 || h["Focus Score"] > 0);
    const avgFocus = activeHours.length > 0 
      ? Math.round(activeHours.reduce((sum, h) => sum + h["Focus Score"], 0) / activeHours.length)
      : 0;

    // Find peak focus hour
    let peakHourObj = { time: "—", score: -1 };
    hourlyFocusTrend.forEach(h => {
      if (h["Focus Score"] > peakHourObj.score && h["Activity Score"] > 0) {
        peakHourObj = { time: h.time, score: h["Focus Score"] };
      }
    });

    const peakFocusTime = peakHourObj.score > 0 ? peakHourObj.time : "—";
    
    return {
      avgFocus,
      peakFocusTime
    };
  }, [hourlyFocusTrend]);

  const distributionStats = useMemo(() => {
    let productive = 0;
    let neutral = 0;
    let unproductive = 0;
    let idle = 0;

    classifiedLogs.forEach(a => {
      if (a.app_name?.startsWith("STATUS_CHANGE")) return;
      const duration = a.duration_seconds || 0;
      const cat = a.ai.category;
      if (cat === "Productive") productive += duration;
      else if (cat === "Neutral") neutral += duration;
      else if (cat === "Unproductive") unproductive += duration;
      else if (cat === "Idle") idle += duration;
    });

    const total = productive + neutral + unproductive + idle;
    
    return {
      productive: { duration: productive, pct: total > 0 ? Math.round((productive / total) * 100) : 0 },
      neutral: { duration: neutral, pct: total > 0 ? Math.round((neutral / total) * 100) : 0 },
      unproductive: { duration: unproductive, pct: total > 0 ? Math.round((unproductive / total) * 100) : 0 },
      idle: { duration: idle, pct: total > 0 ? Math.round((idle / total) * 100) : 0 },
      total
    };
  }, [classifiedLogs]);

  // Hourly Productivity Heatmap state
  const heatmapData = useMemo(() => {
    const hourlyIntensity: Record<number, { score: number; count: number }> = {};
    for (let i = 9; i <= 18; i++) {
      hourlyIntensity[i] = { score: 0, count: 0 };
    }

    classifiedLogs.forEach(log => {
      const date = new Date(log.start_time);
      const hour = date.getHours();
      if (hour >= 9 && hour <= 18) {
        hourlyIntensity[hour].score += log.ai.score;
        hourlyIntensity[hour].count++;
      }
    });

    return Object.entries(hourlyIntensity).map(([hour, val]) => {
      const avg = val.count > 0 ? val.score / val.count : 0;
      let colorClass = "bg-slate-800/40 border-slate-800";
      if (val.count > 0) {
        if (avg > 6) colorClass = "bg-emerald-500/25 border-emerald-500/20 text-emerald-400 glow-sm";
        else if (avg > 2) colorClass = "bg-indigo-500/20 border-indigo-500/10 text-indigo-400";
        else if (avg >= 0) colorClass = "bg-slate-700/30 border-slate-800 text-slate-400";
        else colorClass = "bg-rose-500/25 border-rose-500/20 text-rose-400";
      }
      return {
        hour: parseInt(hour),
        label: `${parseInt(hour) % 12 === 0 ? 12 : parseInt(hour) % 12} ${parseInt(hour) >= 12 ? 'PM' : 'AM'}`,
        avg,
        count: val.count,
        colorClass
      };
    });
  }, [classifiedLogs]);

  const timeFilterLabel = useMemo(() => {
    switch (timeFilter) {
      case "daily": return "today";
      case "yesterday": return "yesterday";
      case "weekly": return "this week";
      case "monthly": return "this month";
      case "custom": return "on selected date";
      case "all": return "all time";
      default: return "today";
    }
  }, [timeFilter]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070b13] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
          <div className="text-slate-400 text-xs font-medium tracking-wide mt-1">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 p-4 md:p-6 font-sans selection:bg-blue-500/30 overflow-x-hidden relative">
      <div className="fixed inset-0 bg-[#070b13] -z-10" />

      <div className="max-w-7xl mx-auto space-y-4 relative z-10">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 border-b border-slate-800 pb-3 relative z-30">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              <Laptop className="w-5 h-5 text-blue-500" /> Employee Dashboard <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-900 text-slate-400 border border-slate-800 rounded">Console</span>
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium tracking-wide uppercase">
              Welcome back, {employeeName}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-200 border border-slate-800 rounded transition-all cursor-pointer flex items-center justify-center"
              title="Refresh logs & dashboard"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : "text-slate-400"}`} />
            </button>
            <button
              onClick={handleLogout}
              className="px-3 py-1.5 bg-red-950/20 hover:bg-red-950/40 text-red-400 border border-red-900/20 rounded transition-all text-xs font-medium cursor-pointer"
            >
              Logout
            </button>
          </div>
        </header>

        {/* KPI STATUS BAR */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <CompactStatWidget
            label="Active Time"
            value={formatDuration(totalDuration)}
            sub="Total duration tracked"
            colorClass="text-blue-400"
          />
          <CompactStatWidget
            label="Productivity Rate"
            value={`${productivityRate}%`}
            sub={`Average score ${timeFilterLabel}`}
            colorClass={productivityRate >= 70 ? "text-emerald-400" : "text-slate-300"}
          />
          <CompactStatWidget
            label="Your Role"
            value={FALLBACK_ROLES[roleName]?.name || roleName.replace("_", " ")}
            sub="Assigned department"
            colorClass="text-indigo-400"
          />
          <CompactStatWidget
            label="Active Status"
            value={userStatus === "dnd" ? "DND" : userStatus}
            sub="Current presence status"
            colorClass={userStatus === "online" ? "text-emerald-400" : userStatus === "dnd" ? "text-rose-400" : "text-amber-400"}
          />
        </div>

        {/* SETTINGS CONTROL BAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#121826] border border-slate-800 p-2 rounded shadow-sm relative z-30">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dashboard Settings</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            {/* Presence status Dropdown */}
            <div className="flex items-center gap-2 bg-[#111827] border border-slate-800 rounded px-2.5 py-0.5 h-[32px]">
              <span className={`w-1.5 h-1.5 rounded-full ${userStatus === "online" ? "bg-emerald-500" :
                userStatus === "dnd" ? "bg-rose-500 animate-pulse" :
                  userStatus === "idle" ? "bg-amber-500" :
                    "bg-slate-500"
                }`} />
              <Dropdown
                options={statusOptions}
                value={userStatus}
                onChange={handleStatusChange}
                className="!bg-transparent border-none !px-0 text-xs text-slate-305"
              />
            </div>

            {/* Time filters Dropdown */}
            <div className="flex items-center gap-2">
              <Dropdown
                options={timeFilterOptions}
                value={timeFilter}
                onChange={(val) => setTimeFilter(val as any)}
                icon={CalendarDays}
              />
              {timeFilter === "custom" && (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="px-2.5 py-1 bg-[#121826] border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all font-sans cursor-pointer h-[32px] [color-scheme:dark]"
                />
              )}
            </div>
          </div>
        </div>

        {/* MIDDLE CHARTS & TRENDS GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Productivity Distribution stacked horizontal bar style */}
          <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden col-span-1">
            <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-500" />
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Work Distribution</h2>
              </div>
            </div>

            <div className="p-3.5">
              <div className="grid grid-cols-3 gap-1.5 bg-[#111827]/40 border border-slate-800 rounded p-2 mb-4">
                <div className="text-center">
                  <span className="text-[8px] uppercase font-bold text-slate-500 block">Total Time</span>
                  <span className="text-xs font-semibold text-slate-300 block mt-0.5 font-mono">{formatDuration(totalDailyTime)}</span>
                </div>
                <div className="text-center border-l border-slate-800">
                  <span className="text-[8px] uppercase font-bold text-slate-500 block">Active Time</span>
                  <span className="text-xs font-semibold text-slate-300 block mt-0.5 font-mono">{formatDuration(totalNonIdleTime)}</span>
                </div>
                <div className="text-center border-l border-slate-800">
                  <span className="text-[8px] uppercase font-bold text-slate-500 block">Idle Time</span>
                  <span className="text-xs font-semibold text-slate-300 block mt-0.5 font-mono">{formatDuration(totalIdleTime)}</span>
                </div>
              </div>

              {distributionStats.total === 0 ? (
                <div className="text-slate-505 text-center py-10 text-[11px] font-mono">
                  No data logs available.
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Segmented Horizontal Bar */}
                  <div className="w-full h-5 flex rounded overflow-hidden bg-slate-800 border border-slate-700">
                    {distributionStats.productive.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.productive.pct}%` }} 
                        className="bg-[#10B981] h-full" 
                        title={`Productive: ${formatDuration(distributionStats.productive.duration)} (${distributionStats.productive.pct}%)`} 
                      />
                    )}
                    {distributionStats.neutral.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.neutral.pct}%` }} 
                        className="bg-[#3B82F6] h-full" 
                        title={`Neutral: ${formatDuration(distributionStats.neutral.duration)} (${distributionStats.neutral.pct}%)`} 
                      />
                    )}
                    {distributionStats.unproductive.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.unproductive.pct}%` }} 
                        className="bg-[#EF4444] h-full" 
                        title={`Unproductive: ${formatDuration(distributionStats.unproductive.duration)} (${distributionStats.unproductive.pct}%)`} 
                      />
                    )}
                    {distributionStats.idle.pct > 0 && (
                      <div 
                        style={{ width: `${distributionStats.idle.pct}%` }} 
                        className="bg-[#6B7280] h-full" 
                        title={`Idle: ${formatDuration(distributionStats.idle.duration)} (${distributionStats.idle.pct}%)`} 
                      />
                    )}
                  </div>

                  {/* Summary Metrics */}
                  <div className="space-y-1.5 text-[10px] font-mono">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#10B981]" />
                        <span className="text-slate-400">Productive Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.productive.duration)} ({distributionStats.productive.pct}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#3B82F6]" />
                        <span className="text-slate-400">Neutral Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.neutral.duration)} ({distributionStats.neutral.pct}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#EF4444]" />
                        <span className="text-slate-400">Unproductive Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.unproductive.duration)} ({distributionStats.unproductive.pct}%)
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded bg-[#6B7280]" />
                        <span className="text-slate-400">Idle Time:</span>
                      </div>
                      <span className="text-slate-200 font-semibold">
                        {formatDuration(distributionStats.idle.duration)} ({distributionStats.idle.pct}%)
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Focus & Activity Timeline AreaChart */}
          <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden col-span-1 lg:col-span-2">
            <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Focus & Activity Timeline</h2>
              </div>
            </div>

            <div className="p-3">
              {/* Timeline Header Summary stats */}
              <div className="grid grid-cols-4 gap-2 bg-[#111827]/40 border border-slate-800 rounded p-2 mb-3 text-center text-[10px] font-mono">
                <div>
                  <span className="text-slate-500 uppercase text-[8px] font-bold block">Avg Focus Score</span>
                  <span className="text-xs font-bold text-blue-400 block mt-0.5">{timelineSummaryStats.avgFocus}%</span>
                </div>
                <div className="border-l border-slate-800">
                  <span className="text-slate-500 uppercase text-[8px] font-bold block">Peak Focus Time</span>
                  <span className="text-xs font-bold text-emerald-400 block mt-0.5">{timelineSummaryStats.peakFocusTime}</span>
                </div>
                <div className="border-l border-slate-800">
                  <span className="text-slate-500 uppercase text-[8px] font-bold block">Total Active</span>
                  <span className="text-xs font-bold text-slate-300 block mt-0.5">{formatDuration(totalNonIdleTime)}</span>
                </div>
                <div className="border-l border-slate-800">
                  <span className="text-slate-500 uppercase text-[8px] font-bold block">Longest Idle</span>
                  <span className="text-xs font-bold text-amber-500 block mt-0.5">{formatDuration(longestIdlePeriod)}</span>
                </div>
              </div>

              <div className="min-h-[196px] -ml-4 relative">
                {classifiedLogs.length === 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center text-slate-500 text-xs font-mono">
                    No data logs recorded.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={196}>
                    <AreaChart data={hourlyFocusTrend}>
                      <defs>
                        <linearGradient id="focusColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.15}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.02)" vertical={false} />
                      <XAxis dataKey="time" stroke="#475569" tick={{ fill: "#64748b", fontSize: 8 }} tickLine={false} axisLine={false} />
                      <YAxis stroke="#475569" tick={{ fill: "#64748b", fontSize: 8 }} tickLine={false} axisLine={false} domain={[0, 100]} />
                      
                      <ReTooltip content={<TimelineTooltip />} />
                      
                      <ReferenceArea 
                        x1="10 AM" 
                        x2="6 PM" 
                        fill="rgba(59, 130, 246, 0.08)" 
                        label={{ value: 'WORKING HOURS', position: 'insideTop', fill: '#3B82F6', fontSize: 8, fontWeight: 'bold', opacity: 0.4, letterSpacing: '0.05em' }} 
                      />
                      <ReferenceLine x="10 AM" stroke="#3b82f6" strokeDasharray="3 3" opacity={0.4} />
                      <ReferenceLine x="6 PM" stroke="#3b82f6" strokeDasharray="3 3" opacity={0.4} />

                      <Area
                        type="monotone"
                        dataKey="Focus Score"
                        stroke="#3B82F6"
                        strokeWidth={1.5}
                        fillOpacity={1}
                        fill="url(#focusColor)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

        </div>

        {/* HOURLY HEATMAP GRID */}
        <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Hourly Productivity Heatmap</h2>
            </div>
          </div>

          <div className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-3">
              {heatmapData.map((cell) => (
                <div
                  key={cell.hour}
                  className={`flex flex-col items-center justify-between p-3 rounded-xl border text-center transition-all duration-300 hover:scale-[1.02] ${cell.colorClass}`}
                >
                  <span className="text-[10px] font-medium text-slate-400">{cell.label}</span>
                  <span className="text-base font-semibold text-slate-105 mt-2">
                    {cell.count > 0 ? (cell.avg > 0 ? `+${cell.avg.toFixed(0)}` : cell.avg.toFixed(0)) : "—"}
                  </span>
                  <span className="text-[9px] text-slate-500 font-medium mt-1 font-mono">
                    {cell.count} {cell.count === 1 ? 'act' : 'acts'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* DAILY AI SUMMARY */}
        <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden animate-in slide-in-from-bottom-2 duration-150">
          <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Daily AI Work Summary</h2>
            </div>
            <div className="flex items-center gap-2">
              {aiSummary && (
                <button
                  onClick={handleGenerateAISummary}
                  disabled={isSummaryLoading}
                  className="p-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-400 hover:text-slate-200 border border-slate-800 rounded transition-all cursor-pointer flex items-center justify-center"
                  title="Re-generate summary"
                >
                  <RefreshCw className={`w-3 h-3 ${isSummaryLoading ? "animate-spin text-blue-400" : ""}`} />
                </button>
              )}
              <span className="text-[9px] font-mono text-slate-405 bg-[#111827] px-1.5 py-0.5 border border-slate-800 rounded">
                {FALLBACK_ROLES[roleName]?.name || roleName.replace("_", " ")}
              </span>
            </div>
          </div>

          <div className="p-4">
            {classifiedLogs.length === 0 ? (
              <div className="text-center py-6 text-slate-505 text-xs">
                No activity logs recorded for today in the selected period.
              </div>
            ) : isSummaryLoading ? (
              <div className="flex flex-col items-center justify-center text-slate-500 py-10">
                <div className="w-5 h-5 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mb-2"></div>
                <p className="text-[11px] font-mono tracking-wide">Compiling summary insights...</p>
              </div>
            ) : summaryError ? (
              <div className="text-center text-rose-400 py-6 text-xs">
                <p className="font-semibold mb-1">Failed to generate summary</p>
                <p className="text-[10px] text-slate-505 mb-2">{summaryError}</p>
                <button
                  onClick={handleGenerateAISummary}
                  className="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-medium transition-all cursor-pointer inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </div>
            ) : aiSummary ? (
              <MarkdownRenderer content={aiSummary} />
            ) : (
              <div className="text-center py-6">
                <p className="text-[11px] text-slate-400 mb-3 font-medium">AI summary report is available for today's {classifiedLogs.length} sessions.</p>
                <button
                  onClick={handleGenerateAISummary}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-semibold shadow-sm transition-all cursor-pointer flex items-center gap-1.5 mx-auto"
                >
                  <Sparkles className="w-3.5 h-3.5 text-blue-205" /> Compile Summary Insights
                </button>
              </div>
            )}
          </div>
        </div>

        {/* MOST USED APPS LIST */}
        <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Laptop className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Most Used Apps</h2>
            </div>
          </div>

          <div className="p-4">
            {topApps.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs font-mono">
                No apps tracked yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {topApps.map((app, index) => (
                  <div key={app.name} className="bg-[#111827] border border-slate-800 rounded-xl p-4 hover:border-slate-700 hover:bg-[#111827]/80 transition-all shadow-sm">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-semibold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-md">#{index + 1}</span>
                      <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider
                      ${app.category === 'Productive' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/10' :
                          app.category === 'Idle' ? 'bg-slate-500/10 text-slate-400 border border-slate-500/10' :
                            app.category === 'Unproductive' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/10' :
                              'bg-blue-500/10 text-blue-400 border border-blue-500/10'}`}
                      >
                        {app.category}
                      </span>
                    </div>
                    <h3 className="font-medium text-slate-202 truncate mt-1 text-xs" title={app.name}>{app.name}</h3>
                    <p className="text-base font-semibold text-slate-100 mt-2">
                      {formatDuration(app.duration)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* LIVE RAW ACTIVITY STREAM */}
        <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-800 flex items-center justify-between bg-[#111827]/80">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Live Raw Activity Stream</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="p-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-slate-400 hover:text-slate-200 border border-slate-800 rounded transition-all cursor-pointer flex items-center justify-center"
                title="Refresh activity logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-blue-400" : ""}`} />
              </button>
              <span className="text-[10px] text-slate-500 font-mono">Showing {Math.min(visibleLogsCount, tableLogs.length)} of {tableLogs.length} entries</span>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left whitespace-nowrap border-collapse">
              <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-[#111827]/40 border-b border-slate-800">
                <tr>
                  <th className="w-10 px-4 py-2" />
                  <th className="px-4 py-2 font-semibold">Process / App</th>
                  <th className="px-4 py-2 font-semibold">Classification</th>
                  <th className="px-4 py-2 font-semibold">Start</th>
                  <th className="px-4 py-2 font-semibold">Duration</th>
                  <th className="px-4 py-2 font-semibold text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {tableLogs.slice(0, visibleLogsCount).map((item, index) => {
                  const ai = item.ai;
                  const isStatusEntry = (item.app_name || "").startsWith("STATUS_CHANGE");
                  const isBrowserEntry = !isStatusEntry && ((item.app_name || "").toLowerCase().includes("chrome") ||
                    (item.app_name || "").toLowerCase().includes("browser") ||
                    (item.website || "").includes("."));
                  const isExpanded = expandedRowId === (item.id || index);

                  const parts = (item.app_name || "").split(" | ");
                  const processName = parts[0] || "Unknown";
                  const windowTitle = parts.slice(1).join(" | ") || "—";

                  return (
                    <Fragment key={item.id || index}>
                      <tr
                        className={`hover:bg-slate-800/20 transition-colors cursor-pointer ${isExpanded ? "bg-slate-800/10" : ""}`}
                        onClick={() => setExpandedRowId(isExpanded ? null : (item.id || index))}
                      >
                        <td className="px-4 py-1.5 text-center">
                          <ChevronDown className={`w-3.5 h-3.5 mx-auto text-slate-505 transition-all duration-300 ${isExpanded ? "rotate-180 text-blue-500" : ""}`} />
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-200 max-w-[280px] truncate">
                              {ai.cleanName}
                            </span>
                            <span className={`text-[8px] font-bold px-1 py-0.2 rounded border tracking-wider uppercase ${isStatusEntry ? "bg-purple-500/10 text-purple-400 border-purple-500/10" :
                                isBrowserEntry ? "bg-blue-500/10 text-blue-400 border-blue-500/10" :
                                  "bg-amber-500/10 text-amber-400 border-amber-500/10"
                              }`}>
                              {isStatusEntry ? "System" : isBrowserEntry ? "Domain" : "App"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-1.5">
                          <span
                            className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] font-semibold border uppercase tracking-wide"
                            style={{
                              backgroundColor: `${getCategoryColor(ai.category)}15`,
                              color: getCategoryColor(ai.category),
                              borderColor: `${getCategoryColor(ai.category)}10`,
                            }}
                          >
                            {ai.category}
                          </span>
                        </td>
                        <td className="px-4 py-1.5 text-slate-400 font-mono text-[11px]">{formatTime(item.start_time)}</td>
                        <td className="px-4 py-1.5 text-slate-400 font-mono text-[11px]">{formatDuration(item.duration_seconds)}</td>
                        <td className="px-4 py-1.5 text-right">
                          <span className={`font-semibold font-mono text-xs ${ai.score > 0 ? "text-emerald-400" : ai.score < 0 ? "text-rose-400" : "text-slate-400"}`}>
                            {ai.score > 0 ? "+" : ""}{ai.score}
                          </span>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="bg-[#111827]/40">
                          <td colSpan={6} className="px-6 py-3 border-b border-slate-800">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 animate-in fade-in duration-150">
                              {isBrowserEntry ? (
                                <>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Active Browser</p>
                                    <p className="text-xs font-semibold text-slate-200 bg-[#070b13] border border-slate-800 p-2 rounded">
                                      {getBrowserName(processName)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Website Name</p>
                                    <p className="text-xs font-semibold text-slate-200 bg-[#070b13] border border-slate-800 p-2 rounded">
                                      {ai.cleanName}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Website Domain / URL</p>
                                    <p className="text-xs font-mono text-blue-400 bg-[#070b13] border border-slate-800 p-2 rounded break-all font-semibold">
                                      {item.website || "—"}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Activity Log ID</p>
                                    <p className="text-xs text-slate-400 font-mono bg-[#070b13] border border-slate-800 p-2 rounded">
                                      #{item.id || index}
                                    </p>
                                  </div>
                                  <div className="md:col-span-4 mt-1">
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Active Tab Title</p>
                                    <p className="text-xs font-medium text-slate-300 leading-normal bg-[#070b13] border border-slate-800 p-2 rounded break-all font-mono">
                                      {windowTitle}
                                    </p>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Active Application</p>
                                    <p className="text-xs font-semibold text-slate-200 bg-[#070b13] border border-slate-800 p-2 rounded">
                                      {ai.cleanName}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Process Executable</p>
                                    <p className="text-xs font-mono text-slate-300 bg-[#070b13] border border-slate-800 p-2 rounded">
                                      {processName}
                                    </p>
                                  </div>
                                  <div className="md:col-span-2">
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Activity Log ID</p>
                                    <p className="text-xs text-slate-400 font-mono bg-[#070b13] border border-slate-800 p-2 rounded">
                                      #{item.id || index}
                                    </p>
                                  </div>
                                  <div className="md:col-span-4 mt-1">
                                    <p className="text-[9px] uppercase font-bold text-slate-500 mb-1">Active Window Title</p>
                                    <p className="text-xs font-medium text-slate-300 leading-normal bg-[#070b13] border border-slate-800 p-2 rounded break-all font-mono">
                                      {windowTitle}
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                {tableLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500 font-mono text-xs">
                      Waiting for live activity logs...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {tableLogs.length > visibleLogsCount && (
            <div className="flex justify-center py-2 border-t border-slate-800 bg-[#111827]/40">
              <button
                onClick={() => setVisibleLogsCount(prev => Math.min(prev + 10, tableLogs.length))}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-colors text-xs font-medium flex items-center gap-1.5 cursor-pointer"
              >
                Load More Activity Logs
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
