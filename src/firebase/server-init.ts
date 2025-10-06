
import { initializeApp, getApps, App, cert } from 'firebase-admin/app';

// This is a placeholder for the actual service account credentials.
// In a real environment, these would be loaded securely (e.g., from environment variables).
const getServiceAccount = () => {
    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };

    if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
        throw new Error('Firebase Admin SDK service account credentials are not fully set in environment variables.');
    }
    return serviceAccount;
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
