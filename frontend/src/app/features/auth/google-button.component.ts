import { Component, OnInit, inject, input, signal } from '@angular/core';
import { ToastService } from '../../core/toast.service';
import { ApiService } from '../../core/api.service';

@Component({
  selector: 'vx-google-button',
  template: `
    <button type="button" class="btn-google" (click)="onClick()">
      <span style="display:flex">
        <svg width="18" height="18" viewBox="0 0 48 48" style="display:block">
          <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.6 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 2.9-2.2 5.4-4.7 7.1l7.3 5.7C43.7 37.7 46.5 31.7 46.5 24.5z"/>
          <path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.3 0 20 0 24s1 7.7 2.6 10.8l7.8-6.1z"/>
          <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.3-5.7c-2 1.4-4.7 2.3-7.9 2.3-6.4 0-11.7-3.8-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
        </svg>
      </span>
      <span>{{ label() }}</span>
    </button>
  `,
  styleUrl: './auth-shared.scss'
})
export class GoogleButtonComponent implements OnInit {
  readonly label = input('Continuar con Google');
  private readonly toast = inject(ToastService);
  private readonly api = inject(ApiService);
  readonly enabled = signal(false);

  ngOnInit(): void {
    this.api.authProviders().subscribe({
      next: (p) => this.enabled.set(p.google),
      error: () => this.enabled.set(false)
    });
  }

  onClick(): void {
    if (this.enabled()) {
      // Login con Google gestionado por acmsy (ruta en la raíz, no /api).
      window.location.href = '/auth/google';
    } else {
      this.toast.show('info', 'Google no está disponible', 'Usa tu correo y contraseña por ahora.');
    }
  }
}
