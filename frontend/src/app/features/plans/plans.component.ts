import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { isTeamPlan, type Plan } from '../../core/models';

interface PlanCard {
  id: Plan;
  name: string;
  price: string;
  per: string;
  desc: string;
  tagline: string;
  features: string[];
  popular: boolean;
  cta: string;
  seats: string | null;
}

const INDIVIDUAL: PlanCard[] = [
  {
    id: 'free', name: 'Free', price: 'Gratis', per: '',
    desc: 'Todas las funciones, en calidad estándar.',
    tagline: 'Empieza sin tarjeta',
    features: [
      'Todas las funciones del editor',
      'Conversiones y biblioteca sin límite',
      'SVG en calidad estándar (1024 px)',
      'PNG normal ilimitado',
      '5 descargas Full HD al mes'
    ],
    popular: false, cta: 'Tu plan gratis', seats: null
  },
  {
    id: 'pro', name: 'Pro', price: '$30.000', per: '/mes',
    desc: 'Para diseñadores freelance.',
    tagline: 'El favorito de los freelance',
    features: [
      'Todo lo del plan Free',
      'SVG en alta resolución (2400 px)',
      'Full HD ilimitado',
      'PNG hasta 2K (2560 px)'
    ],
    popular: true, cta: 'Suscribirme', seats: null
  },
  {
    id: 'studio', name: 'Studio', price: '$60.000', per: '/mes',
    desc: 'Para uso intensivo y profesional.',
    tagline: 'Máxima calidad de exportación',
    features: [
      'Todo lo de Pro',
      'PNG hasta 4K (3840 px)',
      'Máxima calidad de trazado',
      'Soporte prioritario'
    ],
    popular: false, cta: 'Elegir Studio', seats: null
  }
];

const TEAMS: PlanCard[] = [
  {
    id: 'starter', name: 'Starter', price: '$100.000', per: '/mes',
    desc: 'Para equipos pequeños.',
    tagline: 'Tu primer equipo',
    features: [
      'Calidad Pro para cada miembro (2K)',
      'Panel de administración de equipo',
      'Roles: admin, editor y lector'
    ],
    popular: false, cta: 'Empezar Starter', seats: 'Hasta 3 miembros'
  },
  {
    id: 'business', name: 'Business', price: '$200.000', per: '/mes',
    desc: 'Para equipos en crecimiento.',
    tagline: 'El equilibrio perfecto',
    features: [
      'Calidad Studio para cada miembro (4K)',
      'Invitaciones y estados de miembro',
      'Roles y administración completa',
      'Soporte prioritario'
    ],
    popular: true, cta: 'Elegir Business', seats: 'Hasta 10 miembros'
  },
  {
    id: 'enterprise', name: 'Enterprise', price: '$500.000', per: '/mes',
    desc: 'Para agencias grandes.',
    tagline: 'Sin límites, con SLA',
    features: [
      'Todo lo de Business',
      'SSO y auditoría',
      'SLA dedicado',
      'Onboarding personalizado'
    ],
    popular: false, cta: 'Contactar ventas', seats: 'Miembros ilimitados'
  }
];

@Component({
  selector: 'vx-plans',
  imports: [TitleCasePipe],
  templateUrl: './plans.component.html',
  styleUrl: './plans.component.scss'
})
export class PlansComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly scope = signal<'individual' | 'team'>(
    isTeamPlan(this.auth.user()?.plan) ? 'team' : 'individual'
  );
  readonly plans = computed(() => (this.scope() === 'team' ? TEAMS : INDIVIDUAL));
  /** ¿La pasarela de pago está activa? Si no, se cae a cambio simulado. */
  readonly payEnabled = signal(false);
  readonly processing = signal<Plan | null>(null);
  readonly sub = signal<{ plan: Plan; planUntil: string | null; autoRenew: boolean } | null>(null);
  readonly cancelling = signal(false);
  /** Solo mostramos el contenido cuando ya sabemos si hay suscripción activa,
   *  para que la tarjeta de suscripción y los planes salgan juntos (sin salto). */
  readonly ready = signal(false);

  /** ¿El usuario tiene una suscripción de pago activa (con vencimiento)? */
  readonly hasActiveSub = computed(() => {
    const s = this.sub();
    return !!s && s.plan !== 'free' && !!s.planUntil;
  });

  ngOnInit(): void {
    this.api.payStatus().subscribe({
      next: (s) => {
        this.payEnabled.set(s.enabled);
        if (s.enabled) this.loadSubscription();
        else this.ready.set(true);
      },
      error: () => {
        this.payEnabled.set(false);
        this.ready.set(true);
      }
    });
    // Regreso desde el checkout de Wompi: ?wompi=1&id=<transactionId>
    const q = this.route.snapshot.queryParamMap;
    if (q.get('wompi') === '1' && q.get('id')) {
      this.confirmPayment(q.get('id')!);
    }
  }

  private confirmPayment(id: string): void {
    this.toast.show('info', 'Confirmando tu pago…', 'Un momento.');
    this.api.verifyPayment(id).subscribe({
      next: (r) => {
        // Limpia los parámetros de la URL.
        this.router.navigate([], { queryParams: {}, replaceUrl: true });
        if (r.activated && r.user) {
          this.auth.setUser(r.user);
          this.loadSubscription();
          this.toast.show('ok', '¡Pago aprobado!', `Tu plan ${r.user.plan.toUpperCase()} está activo.`);
          if (isTeamPlan(r.user.plan)) setTimeout(() => this.router.navigateByUrl('/equipo'), 1200);
        } else if (r.status === 'PENDING') {
          this.toast.show('info', 'Pago pendiente', 'Te avisaremos cuando se confirme.');
        } else {
          this.toast.show('err', 'El pago no se completó', 'No se realizó ningún cobro.');
        }
      },
      error: (err) => this.toast.show('err', 'No se pudo verificar el pago', err?.error?.error ?? '')
    });
  }

  private loadSubscription(): void {
    this.api.subscription().subscribe({
      next: (s) => {
        this.sub.set(s);
        this.ready.set(true);
      },
      error: () => {
        this.sub.set(null);
        this.ready.set(true);
      }
    });
  }


  /** Fecha del vencimiento/renovación, formateada. */
  renewLabel(): string {
    const s = this.sub();
    if (!s?.planUntil) return '';
    const d = new Date(s.planUntil);
    return d.toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  cancelSub(): void {
    if (this.cancelling()) return;
    this.cancelling.set(true);
    this.api.cancelSubscription().subscribe({
      next: (r) => {
        this.cancelling.set(false);
        this.sub.set({ plan: r.plan, planUntil: r.planUntil, autoRenew: r.autoRenew });
        this.toast.show(
          'ok',
          'Renovación cancelada',
          `Tu plan sigue activo hasta el ${this.renewLabel()}. No se te volverá a cobrar.`
        );
      },
      error: (err) => {
        this.cancelling.set(false);
        this.toast.show('err', 'No se pudo cancelar', err?.error?.error ?? '');
      }
    });
  }

  isCurrent(p: PlanCard): boolean {
    return this.auth.user()?.plan === p.id;
  }

  pick(p: PlanCard): void {
    if (this.isCurrent(p) || this.processing()) return;

    // Plan gratis: baja de plan directo, sin pago.
    if (p.id === 'free') {
      this.api.setPlan('free').subscribe({
        next: ({ user }) => {
          this.auth.setUser(user);
          this.toast.show('ok', 'Plan cambiado', 'Ahora estás en el plan Free.');
        },
        error: (err) => this.toast.show('err', 'No se pudo cambiar', err?.error?.error ?? '')
      });
      return;
    }

    // Sin pasarela configurada aún: no se activa nada (evita el "plan actual"
    // instantáneo). El plan de pago SOLO se activa pagando de verdad.
    if (!this.payEnabled()) {
      this.toast.show(
        'info',
        'Pagos aún no disponibles',
        'Configura tus llaves de Wompi en el backend para activar los planes de pago.'
      );
      return;
    }

    // Pago real: pide los parámetros firmados y redirige al checkout de Wompi.
    this.processing.set(p.id);
    this.api.checkout(p.id).subscribe({
      next: (c) => {
        const url =
          `${c.checkoutUrl}?public-key=${encodeURIComponent(c.publicKey)}` +
          `&currency=${c.currency}&amount-in-cents=${c.amountInCents}` +
          `&reference=${encodeURIComponent(c.reference)}` +
          `&signature:integrity=${c.signature}` +
          `&redirect-url=${encodeURIComponent(c.redirectUrl)}` +
          `&customer-data:email=${encodeURIComponent(c.customerEmail)}`;
        window.location.href = url;
      },
      error: (err) => {
        this.processing.set(null);
        this.toast.show('err', 'No se pudo iniciar el pago', err?.error?.error ?? 'Intenta de nuevo.');
      }
    });
  }
}
