"use client";

import { useEffect, useState, useMemo, Fragment } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  AreaChart, Area, Line, ReferenceLine, ReferenceArea,
} from "recharts";
import {
  Users, Activity, TrendingUp, Clock, ChevronDown,
  BarChart2, PieChart as PieIcon, Target, Zap, AlertTriangle, Layers,
  Flame, Award, Sparkles, ShieldAlert, Terminal, Timer,
  RefreshCw, Sliders, CalendarDays, ChevronRight, Eye, Brain
} from "lucide-react";
import { classifyActivityWithAI, PRODUCTIVITY_COLORS, FALLBACK_ROLES, getNormalizedRoleName } from "../../lib/classifier";
import { calculateSessionMetrics } from "../../lib/sessionEngine";
import Dropdown from "../components/Dropdown";
import { fetchGroqClassificationsBatch, getGroqCacheKey, GroqClassificationResult } from "../../lib/groqClassifier";
import ReactMarkdown from "react-markdown";

// =================================================
// CONSTANTS & HELPERS
// =================================================
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

// =================================================
// COMPONENTS
// =================================================
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
            {entry.formatter
              ? entry.formatter(entry.value, entry.name, entry, i)
              : typeof entry.value === "number" && ["productive", "neutral", "unproductive", "idle"].includes(String(entry.name).toLowerCase())
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
        <div className="border-t border-slate-800 pt-1 mt-1 text-[9px] text-slate-500">
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

// =================================================
// MAIN ADMIN DASHBOARD
// =================================================
export default function AdminDashboard() {
  const router = useRouter();
  const [activities, setActivities] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [adminName, setAdminName] = useState("");

  // Department filter & selectors
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("All");
  const [selectedEmployee, setSelectedEmployee] = useState<string>("All");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<"daily" | "yesterday" | "weekly" | "monthly" | "all" | "custom">("daily");
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().split("T")[0]);

  const timeFilterOptions = useMemo(() => [
    { value: "daily", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "weekly", label: "This Week" },
    { value: "monthly", label: "This Month" },
    { value: "custom", label: "Custom Date" },
    { value: "all", label: "All Time" }
  ], []);

  // Database roles mappings
  const [employeeRolesMap, setEmployeeRolesMap] = useState<Record<string, string>>({});

  // Detail Row expanded state
  const [expandedRowId, setExpandedRowId] = useState<number | null>(null);

  // Registered employees list from DB
  const [registeredEmployees, setRegisteredEmployees] = useState<string[]>([]);
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [groqClassifications, setGroqClassifications] = useState<Record<string, GroqClassificationResult>>({});

  // Visible activity log limit for pagination
  const [visibleLogsCount, setVisibleLogsCount] = useState(10);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // AI Daily Summary States
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const getSummaryCacheKey = (employeeName: string): string => {
    const dateStr = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    return `ai_summary::${employeeName}::${dateStr}`;
  };

  useEffect(() => {
    if (selectedEmployee && selectedEmployee !== "All") {
      const cacheKey = getSummaryCacheKey(selectedEmployee);
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        setAiSummary(cached);
      } else {
        setAiSummary(null);
      }
      setSummaryError(null);
    } else {
      setAiSummary(null);
      setSummaryError(null);
    }
  }, [selectedEmployee]);

  const handleGenerateAISummary = async () => {
    if (!selectedEmployee || selectedEmployee === "All") return;
    setIsSummaryLoading(true);
    setSummaryError(null);

    try {
      const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
      if (!apiKey || apiKey === "your_groq_api_key" || apiKey.includes("your_actual")) {
        throw new Error("Groq API key is not configured or is a placeholder.");
      }

      // Group and aggregate activities to fit within Groq's 12,000 TPM limit
      const aggregationMap: Record<string, { app: string; context: string; category: string; totalDurationSeconds: number; occurrences: number }> = {};
      
      filteredActivities.forEach(l => {
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

      const roleName = employeeRolesMap[selectedEmployee] || "Knowledge Worker";

      const prompt = `You are a corporate AI workforce analyst.
Analyze the following WFH activity logs for employee "${selectedEmployee}" (Role: ${roleName}) for today.

WFH Activity Logs:
${JSON.stringify(logsSummary, null, 2)}

Please generate a single, very short paragraph (maximum 3 sentences) summarizing the employee's daily productivity, key work achievements, and main distractions.
**Strict Formatting Constraints**:
- Return ONLY a single short paragraph.
- Do NOT use headings, titles, lists, or bullet points.
- Do NOT include any efficiency scores, tips, advice, or recommendations.`;

      const response = await fetch(
        `https://api.groq.com/openai/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq API error status ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const summaryText = data.choices?.[0]?.message?.content;
      
      if (!summaryText) {
        throw new Error("Failed to receive content from Groq API.");
      }

      // Cache it
      const cacheKey = getSummaryCacheKey(selectedEmployee);
      localStorage.setItem(cacheKey, summaryText);
      setAiSummary(summaryText);
    } catch (err: any) {
      console.error(err);
      setSummaryError(err.message || "An unexpected error occurred during summary generation.");
    } finally {
      setIsSummaryLoading(false);
    }
  };

  // Fetch initial mappings and raw logs
  const loadData = async (currentFilter: string = "daily", targetDateStr?: string, targetEmployee: string = "All") => {
    // 1. Fetch Employees (from the employees table)
    const { data: employeesData } = await supabase
      .from("employees")
      .select("*");

    if (employeesData) {
      setEmployeesList(employeesData);
      const empNames = employeesData
        .map((e: any) => e.name)
        .filter(Boolean);
      setRegisteredEmployees(empNames);

      // Map employee names to their departments
      const map: Record<string, string> = {};
      employeesData.forEach((e: any) => {
        if (e.name) {
          map[e.name] = getNormalizedRoleName(e.department || "Engineering");
        }
      });
      setEmployeeRolesMap(map);
    }

    // 2. Fetch Activity Logs
    let query = supabase
      .from("activity_logs")
      .select("*");

    if (targetEmployee && targetEmployee !== "All") {
      query = query.eq("employee_name", targetEmployee);
    }

    if (currentFilter === "custom" && targetDateStr) {
      const [year, month, day] = targetDateStr.split("-").map(Number);
      const startOfDay = new Date(year, month - 1, day, 0, 0, 0, 0);
      const endOfDay = new Date(year, month - 1, day, 23, 59, 59, 999);
      
      query = query
        .gte("start_time", startOfDay.toISOString())
        .lte("start_time", endOfDay.toISOString());
    } else if (currentFilter === "yesterday") {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const startOfYesterday = new Date(startOfToday);
      startOfYesterday.setDate(startOfYesterday.getDate() - 1);
      
      query = query
        .gte("start_time", startOfYesterday.toISOString())
        .lt("start_time", startOfToday.toISOString());
    } else if (currentFilter === "weekly") {
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
    } else if (currentFilter === "monthly") {
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1, 0, 0, 0, 0);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

      query = query
        .gte("start_time", startOfMonth.toISOString())
        .lte("start_time", endOfMonth.toISOString());
    } else if (currentFilter === "daily") {
      const cutoffDate = new Date();
      cutoffDate.setHours(0, 0, 0, 0);
      query = query.gte("start_time", cutoffDate.toISOString());
    }

    const { data: logsData, error } = await query
      .order("start_time", { ascending: false })
      .limit(500);

    if (!error && logsData) {
      setActivities(logsData);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData(timeFilter, customDate, selectedEmployee);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Sync selected employee with search input
  useEffect(() => {
    if (selectedEmployee === "All") {
      setSearchTerm("");
    } else {
      setSearchTerm(selectedEmployee);
    }
  }, [selectedEmployee]);

  // Authentication Guard
  useEffect(() => {
    const role = localStorage.getItem("userRole");
    const name = localStorage.getItem("userName");
    if (role !== "admin") {
      router.push("/");
    } else {
      setAdminName(name || "Admin");
      setIsLoading(false);
    }
  }, [router]);

  // Initial Fetches and Zero-Polling Real-Time stream
  useEffect(() => {
    if (isLoading) return;

    loadData(timeFilter, customDate, selectedEmployee);

    // Bind dynamic Real-Time postgres insertion trigger (zero-polling)
    const channel = supabase
      .channel("activity-channel-admin")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activity_logs" }, (payload) => {
        loadData(timeFilter, customDate, selectedEmployee);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isLoading, timeFilter, customDate, selectedEmployee]);

  // Load and fetch Groq classifications for all unique activities in the admin view
  useEffect(() => {
    if (!activities.length) return;

    const newClassifications: Record<string, GroqClassificationResult> = { ...groqClassifications };
    let stateChanged = false;
    const pendingFetches: Array<{ appName: string; website: string; roleName: string; key: string }> = [];

    activities.forEach(log => {
      if (log.app_name === "IDLE" || log.app_name === "Unknown" || log.app_name?.startsWith("STATUS_CHANGE")) return;

      const roleName = employeeRolesMap[log.employee_name] || "Knowledge Worker";
      const cacheKey = getGroqCacheKey(log.app_name, log.website, roleName);
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
        pendingFetches.push({ appName: log.app_name, website: log.website, roleName, key: cacheKey });
      }
    });

    if (stateChanged) {
      setGroqClassifications(newClassifications);
    }

    if (pendingFetches.length > 0) {
      const fetchAll = async () => {
        const chunkSize = 15;
        const chunks = [];
        for (let i = 0; i < pendingFetches.length; i += chunkSize) {
          chunks.push(pendingFetches.slice(i, i + chunkSize));
        }

        for (const chunk of chunks) {
          const results = await fetchGroqClassificationsBatch(
            chunk.map(item => ({
              appName: item.appName,
              website: item.website,
              roleName: item.roleName,
              key: item.key
            }))
          );

          setGroqClassifications(prev => {
            const next = { ...prev };
            for (const key in results) {
              localStorage.setItem(key, JSON.stringify(results[key]));
              next[key] = results[key];
            }
            return next;
          });
        }
      };
      fetchAll();
    }
  }, [activities, employeeRolesMap]);

  const handleLogout = () => {
    localStorage.removeItem("userRole");
    localStorage.removeItem("userName");
    router.push("/");
  };

  // =================================================
  // COGNITIVE INTEL COMPUTATIONS
  // =================================================
  const uniqueEmployees = useMemo(() => {
    return ["All", ...registeredEmployees];
  }, [registeredEmployees]);

  const matchingEmployees = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return [];
    return uniqueEmployees.filter(empName => {
      if (empName === "All") return false;
      if (empName.toLowerCase().includes(term)) return true;
      const empProfile = employeesList.find(e => e.name?.toLowerCase() === empName.toLowerCase());
      if (empProfile && empProfile.id?.toLowerCase().includes(term)) return true;
      return false;
    });
  }, [uniqueEmployees, searchTerm, employeesList]);

  const availableRolesList = useMemo(() =>
    ["All", ...Object.values(FALLBACK_ROLES).map(r => r.name)],
    []);

  const departmentOptions = useMemo(() => {
    return availableRolesList.map(role => ({
      value: role,
      label: role === "All" ? "All Departments" : role.replace("_", " ").toUpperCase()
    }));
  }, [availableRolesList]);

  const employeeOptions = useMemo(() => {
    return uniqueEmployees
      .filter(emp => {
        if (emp === "All") return true;
        const role = employeeRolesMap[emp] || "Knowledge Worker";
        return selectedRoleFilter === "All" || role === selectedRoleFilter;
      })
      .map(emp => ({
        value: emp,
        label: emp === "All" ? "All Employees" : emp
      }));
  }, [uniqueEmployees, employeeRolesMap, selectedRoleFilter]);

  // Sort and classify WFH activities exactly once
  const classifiedActivities = useMemo(() => {
    return activities.map((log) => {
      const roleName = employeeRolesMap[log.employee_name] || "Knowledge Worker";
      const cacheKey = getGroqCacheKey(log.app_name, log.website, roleName);
      const groqCls = groqClassifications[cacheKey] || null;
      const ai = classifyActivityWithAI(
        log.app_name,
        log.website,
        log.category || "Neutral",
        roleName,
        log.duration_seconds || 0,
        [],
        groqCls
      );
      return {
        ...log,
        ai
      };
    });
  }, [activities, employeeRolesMap, groqClassifications]);

  // Individual statistics
  const employeeSessionStats = useMemo(() => {
    const list: {
      username: string;
      roleName: string;
      productivityRate: number;
      totalDuration: number;
      currentStatus: string;
      logs: any[];
    }[] = [];

    const usernames = uniqueEmployees.filter(e => e !== "All");

    usernames.forEach(user => {
      const empLogs = classifiedActivities.filter(a => a.employee_name === user);
      const roleName = employeeRolesMap[user] || "Knowledge Worker";

      let productiveDuration = 0;
      let activeDuration = 0;
      let totalDuration = 0;
      empLogs.filter(l => !l.app_name?.startsWith("STATUS_CHANGE")).forEach(l => {
        const duration = l.duration_seconds || 0;
        const cat = l.ai.category;
        if (cat !== "Idle") {
          if (cat === "Productive" || cat === "Neutral") {
            productiveDuration += duration;
          }
          activeDuration += duration;
        }
        totalDuration += duration;
      });

      const productivityRate = activeDuration > 0 ? Math.round((productiveDuration / activeDuration) * 100) : 0;
      const statusLog = empLogs.find(l => l.app_name?.startsWith("STATUS_CHANGE"));
      let currentStatus = statusLog ? statusLog.app_name.split(" | ")[1] || "offline" : "offline";

      // Heartbeat fallback: if any activity was logged in the last 5 minutes, mark the user as online
      const lastActiveLog = empLogs.find(l => !l.app_name?.startsWith("STATUS_CHANGE"));
      if (lastActiveLog) {
        const lastActiveTime = new Date(lastActiveLog.end_time || lastActiveLog.start_time).getTime();
        const timeDiffMinutes = (Date.now() - lastActiveTime) / 60000;
        if (timeDiffMinutes <= 5) {
          if (currentStatus === "offline" || !currentStatus) {
            currentStatus = "online";
          }
        }
      }

      list.push({
        username: user,
        roleName,
        productivityRate,
        totalDuration: totalDuration,
        currentStatus,
        logs: empLogs
      });
    });

    return list.sort((a, b) => b.productivityRate - a.productivityRate);
  }, [classifiedActivities, employeeRolesMap, uniqueEmployees]);

  // Apply filters
  const filteredEmployeesStats = useMemo(() => {
    return employeeSessionStats.filter(emp => {
      const matchesRole = selectedRoleFilter === "All" || emp.roleName === selectedRoleFilter;
      const matchesEmployee = selectedEmployee === "All" || emp.username === selectedEmployee;
      return matchesRole && matchesEmployee;
    });
  }, [employeeSessionStats, selectedRoleFilter, selectedEmployee]);

  // Aggregated Team Stats
  const teamAggregates = useMemo(() => {
    const total = filteredEmployeesStats.length;
    if (total === 0) {
      return { avgProductivity: 0, totalHoursTracked: 0, activeCount: 0, mostActiveUser: "-" };
    }
    const sumProductivity = filteredEmployeesStats.reduce((s, e) => s + e.productivityRate, 0);
    const totalTime = filteredEmployeesStats.reduce((s, e) => s + e.totalDuration, 0);
    const activeOnline = filteredEmployeesStats.filter(e => e.currentStatus === "online" || e.currentStatus === "dnd").length;

    // Most active employee
    const sortedByTime = [...filteredEmployeesStats].sort((a, b) => b.totalDuration - a.totalDuration);
    const mostActiveUser = sortedByTime[0] ? sortedByTime[0].username : "-";

    return {
      avgProductivity: Math.round(sumProductivity / total),
      totalHoursTracked: parseFloat((totalTime / 3600).toFixed(1)),
      activeCount: activeOnline,
      mostActiveUser
    };
  }, [filteredEmployeesStats]);

  // Raw filtered activity list for graphs and timeline
  const filteredActivities = useMemo(() => {
    return classifiedActivities.filter(a => {
      const roleName = employeeRolesMap[a.employee_name] || "Knowledge Worker";
      const matchesRole = selectedRoleFilter === "All" || roleName === selectedRoleFilter;
      const matchesEmployee = selectedEmployee === "All" || a.employee_name === selectedEmployee;
      return matchesRole && matchesEmployee;
    });
  }, [classifiedActivities, selectedRoleFilter, selectedEmployee, employeeRolesMap]);

  // Timeline Logs for selected stepper employee
  const timelineLogs = useMemo(() => {
    if (!selectedEmployee || selectedEmployee === "All") return [];
    return classifiedActivities
      .filter(a => a.employee_name === selectedEmployee)
      .slice(0, 15) // Capture last 15 active steps
      .reverse(); // Chronological bottom-to-top stepper
  }, [classifiedActivities, selectedEmployee]);

  // Team Category Pie Chart Distribution (excluding Idle)
  const categoryChartData = useMemo(() => {
    const breakdown: Record<string, number> = {};
    filteredActivities.forEach(a => {
      if (a.ai.category !== "Idle") {
        breakdown[a.ai.category] = (breakdown[a.ai.category] || 0) + (a.duration_seconds || 0);
      }
    });
    return Object.entries(breakdown)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, raw: value }))
      .sort((a, b) => b.value - a.value);
  }, [filteredActivities]);

  // Total Idle Time for selected employee(s) / department
  const totalIdleTime = useMemo(() => {
    return filteredActivities
      .filter(a => a.ai.category === "Idle")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [filteredActivities]);

  // Total Daily Time for selected employee(s) / department
  const totalDailyTime = useMemo(() => {
    return filteredActivities.reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [filteredActivities]);

  // Total Non-Idle Time for selected employee(s) / department
  const totalNonIdleTime = useMemo(() => {
    return filteredActivities
      .filter(a => a.ai.category !== "Idle")
      .reduce((sum, a) => sum + (a.duration_seconds || 0), 0);
  }, [filteredActivities]);

  // Hourly Productivity Trend overall
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

    filteredActivities.forEach(a => {
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
      const parsedHour = hour;
      const period = parsedHour >= 12 ? "PM" : "AM";
      const formatHour = parsedHour % 12 === 0 ? 12 : parsedHour % 12;
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
  }, [filteredActivities]);

  const longestIdlePeriod = useMemo(() => {
    const idleLogs = filteredActivities.filter(a => a.ai.category === "Idle");
    if (idleLogs.length === 0) return 0;
    return Math.max(...idleLogs.map(l => l.duration_seconds || 0));
  }, [filteredActivities]);

  const longestIdleHourLabel = useMemo(() => {
    const idleLogs = filteredActivities.filter(a => a.ai.category === "Idle" && a.duration_seconds > 0);
    if (idleLogs.length === 0) return null;
    let longestLog = idleLogs[0];
    idleLogs.forEach(l => {
      if ((l.duration_seconds || 0) > (longestLog.duration_seconds || 0)) {
        longestLog = l;
      }
    });
    if (longestLog.duration_seconds < 120) return null; // Only show if > 2 mins
    if (!longestLog.start_time) return null;
    const date = new Date(longestLog.start_time);
    const hour = date.getHours();
    const period = hour >= 12 ? "PM" : "AM";
    const formatHour = hour % 12 === 0 ? 12 : hour % 12;
    return `${formatHour} ${period}`;
  }, [filteredActivities]);

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

    filteredActivities.forEach(a => {
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
  }, [filteredActivities]);




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

  if (isLoading) return (
    <div className="min-h-screen bg-[#0B1020] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-slate-400 text-xs font-medium tracking-wide mt-1">Loading dashboard...</div>
      </div>
    </div>
  );  return (
    <div className="min-h-screen bg-[#070b13] text-slate-100 p-4 md:p-6 font-sans selection:bg-blue-500/30 overflow-x-hidden relative">
      <div className="fixed inset-0 bg-[#070b13] -z-10" />

      <div className="max-w-7xl mx-auto space-y-4 relative z-10">

        {/* HEADER */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-3 border-b border-slate-800 pb-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              WFH Monitor <span className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-900 text-slate-400 border border-slate-800 rounded">Console</span>
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5 font-medium tracking-wide uppercase">
              Operational Workforce Control Panel
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
            <Link
              href="/admin/employees"
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 rounded transition-all text-xs font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-blue-500" /> Manage Employees
            </Link>
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
            label="Employees Online"
            value={String(teamAggregates.activeCount)}
            sub="Staff currently active"
            colorClass={teamAggregates.activeCount > 0 ? "text-emerald-400" : "text-slate-400"}
          />
          <CompactStatWidget
            label="Active Sessions"
            value={String(filteredEmployeesStats.length)}
            sub={selectedEmployee === "All" ? "Total employees" : "Filtered match"}
            colorClass="text-blue-400"
          />
          <CompactStatWidget
            label="Total Tracked Time"
            value={`${teamAggregates.totalHoursTracked}h`}
            sub={`Aggregated active time ${timeFilterLabel}`}
            colorClass="text-indigo-400"
          />
          <CompactStatWidget
            label="Overall Productivity"
            value={`${teamAggregates.avgProductivity}%`}
            sub={`Average score ${timeFilterLabel}`}
            colorClass={teamAggregates.avgProductivity >= 70 ? "text-emerald-400" : "text-slate-300"}
          />
        </div>

        {/* ADVANCED FILTERING CONTROL BAR */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#121826] border border-slate-800 p-2 rounded shadow-sm relative z-30">
          <div className="flex items-center gap-2">
            <Sliders className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dash Filtering</span>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
            <Dropdown
              options={departmentOptions}
              value={selectedRoleFilter}
              onChange={(val) => {
                setSelectedRoleFilter(val);
                setSelectedEmployee("All");
              }}
              label="Designation:"
            />

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

            {/* SEARCH EMPLOYEE TYPEAHEAD */}
            <div className="relative w-52 z-40">
              <div className="flex items-center bg-[#111827] border border-slate-800 rounded px-2.5 py-1 focus-within:ring-1 focus-within:ring-blue-500/50">
                <Users className="w-3.5 h-3.5 text-blue-500 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Search employee..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setIsDropdownOpen(true);
                  }}
                  onFocus={() => setIsDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                  className="w-full bg-transparent border-none text-slate-200 placeholder:text-slate-500 focus:outline-none text-xs h-[22px]"
                />
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm("");
                      setSelectedEmployee("All");
                    }}
                    className="text-slate-500 hover:text-slate-300 text-xs ml-1 focus:outline-none cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </div>
              {isDropdownOpen && matchingEmployees.length > 0 && (
                <div className="absolute left-0 right-0 mt-1 bg-[#121826] border border-slate-800 rounded shadow-xl max-h-48 overflow-y-auto z-50 divide-y divide-slate-800">
                  {matchingEmployees.map((empName) => {
                    const roleName = employeeRolesMap[empName] || "Knowledge Worker";
                    const roleLabel = roleName;
                    const empProfile = employeesList.find(e => e.name?.toLowerCase() === empName.toLowerCase());
                    const empIdText = empProfile ? ` • ${empProfile.id}` : "";
                    return (
                      <button
                        key={empName}
                        onClick={() => {
                          setSearchTerm(empName);
                          setSelectedEmployee(empName);
                          setIsDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 hover:bg-blue-500/10 hover:text-blue-400 transition-colors flex flex-col cursor-pointer"
                      >
                        <span className="text-xs font-medium text-slate-200 hover:text-inherit">{empName}</span>
                        <span className="text-[9px] text-slate-505 mt-0.5 uppercase tracking-wider font-mono">{roleLabel}{empIdText}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 1. EMPLOYEE MONITORING SECTION (TOP VISIBILITY) */}
        <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Workforce Activity Directory</h2>
            </div>
            <span className="text-[9px] font-mono text-slate-400 bg-[#111827] px-2 py-0.5 border border-slate-800 rounded">
              Real-time Console
            </span>
          </div>

          {filteredEmployeesStats.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No employees tracked under active selection.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left whitespace-nowrap border-collapse">
                <thead className="text-[10px] uppercase font-bold tracking-wider text-slate-400 bg-[#111827]/40 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-2 font-semibold">Status</th>
                    <th className="px-4 py-2 font-semibold">Employee</th>
                    <th className="px-4 py-2 font-semibold">Active Application</th>
                    <th className="px-4 py-2 font-semibold">Window Title / Resource</th>
                    <th className="px-4 py-2 font-semibold">Last Active</th>
                    <th className="px-4 py-2 font-semibold font-mono text-right">Active Time Today</th>
                    <th className="px-4 py-2 font-semibold text-right">Productivity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredEmployeesStats.map((emp) => {
                    const statusColors = {
                      online: { bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", dot: "bg-emerald-500", text: "Online" },
                      dnd: { bg: "bg-rose-500/10 text-rose-400 border-rose-500/20", dot: "bg-rose-500 animate-pulse", text: "DND" },
                      idle: { bg: "bg-amber-500/10 text-amber-400 border-amber-500/20", dot: "bg-amber-500", text: "Idle" },
                      offline: { bg: "bg-slate-800 text-slate-400 border-slate-700/50", dot: "bg-slate-500", text: "Offline" }
                    };
                    const status = (emp.currentStatus || "offline").toLowerCase() as keyof typeof statusColors;
                    const cfg = statusColors[status] || statusColors.offline;

                    const activeLogs = emp.logs.filter(l => !l.app_name?.startsWith("STATUS_CHANGE"));
                    const latestLog = activeLogs[0];
                    
                    const currentApp = latestLog ? latestLog.ai.cleanName : "—";
                    
                    let currentWindow = "—";
                    if (latestLog) {
                      const parts = (latestLog.app_name || "").split(" | ");
                      currentWindow = parts.slice(1).join(" | ") || latestLog.website || "—";
                    }
                    
                    const lastActiveTime = latestLog ? formatTimeCompact(latestLog.start_time) : "—";

                    return (
                      <tr 
                        key={emp.username} 
                        className={`hover:bg-slate-800/30 transition-colors cursor-pointer ${selectedEmployee === emp.username ? "bg-blue-500/5" : ""}`}
                        onClick={() => {
                          setSelectedEmployee(emp.username);
                          setSearchTerm(emp.username);
                        }}
                      >
                        <td className="px-4 py-1.5">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-[10px] font-semibold ${cfg.bg}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.text}
                          </span>
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex flex-col">
                            <span className="font-semibold text-slate-200">{emp.username}</span>
                            <span className="text-[9px] text-slate-500 font-mono uppercase tracking-wider">{FALLBACK_ROLES[emp.roleName]?.name || emp.roleName.replace("_", " ")}</span>
                          </div>
                        </td>
                        <td className="px-4 py-1.5 font-medium text-slate-300 max-w-[140px] truncate">{currentApp}</td>
                        <td className="px-4 py-1.5 text-slate-400 max-w-[320px] truncate" title={currentWindow}>{currentWindow}</td>
                        <td className="px-4 py-1.5 text-slate-500 font-mono">{lastActiveTime}</td>
                        <td className="px-4 py-1.5 text-right font-mono font-semibold text-slate-300">{formatDuration(emp.totalDuration)}</td>
                        <td className="px-4 py-1.5 text-right">
                          <span className={`font-semibold font-mono text-xs ${emp.productivityRate >= 70 ? 'text-emerald-400' : 'text-slate-300'}`}>
                            {emp.productivityRate}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 4. DIAGNOSTICS & TEAM CHARTS (SECONDARY GRID AT BOTTOM) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Work Distribution Stacked Segment Bar */}
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
                <div className="text-slate-500 text-center py-10 text-[11px] font-mono">
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

          {/* Focus & Activity Timeline (AreaChart) */}
          <div className="bg-[#121826] border border-slate-800 rounded shadow-sm overflow-hidden col-span-1 lg:col-span-2">
            <div className="px-4 py-2 border-b border-slate-800 bg-[#111827]/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Focus & Activity Timeline</h2>
              </div>
            </div>

            <div className="p-3">
              {/* Summary Stats above the Graph */}
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
                    
                    {/* Hover Tooltip */}
                    <ReTooltip content={<TimelineTooltip />} />
                    
                    {/* Shaded background for work hours: 10 AM to 6 PM */}
                    <ReferenceArea 
                      x1="10 AM" 
                      x2="6 PM" 
                      fill="rgba(59, 130, 246, 0.08)" 
                      label={{ value: 'WORKING HOURS', position: 'insideTop', fill: '#3B82F6', fontSize: 8, fontWeight: 'bold', opacity: 0.4, letterSpacing: '0.05em' }} 
                    />
                    <ReferenceLine x="10 AM" stroke="#3b82f6" strokeDasharray="3 3" opacity={0.4} />
                    <ReferenceLine x="6 PM" stroke="#3b82f6" strokeDasharray="3 3" opacity={0.4} />

                    {/* Area lines */}
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
              </div>
            </div>
          </div>

        </div>

        {/* 3. DAILY AI WORK SUMMARY (HIDDEN WHEN NO INDIVIDUAL EMPLOYEE IS SELECTED) */}
        {selectedEmployee !== "All" && (
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
                <span className="text-[9px] font-mono text-slate-400 bg-[#111827] px-1.5 py-0.5 border border-slate-800 rounded">
                  {employeeRolesMap[selectedEmployee] || "Knowledge Worker"}
                </span>
              </div>
            </div>

            <div className="p-4">
              {filteredActivities.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No activity logs recorded for this employee in the selected period.
                </div>
              ) : isSummaryLoading ? (
                <div className="flex flex-col items-center justify-center text-slate-500 py-10">
                  <div className="w-5 h-5 border-2 border-white/10 border-t-blue-500 rounded-full animate-spin mb-2"></div>
                  <p className="text-[11px] font-mono tracking-wide">Compiling summary insights...</p>
                </div>
              ) : summaryError ? (
                <div className="text-center text-rose-400 py-6 text-xs">
                  <p className="font-semibold mb-1">Failed to generate summary</p>
                  <p className="text-[10px] text-slate-500 mb-2">{summaryError}</p>
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
                  <p className="text-[11px] text-slate-400 mb-3 font-medium">AI summary report is available for today's {filteredActivities.length} sessions.</p>
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
        )}

        {/* 2. LIVE RAW ACTIVITY STREAM (PRIMARY FEATURE) */}
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
              <span className="text-[10px] text-slate-500 font-mono">Showing {Math.min(visibleLogsCount, filteredActivities.length)} of {filteredActivities.length} entries</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left whitespace-nowrap border-collapse">
              <thead className="text-[10px] uppercase tracking-wider text-slate-400 bg-[#111827]/40 border-b border-slate-800">
                <tr>
                  <th className="w-10 px-4 py-2" />
                  <th className="px-4 py-2 font-semibold">Employee</th>
                  <th className="px-4 py-2 font-semibold">Designation</th>
                  <th className="px-4 py-2 font-semibold">Process / App</th>
                  <th className="px-4 py-2 font-semibold">Classification</th>
                  <th className="px-4 py-2 font-semibold">Start</th>
                  <th className="px-4 py-2 font-semibold">Duration</th>
                  <th className="px-4 py-2 font-semibold text-right">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredActivities.slice(0, visibleLogsCount).map((item, index) => {
                  const roleName = FALLBACK_ROLES[employeeRolesMap[item.employee_name]]?.name || employeeRolesMap[item.employee_name] || "Knowledge Worker";
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
                          <ChevronDown className={`w-3.5 h-3.5 mx-auto text-slate-500 transition-all duration-300 ${isExpanded ? "rotate-180 text-blue-500" : ""}`} />
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-2">
                            <div className="w-5 h-5 rounded bg-blue-500/10 text-blue-400 flex items-center justify-center font-semibold text-[10px] border border-blue-500/20">
                              {item.employee_name?.charAt(0).toUpperCase() || "?"}
                            </div>
                            <span className="font-semibold text-slate-200">{item.employee_name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-1.5">
                          <span className="text-[9px] font-mono text-slate-305 uppercase bg-[#111827] px-1.5 py-0.5 border border-slate-800 rounded">
                            {roleName}
                          </span>
                        </td>
                        <td className="px-4 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-slate-200 max-w-[180px] truncate">
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
                          <td colSpan={8} className="px-6 py-3 border-b border-slate-800">
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
                {filteredActivities.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500 font-mono text-xs">
                      Waiting for live activity logs...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {filteredActivities.length > visibleLogsCount && (
            <div className="flex justify-center py-2 border-t border-slate-800 bg-[#111827]/40">
              <button
                onClick={() => setVisibleLogsCount(prev => Math.min(prev + 10, filteredActivities.length))}
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
