import time
import datetime
import sys
import io

# Fix Windows console Unicode encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import win32gui
import win32process
import win32api
import psutil

from supabase import create_client

# =====================================================
# SUPABASE CONFIG
# =====================================================
url = "https://utwklfackfqmkmpmhvri.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2tsZmFja2ZxbWttcG1odnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzgwNzUsImV4cCI6MjA5NDY1NDA3NX0.7rNmCSgR8AOYsR-bhozYJiWRPtVqWwKy-UU9cECPa84"
supabase = create_client(url, key)

employee_name = "Alvin"

# =====================================================
# PRODUCTIVITY RULES (Base classifications for tracker)
# =====================================================
PRODUCTIVITY_RULES = {
    "code.exe": ("Productive", 10),
    "pycharm64.exe": ("Productive", 10),
    "notion.exe": ("Productive", 8),
    "slack.exe": ("Work Communication", 7),
    "teams.exe": ("Work Communication", 7),
    "discord.exe": ("Communication", 4),
    "chrome.exe": ("Neutral", 5),
    "msedge.exe": ("Neutral", 5),
    "firefox.exe": ("Neutral", 5),
    "youtube": ("Distracting", -5),
    "instagram": ("Distracting", -10),
    "facebook": ("Distracting", -10),
    "spotify.exe": ("Entertainment", 2),
    "netflix": ("Entertainment", -10),
    "explorer.exe": ("System", 3),
    "idle": ("Idle", 0)
}

# =====================================================
# IDLE DETECTION
# =====================================================
IDLE_THRESHOLD = 60  # seconds
idle_accumulated = 0

def get_idle_time():
    try:
        return (win32api.GetTickCount() - win32api.GetLastInputInfo()) / 1000.0
    except Exception:
        return 0

# =====================================================
# PRODUCTIVITY CLASSIFIER & NORMALIZER
# =====================================================
def parse_domain(process_name, window_title):
    proc_lower = process_name.lower()
    title_lower = window_title.lower()
    
    if "chrome" in proc_lower or "edge" in proc_lower or "firefox" in proc_lower:
        # Extract probable site name from window title
        cleaned_title = window_title
        for b in ["google chrome", "microsoft edge", "firefox", "opera", "chrome"]:
            cleaned_title = cleaned_title.replace(b, "").replace("-", "").strip()
        
        parts = [p.strip() for p in cleaned_title.split("|") if p.strip()]
        if not parts:
            parts = [p.strip() for p in cleaned_title.split("-") if p.strip()]
            
        if parts:
            site = parts[-1]
            if "." in site:
                return site.lower()
            return f"{site.lower()}.com"
        return "web browser"
    return process_name

def classify_activity(activity):
    activity_lower = activity.lower()
    for keyword, value in PRODUCTIVITY_RULES.items():
        if keyword in activity_lower:
            return value
    return ("Unknown", 0)

# =====================================================
# SESSION TRACKING STATE
# =====================================================
last_activity = None
activity_start_time = None
app_switches = 0
session_idle_seconds = 0

print("Employee Monitoring Started with Rich Telemetry...", flush=True)

# =====================================================
# MAIN LOOP
# =====================================================
while True:
    idle_time = get_idle_time()
    
    if idle_time >= IDLE_THRESHOLD:
        current_activity = "IDLE"
        session_idle_seconds += 2
    else:
        hwnd = win32gui.GetForegroundWindow()
        window_title = win32gui.GetWindowText(hwnd)
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        
        try:
            process = psutil.Process(pid)
            process_name = process.name()
        except:
            process_name = "Unknown"
            
        current_activity = f"{process_name} | {window_title}"

    if last_activity is None:
        last_activity = current_activity
        activity_start_time = datetime.datetime.now()
        app_switches = 0
        session_idle_seconds = 0
    elif current_activity != last_activity:
        end_time = datetime.datetime.now()
        duration = int((end_time - activity_start_time).total_seconds())
        
        if duration > 0:
            category, score = classify_activity(last_activity)
            
            # Determine process, app name, and domain for telemetry
            parts = last_activity.split(" | ")
            proc = parts[0] if len(parts) > 0 else "Unknown"
            w_title = parts[1] if len(parts) > 1 else ""
            domain = parse_domain(proc, w_title)
            
            print("\n===================================", flush=True)
            print("Activity Switch Detected (Telemetry-Rich Log)", flush=True)
            print("Process    :", proc, flush=True)
            print("Title      :", w_title, flush=True)
            print("Domain     :", domain, flush=True)
            print("Duration   :", duration, "seconds (Idle:", session_idle_seconds, "s)", flush=True)
            print("Category   :", category, flush=True)
            print("Score      :", score, flush=True)
            print("===================================\n", flush=True)
            
            # Save rich log to Supabase
            data = {
                "employee_name": employee_name,
                "app_name": last_activity,
                "website": domain,
                "start_time": activity_start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "duration_seconds": duration,
                "category": category,
                "productivity_score": score
            }
            
            try:
                supabase.table("activity_logs").insert(data).execute()
                print("Session telemetry saved successfully.\n", flush=True)
            except Exception as e:
                print("Database Error:", e, flush=True)
                
        # Reset telemetry trackers for the new activity
        last_activity = current_activity
        activity_start_time = end_time
        app_switches += 1
        session_idle_seconds = 0
        
    time.sleep(2)