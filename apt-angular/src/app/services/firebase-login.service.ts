import { Injectable, signal } from '@angular/core';
import type { FirebaseOptions } from 'firebase/app';

declare global {
  interface Window {
    BO_FIREBASE_CONFIG?: FirebaseOptions;
    APT_FIREBASE_CONFIG?: FirebaseOptions;
  }
}

@Injectable({ providedIn: 'root' })
export class FirebaseLoginService {
  private readonly supportState = signal(false);
  private readonly supportChecked = signal(false);

  constructor() {
    if (typeof window !== 'undefined') {
      const supported = Boolean(this.readConfig());
      this.supportState.set(supported);
      this.supportChecked.set(true);
    }
  }

  readonly isSupported = this.supportState.asReadonly();
  readonly isReady = this.supportChecked.asReadonly();

  async signInWithPopup(): Promise<string | null> {
    const config = this.readConfig();
    if (!config || typeof window === 'undefined') {
      return null;
    }

    const [{ initializeApp, getApps, getApp }, authModule] = await Promise.all([
      import('firebase/app'),
      import('firebase/auth')
    ]);

    let app;
    const existing = getApps().find((candidate) => candidate.name === 'bo-angular');
    if (existing) {
      app = existing;
    } else {
      app = initializeApp(config, 'bo-angular');
    }

    const auth = authModule.getAuth(app);
    const provider = new authModule.GoogleAuthProvider();
    const result = await authModule.signInWithPopup(auth, provider);
    return result.user.getIdToken();
  }

  private readConfig(): FirebaseOptions | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.BO_FIREBASE_CONFIG ?? window.APT_FIREBASE_CONFIG ?? null;
  }
}
