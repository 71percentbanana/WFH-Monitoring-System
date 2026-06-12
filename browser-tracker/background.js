const SUPABASE_URL = "https://utwklfackfqmkmpmhvri.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2tsZmFja2ZxbWttcG1odnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzgwNzUsImV4cCI6MjA5NDY1NDA3NX0.7rNmCSgR8AOYsR-bhozYJiWRPtVqWwKy-UU9cECPa84";

let lastLoggedUrl = "";
let lastLoggedTime = 0;

async function logActiveTab() {
  // Get the employee ID from storage (set via the popup)
  const { employeeId } = await chrome.storage.local.get(["employeeId"]);

  // Don't log anything if ID hasn't been set yet
  if (!employeeId) return;

  try {
    const tabs = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    
    const tab = tabs[0];
    if (!tab || !tab.url || !tab.title) return;

    // Skip internal browser pages
    if (
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:")
    ) {
      return;
    }

    let hostname = "";
    try {
      hostname = new URL(tab.url).hostname;
    } catch {
      return;
    }

    // Debounce to prevent duplicate records within 2 seconds
    const now = Date.now();
    if (tab.url === lastLoggedUrl && now - lastLoggedTime < 2000) {
      return;
    }

    lastLoggedUrl = tab.url;
    lastLoggedTime = now;

    const data = {
      employee_id: employeeId,
      app_name: `Browser | ${tab.title}`,
      website: hostname,
      window_title: tab.title,
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
      duration_seconds: 0,
      category: "Neutral",
      productivity_score: 0
    };

    console.log("[WFH Tracker] Logging active tab:", data);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/activity_logs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=minimal"
      },
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP status ${response.status}`);
    }
  } catch (err) {
    console.error("[WFH Tracker] Failed to log active tab:", err);
  }
}

// --------------------------------------------------
// LISTENERS
// --------------------------------------------------

// 1. Detect active tab switches
chrome.tabs.onActivated.addListener(() => {
  logActiveTab();
});

// 2. Detect URL / page updates in active tab
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && changeInfo.status === "complete") {
    logActiveTab();
  }
});

// 3. Detect browser window focus changes (e.g. switching back to browser from VS Code)
chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) {
    logActiveTab();
  }
});
