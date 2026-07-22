import { Component, OnInit, computed, input, output, signal } from '@angular/core';

interface Hsv {
  h: number;
  s: number;
  v: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = (hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h || '0', 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const p = (x: number) => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0');
  return '#' + p(r) + p(g) + p(b);
}

function rgbToHsv(r: number, g: number, b: number): Hsv {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: mx ? d / mx : 0, v: mx };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** Selector de color HSV flotante del diseÃ±o (Ã¡rea S/V + barra de tono + hex/RGB). */
@Component({
  selector: 'vx-color-picker',
  template: `
    <div class="scrim" (click)="close.emit()"></div>
    <div class="card" [style.left.px]="pos().left" [style.top.px]="pos().top">
      <div
        class="sv"
        [style.background]="hueColor()"
        (pointerdown)="svDown($event)"
        (pointermove)="svMove($event)"
        (pointerup)="svUp()"
      >
        <div class="sv-white"></div>
        <div class="sv-black"></div>
        <div class="sv-knob" [style.left.%]="hsv().s * 100" [style.top.%]="(1 - hsv().v) * 100"
          [style.background]="hex()"></div>
      </div>
      <div class="hue-row">
        <div class="preview" [style.background]="hex()"></div>
        <div class="hue" (pointerdown)="hueDown($event)" (pointermove)="hueMove($event)" (pointerup)="hueUp()">
          <div class="hue-knob" [style.left.%]="(hsv().h / 360) * 100"></div>
        </div>
      </div>
      <div class="fields-row">
        <div class="hex-field">
          <div class="lbl">HEX</div>
          <div class="hex-wrap">
            <span class="hash">#</span>
            <input [value]="hex().slice(1).toUpperCase()" (input)="onHexInput($event)" spellcheck="false" />
          </div>
        </div>
        @for (f of rgbFields(); track f.label) {
          <div class="rgb-field">
            <div class="lbl" style="text-align:center">{{ f.label }}</div>
            <div class="rgb-box">{{ f.val }}</div>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    .scrim {
      position: fixed;
      inset: 0;
      z-index: 150;
    }
    .card {
      position: fixed;
      width: 264px;
      z-index: 200;
      background: var(--surface);
      border-radius: 16px;
      padding: 14px;
      animation: vx-popup 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.1);
    }
    .sv {
      position: relative;
      width: 100%;
      height: 140px;
      border-radius: 12px;
      cursor: crosshair;
      touch-action: none;
    }
    .sv-white,
    .sv-black {
      position: absolute;
      inset: 0;
      border-radius: 12px;
      pointer-events: none;
    }
    .sv-white {
      background: linear-gradient(to right, #fff, rgba(255, 255, 255, 0));
    }
    .sv-black {
      background: linear-gradient(to top, #000, rgba(0, 0, 0, 0));
    }
    .sv-knob {
      position: absolute;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      box-shadow: 0 0 0 2px #fff, 0 0 0 3px rgba(0, 0, 0, 0.3);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .hue-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 12px;
    }
    .preview {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      flex-shrink: 0;
    }
    .hue {
      position: relative;
      flex: 1;
      height: 14px;
      border-radius: 8px;
      cursor: pointer;
      touch-action: none;
      background: linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000);
    }
    .hue-knob {
      position: absolute;
      top: 50%;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--surface);
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
      transform: translate(-50%, -50%);
      pointer-events: none;
    }
    .fields-row {
      display: flex;
      gap: 8px;
      margin-top: 12px;
      align-items: flex-end;
    }
    .hex-field {
      flex: 1.5;
    }
    .rgb-field {
      flex: 1;
    }
    .lbl {
      font-size: 11px;
      color: var(--n-400);
      font-weight: 600;
      margin-bottom: 4px;
    }
    .hex-wrap {
      display: flex;
      align-items: center;
      border-radius: 9px;
      padding: 0 10px;
      height: 34px;
      background: var(--n-50);
    }
    .hash {
      font-family: var(--font-mono);
      color: var(--n-300);
      font-size: 13px;
    }
    .hex-wrap input {
      flex: 1;
      background: none;
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--n-800);
      text-transform: uppercase;
      padding: 0 0 0 4px;
      min-width: 0;
      width: 100%;
    }
    .rgb-box {
      border-radius: 9px;
      padding: 8px 0;
      font-family: var(--font-mono);
      font-size: 12.5px;
      color: var(--n-800);
      background: var(--n-50);
      text-align: center;
    }
  `
})
export class ColorPickerComponent implements OnInit {
  readonly initialHex = input.required<string>();
  /** Ancla del popup: rect del botÃ³n que lo abre. */
  readonly anchor = input.required<{ left: number; top: number; bottom: number }>();
  readonly hexChange = output<string>();
  readonly close = output<void>();

  readonly hsv = signal<Hsv>({ h: 258, s: 0.71, v: 1 });
  private svDragging = false;
  private hueDragging = false;

  readonly hex = computed(() => {
    const { h, s, v } = this.hsv();
    const { r, g, b } = hsvToRgb(h, s, v);
    return rgbToHex(r, g, b);
  });

  readonly hueColor = computed(() => {
    const { r, g, b } = hsvToRgb(this.hsv().h, 1, 1);
    return rgbToHex(r, g, b);
  });

  readonly rgbFields = computed(() => {
    const { r, g, b } = hexToRgb(this.hex());
    return [
      { label: 'R', val: Math.round(r) },
      { label: 'G', val: Math.round(g) },
      { label: 'B', val: Math.round(b) }
    ];
  });

  readonly pos = computed(() => {
    const PICK_W = 264, PICK_H = 288;
    const a = this.anchor();
    const left = Math.max(12, Math.min(a.left, window.innerWidth - PICK_W - 12));
    let top = a.top - PICK_H - 10;
    if (top < 12) top = a.bottom + 10;
    top = Math.max(12, Math.min(top, window.innerHeight - PICK_H - 12));
    return { left, top };
  });

  ngOnInit(): void {
    const { r, g, b } = hexToRgb(this.initialHex());
    this.hsv.set(rgbToHsv(r, g, b));
  }

  private emit(): void {
    this.hexChange.emit(this.hex().toUpperCase());
  }

  svDown(ev: PointerEvent): void {
    this.svDragging = true;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.svUpdate(ev);
  }
  svMove(ev: PointerEvent): void {
    if (this.svDragging) this.svUpdate(ev);
  }
  svUp(): void {
    this.svDragging = false;
  }
  private svUpdate(ev: PointerEvent): void {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (ev.clientY - rect.top) / rect.height));
    this.hsv.update((p) => ({ ...p, s, v }));
    this.emit();
  }

  hueDown(ev: PointerEvent): void {
    this.hueDragging = true;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.hueUpdate(ev);
  }
  hueMove(ev: PointerEvent): void {
    if (this.hueDragging) this.hueUpdate(ev);
  }
  hueUp(): void {
    this.hueDragging = false;
  }
  private hueUpdate(ev: PointerEvent): void {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const h = Math.max(0, Math.min(359.9, ((ev.clientX - rect.left) / rect.width) * 360));
    this.hsv.update((p) => ({ ...p, h }));
    this.emit();
  }

  onHexInput(ev: Event): void {
    const raw = (ev.target as HTMLInputElement).value.trim().replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(raw)) {
      const { r, g, b } = hexToRgb('#' + raw);
      this.hsv.set(rgbToHsv(r, g, b));
      this.emit();
    }
  }
}



