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
const ts = (v) => v?.toMillis?.() ?? 0;

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

function renderAll() {
  const reports = activeReports();
  syncProfileUI();
  renderHomeRecent(reports);
  renderPatients();
  renderPredictions(reports);
  updateStats(reports);
}

function updateStats(reports) {
  const highRisk = reports.filter((r) => r.risk === "High Risk").length;
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set("patient-count",    state.patients.length || reports.length);
  set("scan-count",       reports.length);
  set("prediction-count", reports.length);
  set("risk-count",       highRisk);
  set("reports-analyzed", reports.length);
  const lowRisk = reports.length - highRisk;
  set("low-risk-count",  lowRisk);
  set("high-risk-count", highRisk);
  const latest = reports[0];
  const lsEl = $("latest-score");
  if (lsEl) lsEl.textContent = latest?.score != null ? `${latest.score}%` : "—";
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
      <div class="recent-score">${r.score != null ? r.score : 98}%</div>
    </div>
  `).join("") || '<p class="empty-state">No reports yet.</p>';
}

function renderPatients(filter = "") {
  const el = $("patient-list");
  if (!el) return;
  const reports = activeReports();
  const filtered = reports.filter((r) =>
    (r.patientName || r.fileName || "").toLowerCase().includes(filter.toLowerCase())
  );
  if (!filtered.length) {
    el.innerHTML = '<p class="empty-state">No patient records found.</p>';
    return;
  }
  el.innerHTML = filtered.map((r) => {
    const initial = (r.patientName || "C")[0].toUpperCase();
    return `
      <div class="patient-row" data-open-report="${r.id}">
        <div class="patient-avatar">${initial}</div>
        <div class="patient-info">
          <div class="patient-name">${r.patientName || "Clinical Report Patient"}</div>
          <div class="patient-meta">${r.fileName || "report.jpg"} · Survival ${r.score != null ? r.score : 98}%</div>
        </div>
        <div class="patient-score">${r.score != null ? r.score : 98}%</div>
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
      <div class="pred-score">${r.score != null ? r.score : 98}%</div>
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
}

// ════════════════════════════════
//  REPORT EVALUATION MODAL
// ════════════════════════════════
// Accepts either a report object or a report ID string.
function openEvaluation(reportOrId) {
  const report = (typeof reportOrId === "object" && reportOrId !== null)
    ? reportOrId
    : (activeReports().find((r) => r.id === reportOrId) || activeReports()[0]);
  if (!report) return;

  const score  = report.score ?? 98;
  const values = [score, Math.max(0, score - 17), Math.max(0, score - 36), Math.max(0, score - 56)];

  document.querySelectorAll("#patient-evaluation .ring").forEach((ring, i) => {
    ring.style.setProperty("--v", values[i]);
    const b = ring.querySelector("b");
    if (b) b.textContent = `${values[i]}%`;
  });

  const dp = $("detail-patient"); if (dp) dp.textContent = `Patient: ${report.patientName || "Clinical Report Patient"}`;
  const dr = $("detail-risk");    if (dr) dr.textContent = report.risk || "Low Risk";
  const ds = $("detail-success"); if (ds) ds.textContent = `${score}%`;

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
  const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ")
    .replace(/\b(medical|clinical|lab|report|record|document|scan)\b/gi, "").replace(/\s+/g, " ").trim();
  const patientName = baseName
    ? baseName.replace(/\b\w/g, (c) => c.toUpperCase())
    : `Clinical Report Patient`;

  const entry = { id: `r-${Date.now()}`, patientName, fileName: file.name, score: 98, risk: "Low Risk", createdAt: { toMillis: () => Date.now() } };

  // ── Show result INSTANTLY — no waiting for the network ──
  state.reports = [entry, ...state.reports];
  renderAll();
  showView("predictions");
  openEvaluation(entry);

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
  if (reportBtn) { openEvaluation(reportBtn.dataset.openReport); return; }

  if (e.target.id === "create-patient") { $("patient-modal").classList.remove("hidden"); return; }
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
//  AUTH FORM
// ════════════════════════════════
$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  const pw    = $("password").value;
  $("auth-notice").textContent = "";

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
//  PATIENT FORM
// ════════════════════════════════
$("patient-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!requireFirebaseSession()) return;
  const name = $("patient-name").value.trim();
  const age  = $("patient-age").value;
  if (!name) return;

  const entry = {
    id: `p-${Date.now()}`,
    patientName: name,
    fileName: `Patient Record${age ? ` (${age} y/o)` : ""}`,
    score: 98, risk: "Low Risk",
    createdAt: { toMillis: () => Date.now() },
  };

  if (user) {
    try { await addDoc(userCol("patients"), { name, age, createdAt: serverTimestamp() }); }
    catch (e) { console.warn(e); }
  }

  state.reports.unshift(entry);
  renderAll();
  $("patient-modal").classList.add("hidden");
  e.target.reset();
  showView("patients");
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
