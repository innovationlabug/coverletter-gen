/**
 * Firebase web config for the "coverletter-emily" web app.
 *
 * The values are NOT in the repository: they come from Vite env vars (.env.local locally,
 * project env vars on Vercel). They are public by design once deployed (they identify the app,
 * they do not authorise anything); abuse protection is App Check, see src/lib/firebase.ts.
 * Get them with:  firebase apps:sdkconfig WEB <appId> --project <projectId>
 */
import type { FirebaseOptions } from 'firebase/app';

const env = import.meta.env;

export const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

/** True when the minimum fields for Firebase AI Logic are present. */
export function isFirebaseConfigured(cfg: FirebaseOptions = firebaseConfig): boolean {
  return Boolean(cfg.apiKey && cfg.projectId && cfg.appId);
}

/** Optional reCAPTCHA Enterprise site key; when set, App Check is initialised. */
export const recaptchaEnterpriseKey: string | undefined = env.VITE_RECAPTCHA_ENTERPRISE_KEY || undefined;

/** Dev-only App Check debug token (only honoured by `vite dev`, never in a production build). */
export const appCheckDebugToken: string | undefined = env.DEV ? env.VITE_APPCHECK_DEBUG_TOKEN || undefined : undefined;
