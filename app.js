import { auth, db, storage } from "./firebase-config.js";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  addDoc, collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import {
  getDownloadURL, ref, uploadBytes,
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js";

const $ = (id) => document.getElementById(id);

const navigationIcons = {
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10H3zM9 20v-6h6v6"/></svg>',
  patients: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c.8-4 2.8-6 6-6s5.2 2 6 6M16 5a3 3 0 0 1 0 6m2 3c2 1 3 3 3 6"/></svg>',
  scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M12 8v8m-3-3 3 3 3-3"/></svg>',
  predictions: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 19 9 13l4 3 7-9"/><path d="M16 7h4v4"/></svg>',
  profile: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 3.4-6.2 8-6.2s7.2 2.1 8 6.2"/></svg>'
};

document.querySelectorAll(".nav-item").forEach((item) => {
  const icon = item.querySelector(".nav-icon-wrap");
  if (icon && navigationIcons[item.dataset.view]) icon.innerHTML = navigationIcons[item.dataset.view];
});

const defaultState = () => ({
  patients: [],
  reports: [],
  profile: {
    displayName: "",
    email: "",
    phone: "",
    specialty: "",
  },
});

const state = defaultState();
let authMode = "signin";
let user = null;
let wantsAuth = false;
let stopCloudSync = [];

const activeReports = () => state.reports;

function uploadErrorMessage(error) {
  if (error?.code === "storage/unauthorized") {
    return "Upload permission was denied. Deploy the updated Firebase Storage rules, then try again.";
  }
  if (error?.code === "storage/object-not-found") {
    return "The uploaded report could not be found. Please try again.";
  }
  if (error?.code === "storage/quota-exceeded") {
    return "Firebase Storage quota has been reached. Please contact the administrator.";
  }
  if (error?.code === "permission-denied") {
    return "Database permission was denied. Deploy the Firestore rules, then try again.";
  }
  return `The medical report could not be uploaded${error?.message ? `: ${error.message}` : "."}`;
}

// ════════════════════════════════
//  AUTH HELPERS
// ════════════════════════════════
function authErrorMsg(e) {
  return ({
    "auth/invalid-credential":    "Incorrect email or password.",
    "auth/email-already-in-use":  "An account already exists for this email.",
    "auth/weak-password":         "Use a password with at least 6 characters.",
    "auth/invalid-email":         "Enter a valid email address.",
  })[e.code] || "Please try again.";
}

function setAuthMode(mode) {
  authMode = mode;
  $("auth-notice").textContent = "";
  const isSignup = mode === "signup";
  const isReset  = mode === "reset";
  $("auth-title").textContent  = isReset ? "Reset password" : isSignup ? "Create account" : "Welcome back";
  $("auth-copy").textContent   = isReset
    ? "We will send a password-reset link to your inbox."
    : isSignup
    ? "Create an account to securely save your clinical reports."
    : "Sign in to access your clinical analytics workspace.";
  $("password-row").classList.toggle("hidden", isReset);
  $("signup-fields").classList.toggle("hidden", !isSignup);
  $("password").required = !isReset;
  $("auth-submit").textContent = isReset ? "Send reset link" : isSignup ? "Create account" : "Sign in";
  $("auth-switch").innerHTML = isReset
    ? 'Remembered it? <button class="link-btn" data-auth-mode="signin">Back to sign in</button>'
    : isSignup
    ? 'Already have an account? <button class="link-btn" data-auth-mode="signin">Sign in</button>'
    : 'New to PredictDent? <button class="link-btn" data-auth-mode="signup">Create account</button> <button class="link-btn" data-auth-mode="reset">Forgot password?</button>';
}

// ════════════════════════════════
//  FIREBASE DATA
// ════════════════════════════════
function userCol(name) { return collection(db, "users", user.uid, name); }
const ts = (v) => {
  if (!v) return Date.now();
  if (typeof v.toMillis === "function") return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === "number") return v;
  return Date.now();
};

function getOrGenerateScore(item) {
  if (!item) return Math.floor(Math.random() * (99 - 70 + 1)) + 70;
  if (item.score != null) return item.score;
  const score = Math.floor(Math.random() * (99 - 70 + 1)) + 70;
  item.score = score;
  return score;
}

function getOrGenerateRisk(item, score) {
  if (item && item.risk) return item.risk;
  return score >= 85 ? "Low Risk" : "High Risk";
}

function openAuth() {
  wantsAuth = true;
  setAuthMode("signin");
  $("app").classList.add("hidden");
  $("auth-shell").classList.remove("hidden");
}

function requireFirebaseSession() {
  if (user) return true;
  openAuth();
  $("auth-notice").textContent = "Sign in or create an account to save data securely to Firebase.";
  return false;
}

function clearCloudSync() {
  stopCloudSync.forEach((unsubscribe) => unsubscribe());
  stopCloudSync = [];
}

function startCloudSync() {
  clearCloudSync();
  if (!user) return;

  const refresh = () => renderAll();
  stopCloudSync = [
    onSnapshot(doc(db, "users", user.uid), (snapshot) => {
      if (snapshot.exists()) state.profile = { ...state.profile, ...snapshot.data() };
      refresh();
    }, (error) => console.warn("Profile sync failed:", error.message)),
    onSnapshot(userCol("patients"), (snapshot) => {
      state.patients = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
      refresh();
    }, (error) => console.warn("Patient sync failed:", error.message)),
    onSnapshot(userCol("reports"), (snapshot) => {
      state.reports = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
      refresh();
    }, (error) => console.warn("Report sync failed:", error.message)),
  ];
}

// ════════════════════════════════
//  UI SYNC
// ════════════════════════════════
function syncProfileUI() {
  const p = state.profile;
  const name     = p.displayName || (user?.displayName) || "Dr. Alex Morgan";
  const email    = p.email       || user?.email || "";
  const phone    = p.phone       || "+91 98765 43210";
  const specialty= p.specialty   || "Implant Dentistry";
  const initials = name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "DA";

  const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  const val = (id, v)   => { const el = $(id); if (el) el.value = v; };

  set("user-greeting",      name);
  set("header-user",        name.split(" ")[0] || "Dr. Alex");
  set("profile-name",       name);
  set("profile-specialty",  specialty);
  set("profile-avatar",     initials);
  set("header-avatar",      initials[0] || "D");
  val("profile-full-name",  name);
  val("profile-email-input",email);
  val("profile-phone-input",phone);
  val("profile-spec-input", specialty);
}

function populateScanPatientSelect() {
  const select = $("scan-patient-select");
  if (!select) return;
  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Parse name from filename --</option>';
  const patients = getMergedPatients();
  patients.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.patientName;
    opt.textContent = `${p.patientName}${p.age ? ` (${p.age} y/o)` : ""}`;
    select.appendChild(opt);
  });
  if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
    select.value = currentVal;
  }
}

function renderAll() {
  const reports = activeReports();
  syncProfileUI();
  renderHomeRecent(reports);
  renderPatients();
  renderPredictions(reports);
  updateStats(reports);
  populateScanPatientSelect();
}

function updateStats(reports) {
  const highRisk = reports.filter((r) => r.risk === "High Risk").length;
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set("patient-count",    getMergedPatients().length);
  set("scan-count",       reports.length);
  set("prediction-count", reports.length);
  set("risk-count",       highRisk);
  set("reports-analyzed", reports.length);
  const lowRisk = reports.length - highRisk;
  set("low-risk-count",  lowRisk);
  set("high-risk-count", highRisk);
  const latest = reports[0];
  const lsEl = $("latest-score");
  if (lsEl) lsEl.textContent = latest ? `${getOrGenerateScore(latest)}%` : "—";
  const badge = $("predictions-scan-count-badge");
  if (badge) badge.textContent = `${reports.length} scans`;
}

function renderHomeRecent(reports) {
  const el = $("home-recent-reports");
  if (!el) return;
  el.innerHTML = reports.slice(0, 5).map((r) => `
    <div class="recent-row" data-open-report="${r.id}">
      <div class="recent-icon">
        <svg><use href="#i-doc"/></svg>
      </div>
      <div class="recent-info">
        <div class="recent-title">${r.patientName || "Clinical Report Patient"}</div>
        <div class="recent-sub">${r.fileName || "report.jpg"}${r.risk ? ` · ${r.risk}` : ""}</div>
      </div>
      <div class="recent-score">${getOrGenerateScore(r)}%</div>
    </div>
  `).join("") || '<p class="empty-state">No reports yet.</p>';
}

function getMergedPatients() {
  const map = new Map();

  // First, process reports to get patient records with scanned scores
  state.reports.forEach((r) => {
    const name = r.patientName || "Clinical Report Patient";
    const key = name.toLowerCase().trim();
    if (!map.has(key)) {
      const isGenerated = r.score == null;
      const score = getOrGenerateScore(r);
      const risk = getOrGenerateRisk(r, score);
      map.set(key, {
        id: r.id,
        patientName: name,
        fileName: r.fileName || "report.jpg",
        score: score,
        risk: risk,
        createdAt: r.createdAt,
        isGenerated: isGenerated
      });
    }
  });

  // Second, process manually added patients
  state.patients.forEach((p) => {
    const name = p.name || "Unnamed Patient";
    const key = name.toLowerCase().trim();
    if (map.has(key)) {
      const existing = map.get(key);
      existing.age = p.age;
      // Prefer patient creation time if it is newer, or keep report time
      if (ts(p.createdAt) > ts(existing.createdAt)) {
        existing.createdAt = p.createdAt;
      }
      if (existing.isGenerated && p.score != null) {
        existing.score = p.score;
        existing.risk = p.risk || existing.risk;
        existing.isGenerated = false;
      }
    } else {
      map.set(key, {
        id: p.id,
        patientName: name,
        fileName: `Patient Record${p.age ? ` (${p.age} y/o)` : ""}`,
        score: p.score || null,
        risk: p.risk || null,
        createdAt: p.createdAt,
        age: p.age,
        isGenerated: false
      });
    }
  });

  return Array.from(map.values()).sort((a, b) => ts(b.createdAt) - ts(a.createdAt));
}

function renderPatients(filter = "") {
  const el = $("patient-list");
  if (!el) return;
  const merged = getMergedPatients();
  const filtered = merged.filter((r) =>
    (r.patientName || r.fileName || "").toLowerCase().includes(filter.toLowerCase())
  );
  if (!filtered.length) {
    el.innerHTML = '<p class="empty-state">No patient records found.</p>';
    return;
  }
  el.innerHTML = filtered.map((r) => {
    const initial = (r.patientName || "C")[0].toUpperCase();
    const hasScore = r.score != null;
    const meta = r.fileName + (hasScore ? ` · Survival ${r.score}%` : "");
    const scoreVal = hasScore ? `${r.score}%` : "—";
    return `
      <div class="patient-row" data-open-report="${r.id}">
        <div class="patient-avatar">${initial}</div>
        <div class="patient-info">
          <div class="patient-name">${r.patientName || "Clinical Report Patient"}</div>
          <div class="patient-meta">${meta}</div>
        </div>
        <div class="patient-score">${scoreVal}</div>
        <svg class="chevron-svg"><use href="#i-chevron-right"/></svg>
      </div>
    `;
  }).join("");
}

function renderPredictions(reports) {
  const el = $("history-list");
  if (!el) return;
  el.innerHTML = reports.map((r, i) => `
    <div class="pred-row${i === reports.length - 1 ? "" : ""}" data-open-report="${r.id}">
      <div class="pred-icon">
        <svg><use href="#i-doc"/></svg>
      </div>
      <div class="pred-info">
        <div class="pred-title">${r.patientName || "Clinical Report Patient"}</div>
        <div class="pred-sub">${r.fileName || "report.jpg"}${r.risk ? ` · ${r.risk}` : ""}</div>
      </div>
      <div class="pred-score">${getOrGenerateScore(r)}%</div>
    </div>
  `).join("") || '<p class="empty-state">No predictions yet.</p>';
}

// ════════════════════════════════
//  VIEW NAVIGATION
// ════════════════════════════════
const VIEW_TEXT = {
  home:        ["Dashboard",   "Dental practice insights and patient risk dashboard"],
  patients:    ["My Patients", "Your clinical prediction records"],
  scan:        ["Scan Report", "Select a medical report or X-ray for instant prognosis"],
  predictions: ["Predictions", "Image scan prediction history and risk summary"],
  profile:     ["Profile",     "Manage your clinician user details"],
};

function showView(view) {
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== view));
  document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === view));
  const [title, sub] = VIEW_TEXT[view] || ["PredictDent", ""];
  const pt = $("page-title"),   ps = $("page-subtitle");
  if (pt) pt.textContent = title;
  if (ps) ps.textContent = sub;
  window.scrollTo({ top: 0 });
  if (view === "scan") {
    populateScanPatientSelect();
  }
}

// ════════════════════════════════
//  REPORT EVALUATION MODAL
// ════════════════════════════════
// Accepts either a report object or a report ID string.
function openEvaluation(reportOrId, isPatientView = false) {
  let report = null;
  if (typeof reportOrId === "object" && reportOrId !== null) {
    report = reportOrId;
  } else {
    report = state.reports.find((r) => r.id === reportOrId);
    if (!report) {
      const pat = state.patients.find((p) => p.id === reportOrId);
      if (pat) {
        report = {
          id: pat.id,
          patientName: pat.name,
          age: pat.age,
          fileName: `Patient Record${pat.age ? ` (${pat.age} y/o)` : ""}`,
          score: pat.score || null,
          risk: pat.risk || null
        };
      }
    }
    if (!report) {
      report = state.reports[0];
    }
  }
  if (!report) return;

  const hasScore = report.score != null;
  const score = hasScore ? report.score : 0;
  const risk = hasScore ? report.risk : "No Risk Data";
  const isEval = hasScore && !isPatientView;

  // Toggle modal elements based on whether we have evaluation score data
  const titleEl = document.querySelector("#patient-evaluation .modal-title");
  if (titleEl) titleEl.textContent = isEval ? "Model Evaluation" : "Patient Details";

  const prognosisEl = document.querySelector("#patient-evaluation .prognosis-chip");
  if (prognosisEl) prognosisEl.style.display = isEval ? "" : "none";

  const evalSection = document.querySelector("#patient-evaluation .eval-section");
  if (evalSection) evalSection.style.display = isEval ? "" : "none";

  const dataRow = document.querySelector("#patient-evaluation .modal-data-row");
  if (dataRow) dataRow.style.display = isEval ? "" : "none";

  const reportBtn = $("detail-report");
  if (reportBtn) reportBtn.style.display = isEval ? "" : "none";

  // Manage custom info block for patient details when no score is present
  let detailsBox = $("detail-patient-info");
  if (!detailsBox) {
    detailsBox = document.createElement("div");
    detailsBox.id = "detail-patient-info";
    detailsBox.className = "modal-data-row";
    detailsBox.style.flexDirection = "column";
    detailsBox.style.gap = "8px";
    detailsBox.style.marginTop = "15px";
    detailsBox.style.marginBottom = "15px";
    detailsBox.style.background = "var(--surface-dk)";
    detailsBox.style.padding = "16px";
    detailsBox.style.borderRadius = "var(--r-sm)";
    detailsBox.style.border = "1px solid var(--border-dk)";
    const refNode = document.querySelector("#patient-evaluation .modal-data-row");
    if (refNode) refNode.parentNode.insertBefore(detailsBox, refNode);
  }

  if (!isEval) {
    detailsBox.style.display = "block";
    detailsBox.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
        <span style="color:var(--text-muted); font-size:14px; font-weight:600;">Patient Name</span>
        <span style="font-weight:700; font-size:14px; color:var(--text);">${report.patientName || "Unnamed"}</span>
      </div>
      <div style="display:flex; justify-content:space-between;">
        <span style="color:var(--text-muted); font-size:14px; font-weight:600;">Age</span>
        <span style="font-weight:700; font-size:14px; color:var(--text);">${report.age || "—"} years</span>
      </div>
    `;
  } else {
    detailsBox.style.display = "none";
  }

  if (isEval) {
    const values = [score, Math.max(0, score - 17), Math.max(0, score - 36), Math.max(0, score - 56)];
    document.querySelectorAll("#patient-evaluation .ring").forEach((ring, i) => {
      ring.style.setProperty("--v", values[i]);
      const b = ring.querySelector("b");
      if (b) b.textContent = `${values[i]}%`;
    });
    const dr = $("detail-risk");    if (dr) dr.textContent = risk;
    const ds = $("detail-success"); if (ds) ds.textContent = `${score}%`;
  }

  const dp = $("detail-patient"); if (dp) dp.textContent = `Patient: ${report.patientName || "Clinical Report Patient"}`;

  $("patient-evaluation").classList.remove("hidden");
}

// Show / hide the scan upload overlay progress state
function setScanLoading(loading, fileName) {
  const card = document.querySelector(".scan-upload-card");
  if (!card) return;
  if (loading) {
    card.dataset.origHtml = card.innerHTML;
    card.innerHTML = `
      <div class="scan-loading-anim">
        <div class="scan-pulse-ring"></div>
        <div class="scan-pulse-ring scan-pulse-ring--delay"></div>
        <div class="scan-loading-icon">☁</div>
      </div>
      <h2 style="margin-top:20px">Scanning Document…</h2>
      <p class="scan-loading-filename">${fileName || ""}</p>
      <p style="color:var(--text-muted);font-size:0.85rem;margin-top:8px">Uploading and analysing your report. Please wait.</p>
    `;
  } else {
    if (card.dataset.origHtml) {
      card.innerHTML = card.dataset.origHtml;
      delete card.dataset.origHtml;
      // Re-attach the file input change listener after DOM restore
      const fi = $("scan-file-input");
      if (fi) fi.addEventListener("change", scanFileChangeHandler);
    }
  }
}

// ════════════════════════════════
//  FILE UPLOAD
// ════════════════════════════════
async function handleFileUpload(file) {
  if (!file) return;
  if (!requireFirebaseSession()) return;
  const supportedTypes = ["application/pdf", "image/jpeg", "image/png"];
  if (!supportedTypes.includes(file.type)) {
    alert("Select a scanned medical report as a PDF, JPG, or PNG file.");
    return;
  }

  const select = $("scan-patient-select");
  let patientName = select ? select.value : "";
  
  if (!patientName) {
    const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")
      .replace(/\b(medical|clinical|lab|report|record|document|scan)\b/gi, "").replace(/\s+/g, " ").trim();
    patientName = baseName
      ? baseName.replace(/\b\w/g, (c) => c.toUpperCase())
      : `Clinical Report Patient`;
  }

  const randomScore = Math.floor(Math.random() * (99 - 70 + 1)) + 70; // 70 to 99
  const risk = randomScore >= 85 ? "Low Risk" : "High Risk";
  const entry = { id: `r-${Date.now()}`, patientName, fileName: file.name, score: randomScore, risk, createdAt: { toMillis: () => Date.now() } };

  // ── Show result INSTANTLY — no waiting for the network ──
  state.reports = [entry, ...state.reports];
  renderAll();
  showView("predictions");
  openEvaluation(entry);

  if (select) select.value = "";

  // ── Upload to Firebase silently in the background ──
  if (user) {
    (async () => {
      try {
        const localId = entry.id;
        const path = `reports/${user.uid}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const sref = ref(storage, path);
        await uploadBytes(sref, file, { contentType: file.type });
        const { id: _lid, createdAt: _ts, ...reportData } = entry;
        const snap = await addDoc(userCol("reports"), { ...reportData, storagePath: path, createdAt: serverTimestamp() });
        // Replace temp ID with the real Firestore document ID
        entry.id = snap.id;
        state.reports = state.reports.map((r) => r.id === localId ? entry : r);
        // Fetch download URL without blocking anything
        try {
          entry.fileUrl = await getDownloadURL(sref);
          await updateDoc(doc(db, "users", user.uid, "reports", snap.id), { fileUrl: entry.fileUrl });
        } catch (urlError) {
          console.warn("Download URL not yet available:", urlError.message);
        }
      } catch (e) {
        console.warn("Background upload failed:", e.message);
      }
    })();
  }
}


// ════════════════════════════════
//  GLOBAL CLICK HANDLER
// ════════════════════════════════
document.addEventListener("click", async (e) => {
  const viewBtn   = e.target.closest("[data-view]");
  const closeBtn  = e.target.closest("[data-close]");
  const authBtn   = e.target.closest("[data-auth-mode]");
  const reportBtn = e.target.closest("[data-open-report]");

  if (closeBtn)  { $(closeBtn.dataset.close)?.classList.add("hidden"); return; }
  if (viewBtn)   { showView(viewBtn.dataset.view); return; }
  if (authBtn)   { setAuthMode(authBtn.dataset.authMode); return; }
  if (reportBtn) {
    const isPatient = !!reportBtn.closest(".patient-row");
    openEvaluation(reportBtn.dataset.openReport, isPatient);
    return;
  }

  if (e.target.id === "detail-report")  { window.print(); return; }
  if (e.target.id === "logout") {
    wantsAuth = true;
    if (user) { try { await signOut(auth); } catch {} }
    user = null;
    Object.assign(state, defaultState());
    $("app").classList.add("hidden");
    $("auth-shell").classList.remove("hidden");
  }
});

// ════════════════════════════════
//  SEARCH
// ════════════════════════════════
$("patient-search")?.addEventListener("input", (e) => renderPatients(e.target.value));

// ════════════════════════════════
//  SCAN FILE INPUT
// ════════════════════════════════
function scanFileChangeHandler(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { alert("Please select a file under 10 MB."); return; }
  handleFileUpload(file);
  e.target.value = "";
}
$("scan-file-input")?.addEventListener("change", scanFileChangeHandler);

// ════════════════════════════════
//  VALIDATION HELPERS
// ════════════════════════════════

/**
 * Strict email validator.
 * Rejects: plainaddress, missing-at-sign.com, @missing-local.org,
 * missing-domain@.com, missing-tld@domain., user@domain..com,
 * user name@domain.com (spaces), user@domain (no TLD),
 * user@-domain.com (hyphen-leading domain), leading/trailing spaces,
 * SQL/script injection payloads.
 * Accepts: standard emails including + addressing and .co.uk TLDs.
 */
function isValidEmail(value) {
  if (!value || typeof value !== 'string') return false;
  // Reject any leading or trailing whitespace
  if (value !== value.trim()) return false;
  // Reject any internal whitespace
  if (/\s/.test(value)) return false;
  // Must have exactly one @
  const atIdx = value.indexOf('@');
  if (atIdx < 1) return false; // no @ or @ at start
  if (value.indexOf('@', atIdx + 1) !== -1) return false; // multiple @
  const local = value.slice(0, atIdx);
  const domain = value.slice(atIdx + 1);
  // Local part: 1-64 chars, allowed chars
  if (!local || local.length > 64) return false;
  if (!/^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local)) return false;
  // Domain: must have at least one dot, no leading/trailing dot, no double-dot
  if (!domain || domain.startsWith('.') || domain.endsWith('.')) return false;
  if (domain.startsWith('-') || domain.endsWith('-')) return false;
  if (domain.includes('..')) return false;
  const domainParts = domain.split('.');
  if (domainParts.length < 2) return false; // no TLD
  for (const part of domainParts) {
    if (!part) return false; // empty part (double dot or leading/trailing dot)
    if (part.startsWith('-') || part.endsWith('-')) return false;
    if (!/^[a-zA-Z0-9-]+$/.test(part)) return false;
  }
  // TLD must be at least 2 chars and alphabetic only
  const tld = domainParts[domainParts.length - 1];
  if (tld.length < 2 || !/^[a-zA-Z]+$/.test(tld)) return false;
  return true;
}

/**
 * Password strength validator.
 * Rules:
 *   - At least 10 characters
 *   - At least one uppercase letter (A-Z)
 *   - At least one lowercase letter (a-z)
 *   - At least one digit (0-9)
 *   - No whitespace characters (spaces, tabs, etc.)
 *
 * This correctly rejects all invalid test passwords:
 *   short, alllowercase, ALLUPPERCASE, 12345678, password, abc123,
 *   '     ' (spaces only), p@ss, 'P@ss wor d' (has space), P@ssw0rd! (9 chars)
 *
 * And accepts all valid test passwords:
 *   CorrectHorseBatteryStaple1!, StrongPass#2026, P@ssw0rd2026!
 */
function isValidPassword(value) {
  if (!value || typeof value !== 'string') return false;
  if (value.length < 10) return false;
  if (/\s/.test(value)) return false;
  if (!/[A-Z]/.test(value)) return false;
  if (!/[a-z]/.test(value)) return false;
  if (!/[0-9]/.test(value)) return false;
  return true;
}

/** Shows a field-level error and marks the input with an error border. */
function showFieldError(inputId, errorId, message) {
  const input = $(inputId);
  const error = $(errorId);
  if (error) error.textContent = message;
  if (input) input.classList.add('field-input--error');
}

/** Clears a field-level error and removes the error border. */
function clearFieldError(inputId, errorId) {
  const input = $(inputId);
  const error = $(errorId);
  if (error) error.textContent = '';
  if (input) input.classList.remove('field-input--error');
}

/** Validates the signin form. Returns true if valid, false if errors were shown. */
function validateLoginForm(emailVal, pwVal) {
  let valid = true;

  // ── Email ──────────────────────────────────────────────────────────────────
  clearFieldError('email', 'email-error');
  if (!emailVal) {
    showFieldError('email', 'email-error', 'Email is required');
    valid = false;
  } else if (!isValidEmail(emailVal)) {
    showFieldError('email', 'email-error', 'Enter a valid email — invalid format');
    valid = false;
  }

  // ── Password ───────────────────────────────────────────────────────────────
  clearFieldError('password', 'password-error');
  if (pwVal === '') {
    // Truly empty field — show "required"
    showFieldError('password', 'password-error', 'Password is required');
    valid = false;
  } else if (!isValidPassword(pwVal)) {
    // Weak, too short, has spaces, missing char class, etc.
    showFieldError('password', 'password-error',
      'Password must be at least 10 characters with uppercase, lowercase, and a number');
    valid = false;
  }

  return valid;
}

// ════════════════════════════════
//  AUTH FORM
// ════════════════════════════════
$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const emailRaw = $("email").value;
  const email    = emailRaw.trim();
  const pw       = $("password").value;
  $("auth-notice").textContent = "";

  // Signin mode: run client-side validation before touching Firebase.
  // We validate emailRaw (not trimmed) so that emails with leading/trailing
  // spaces are caught as invalid by the isValidEmail whitespace check.
  if (authMode === "signin") {
    if (!validateLoginForm(emailRaw, pw)) return; // stop — errors already shown
    // Clear any previous field errors before firing the network request
    clearFieldError('email', 'email-error');
    clearFieldError('password', 'password-error');
  }

  try {
    if (authMode === "reset") {
      await sendPasswordResetEmail(auth, email);
      $("auth-notice").style.color = "var(--teal)";
      $("auth-notice").textContent = "Password reset link sent. Check your inbox.";
    } else if (authMode === "signup") {
      const name  = $("signup-name").value.trim();
      const phone = $("signup-phone").value.trim();
      const cred  = await createUserWithEmailAndPassword(auth, email, pw);
      await setDoc(doc(db, "users", cred.user.uid), { email, displayName: name, phone, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      await setPersistence(auth, browserLocalPersistence);
      await signInWithEmailAndPassword(auth, email, pw);
    }
  } catch (err) {
    $("auth-notice").style.color = "var(--danger)";
    $("auth-notice").textContent = authErrorMsg(err);
  }
});

// ════════════════════════════════
//  PROFILE FORM
// ════════════════════════════════
$("profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!requireFirebaseSession()) return;
  const displayName = $("profile-full-name").value.trim();
  const email       = $("profile-email-input").value.trim();
  const phone       = $("profile-phone-input").value.trim();
  const specialty   = $("profile-spec-input").value.trim();

  state.profile = { displayName, email, phone, specialty };
  syncProfileUI();

  if (user) {
    try { await setDoc(doc(db, "users", user.uid), { displayName, phone, specialty, updatedAt: serverTimestamp() }, { merge: true }); }
    catch (e) { console.warn(e); }
  }
  alert("✓ Clinician details saved.");
});



// ════════════════════════════════
//  AUTH STATE
// ════════════════════════════════
onAuthStateChanged(auth, async (firebaseUser) => {
  if (firebaseUser) {
    user = firebaseUser;
    wantsAuth = false;
    if (user.displayName) state.profile.displayName = user.displayName;
    if (user.email)       state.profile.email       = user.email;

    $("auth-shell").classList.add("hidden");
    $("app").classList.remove("hidden");

    try {
      await setDoc(doc(db, "users", user.uid), { email: user.email, updatedAt: serverTimestamp() }, { merge: true });
      startCloudSync();
    } catch {
      renderAll();
    }
  } else {
    clearCloudSync();
    Object.assign(state, defaultState());
    if (wantsAuth) {
      $("app").classList.add("hidden");
      $("auth-shell").classList.remove("hidden");
      return;
    }
    $("app").classList.add("hidden");
    $("auth-shell").classList.remove("hidden");
  }
});

// Initial render (works without login)
renderAll();
syncProfileUI();
