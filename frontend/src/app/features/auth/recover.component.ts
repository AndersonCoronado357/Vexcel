import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'vx-recover',
  imports: [FormsModule, RouterLink],
  templateUrl: './recover.component.html',
  styleUrls: ['./auth-shared.scss', './recover.component.scss']
})
export class RecoverComponent {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  email = '';
  readonly busy = signal(false);
  readonly sent = signal(false);

  submit(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.api.recover(this.email.trim()).subscribe({
      next: () => {
        this.busy.set(false);
        this.sent.set(true);
      },
      error: (err) => {
        this.busy.set(false);
        this.toast.show('err', 'No se pudo enviar el enlace', err?.error?.error ?? 'Intenta de nuevo.');
      }
    });
  }
}
