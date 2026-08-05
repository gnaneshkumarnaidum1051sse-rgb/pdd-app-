# PredictDent AI

## Run the web app

Install Node.js 20.19+ or 22.12+, then run:

```bash
npm install
npm run dev
```

Open the URL shown in the terminal, normally `http://localhost:5173`.

## Production build

```bash
npm run build
npm run preview
```

The optimized files are generated in `dist/`.

## Backend API

The Firebase Admin API is separate in `backend/`. Configure `backend/.env` using `backend/.env.example`, then run:

```bash
cd backend
npm install
npm run dev
```

## Web and Android data sync

The web app stores each signed-in user's data in the Firebase project configured in `firebase-config.js`:

- Profile: `users/{uid}`
- Patients: `users/{uid}/patients/{patientId}`
- Medical report metadata: `users/{uid}/reports/{reportId}`
- Medical report files: `reports/{uid}/{filename}` in Firebase Storage

Configure the Android app with the same Firebase project (`pddd-app`) and use Firebase Authentication for the same account. Listen to these Firestore paths with snapshot listeners; profile and report changes will then appear on both apps automatically.

## Install as an app

After hosting the production build over HTTPS, open it in a compatible browser and choose **Install app** or **Add to Home Screen**. The manifest sets the app to open in standalone mode.
