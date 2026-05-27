from supabase import create_client
from collections import Counter

# =====================================================
# SUPABASE CONFIG
# =====================================================

url = "https://utwklfackfqmkmpmhvri.supabase.co"

key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2tsZmFja2ZxbWttcG1odnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzgwNzUsImV4cCI6MjA5NDY1NDA3NX0.7rNmCSgR8AOYsR-bhozYJiWRPtVqWwKy-UU9cECPa84"

supabase = create_client(url, key)

employee_name = "Alvin"

# =====================================================
# FETCH DATA
# =====================================================

response = supabase.table(
    "activity_logs"
).select("*").eq(
    "employee_name",
    employee_name
).execute()

logs = response.data

# =====================================================
# ANALYTICS VARIABLES
# =====================================================

productive_time = 0

distracting_time = 0

idle_time = 0

neutral_time = 0

total_score = 0

task_switches = len(logs)

focus_sessions = 0

app_counter = Counter()

website_counter = Counter()

# =====================================================
# PROCESS LOGS
# =====================================================

for log in logs:

    duration = log.get(
        "duration_seconds", 0
    ) or 0

    category = (
        log.get("category", "")
        or ""
    )

    score = log.get(
        "productivity_score", 0
    ) or 0

    app_name = (
        log.get("app_name", "")
        or ""
    )

    website = (
        log.get("website", "")
        or ""
    )

    # ---------------------------------------------
    # CATEGORY TIME
    # ---------------------------------------------

    if category == "Productive":
        productive_time += duration

    elif category == "Distracting":
        distracting_time += duration

    elif category == "Idle":
        idle_time += duration

    else:
        neutral_time += duration

    # ---------------------------------------------
    # PRODUCTIVITY SCORE
    # ---------------------------------------------

    total_score += score

    # ---------------------------------------------
    # FOCUS SESSIONS
    # ---------------------------------------------

    if (
        category == "Productive"
        and duration >= 1800
    ):
        focus_sessions += 1

    # ---------------------------------------------
    # APP COUNTERS
    # ---------------------------------------------

    app_counter[app_name] += duration

    website_counter[website] += duration

# =====================================================
# FORMAT TIME
# =====================================================

def format_time(seconds):

    hours = seconds // 3600

    minutes = (
        seconds % 3600
    ) // 60

    return f"{hours}h {minutes}m"

# =====================================================
# TOP APP & WEBSITE
# =====================================================

top_app = (
    app_counter.most_common(1)[0][0]
    if app_counter else "N/A"
)

top_website = (
    website_counter.most_common(1)[0][0]
    if website_counter else "N/A"
)

# =====================================================
# PRODUCTIVITY %
# =====================================================

total_time = (
    productive_time
    + distracting_time
    + neutral_time
)

if total_time > 0:

    productivity_percent = int(
        (
            productive_time / total_time
        ) * 100
    )

else:

    productivity_percent = 0

# =====================================================
# REPORT
# =====================================================

print("\n===================================")

print("DAILY PRODUCTIVITY REPORT")

print("===================================\n")

print("Employee :", employee_name)

print(
    "Productive Time :",
    format_time(productive_time)
)

print(
    "Distracting Time :",
    format_time(distracting_time)
)

print(
    "Idle Time :",
    format_time(idle_time)
)

print(
    "Neutral Time :",
    format_time(neutral_time)
)

print(
    "Task Switches :",
    task_switches
)

print(
    "Focus Sessions :",
    focus_sessions
)

print(
    "Top App :",
    top_app
)

print(
    "Top Website :",
    top_website
)

print(
    "Productivity % :",
    f"{productivity_percent}%"
)

print(
    "Total Productivity Score :",
    total_score
)

print("\n===================================\n")
