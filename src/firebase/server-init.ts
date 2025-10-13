
import { initializeApp, getApps, App, cert, ServiceAccount } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

/**
 * Parses the service account credentials from a single environment variable.
 */
const getServiceAccount = (): ServiceAccount => {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_CREDENTIALS;
    if (!serviceAccountJson) {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_CREDENTIALS environment variable is not set.');
    }
    try {
        return JSON.parse(serviceAccountJson) as ServiceAccount;
    } catch (e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_CREDENTIALS:", e);
        throw new Error("Could not parse Firebase service account credentials.");
    }
}

/**
 * Initializes the Firebase Admin SDK app instance if it doesn't already exist.
 * This is idempotent and safe to call multiple times.
 */
const initializeAdminApp = (): App => {
  if (getApps().length > 0) {
    return getApps()[0];
  }
  const serviceAccount = getServiceAccount();
  return initializeApp({
    credential: cert(serviceAccount),
  });
}

// Initialize the app once and export the services.
// This pattern is safer in serverless environments like Next.js.
const adminApp = initializeAdminApp();
const firestore = getFirestore(adminApp);
const auth = getAuth(adminApp);

export { firestore, auth };

    