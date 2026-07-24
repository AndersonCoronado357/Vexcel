import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import type { PaymentRecord } from '../../core/models';

/** Página dedicada al historial de pagos de la suscripción. */
@Component({
  selector: 'vx-payments',
  imports: [RouterLink],
  templateUrl: './payments.component.html',
  styleUrl: './payments.component.scss'
})
export class PaymentsComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly payments = signal<PaymentRecord[]>([]);
  readonly loaded = signal(false);

  ngOnInit(): void {
    this.api.paymentHistory().subscribe({
      next: (r) => {
        this.payments.set(r.payments);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true)
    });
  }

  cop(cents: number): string {
    return '$' + Math.round(cents / 100).toLocaleString('es-CO');
  }

  planName(id: string): string {
    return id === '—' ? 'Pago' : id.charAt(0).toUpperCase() + id.slice(1);
  }

  payDate(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      APPROVED: 'Aprobado',
      DECLINED: 'Rechazado',
      VOIDED: 'Anulado',
      PENDING: 'Pendiente',
      ERROR: 'Error'
    };
    return map[s] ?? s;
  }

  statusClass(s: string): string {
    if (s === 'APPROVED') return 'ok';
    if (s === 'PENDING') return 'pending';
    return 'bad';
  }

  methodLabel(m: string | null): string {
    if (!m) return '';
    const map: Record<string, string> = {
      CARD: 'Tarjeta',
      NEQUI: 'Nequi',
      PSE: 'PSE',
      BANCOLOMBIA_TRANSFER: 'Bancolombia',
      BANCOLOMBIA_QR: 'Bancolombia QR',
      DAVIPLATA: 'Daviplata'
    };
    return map[m] ?? m;
  }
}
