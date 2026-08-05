# PredictDent API

This is the authenticated backend for medical-report uploads and analysis history.

1. Install Node.js 20+.
2. Copy `.env.example` to `.env` and enter Firebase Admin service-account values.
3. Run `npm install` and `npm run dev` from this folder.
4. In Firebase Console, enable Email/Password Authentication and create a Firestore database.

The API only accepts Firebase ID tokens and stores each authenticated user's reports in Firestore. Its clinical analysis output is currently demonstrative; connect a vetted OCR/AI service inside `analysisResult()` before production use.
