import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, type AuthResponse } from './api.service';
import { PLAN_LABELS, type User } from './models';

const TOKEN_KEY = 'vexcel_token';
const USER_KEY = 'vexcel_user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly user = signal<User | null>(this.readStoredUser());
  readonly isLogged = computed(() => this.user() !== null);
  readonly initials = computed(() => {
    const n = this.user()?.name ?? 'U';
    return n.trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  });
  readonly planLabel = computed(() => {
    const u = this.user();
    return u ? PLAN_LABELS[u.plan] ?? 'Plan Free' : '';
  });

  constructor() {
    // Revalida la sesión guardada contra el backend al arrancar (diferido para
    // no disparar HTTP dentro de la construcción del servicio).
    if (this.token) {
      queueMicrotask(() =>
        this.api.me().subscribe({
          next: ({ user }) => this.setUser(user),
          error: (err) => {
            // Solo cierra sesión si el token fue rechazado; un fallo de red no.
            if (err?.status === 401) this.clear();
          }
        })
      );
    }
  }

  get token(): string {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  }

  private readStoredUser(): User | null {
    try {
      const raw = localStorage.getItem(USER_KEY);
      return raw && localStorage.getItem(TOKEN_KEY) ? (JSON.parse(raw) as User) : null;
    } catch {
      return null;
    }
  }

  /**
   * Acepta la sesión. Devuelve true si ya redirigió (invitación pendiente):
   * en ese caso el llamador NO debe navegar por su cuenta.
   */
  acceptSession(res: AuthResponse): boolean {
    localStorage.setItem(TOKEN_KEY, res.token);
    this.setUser(res.user);
    const pending = localStorage.getItem('vexcel_pending_join');
    if (pending) {
      localStorage.removeItem('vexcel_pending_join');
      this.router.navigateByUrl('/unirse?c=' + encodeURIComponent(pending));
      return true;
    }
    return false;
  }

  setUser(user: User): void {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    this.user.set(user);
  }

  /**
   * Acepta una sesión a partir de un token (p. ej. el que devuelve el login con
   * Google). Guarda el token, trae el usuario y entra a la app.
   */
  loginWithToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token);
    this.api.me().subscribe({
      next: ({ user }) => {
        this.setUser(user);
        this.router.navigateByUrl('/');
      },
      error: () => {
        this.clear();
        this.router.navigateByUrl('/login');
      }
    });
  }

  logout(): void {
    this.clear();
    this.router.navigateByUrl('/login');
  }

  clear(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    this.user.set(null);
  }
}
