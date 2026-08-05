import "dotenv/config";
import cors from "cors";
import express from "express";
import admin from "firebase-admin";
import multer from "multer";

const required = ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing Firebase Admin environment values: ${missing.join(", ")}`);

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
  })
});

const db = admin.firestore();
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const allowedTypes = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);
app.use(cors({ origin: process.env.CLIENT_ORIGIN || "http://localhost:8080" }));
app.use(express.json({ limit: "1mb" }));

async function requireUser(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Authentication is required." });
  try { req.user = await admin.auth().verifyIdToken(token); next(); }
  catch { return res.status(401).json({ error: "Invalid or expired Firebase token." }); }
}

function analysisResult(source) {
  return { caseId: `PD-${Date.now().toString().slice(-6)}`, source, score: 98, healingScore: 100, boneHealth: "98% · Type II Density", risk: "Low Risk", status: "Optimal", timeline: [74, 81, 94, 97, 98], disclaimer: "Demo clinical-analysis output. A qualified clinician must verify all report values before diagnosis." };
}

app.get("/api/health", (_, res) => res.json({ ok: true, service: "PredictDent API" }));
app.post("/api/reports/analyze", requireUser, upload.single("report"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "A medical report file is required." });
  if (!allowedTypes.has(req.file.mimetype)) return res.status(415).json({ error: "Only PDF, JPG, PNG, and WEBP medical reports are accepted." });
  const result = analysisResult(req.file.originalname);
  const report = { uid: req.user.uid, patientName: "Clinical Report Patient", fileName: req.file.originalname, mimeType: req.file.mimetype, createdAt: admin.firestore.FieldValue.serverTimestamp(), ...result };
  const reference = await db.collection("reports").add(report);
  res.status(201).json({ id: reference.id, ...result });
});
app.post("/api/reports/analyze-text", requireUser, async (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ error: "Medical report text is required." });
  const result = analysisResult("Pasted medical report");
  const reference = await db.collection("reports").add({ uid: req.user.uid, patientName: "Clinical Report Patient", text, createdAt: admin.firestore.FieldValue.serverTimestamp(), ...result });
  res.status(201).json({ id: reference.id, ...result });
});
app.get("/api/reports", requireUser, async (req, res) => {
  const snapshot = await db.collection("reports").where("uid", "==", req.user.uid).orderBy("createdAt", "desc").limit(25).get();
  res.json(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
});
app.use((error, _, res, __) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: "Report files must be 10 MB or smaller." });
  console.error(error); res.status(500).json({ error: "The report could not be processed." });
});
app.listen(process.env.PORT || 3001, () => console.log(`PredictDent API listening on port ${process.env.PORT || 3001}`));
