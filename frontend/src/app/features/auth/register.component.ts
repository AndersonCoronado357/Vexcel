import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { MarkComponent } from '../../shared/mark.component';
import { GoogleButtonComponent } from './google-button.component';

@Component({
  selector: 'vx-register',
  imports: [FormsModule, RouterLink, MarkComponent, GoogleButtonComponent],
  templateUrl: './register.component.html',
  styleUrl: './auth-shared.scss'
})
export class RegisterComponent {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  name = '';
  email = '';
  pass = '';
  readonly busy = signal(false);
  // Leemos del DOM al enviar (el autocompletado no siempre sincroniza ngModel).
  readonly nameEl = viewChild<ElementRef<HTMLInputElement>>('nameEl');
  readonly emailEl = viewChild<ElementRef<HTMLInputElement>>('emailEl');
  readonly passEl = viewChild<ElementRef<HTMLInputElement>>('passEl');

  readonly benefits = [
    { title: 'Vectorización con potrace', desc: 'Calidad idéntica a un trazo profesional.' },
    { title: 'Conversiones ilimitadas', desc: 'Convierte todo lo que quieras, gratis.' },
    { title: 'Descarga en SVG limpio', desc: 'Y 5 descargas Full HD al mes incluidas.' },
    { title: 'Biblioteca personal', desc: 'Guarda y reabre tus conversiones.' }
  ];

  submit(): void {
    if (this.busy()) return;
    const name = (this.nameEl()?.nativeElement.value ?? this.name).trim();
    const email = (this.emailEl()?.nativeElement.value ?? this.email).trim();
    const pass = this.passEl()?.nativeElement.value ?? this.pass;
    if (!name || !email || !pass) {
      this.toast.show('err', 'Completa el formulario', 'Nombre, correo y contraseña.');
      return;
    }
    this.busy.set(true);
    this.api.register(name, email, pass).subscribe({
      next: (res) => {
        this.auth.acceptSession(res.user);
        const join = this.route.snapshot.queryParamMap.get('join');
        this.router.navigateByUrl(join ? '/unirse?c=' + encodeURIComponent(join) : '/');
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show('err', 'No se pudo crear la cuenta', err?.error?.error ?? 'Intenta de nuevo.');
      }
    });
  }
}
