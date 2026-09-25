/**
 * Lazy Firebase initialisation (app + optional App Check + Firebase AI Logic).
 * Nothing Firebase-related is loaded until the user asks for the cloud letter.
 */
import type { FirebaseApp } from 'firebase/app';
import type { AI } from 'firebase/ai';
import { appCheckDebugToken, firebaseConfig, isFirebaseConfigured, recaptchaEnterpriseKey } from '../firebase-config';

let aiPromise: Promise<AI> | null = null;

export type AppCheckMode = 'recaptcha-enterprise' | 'debug-token' | 'off';

export function appCheckMode(): AppCheckMode {
  if (appCheckDebugToken) return 'debug-token';
  if (recaptchaEnterpriseKey) return 'recaptcha-enterprise';
  return 'off';
}

async function initAppCheck(app: FirebaseApp): Promise<void> {
  const mode = appCheckMode();
  if (mode === 'off') return;
  const { initializeAppCheck, ReCaptchaEnterpriseProvider, CustomProvider } = await import('firebase/app-check');
  if (mode === 'debug-token') {
    // Dev only: the SDK exchanges this registered debug token for an App Check token.
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = appCheckDebugToken;
    initializeAppCheck(app, {
      // In debug mode the provider is never asked for a token; a no-op provider avoids loading reCAPTCHA.
      provider: new CustomProvider({ getToken: () => Promise.reject(new Error('debug mode only')) }),
      isTokenAutoRefreshEnabled: true,
    });
    return;
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseKey!),
    isTokenAutoRefreshEnabled: true,
  });
}

export function getFirebaseAI(): Promise<AI> {
  if (!isFirebaseConfigured()) {
    return Promise.reject(new Error('Firebase no está configurado: faltan variables VITE_FIREBASE_* (ver README).'));
  }
  aiPromise ??= (async () => {
    const [{ initializeApp, getApps }, { getAI, GoogleAIBackend }] = await Promise.all([
      import('firebase/app'),
      import('firebase/ai'),
    ]);
    const app = getApps()[0] ?? initializeApp(firebaseConfig);
    await initAppCheck(app);
    return getAI(app, { backend: new GoogleAIBackend() });
  })();
  return aiPromise;
}

/** Tests only. */
export function _resetFirebaseForTests(): void {
  aiPromise = null;
}
