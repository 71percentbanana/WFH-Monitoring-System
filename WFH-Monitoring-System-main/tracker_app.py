import customtkinter as ctk
import time
import datetime
import threading
import sys
import io

# Fix Windows console Unicode encoding
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

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
# PRODUCTIVITY RULES
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

class TrackerApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        # App config
        self.title("WFH Tracker")
        self.geometry("400x500")
        self.resizable(False, False)
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        # Global State
        self.logged_in_user = None
        self.is_tracking = False
        self.last_input_time = time.time()
        self.IDLE_THRESHOLD = 60
        self.last_activity = None
        self.activity_start_time = None
        
        # Build UI
        self.show_login_frame()

    # =================================================
    # IDLE DETECTION CALLBACKS
    # =================================================
    def update_activity(self, *args):
        self.last_input_time = time.time()

    def classify_activity(self, activity):
        activity_lower = activity.lower()
        for keyword, value in PRODUCTIVITY_RULES.items():
            if keyword in activity_lower:
                return value
        return ("Unknown", 0)

    # =================================================
    # LOGIN UI
    # =================================================
    def show_login_frame(self):
        # Clear existing widgets
        for widget in self.winfo_children():
            widget.destroy()

        self.login_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.login_frame.pack(fill="both", expand=True, padx=40, pady=60)

        # Title
        title_label = ctk.CTkLabel(self.login_frame, text="WFH Tracker", font=ctk.CTkFont(size=28, weight="bold"))
        title_label.pack(pady=(0, 10))
        
        subtitle_label = ctk.CTkLabel(self.login_frame, text="Sign in to your employee account", text_color="gray")
        subtitle_label.pack(pady=(0, 40))

        # Inputs
        self.username_entry = ctk.CTkEntry(self.login_frame, placeholder_text="Username", height=45)
        self.username_entry.pack(fill="x", pady=10)

        self.password_entry = ctk.CTkEntry(self.login_frame, placeholder_text="Password", show="*", height=45)
        self.password_entry.pack(fill="x", pady=10)

        self.error_label = ctk.CTkLabel(self.login_frame, text="", text_color="red", font=ctk.CTkFont(size=12))
        self.error_label.pack(pady=5)

        # Login Button
        self.login_btn = ctk.CTkButton(self.login_frame, text="Log In", height=45, font=ctk.CTkFont(weight="bold"), command=self.handle_login)
        self.login_btn.pack(fill="x", pady=(10, 0))

    def handle_login(self):
        username = self.username_entry.get().strip()
        password = self.password_entry.get().strip()

        if not username or not password:
            self.error_label.configure(text="Please enter all fields")
            return

        self.login_btn.configure(state="disabled", text="Logging in...")
        
        # Verify with Supabase
        try:
            response = supabase.table("users").select("*").eq("username", username).eq("password", password).execute()
            data = response.data
            
            if len(data) > 0 and data[0]["role"] == "employee":
                self.logged_in_user = data[0]["username"]
                self.show_dashboard_frame()
            else:
                self.error_label.configure(text="Invalid credentials")
                self.login_btn.configure(state="normal", text="Log In")
        except Exception as e:
            self.error_label.configure(text="Database connection error")
            self.login_btn.configure(state="normal", text="Log In")

    # =================================================
    # DASHBOARD UI
    # =================================================
    def show_dashboard_frame(self):
        # Clear existing widgets
        for widget in self.winfo_children():
            widget.destroy()

        self.dash_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.dash_frame.pack(fill="both", expand=True, padx=40, pady=40)

        # Header
        welcome_label = ctk.CTkLabel(self.dash_frame, text=f"Welcome, {self.logged_in_user}", font=ctk.CTkFont(size=24, weight="bold"))
        welcome_label.pack(pady=(0, 5))

        # Status indicator
        self.status_frame = ctk.CTkFrame(self.dash_frame, fg_color="green", corner_radius=15, height=30)
        self.status_frame.pack(fill="x", pady=20)
        
        self.status_label = ctk.CTkLabel(self.status_frame, text="● Tracking Active", font=ctk.CTkFont(weight="bold", size=14), text_color="white")
        self.status_label.pack(pady=5)

        # Current App Display
        info_label = ctk.CTkLabel(self.dash_frame, text="Currently Tracking:", text_color="gray")
        info_label.pack(pady=(20, 0))
        
        self.current_app_label = ctk.CTkLabel(self.dash_frame, text="Initializing...", font=ctk.CTkFont(size=14), wraplength=300)
        self.current_app_label.pack(pady=(5, 30))

        # Logout Button
        self.logout_btn = ctk.CTkButton(self.dash_frame, text="Stop & Logout", height=45, fg_color="transparent", border_width=2, border_color="gray", text_color="gray", hover_color="#333333", command=self.handle_logout)
        self.logout_btn.pack(side="bottom", fill="x")

        # Start Tracking Thread
        self.is_tracking = True
        self.start_listeners()
        self.tracking_thread = threading.Thread(target=self.tracking_loop, daemon=True)
        self.tracking_thread.start()

    def handle_logout(self):
        self.is_tracking = False
        # Push final log if exists
        self.push_current_log()
        self.logged_in_user = None
        self.show_login_frame()

    # =================================================
    # TRACKING ENGINE
    # =================================================
    def start_listeners(self):
        keyboard.Listener(on_press=self.update_activity).start()
        mouse.Listener(on_move=self.update_activity, on_click=self.update_activity, on_scroll=self.update_activity).start()

    def push_current_log(self):
        if not self.last_activity or not self.activity_start_time:
            return

        end_time = datetime.datetime.now()
        duration = int((end_time - self.activity_start_time).total_seconds())
        
        if duration <= 0:
            return

        category, score = self.classify_activity(self.last_activity)

        data = {
            "employee_name": self.logged_in_user,
            "app_name": self.last_activity,
            "website": self.last_activity,
            "start_time": self.activity_start_time.isoformat(),
            "end_time": end_time.isoformat(),
            "duration_seconds": duration,
            "category": category,
            "productivity_score": score
        }

        try:
            supabase.table("activity_logs").insert(data).execute()
            print(f"[{datetime.datetime.now()}] Saved log for {self.logged_in_user}: {self.last_activity} ({duration}s)")
        except Exception as e:
            print("Database Error:", e)

    def tracking_loop(self):
        self.last_activity = None
        self.activity_start_time = None
        self.last_input_time = time.time()

        while self.is_tracking:
            idle_time = time.time() - self.last_input_time

            if idle_time >= self.IDLE_THRESHOLD:
                current_activity = "IDLE"
            else:
                try:
                    hwnd = win32gui.GetForegroundWindow()
                    window_title = win32gui.GetWindowText(hwnd)
                    _, pid = win32process.GetWindowThreadProcessId(hwnd)
                    process = psutil.Process(pid)
                    process_name = process.name()
                    current_activity = f"{process_name} | {window_title}"
                except:
                    current_activity = "Unknown"

            # Update UI safely
            try:
                display_text = current_activity if len(current_activity) < 50 else current_activity[:47] + "..."
                self.current_app_label.configure(text=display_text)
            except:
                pass

            if self.last_activity is None:
                self.last_activity = current_activity
                self.activity_start_time = datetime.datetime.now()
            elif current_activity != self.last_activity:
                # Push the completed activity
                self.push_current_log()
                
                # Start new activity
                self.last_activity = current_activity
                self.activity_start_time = datetime.datetime.now()

            time.sleep(2)

if __name__ == "__main__":
    app = TrackerApp()
    app.mainloop()
