import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';

if (!getApps().length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      credential = cert(sa);
    } catch (e) {
      console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY, falling back to applicationDefault():", e);
      credential = applicationDefault();
    }
  } else {
    credential = applicationDefault();
  }

  try {
    initializeApp({
      credential,
      projectId: firebaseConfig.projectId,
    });
  } catch (err) {
    console.error("Firebase Admin SDK initialization error:", err);
  }
}

export const adminAuth = getAuth();
