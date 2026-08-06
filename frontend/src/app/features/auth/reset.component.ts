import { Component, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'vx-reset',
  imports: [FormsModule, RouterLink],
  templateUrl: './reset.component.html',
  styleUrls: ['./auth-shared.scss', './recover.component.scss']
})
export class ResetComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  pass = '';
  pass2 = '';
  readonly busy = signal(false);
  readonly validLink = signal(true);
  readonly passEl = viewChild<ElementRef<HTMLInputElement>>('passEl');
  readonly pass2El = viewChild<ElementRef<HTMLInputElement>>('pass2El');

  private token = '';
  email = '';

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    this.token = q.get('token') ?? '';
    this.email = (q.get('e') ?? '').toLowerCase();
    if (!this.token || !this.email) this.validLink.set(false);
  }

  submit(): void {
    if (this.busy()) return;
    const pass = this.passEl()?.nativeElement.value ?? this.pass;
    const pass2 = this.pass2El()?.nativeElement.value ?? this.pass2;
    if (pass.length < 8) {
      this.toast.show('err', 'Contraseña muy corta', 'Debe tener mínimo 8 caracteres.');
      return;
    }
    if (pass !== pass2) {
      this.toast.show('err', 'No coinciden', 'Repite la misma contraseña.');
      return;
    }
    this.busy.set(true);
    this.api.resetPassword(this.email, this.token, pass).subscribe({
      next: (res) => {
        // Navega primero; el toast se muestra al terminar (no interfiere con la
        // view-transition, que si no aborta la navegación).
        this.auth.acceptSession(res.user);
        this.router.navigateByUrl('/').then(() =>
          this.toast.show('ok', 'Contraseña actualizada', 'Tu sesión ya está iniciada.')
        );
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show('err', 'No se pudo restablecer', err?.error?.error ?? 'El enlace pudo vencer.');
      }
    });
  }
}
