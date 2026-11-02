import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
const httpAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

if (!getApps().length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      credential = cert(sa, httpAgent);
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
      httpAgent,
    });
  } catch (err) {
    console.error("Firebase Admin SDK initialization error:", err);
  }
}

export const adminAuth = getAuth();
