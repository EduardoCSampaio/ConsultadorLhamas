// NOTE: This file should not have the 'use client' directive.
// It is intended to run in any environment (client or server).

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/**
 * Initializes and returns the Firebase app and associated services.
 * This function is idempotent. It ensures that Firebase is initialized only once.
 */
export function initializeFirebase() {
  if (!getApps().length) {
    // If no apps are initialized, initialize a new one with the provided config.
    const firebaseApp = initializeApp(firebaseConfig);
    return getSdks(firebaseApp);
  }
  
  // If an app is already initialized, get it and return the services.
  return getSdks(getApp());
}

/**
 * A helper function to get the SDKs from a FirebaseApp instance.
 * @param firebaseApp The initialized FirebaseApp.
 * @returns An object containing the auth and firestore SDKs.
 */
export function getSdks(firebaseApp: FirebaseApp) {
  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore: getFirestore(firebaseApp),
  };
}
