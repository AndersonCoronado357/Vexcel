import {
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';

/**
 * Modal para ajustar la foto de perfil: mover (arrastrar) y acercar (zoom)
 * antes de guardar. Recorta a un cuadrado de 512×512 con máscara circular.
 */
@Component({
  selector: 'vx-avatar-editor',
  template: `
    <div class="ae-backdrop" (click)="cancel.emit()"></div>
    <div class="ae-card" role="dialog" aria-modal="true">
      <div class="ae-title">Ajusta tu foto</div>
      <div class="ae-sub">Arrastra para mover y usa el control para acercar.</div>

      <div
        #viewport
        class="ae-viewport"
        (pointerdown)="down($event)"
        (pointermove)="move($event)"
        (pointerup)="up($event)"
        (pointercancel)="up($event)"
      >
        @if (src()) {
          <img
            class="ae-img"
            [src]="src()"
            (load)="onLoad($event)"
            [style.width.px]="dispW()"
            [style.height.px]="dispH()"
            [style.left.px]="(SIZE - dispW()) / 2"
            [style.top.px]="(SIZE - dispH()) / 2"
            [style.transform]="'translate(' + x() + 'px,' + y() + 'px) scale(' + zoom() + ')'"
            alt="Foto a recortar"
            draggable="false"
          />
        }
        <div class="ae-ring"></div>
      </div>

      <div class="ae-zoom">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M8 11h6" />
        </svg>
        <input type="range" min="1" max="3" step="0.01" [value]="zoom()"
          (input)="setZoom($any($event.target).value)" />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
          stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3M8 11h6M11 8v6" />
        </svg>
      </div>

      <div class="ae-actions">
        <button type="button" class="ae-btn ae-ghost" (click)="cancel.emit()">Cancelar</button>
        <button type="button" class="ae-btn ae-primary" (click)="apply()">Guardar foto</button>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        position: fixed;
        inset: 0;
        z-index: 200;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      .ae-backdrop {
        position: absolute;
        inset: 0;
        background: rgba(10, 10, 16, 0.55);
        backdrop-filter: blur(4px);
        animation: ae-fade 0.18s ease;
      }
      .ae-card {
        position: relative;
        width: 100%;
        max-width: 360px;
        background: var(--surface);
        border-radius: 22px;
        padding: 22px;
        animation: ae-pop 0.22s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .ae-title {
        font: 700 19px var(--font-sans);
        color: var(--n-900);
        letter-spacing: -0.02em;
      }
      .ae-sub {
        margin-top: 4px;
        font-size: 13px;
        color: var(--n-400);
      }
      .ae-viewport {
        position: relative;
        width: 260px;
        height: 260px;
        margin: 18px auto 0;
        border-radius: 16px;
        overflow: hidden;
        background: var(--n-100);
        touch-action: none;
        cursor: grab;
        user-select: none;
      }
      .ae-viewport:active {
        cursor: grabbing;
      }
      .ae-img {
        position: absolute;
        transform-origin: center center;
        pointer-events: none;
        max-width: none;
      }
      .ae-ring {
        position: absolute;
        inset: 0;
        pointer-events: none;
        border-radius: 16px;
        box-shadow: 0 0 0 9999px transparent;
      }
      .ae-ring::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: 50%;
        box-shadow: 0 0 0 2000px rgba(18, 18, 26, 0.16);
        outline: 2px solid rgba(255, 255, 255, 0.92);
        outline-offset: -2px;
      }
      :root[data-theme='dark'] .ae-ring::after {
        box-shadow: 0 0 0 2000px rgba(0, 0, 0, 0.5);
      }
      .ae-zoom {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 16px;
        color: var(--n-400);
      }
      .ae-zoom input {
        flex: 1;
      }
      .ae-actions {
        display: flex;
        gap: 10px;
        margin-top: 20px;
      }
      .ae-btn {
        flex: 1;
        height: 46px;
        border-radius: 13px;
        font: 600 14.5px var(--font-sans);
        cursor: pointer;
        transition: background 0.15s;
      }
      .ae-ghost {
        background: var(--n-100);
        color: var(--n-700);
      }
      .ae-ghost:hover {
        background: var(--n-200);
      }
      .ae-primary {
        background: var(--a-500);
        color: #fff;
      }
      .ae-primary:hover {
        background: var(--a-600);
      }
      @keyframes ae-fade {
        from {
          opacity: 0;
        }
      }
      @keyframes ae-pop {
        from {
          opacity: 0;
          transform: translateY(10px) scale(0.97);
        }
      }
    `
  ]
})
export class AvatarEditorComponent {
  /** Imagen origen (data URL). */
  readonly src = input.required<string>();
  readonly save = output<string>();
  readonly cancel = output<void>();

  protected readonly SIZE = 260;
  private readonly OUT = 512;

  private readonly viewport = viewChild.required<ElementRef<HTMLElement>>('viewport');

  private readonly natW = signal(1);
  private readonly natH = signal(1);
  /** Escala natural→viewport que hace que la imagen cubra el recuadro. */
  private readonly cover = signal(1);

  readonly zoom = signal(1);
  readonly x = signal(0);
  readonly y = signal(0);

  readonly dispW = computed(() => this.natW() * this.cover());
  readonly dispH = computed(() => this.natH() * this.cover());

  private dragging = false;
  private last = { x: 0, y: 0 };

  onLoad(ev: Event): void {
    const img = ev.target as HTMLImageElement;
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    this.natW.set(w);
    this.natH.set(h);
    this.cover.set(this.SIZE / Math.min(w, h));
    this.zoom.set(1);
    this.x.set(0);
    this.y.set(0);
  }

  setZoom(v: string): void {
    this.zoom.set(Math.max(1, Math.min(3, Number(v) || 1)));
    this.clamp();
  }

  down(ev: PointerEvent): void {
    this.dragging = true;
    this.last = { x: ev.clientX, y: ev.clientY };
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  }
  move(ev: PointerEvent): void {
    if (!this.dragging) return;
    this.x.update((v) => v + (ev.clientX - this.last.x));
    this.y.update((v) => v + (ev.clientY - this.last.y));
    this.last = { x: ev.clientX, y: ev.clientY };
    this.clamp();
  }
  up(ev: PointerEvent): void {
    this.dragging = false;
    try {
      (ev.currentTarget as HTMLElement).releasePointerCapture(ev.pointerId);
    } catch {
      /* noop */
    }
  }

  /** Mantiene la imagen siempre cubriendo el recuadro. */
  private clamp(): void {
    const halfX = Math.max(0, (this.dispW() * this.zoom() - this.SIZE) / 2);
    const halfY = Math.max(0, (this.dispH() * this.zoom() - this.SIZE) / 2);
    this.x.update((v) => Math.max(-halfX, Math.min(halfX, v)));
    this.y.update((v) => Math.max(-halfY, Math.min(halfY, v)));
  }

  apply(): void {
    const s = this.cover() * this.zoom(); // natural px → viewport px
    // Región del recuadro en coordenadas de la imagen natural.
    const sSize = this.SIZE / s;
    const sx = (0 - (this.SIZE / 2 + this.x())) / s + this.natW() / 2;
    const sy = (0 - (this.SIZE / 2 + this.y())) / s + this.natH() / 2;

    const canvas = document.createElement('canvas');
    canvas.width = this.OUT;
    canvas.height = this.OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, sx, sy, sSize, sSize, 0, 0, this.OUT, this.OUT);
      this.save.emit(canvas.toDataURL('image/png'));
    };
    img.src = this.src();
  }
}
