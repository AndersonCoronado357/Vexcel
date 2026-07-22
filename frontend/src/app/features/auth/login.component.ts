import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { MarkComponent } from '../../shared/mark.component';
import { GoogleButtonComponent } from './google-button.component';

@Component({
  selector: 'vx-login',
  imports: [FormsModule, RouterLink, MarkComponent, GoogleButtonComponent],
  templateUrl: './login.component.html',
  styleUrl: './auth-shared.scss'
})
export class LoginComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  email = '';
  pass = '';
  readonly busy = signal(false);
  /** Volviendo de Google: mostramos una pantalla de carga limpia (sin alertas). */
  readonly googleEntering = signal(false);

  ngOnInit(): void {
    const q = this.route.snapshot.queryParamMap;
    const token = q.get('token');
    if (token) {
      // Vuelta del login con Google: entramos directo, sin toast ni formulario.
      this.googleEntering.set(true);
      this.auth.loginWithToken(token);
      return;
    }
    const g = q.get('google');
    if (g === 'error') {
      this.toast.show('err', 'No se pudo entrar con Google', 'Intenta de nuevo o usa tu correo.');
    } else if (g === 'unavailable') {
      this.toast.show('info', 'Google no está disponible', 'Usa tu correo y contraseña por ahora.');
    }
  }

  submit(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.login(this.email.trim(), this.pass).subscribe({
      next: (res) => {
        if (!this.auth.acceptSession(res)) this.router.navigateByUrl('/');
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show('err', 'No se pudo iniciar sesión', err?.error?.error ?? 'Intenta de nuevo.');
      }
    });
  }

}
