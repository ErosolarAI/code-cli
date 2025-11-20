import { bootstrapApplication } from '@angular/platform-browser';
import type { FirebaseOptions } from '@angular/fire/app';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

const ensureFirebaseConfig = async (): Promise<void> => {
  const globalScope = globalThis as {
    BO_FIREBASE_CONFIG?: FirebaseOptions;
    APT_FIREBASE_CONFIG?: FirebaseOptions;
  };
  if (globalScope.BO_FIREBASE_CONFIG ?? globalScope.APT_FIREBASE_CONFIG) {
    return;
  }

  if (typeof window !== 'undefined' && typeof fetch !== 'undefined') {
    try {
      const response = await fetch('/api/firebase-config', { cache: 'no-store' });
      if (response.ok) {
        const payload = (await response.json()) as FirebaseOptions;
        globalScope.BO_FIREBASE_CONFIG = payload;
        globalScope.APT_FIREBASE_CONFIG = payload;
        return;
      }
    } catch {
    }
  }

  globalScope.BO_FIREBASE_CONFIG = environment.firebase;
  globalScope.APT_FIREBASE_CONFIG = environment.firebase;
};

ensureFirebaseConfig()
  .catch((error) => {
    console.error('Failed to preload Firebase config', error);
    const globalScope = globalThis as {
      BO_FIREBASE_CONFIG?: FirebaseOptions;
      APT_FIREBASE_CONFIG?: FirebaseOptions;
    };
    globalScope.BO_FIREBASE_CONFIG = environment.firebase;
    globalScope.APT_FIREBASE_CONFIG = environment.firebase;
  })
  .finally(() => {
    bootstrapApplication(App, appConfig).catch((err) => console.error(err));
  });
