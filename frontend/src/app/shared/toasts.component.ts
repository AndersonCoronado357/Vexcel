import { Component, inject } from '@angular/core';
import { ToastService, type Toast } from '../core/toast.service';

/**
 * Alertas del diseÃ±o: icono de lÃ­nea en el color del tipo (sin fondo), que se
 * dibuja animado con stroke-dashoffset, y texto centrado.
 */
@Component({
  selector: 'vx-toasts',
  template: `
    <div class="stack">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast">
          <svg class="t-icon" width="24" height="24" viewBox="0 0 24 24" fill="none"
            [attr.stroke]="color(t)" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
            @if (t.type === 'ok') {
              <circle cx="12" cy="12" r="9.5" class="draw draw-slow" />
              <path d="M8 12.5l2.6 2.6L16 9.5" class="draw draw-late" />
            } @else if (t.type === 'err') {
              <circle cx="12" cy="12" r="9.5" class="draw draw-slow" />
              <path d="M9.2 9.2l5.6 5.6M14.8 9.2l-5.6 5.6" class="draw draw-late" />
            } @else {
              <circle cx="12" cy="12" r="9.5" class="draw draw-slow" />
              <path d="M12 11v5M12 8h.01" class="draw draw-late" />
            }
          </svg>
          <div class="body">
            <div class="title">{{ t.title }}</div>
            @if (t.msg) {
              <div class="msg">{{ t.msg }}</div>
            }
          </div>
          <div class="prog" [style.background]="color(t)"></div>
        </div>
      }
    </div>
  `,
  styles: `
    .stack {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      z-index: 210;
      align-items: flex-end;
      pointer-events: none;
    }
    /* Icono a la izquierda, texto al lado alineado; verticalmente centrados */
    .toast {
      width: 320px;
      background: var(--surface);
      border-radius: 15px;
      padding: 14px 16px;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      gap: 12px;
      animation: vx-toast 0.4s cubic-bezier(0.2, 0.9, 0.3, 1.2);
    }
    .t-icon {
      flex-shrink: 0;
    }
    /* El icono se forma dibujÃ¡ndose: primero el aro, luego el sÃ­mbolo */
    .draw {
      stroke-dasharray: 62;
      stroke-dashoffset: 62;
      animation: vx-check 0.5s cubic-bezier(0.23, 1, 0.32, 1) forwards;
    }
    .draw-slow {
      animation-duration: 0.55s;
    }
    .draw-late {
      animation-delay: 0.28s;
      animation-duration: 0.4s;
    }
    .body {
      min-width: 0;
      flex: 1;
    }
    .title {
      font-size: 13.5px;
      font-weight: 600;
      color: var(--n-900);
    }
    .msg {
      font-size: 12.5px;
      color: var(--n-500);
      margin-top: 1px;
      line-height: 1.4;
    }
    .prog {
      position: absolute;
      left: 0;
      bottom: 0;
      height: 3px;
      width: 100%;
      transform-origin: left;
      animation: vx-prog 3.2s linear forwards;
    }
    @media (max-width: 759px) {
      .stack {
        top: 12px;
        right: 12px;
        left: 12px;
        align-items: stretch;
      }
      .toast {
        width: 100%;
      }
    }
  `
})
export class ToastsComponent {
  readonly toasts = inject(ToastService);

  color(t: Toast): string {
    return t.type === 'ok' ? '#6D4AFF' : t.type === 'err' ? '#D64541' : '#8B7BFF';
  }
}



