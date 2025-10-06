
import { initializeApp, getApps, App, cert, ServiceAccount } from 'firebase-admin/app';

/**
 * Parses the service account credentials from environment variables.
 * Firebase Studio provides the credentials in a JSON string.
 */
const getServiceAccount = (): ServiceAccount => {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_CREDENTIALS;

    if (!serviceAccountJson) {
        throw new Error('Firebase Admin SDK service account credentials are not fully set in environment variables.');
    }
    
    try {
        const serviceAccount = JSON.parse(serviceAccountJson);
        return serviceAccount;
    } catch (e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_CREDENTIALS:", e);
        throw new Error("Could not parse Firebase service account credentials.");
    }
}


/**
 * Initializes the Firebase Admin SDK for server-side usage.
 * This is safe to call multiple times; it will only initialize once.
 * It uses environment variables for service account credentials, which are
 * securely stored in the deployment environment.
 */
export function initializeFirebaseAdmin(): App {
  if (getApps().length) {
    return getApps()[0];
  }

  const serviceAccount = getServiceAccount();

  return initializeApp({
    credential: cert(serviceAccount),
  });
}
