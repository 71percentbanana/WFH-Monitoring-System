// Load saved employee ID on popup open
chrome.storage.local.get(["employeeId"], (result) => {
  const id = result.employeeId;
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");

  if (id) {
    document.getElementById("emp-name").value = id;
    dot.classList.remove("inactive");
    text.innerHTML = `Tracking as <span class="status-name">${id}</span>`;
  } else {
    text.textContent = "Not configured — enter your Employee ID";
  }
});

// Save employee ID when button is clicked
document.getElementById("save-btn").addEventListener("click", () => {
  const id = document.getElementById("emp-name").value.trim();
  if (!id) return;

  chrome.storage.local.set({ employeeId: id }, () => {
    const dot = document.getElementById("status-dot");
    const text = document.getElementById("status-text");
    dot.classList.remove("inactive");
    text.innerHTML = `Tracking as <span class="status-name">${id}</span>`;

    const msg = document.getElementById("success-msg");
    msg.style.display = "block";
    setTimeout(() => { msg.style.display = "none"; }, 2500);
  });
});
