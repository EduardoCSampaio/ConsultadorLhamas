
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './config';
import { getAuth } from 'firebase/auth';

/**
 * Initializes Firebase for server-side usage (e.g., API routes, server actions).
 * This function does NOT contain 'use client' and can be safely used on the server.
 */
export function initializeFirebaseAdmin() {
  if (!getApps().length) {
    // We are on the server, so we must use the explicit config.
    const firebaseApp = initializeApp(firebaseConfig);
    return getSdks(firebaseApp);
  }
  
  // If already initialized, return the SDKs with the existing app.
  return getSdks(getApp());
}

function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    firestore: getFirestore(firebaseApp),
    auth: getAuth(firebaseApp)
  };
}
