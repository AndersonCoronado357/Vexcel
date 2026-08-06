import { Component, ElementRef, OnInit, inject, signal, viewChild } from '@angular/core';
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
  // Referencias al DOM: leemos el valor real al enviar (el autocompletado del
  // navegador a veces no dispara el evento que sincroniza ngModel).
  readonly emailEl = viewChild<ElementRef<HTMLInputElement>>('emailEl');
  readonly passEl = viewChild<ElementRef<HTMLInputElement>>('passEl');

  ngOnInit(): void {
    // El login con Google deja la sesión en una cookie y vuelve directo a "/",
    // así que aquí solo manejamos los avisos de error.
    const g = this.route.snapshot.queryParamMap.get('google');
    if (g === 'error') {
      this.toast.show('err', 'No se pudo entrar con Google', 'Intenta de nuevo o usa tu correo.');
    } else if (g === 'unavailable') {
      this.toast.show('info', 'Google no está disponible', 'Usa tu correo y contraseña por ahora.');
    }
  }

  /** A dónde ir tras autenticar: al equipo si venías de una invitación. */
  private afterAuthUrl(): string {
    const join = this.route.snapshot.queryParamMap.get('join');
    return join ? '/unirse?c=' + encodeURIComponent(join) : '/';
  }

  submit(): void {
    if (this.busy()) return;
    // Valor real del DOM (robusto ante autocompletado), con ngModel de respaldo.
    const email = (this.emailEl()?.nativeElement.value ?? this.email).trim();
    const pass = this.passEl()?.nativeElement.value ?? this.pass;
    if (!email || !pass) {
      this.toast.show('err', 'Faltan datos', 'Escribe tu correo y contraseña.');
      return;
    }
    this.busy.set(true);
    this.api.login(email, pass).subscribe({
      next: (res) => {
        this.auth.acceptSession(res.user);
        this.router.navigateByUrl(this.afterAuthUrl());
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show('err', 'No se pudo iniciar sesión', err?.error?.error ?? 'Intenta de nuevo.');
      }
    });
  }

}
