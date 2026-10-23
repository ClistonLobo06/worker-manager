const STORAGE_KEY = "lobo_electricals_v11";

const defaultData = {
  businesses: ["Lobo Electricals", "Contract / Sites"],
  workers: [
    { id: "w1", name: "Ramesh", phone: "9876543210", business: "Lobo Electricals" },
    { id: "w2", name: "Suresh", phone: "9876543211", business: "Lobo Electricals" },
    { id: "w3", name: "Mahesh", phone: "9876543212", business: "Contract / Sites" }
  ],
  attendance: {}, // { "YYYY-MM-DD": { "w1": { status: "P", wage: 600, location: "Main Shop" } } }
  payouts: {},    // { "weekStart_workerId": true }
  notes: []       // [ { id, title, category, body, date } ]
};

// Safe Database Bootloader
let db;
try {
  const stored = localStorage.getItem(STORAGE_KEY);
  db = stored ? JSON.parse(stored) : defaultData;
} catch (e) {
  console.warn("Storage reset due to parse error", e);
  db = defaultData;
}

if (!db.businesses || !Array.isArray(db.businesses)) db.businesses = ["Lobo Electricals", "Contract / Sites"];
if (!db.workers || !Array.isArray(db.workers)) db.workers = defaultData.workers;
if (!db.attendance || typeof db.attendance !== "object") db.attendance = {};
if (!db.payouts || typeof db.payouts !== "object") db.payouts = {};
if (!db.notes || !Array.isArray(db.notes)) db.notes = [];

let activeBusiness = "ALL";

function saveDB() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.error("Failed to save to localStorage", err);
  }
  updateDashboard();
}

// Local Date Formatter (Prevents UTC offset issues)
function formatLocalDate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// 1. Navigation Controller
function showSection(sectionId, btn) {
  document.querySelectorAll(".content-view").forEach(el => el.classList.add("hidden"));
  const target = document.getElementById(`sec-${sectionId}`);
  if (target) target.classList.remove("hidden");

  if (btn) {
    document.querySelectorAll(".nav-item").forEach(el => el.classList.remove("active"));
    btn.classList.add("active");
  }

  if (sectionId === "dashboard") updateDashboard();
  if (sectionId === "attendance") renderAttendanceSheet();
  if (sectionId === "workers") renderWorkersTable();
  if (sectionId === "payroll") calculateWeeklyPayroll();
  if (sectionId === "notes") renderNotesList();
}

// 2. Business Switching
function initBusinessFilter() {
  const filter = document.getElementById("business-filter");
  if (!filter) return;
  filter.innerHTML = `<option value="ALL">⚡ All Work Types</option>`;
  db.businesses.forEach(b => {
    filter.innerHTML += `<option value="${b}">${b}</option>`;
  });
  filter.value = activeBusiness;
}

function switchBusiness(b) {
  activeBusiness = b;
  updateDashboard();
  renderAttendanceSheet();
  renderWorkersTable();
  calculateWeeklyPayroll();
}

// 3. Week Range Computation (Monday to Sunday)
function getWeekRange(inputDateStr) {
  let targetDate;
  if (inputDateStr) {
    const parts = inputDateStr.split("-").map(Number);
    targetDate = new Date(parts[0], parts[1] - 1, parts[2]);
  } else {
    targetDate = new Date();
  }

  const dayOfWeek = targetDate.getDay(); // 0 is Sunday
  const distanceToMonday = targetDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(targetDate.getFullYear(), targetDate.getMonth(), distanceToMonday);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    dates.push(formatLocalDate(day));
  }

  return {
    start: dates[0],
    end: dates[6],
    allDates: dates
  };
}

function navigateWeek(direction) {
  const dateInput = document.getElementById("payroll-week-date");
  if (!dateInput) return;

  const parts = (dateInput.value || formatLocalDate(new Date())).split("-").map(Number);
  const current = new Date(parts[0], parts[1] - 1, parts[2]);
  current.setDate(current.getDate() + direction * 7);

  dateInput.value = formatLocalDate(current);
  calculateWeeklyPayroll();
}

// 4. Daily Attendance
function renderAttendanceSheet() {
  const dateInput = document.getElementById("attendance-date");
  if (!dateInput) return;
  if (!dateInput.value) dateInput.value = formatLocalDate(new Date());

  const date = dateInput.value;
  const tbody = document.getElementById("attendance-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const workers = db.workers.filter(w => activeBusiness === "ALL" || w.business === activeBusiness);

  if (!db.attendance[date]) db.attendance[date] = {};
  const dayRecords = db.attendance[date];

  if (workers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 24px; color: var(--text-muted);">No workers found. Click "+ Add Worker" to begin.</td></tr>`;
    return;
  }

  workers.forEach(w => {
    const raw = dayRecords[w.id];
    let status = "P";
    let todayWage = 500;
    let todayLocation = w.business || "General Work";

    if (typeof raw === "string") {
      status = raw === "A" ? "A" : "P";
    } else if (raw && typeof raw === "object") {
      status = raw.status === "A" ? "A" : "P";
      todayWage = (raw.wage !== undefined && !isNaN(raw.wage)) ? Number(raw.wage) : 500;
      todayLocation = raw.location || w.business || "General Work";
    }

    dayRecords[w.id] = { status, wage: todayWage, location: todayLocation };

    tbody.innerHTML += `
      <tr>
        <td>
          <div style="font-weight: 700; font-size: 1rem; color: #0f172a;">${w.name}</div>
          <small style="color: var(--text-muted);">${w.phone || "No phone"}</small>
        </td>
        <td style="min-width: 170px;">
          <input 
            type="text" 
            placeholder="e.g. Main Shop, Site A"
            value="${todayLocation}" 
            style="width: 100%; padding: 8px 12px; font-size: 0.9rem; font-weight: 600; border: 1.5px solid var(--border); border-radius: var(--radius-sm); background: #f8fafc;"
            onchange="updateDailyLocation('${w.id}', this.value)" 
          />
        </td>
        <td style="width: 130px;">
          <input 
            type="number" 
            class="wage-pill-input"
            value="${todayWage}" 
            min="0" 
            onchange="updateDailyWage('${w.id}', this.value)" 
          />
        </td>
        <td>
          <div class="pa-toggle-group">
            <button 
              type="button" 
              class="pa-btn ${status === 'P' ? 'active-p' : ''}" 
              onclick="setStatus('${w.id}', 'P')">
              ✓ Present
            </button>
            <button 
              type="button" 
              class="pa-btn ${status === 'A' ? 'active-a' : ''}" 
              onclick="setStatus('${w.id}', 'A')">
              ✕ Absent
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  saveDB();
}

function setStatus(workerId, st) {
  const date = document.getElementById("attendance-date").value;
  if (!db.attendance[date]) db.attendance[date] = {};

  const current = db.attendance[date][workerId] || {};
  const w = db.workers.find(x => x.id === workerId);
  const wage = current.wage !== undefined ? Number(current.wage) : 500;
  const location = current.location || (w ? w.business : "General Work");

  db.attendance[date][workerId] = { status: st, wage, location };
  saveDB();
  renderAttendanceSheet();
  calculateWeeklyPayroll();
}

function updateDailyLocation(workerId, newLocation) {
  const date = document.getElementById("attendance-date").value;
  if (!db.attendance[date]) db.attendance[date] = {};

  const current = db.attendance[date][workerId] || {};
  const status = current.status === "A" ? "A" : "P";
  const wage = current.wage !== undefined ? Number(current.wage) : 500;

  db.attendance[date][workerId] = {
    status,
    wage,
    location: (newLocation || "").trim() || "General Work"
  };
  saveDB();
  calculateWeeklyPayroll();
}

function updateDailyWage(workerId, newWage) {
  const date = document.getElementById("attendance-date").value;
  if (!db.attendance[date]) db.attendance[date] = {};

  const current = db.attendance[date][workerId] || {};
  const w = db.workers.find(x => x.id === workerId);
  const status = current.status === "A" ? "A" : "P";
  const location = current.location || (w ? w.business : "General Work");

  db.attendance[date][workerId] = {
    status,
    wage: Math.max(0, parseFloat(newWage) || 0),
    location
  };
  saveDB();
  calculateWeeklyPayroll();
}

function markAllPresent() {
  const date = document.getElementById("attendance-date").value;
  if (!db.attendance[date]) db.attendance[date] = {};

  db.workers.forEach(w => {
    if (activeBusiness === "ALL" || w.business === activeBusiness) {
      const existing = db.attendance[date][w.id] || {};
      const wage = existing.wage !== undefined ? Number(existing.wage) : 500;
      const location = existing.location || w.business || "General Work";
      db.attendance[date][w.id] = { status: "P", wage, location };
    }
  });

  saveDB();
  renderAttendanceSheet();
  calculateWeeklyPayroll();
}

function saveAttendance() {
  saveDB();
  calculateWeeklyPayroll();
  alert("Today's attendance saved!");
}

// 5. Workers List
function renderWorkersTable() {
  const tbody = document.getElementById("workers-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const workers = db.workers.filter(w => activeBusiness === "ALL" || w.business === activeBusiness);

  workers.forEach(w => {
    tbody.innerHTML += `
      <tr>
        <td><strong>${w.name}</strong></td>
        <td>${w.phone || "-"}</td>
        <td><span style="background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 6px; font-weight: 700;">${w.business}</span></td>
        <td>
          <button class="btn btn-danger" style="padding: 6px 12px; font-size: 0.8rem;" onclick="deleteWorker('${w.id}')">Delete</button>
        </td>
      </tr>
    `;
  });
}

function openAddWorkerModal() {
  document.getElementById("worker-modal").classList.remove("hidden");
}

function closeAddWorkerModal() {
  document.getElementById("worker-modal").classList.add("hidden");
}

function handleSaveWorker(e) {
  e.preventDefault();
  const categoryName = document.getElementById("w-business").value.trim() || "Lobo Electricals";

  if (!db.businesses.includes(categoryName)) {
    db.businesses.push(categoryName);
    initBusinessFilter();
  }

  const newWorker = {
    id: "w_" + Date.now(),
    name: document.getElementById("w-name").value.trim(),
    phone: document.getElementById("w-phone").value.trim(),
    business: categoryName
  };

  db.workers.push(newWorker);
  saveDB();
  closeAddWorkerModal();
  renderWorkersTable();
  e.target.reset();
}

function deleteWorker(id) {
  if (confirm("Remove this worker?")) {
    db.workers = db.workers.filter(w => w.id !== id);
    saveDB();
    renderWorkersTable();
    calculateWeeklyPayroll();
  }
}

// 6. Weekly Payroll & Automatic Location Aggregation
function calculateWeeklyPayroll() {
  const dateInput = document.getElementById("payroll-week-date");
  if (!dateInput) return;
  if (!dateInput.value) dateInput.value = formatLocalDate(new Date());

  const selectedDate = dateInput.value;
  const weekInfo = getWeekRange(selectedDate);

  const banner = document.getElementById("week-range-banner");
  if (banner) {
    banner.innerHTML = `🗓️ <strong>Viewing Pay Week:</strong> ${weekInfo.start} to ${weekInfo.end} (Monday - Sunday)`;
  }

  const tbody = document.getElementById("payroll-table-body");
  if (!tbody) return;
  tbody.innerHTML = "";

  const workers = db.workers.filter(w => activeBusiness === "ALL" || w.business === activeBusiness);

  let weekTotalBill = 0;
  let weekTotalPaid = 0;

  workers.forEach(w => {
    let effectiveDays = 0;
    let totalEarned = 0;
    const locationCounts = {};

    weekInfo.allDates.forEach(dateKey => {
      const dayData = db.attendance ? db.attendance[dateKey] : null;
      if (!dayData || !dayData[w.id]) return;

      const record = dayData[w.id];
      const status = typeof record === "string" ? record : record.status;
      const dayRate = (record && typeof record === "object" && record.wage !== undefined && !isNaN(record.wage)) 
        ? Number(record.wage) 
        : 500;

      const loc = (record && typeof record === "object" && record.location && record.location.trim()) 
        ? record.location.trim() 
        : (w.business || "General Work");

      if (status === "P") {
        effectiveDays += 1;
        totalEarned += dayRate;
        locationCounts[loc] = (locationCounts[loc] || 0) + 1;
      }
    });

    const locEntries = Object.entries(locationCounts);
    let locationBadgesHtml = "";

    if (locEntries.length > 0) {
      locationBadgesHtml = `
        <div class="location-tags-wrap">
          ${locEntries.map(([locName, count]) => `
            <span class="location-tag">
              📍 ${locName}
              <span class="location-tag-count">${count}d</span>
            </span>
          `).join("")}
        </div>
      `;
    } else {
      locationBadgesHtml = `<span style="color:var(--text-muted); font-size:0.85rem;">No days present</span>`;
    }

    const payoutKey = `${weekInfo.start}_${w.id}`;
    const isPaid = !!db.payouts[payoutKey];

    weekTotalBill += totalEarned;
    if (isPaid) {
      weekTotalPaid += totalEarned;
    }

    const locationSummaryJSON = encodeURIComponent(JSON.stringify(locationCounts));

    tbody.innerHTML += `
      <tr style="${isPaid ? 'background-color: #f0fdf4;' : ''}">
        <td>
          <strong>${w.name}</strong><br>
          <small style="color:var(--text-muted);">${w.phone || "No phone"}</small>
        </td>
        <td>${locationBadgesHtml}</td>
        <td><strong>${effectiveDays}</strong> days</td>
        <td><strong style="font-size: 1.15rem; color: ${isPaid ? '#15803d' : '#0f172a'};">₹${totalEarned.toLocaleString()}</strong></td>
        <td>
          ${isPaid 
            ? `<div style="display: flex; align-items: center; gap: 8px;">
                 <span style="color: #15803d; font-weight: 800; font-size: 0.95rem;">🟢 Paid</span>
                 <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 0.75rem; border: 1px solid #cbd5e1;" onclick="clearSingleWorkerPayment('${payoutKey}', '${w.name}')">Clear</button>
               </div>`
            : `<button class="btn btn-success" style="padding: 8px 14px; font-size: 0.85rem;" onclick="togglePayment('${payoutKey}')">Mark as Paid</button>`
          }
        </td>
        <td>
          <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.85rem;" onclick="printWeeklySlip('${w.id}', '${weekInfo.start}', '${weekInfo.end}', ${totalEarned}, ${effectiveDays}, ${isPaid}, '${locationSummaryJSON}')">Slip</button>
        </td>
      </tr>
    `;
  });

  const weekPending = Math.max(0, weekTotalBill - weekTotalPaid);

  const billEl = document.getElementById("week-total-bill");
  const paidEl = document.getElementById("week-total-paid");
  const pendingEl = document.getElementById("week-total-pending");

  if (billEl) billEl.innerText = `₹${weekTotalBill.toLocaleString()}`;
  if (paidEl) paidEl.innerText = `₹${weekTotalPaid.toLocaleString()}`;
  if (pendingEl) pendingEl.innerText = `₹${weekPending.toLocaleString()}`;
}

function togglePayment(key) {
  db.payouts[key] = !db.payouts[key];
  saveDB();
  calculateWeeklyPayroll();
}

// Clear all payments for current week
function clearAllWeekPayments() {
  const dateInput = document.getElementById("payroll-week-date");
  if (!dateInput) return;
  const weekInfo = getWeekRange(dateInput.value);

  const paidWorkersThisWeek = db.workers.filter(w => db.payouts[`${weekInfo.start}_${w.id}`]);

  if (paidWorkersThisWeek.length === 0) {
    alert("No workers are currently marked as paid for this week.");
    return;
  }

  if (confirm(`Reset payment status for all workers between ${weekInfo.start} and ${weekInfo.end} back to UNPAID?`)) {
    db.workers.forEach(w => {
      const payoutKey = `${weekInfo.start}_${w.id}`;
      delete db.payouts[payoutKey];
    });
    saveDB();
    calculateWeeklyPayroll();
  }
}

// Clear single worker payment
function clearSingleWorkerPayment(payoutKey, workerName) {
  if (confirm(`Clear paid status for ${workerName}?`)) {
    delete db.payouts[payoutKey];
    saveDB();
    calculateWeeklyPayroll();
  }
}

function printWeeklySlip(workerId, start, end, total, days, isPaid, locSummaryEncoded) {
  const w = db.workers.find(x => x.id === workerId);
  const container = document.getElementById("slip-content");
  if (!w || !container) return;

  let locSummary = {};
  try {
    locSummary = JSON.parse(decodeURIComponent(locSummaryEncoded));
  } catch (e) {
    locSummary = {};
  }

  const breakdownRows = Object.entries(locSummary).map(([loc, count]) => `
    <tr style="border-bottom: 1px dashed #ccc;">
      <td style="padding: 6px 0;">📍 <strong>${loc}</strong></td>
      <td style="padding: 6px 0; text-align: right; font-weight: bold;">${count} day(s)</td>
    </tr>
  `).join("");

  container.innerHTML = `
    <div style="border: 2px solid #000; padding: 22px; font-family: monospace; background: white;">
      <h2 style="text-align: center; margin-bottom: 2px;">${w.business}</h2>
      <p style="text-align: center; margin-bottom: 14px; font-size: 1.05rem;"><strong>WEEKLY WAGE SETTLEMENT</strong></p>
      <p style="text-align: center; font-size: 0.9rem; margin-bottom: 12px;">Week: ${start} to ${end}</p>
      <hr style="margin-bottom: 12px;"/>
      <p><strong>Worker:</strong> ${w.name}</p>
      <p><strong>Primary Business:</strong> ${w.business}</p>
      <p><strong>Phone:</strong> ${w.phone || "N/A"}</p>
      <p><strong>Total Days Worked:</strong> ${days} days</p>
      <hr style="margin: 12px 0;"/>
      <p style="font-weight: bold; margin-bottom: 8px;">ALL SITES / LOCATIONS WORKED THIS WEEK:</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
        ${breakdownRows || '<tr><td>Standard Work</td><td style="text-align:right;">0 days</td></tr>'}
      </table>
      <hr style="margin: 12px 0;"/>
      <h3 style="font-size: 1.35rem; margin-top: 6px;">TOTAL PAYABLE: ₹${total.toLocaleString()}</h3>
      <p style="margin-top: 8px;"><strong>Status:</strong> ${isPaid ? '🟢 FULLY PAID' : '🟡 PAYMENT PENDING'}</p>
      <br><br>
      <div style="display: flex; justify-content: space-between; margin-top: 24px;">
        <span>Owner Sign: ______________</span>
        <span>Worker Sign: ______________</span>
      </div>
    </div>
  `;
  document.getElementById("slip-modal").classList.remove("hidden");
}

function closeSlipModal() {
  document.getElementById("slip-modal").classList.add("hidden");
}

// 7. Notes System
function renderNotesList() {
  const container = document.getElementById("notes-grid");
  if (!container) return;
  container.innerHTML = "";

  if (!db.notes || db.notes.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; background: white; border-radius: var(--radius-md); border: 1.5px dashed var(--border);">
        <p style="font-size: 1.1rem; color: var(--text-muted); margin-bottom: 12px;">No notes yet.</p>
        <button class="btn btn-primary" onclick="openNoteModal()">➕ Write First Note</button>
      </div>
    `;
    return;
  }

  const sortedNotes = [...db.notes].reverse();

  sortedNotes.forEach(note => {
    container.innerHTML += `
      <div class="note-card">
        <div>
          <div class="note-card-header">
            <h4 class="note-card-title">${note.title}</h4>
            <span class="note-card-badge">${note.category}</span>
          </div>
          <div class="note-card-body">${note.body}</div>
        </div>
        <div class="note-card-footer">
          <span>📅 ${note.date}</span>
          <button class="note-del-btn" onclick="deleteNote('${note.id}')">🗑️ Delete</button>
        </div>
      </div>
    `;
  });
}

function openNoteModal() {
  document.getElementById("note-modal").classList.remove("hidden");
  document.getElementById("note-title").focus();
}

function closeNoteModal() {
  document.getElementById("note-modal").classList.add("hidden");
}

function handleSaveNote(e) {
  e.preventDefault();
  const title = document.getElementById("note-title").value.trim();
  const category = document.getElementById("note-category").value;
  const body = document.getElementById("note-body").value.trim();

  const newNote = {
    id: "n_" + Date.now(),
    title,
    category,
    body,
    date: new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
  };

  db.notes.push(newNote);
  saveDB();
  closeNoteModal();
  renderNotesList();
  e.target.reset();
}

function deleteNote(id) {
  if (confirm("Delete this note?")) {
    db.notes = db.notes.filter(n => n.id !== id);
    saveDB();
    renderNotesList();
  }
}

// 8. Backup & Restore (Top Header)
function downloadBackup() {
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(db, null, 2));
  const dlAnchor = document.createElement("a");
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", `lobo_electricals_backup_${formatLocalDate(new Date())}.json`);
  dlAnchor.click();
}

function restoreBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      db = JSON.parse(evt.target.result);
      if (!db.payouts) db.payouts = {};
      if (!db.notes) db.notes = [];
      if (!db.attendance) db.attendance = {};
      saveDB();
      location.reload();
    } catch (err) {
      alert("Invalid backup file.");
    }
  };
  reader.readAsText(file);
}

// 9. Dashboard Stats
function updateDashboard() {
  const dateInput = document.getElementById("attendance-date");
  const today = dateInput && dateInput.value ? dateInput.value : formatLocalDate(new Date());
  const filteredWorkers = db.workers.filter(w => activeBusiness === "ALL" || w.business === activeBusiness);

  const totalEl = document.getElementById("stat-total-workers");
  if (totalEl) totalEl.innerText = filteredWorkers.length;

  let present = 0, absent = 0;
  const todayRecords = db.attendance[today] || {};

  filteredWorkers.forEach(w => {
    const raw = todayRecords[w.id];
    const st = typeof raw === "string" ? raw : (raw ? raw.status : undefined);

    if (st === "P") present++;
    else if (st === "A") absent++;
  });

  const pEl = document.getElementById("stat-today-present");
  const aEl = document.getElementById("stat-today-absent");

  if (pEl) pEl.innerText = present;
  if (aEl) aEl.innerText = absent;
}

// 10. Quick Calculator
let calcExpression = "";

function toggleCalculator() {
  const modal = document.getElementById("calculator-modal");
  if (modal) modal.classList.toggle("hidden");
}

function updateCalcScreen(history = "", current = "0") {
  const main = document.getElementById("calc-display");
  const sub = document.getElementById("calc-history");
  if (main) main.innerText = current;
  if (sub) sub.innerText = history;
}

function calcNum(num) {
  if (calcExpression === "0" && num !== ".") {
    calcExpression = num;
  } else {
    calcExpression += num;
  }
  updateCalcScreen("", calcExpression);
}

function calcOp(op) {
  if (!calcExpression) return;
  const lastChar = calcExpression.slice(-1);
  if (["+", "-", "*", "/", "%"].includes(lastChar)) {
    calcExpression = calcExpression.slice(0, -1) + op;
  } else {
    calcExpression += op;
  }
  updateCalcScreen("", calcExpression);
}

function calcClear() {
  calcExpression = "";
  updateCalcScreen("", "0");
}

function calcBackspace() {
  calcExpression = calcExpression.slice(0, -1);
  updateCalcScreen("", calcExpression || "0");
}

function calcEquals() {
  if (!calcExpression) return;
  try {
    const sanitized = calcExpression.replace(/[^0-9+\-*/.%]/g, "");
    const result = Function(`'use strict'; return (${sanitized})`)();
    const formattedResult = Number.isInteger(result) ? result : Number(result.toFixed(2));
    updateCalcScreen(calcExpression + " =", String(formattedResult));
    calcExpression = String(formattedResult);
  } catch (err) {
    updateCalcScreen("Error", "0");
    calcExpression = "";
  }
}

// 11. Initial Startup Load
window.onload = function() {
  const todayStr = formatLocalDate(new Date());

  const attDate = document.getElementById("attendance-date");
  const payDate = document.getElementById("payroll-week-date");
  const dateDisplay = document.getElementById("today-date-display");

  if (attDate) attDate.value = todayStr;
  if (payDate) payDate.value = todayStr;

  if (dateDisplay) {
    dateDisplay.innerText = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "short",
      day: "numeric"
    });
  }

  initBusinessFilter();
  updateDashboard();
  renderAttendanceSheet();
  calculateWeeklyPayroll();

  // Register Service Worker for 100% Offline Support
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register("./sw.js")
      .then((reg) => console.log("Worker Manager Service Worker Registered! Scope:", reg.scope))
      .catch((err) => console.warn("Service Worker registration failed:", err));
  }

  // Check In-App Browser & Initial PWA UI state
  checkInAppBrowser();
  updateInstallUI();
};

// 12. PWA Installation & Offline Standalone Management
let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  // Prevent mini-infobar on mobile Chrome
  e.preventDefault();
  deferredInstallPrompt = e;
  console.log("PWA beforeinstallprompt captured!");
  updateInstallUI();
});

window.addEventListener("appinstalled", () => {
  console.log("Worker Manager PWA was successfully installed!");
  deferredInstallPrompt = null;
  updateInstallUI();
});

function isRunningStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true ||
    document.referrer.includes("android-app://")
  );
}

function updateInstallUI() {
  const isStandalone = isRunningStandalone();
  const banner = document.getElementById("pwa-install-banner");
  const headerBtn = document.getElementById("btn-install-header");
  const dashBtn = document.getElementById("btn-dash-install");

  if (isStandalone) {
    if (banner) banner.classList.add("hidden");
    if (headerBtn) headerBtn.classList.add("hidden");
    if (dashBtn) {
      dashBtn.innerText = "✅ App Installed on Device";
      dashBtn.disabled = true;
      dashBtn.style.opacity = "0.75";
      dashBtn.style.cursor = "default";
      dashBtn.onclick = null;
    }
  } else {
    if (headerBtn) headerBtn.classList.remove("hidden");
    if (banner && !sessionStorage.getItem("pwa_banner_dismissed")) {
      banner.classList.remove("hidden");
    }
  }
}

function dismissInstallBanner() {
  const banner = document.getElementById("pwa-install-banner");
  if (banner) banner.classList.add("hidden");
  sessionStorage.setItem("pwa_banner_dismissed", "true");
}

function checkInAppBrowser() {
  if (isRunningStandalone()) return;
  const ua = (navigator.userAgent || navigator.vendor || window.opera || "").toLowerCase();
  const isWhatsApp = ua.includes("whatsapp");
  const isFB = ua.includes("fban") || ua.includes("fbav") || ua.includes("instagram");
  const isLine = ua.includes("line");

  if (isWhatsApp || isFB || isLine) {
    const alertBanner = document.getElementById("webview-alert-banner");
    if (alertBanner) alertBanner.classList.remove("hidden");
  }
}

function triggerPWAInstall() {
  if (deferredInstallPrompt) {
    deferredInstallPrompt.prompt();
    deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === "accepted") {
        console.log("User accepted PWA installation");
      }
      deferredInstallPrompt = null;
    });
  } else {
    // Show user-friendly guide modal
    openInstallModal();
  }
}

function openInstallModal() {
  const modal = document.getElementById("install-help-modal");
  if (!modal) return;
  modal.classList.remove("hidden");

  // Auto-detect browser/platform to show the most relevant tab
  const ua = (navigator.userAgent || "").toLowerCase();
  if (ua.includes("whatsapp") || ua.includes("fban") || ua.includes("fbav")) {
    switchInstallTab("whatsapp");
  } else if (/iphone|ipad|ipod/.test(ua)) {
    switchInstallTab("ios");
  } else {
    switchInstallTab("android");
  }
}

function closeInstallModal() {
  const modal = document.getElementById("install-help-modal");
  if (modal) modal.classList.add("hidden");
}

function switchInstallTab(tab) {
  ["android", "ios", "whatsapp"].forEach((t) => {
    const btn = document.getElementById(`tab-btn-${t}`);
    const content = document.getElementById(`tab-content-${t}`);
    if (btn) btn.classList.remove("active");
    if (content) content.classList.add("hidden");
  });

  const activeBtn = document.getElementById(`tab-btn-${tab}`);
  const activeContent = document.getElementById(`tab-content-${tab}`);
  if (activeBtn) activeBtn.classList.add("active");
  if (activeContent) activeContent.classList.remove("hidden");
}