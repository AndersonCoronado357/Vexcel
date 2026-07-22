import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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

  name = '';
  email = '';
  pass = '';
  readonly busy = signal(false);

  readonly benefits = [
    { title: 'Vectorización con potrace', desc: 'Calidad idéntica a un trazo profesional.' },
    { title: 'Conversiones ilimitadas', desc: 'Convierte todo lo que quieras, gratis.' },
    { title: 'Descarga en SVG limpio', desc: 'Y 5 descargas Full HD al mes incluidas.' },
    { title: 'Biblioteca personal', desc: 'Guarda y reabre tus conversiones.' }
  ];

  submit(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.register(this.name.trim(), this.email.trim(), this.pass).subscribe({
      next: (res) => {
        if (!this.auth.acceptSession(res)) this.router.navigateByUrl('/');
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show('err', 'No se pudo crear la cuenta', err?.error?.error ?? 'Intenta de nuevo.');
      }
    });
  }
}
