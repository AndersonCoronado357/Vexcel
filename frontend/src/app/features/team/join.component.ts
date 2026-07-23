import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

/** PÃ¡gina del enlace/QR de invitaciÃ³n: /unirse?c=CODIGO */
@Component({
  selector: 'vx-join',
  template: `
    <div class="wrap">
      <div class="card">
        <img src="assets/vexcel-icon.svg" alt="Vexcel" width="46" height="46"
          [style.animation]="busy() ? 'vx-pulse 1.2s ease-in-out infinite' : 'none'" />
        <div class="title">{{ title() }}</div>
        <div class="sub">{{ sub() }}</div>
      </div>
    </div>
  `,
  styles: `
    .wrap {
      flex: 1;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--n-50);
      padding: 24px;
    }
    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      background: var(--surface);
      border-radius: 22px;
      padding: 44px 48px;
      text-align: center;
      animation: vx-pop 240ms var(--ease-out-strong);
    }
    .title {
      font-size: 19px;
      font-weight: 700;
      color: var(--n-900);
      margin-top: 8px;
    }
    .sub {
      font-size: 14px;
      color: var(--n-400);
    }
  `
})
export class JoinComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly busy = signal(true);
  readonly title = signal('UniÃ©ndote al equipoâ€¦');
  readonly sub = signal('Un momento.');

  ngOnInit(): void {
    const code = (this.route.snapshot.queryParamMap.get('c') ?? '').toUpperCase();
    if (!code) {
      this.router.navigateByUrl('/');
      return;
    }
    if (!this.auth.isLogged()) {
      // Guarda el cÃ³digo, entra o crea cuenta, y se retoma solo.
      localStorage.setItem('vexcel_pending_join', code);
      this.router.navigateByUrl('/login');
      return;
    }
    this.api.joinTeam(code).subscribe({
      next: ({ teamName }) => {
        this.busy.set(false);
        this.title.set(`Ya eres parte de ${teamName}`);
        this.sub.set('Te llevamos al conversorâ€¦');
        this.toast.show('ok', 'InvitaciÃ³n aceptada', `Bienvenido a ${teamName}.`);
        setTimeout(() => this.router.navigateByUrl('/'), 1400);
      },
      error: (err) => {
        this.busy.set(false);
        this.title.set('No se pudo usar la invitaciÃ³n');
        this.sub.set(err?.error?.error ?? 'Revisa el cÃ³digo e intenta de nuevo.');
        setTimeout(() => this.router.navigateByUrl('/'), 2600);
      }
    });
  }
}



