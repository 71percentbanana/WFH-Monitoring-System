import time
import datetime
import logging
import json
import socket
import sys
from pathlib import Path

logging.basicConfig(
    filename="tracker.log",
    level=logging.INFO,
    format="%(asctime)s - %(message)s"
)

import win32gui
import win32process
import psutil

from pynput import keyboard, mouse
from supabase import create_client

# =====================================================
# SUPABASE CONFIG
# =====================================================

url = "https://utwklfackfqmkmpmhvri.supabase.co"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2tsZmFja2ZxbWttcG1odnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzgwNzUsImV4cCI6MjA5NDY1NDA3NX0.7rNmCSgR8AOYsR-bhozYJiWRPtVqWwKy-UU9cECPa84"

supabase = create_client(url, key)

# =====================================================
# AGENT CONFIG
# =====================================================

def get_app_folder():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent
    return Path(__file__).parent


def load_agent_config():
    app_folder = get_app_folder()
    config_path = app_folder / "agent_config.json"

    device_id = socket.gethostname()

    default_config = {
        "employee_id": f"UNREGISTERED-{device_id}",
        "employee_name": "Unregistered Employee",
        "employee_email": "",
        "department": "Unknown",
        "device_id": device_id
    }

    if not config_path.exists():
        return default_config

    with open(config_path, "r", encoding="utf-8") as file:
        config = json.load(file)

    config["device_id"] = config.get("device_id") or device_id

    return config


agent_config = load_agent_config()

employee_id = agent_config["employee_id"]
employee_name = agent_config["employee_name"]
employee_email = agent_config.get("employee_email", "")
department = agent_config.get("department", "Unknown")
device_id = agent_config["device_id"]

# =====================================================
# AUTO-REGISTER EMPLOYEE
# =====================================================

def register_employee():
    try:
        data = {
            "id": employee_id,
            "name": employee_name,
            "email": employee_email,
            "device_id": device_id,
            "department": department
        }

        supabase.table("employees").upsert(data).execute()

        logging.info(f"Employee registered: {employee_name} - {device_id}")

    except Exception as e:
        logging.error(f"Employee registration failed: {e}")

# =====================================================
# PRODUCTIVITY RULES
# =====================================================

PRODUCTIVITY_RULES = {

    # =================================================
    # DISTRACTING WEBSITES FIRST
    # =================================================

    "youtube": ("Distracting", -5),

    "instagram": ("Distracting", -10),

    "facebook": ("Distracting", -10),

    "netflix": ("Distracting", -10),

    "twitter": ("Distracting", -5),

    "reddit": ("Distracting", -5),

    # =================================================
    # PRODUCTIVE WEBSITES
    # =================================================

    "github": ("Productive", 10),

    "stackoverflow": ("Productive", 8),

    "jira": ("Productive", 9),

    "chatgpt": ("Productive", 7),

    "notion": ("Productive", 8),

    # =================================================
    # PRODUCTIVE APPS
    # =================================================

    "code.exe": ("Productive", 10),

    "pycharm64.exe": ("Productive", 10),

    "notion.exe": ("Productive", 8),

    "slack.exe": ("Work Communication", 7),

    "teams.exe": ("Work Communication", 7),

    # =================================================
    # ENTERTAINMENT APPS
    # =================================================

    "spotify.exe": ("Entertainment", 2),

    "discord.exe": ("Communication", 4),

    # =================================================
    # SYSTEM
    # =================================================

    "explorer.exe": ("System", 3),

    "idle": ("Idle", 0),

    # =================================================
    # BROWSERS (PRODUCTIVE)
    # =================================================

    "chrome.exe": ("Productive", 5),

    "msedge.exe": ("Productive", 5),

    "firefox.exe": ("Productive", 5)
}

# =====================================================
# IDLE DETECTION
# =====================================================

last_input_time = time.time()
IDLE_THRESHOLD = 60  # seconds


def update_activity(*args):
    global last_input_time
    last_input_time = time.time()


# Keyboard listener
keyboard.Listener(
    on_press=update_activity
).start()

# Mouse listener
mouse.Listener(
    on_move=update_activity,
    on_click=update_activity,
    on_scroll=update_activity
).start()

# =====================================================
# PRODUCTIVITY CLASSIFIER
# =====================================================

def classify_activity(activity):

    activity_lower = activity.lower()

    for keyword, value in PRODUCTIVITY_RULES.items():

        if keyword in activity_lower:
            return value

    return ("Unknown", 0)

# =====================================================
# SESSION TRACKING
# =====================================================

def start_tracking():
    global last_input_time

    register_employee()

    last_activity = None
    activity_start_time = None

    logging.info("Employee Monitoring Started")
    print("Employee Monitoring Started...\n", flush=True)

    # =====================================================
    # MAIN LOOP
    # =====================================================

    while True:

        idle_time = time.time() - last_input_time

        # =================================================
        # DETECT CURRENT ACTIVITY
        # =================================================

        if idle_time >= IDLE_THRESHOLD:

            current_activity = "IDLE"

        else:

            hwnd = win32gui.GetForegroundWindow()

            window_title = win32gui.GetWindowText(hwnd)

            _, pid = win32process.GetWindowThreadProcessId(hwnd)

            try:
                process = psutil.Process(pid)
                process_name = process.name()

            except:
                process_name = "Unknown"

            current_activity = (
                f"{process_name} | {window_title}"
            )

        # =================================================
        # FIRST ACTIVITY
        # =================================================

        if last_activity is None:

            last_activity = current_activity
            activity_start_time = datetime.datetime.now()

        # =================================================
        # ACTIVITY CHANGED
        # =================================================

        elif current_activity != last_activity:

            end_time = datetime.datetime.now()

            duration = int(
                (
                    end_time - activity_start_time
                ).total_seconds()
            )

            # =================================================
            # PRODUCTIVITY ANALYSIS
            # =================================================

            category, score = classify_activity(
                last_activity
            )

            # =================================================
            # TERMINAL OUTPUT
            # =================================================

            print("\n===================================", flush=True)
            logging.info("Activity Finished")
            print("Activity :", last_activity, flush=True)
            print("Duration :", duration, "seconds", flush=True)
            print("Category :", category, flush=True)
            print("Score    :", score, flush=True)
            print("===================================\n", flush=True)

            # =================================================
            # SAVE TO SUPABASE
            # =================================================

            data = {
                "employee_id": employee_id,
                "employee_name": employee_name,
                "employee_email": employee_email,
                "device_id": device_id,
                "department": department,
                "app_name": last_activity,
                "website": last_activity,
                "start_time": activity_start_time.isoformat(),
                "end_time": end_time.isoformat(),
                "duration_seconds": duration,
                "category": category,
                "productivity_score": score
            }

            try:

                supabase.table(
                    "activity_logs"
                ).insert(data).execute()

                logging.info("Session saved to Supabase")

            except Exception as e:

                logging.error(f"Database Error: {e}")

            # =================================================
            # START NEW SESSION
            # =================================================

            last_activity = current_activity
            activity_start_time = end_time

        time.sleep(2)