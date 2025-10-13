
import { initializeApp, getApps, App, cert, ServiceAccount } from 'firebase-admin/app';

// This will hold the initialized app instance.
let adminApp: App | null = null;

/**
 * Parses the service account credentials from a single environment variable.
 * Firebase Studio and Vercel provide the credentials in a JSON string.
 */
const getServiceAccount = (): ServiceAccount => {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_CREDENTIALS;

    if (!serviceAccountJson) {
        throw new Error('Firebase Admin SDK service account credentials are not fully set in environment variables.');
    }
    
    try {
        // Parse the JSON string from the environment variable.
        const serviceAccount = JSON.parse(serviceAccountJson);
        return serviceAccount;
    } catch (e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT_CREDENTIALS:", e);
        throw new Error("Could not parse Firebase service account credentials. Make sure it's a valid JSON string.");
    }
}

/**
 * Initializes the Firebase Admin SDK for server-side usage.
 * This is now designed to be robust and idempotent, safe to call multiple times.
 * It ensures initialization only happens once.
 */
export function initializeFirebaseAdmin(): App {
  // If the app is already initialized, return it immediately.
  if (adminApp) {
    return adminApp;
  }
  
  // If other apps were somehow initialized, use the first one.
  if (getApps().length > 0) {
    adminApp = getApps()[0];
    if (adminApp) return adminApp;
  }

  // Get the credentials from environment variables.
  const serviceAccount = getServiceAccount();

  // Initialize the app and store it in our local variable.
  adminApp = initializeApp({
    credential: cert(serviceAccount),
  });

  return adminApp;
}
