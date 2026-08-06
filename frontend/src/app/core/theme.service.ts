import { Injectable, effect, inject, signal } from '@angular/core';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';

export type Theme = 'light' | 'dark';

/**
 * Tema SIN almacenamiento en el navegador:
 * - Invitados: preferencia del sistema (prefers-color-scheme).
 * - Con sesión: se guarda en el servidor (en la cuenta) y se rehidrata al entrar.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  readonly theme = signal<Theme>(this.systemTheme());
  /** Evita re-guardar el tema que acabamos de recibir del servidor. */
  private applyingFromServer = false;

  constructor() {
    // Aplica el tema al DOM cada vez que cambia.
    effect(() => {
      document.documentElement.setAttribute('data-theme', this.theme());
    });
    // Cuando se conoce al usuario (login o rehidratación), aplica SU tema.
    effect(() => {
      const pref = this.auth.user()?.themePref;
      if (pref === 'light' || pref === 'dark') {
        this.applyingFromServer = true;
        this.theme.set(pref);
        this.applyingFromServer = false;
      }
    });
  }

  private systemTheme(): Theme {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  toggle(): void {
    const next: Theme = this.theme() === 'dark' ? 'light' : 'dark';
    this.theme.set(next);
    // Si hay sesión, se persiste en el servidor (nunca en el navegador).
    if (!this.applyingFromServer && this.auth.isLogged()) {
      this.api.saveTheme(next).subscribe({ error: () => undefined });
    }
  }
}
