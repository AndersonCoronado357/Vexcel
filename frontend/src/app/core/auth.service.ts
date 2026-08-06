import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from './api.service';
import { PLAN_LABELS, type User } from './models';

/**
 * La sesión vive en una cookie httpOnly del backend (inaccesible desde JS).
 * En memoria solo guardamos el objeto de usuario para pintar la UI; al recargar
 * se rehidrata con /auth/session (ver loadSession, llamado en el arranque).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly user = signal<User | null>(null);
  readonly isLogged = computed(() => this.user() !== null);
  readonly initials = computed(() => {
    const n = this.user()?.name ?? 'U';
    return n.trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  });
  readonly planLabel = computed(() => {
    const u = this.user();
    return u ? PLAN_LABELS[u.plan] ?? 'Plan Free' : '';
  });

  /** Hidrata la sesión al arrancar leyendo la cookie (vía backend). */
  async loadSession(): Promise<void> {
    try {
      const { user } = await firstValueFrom(this.api.session());
      this.user.set(user ?? null);
    } catch {
      this.user.set(null);
    }
  }

  /** Acepta la sesión tras login/registro/reset (la cookie ya la puso el backend). */
  acceptSession(user: User): void {
    this.setUser(user);
  }

  setUser(user: User): void {
    this.user.set(user);
  }

  logout(): void {
    // Pide al backend borrar la cookie; pase lo que pase, limpiamos y salimos.
    this.api.logout().subscribe({
      next: () => this.finishLogout(),
      error: () => this.finishLogout()
    });
  }

  private finishLogout(): void {
    this.user.set(null);
    this.router.navigateByUrl('/login');
  }

  clear(): void {
    this.user.set(null);
  }
}
