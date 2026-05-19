const SUPABASE_URL =
  "https://utwklfackfqmkmpmhvri.supabase.co";

const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0d2tsZmFja2ZxbWttcG1odnJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNzgwNzUsImV4cCI6MjA5NDY1NDA3NX0.7rNmCSgR8AOYsR-bhozYJiWRPtVqWwKy-UU9cECPa84";

const employeeName = "Alvin";

// --------------------------------------------------
// DETECT TAB CHANGES
// --------------------------------------------------

chrome.tabs.onActivated.addListener(async () => {

  let [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (!tab || !tab.url) return;

  const data = {
    employee_name: employeeName,
    app_name: "Browser",
    website: new URL(tab.url).hostname,
    window_title: tab.title,
    start_time: new Date().toISOString()
  };

  console.log("Sending:", data);

  fetch(
    `${SUPABASE_URL}/rest/v1/activity_logs`,
    {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "return=minimal"
      },

      body: JSON.stringify(data)
    }
  );
});
