import { Component, inject, signal } from '@angular/core';
import { ConverterStateService } from './converter-state.service';
import { ViewportService } from '../../core/viewport.service';
import { ColorPickerComponent } from './color-picker.component';

const SWATCHES = ['#6D4AFF', '#5A38E0', '#4728B4', '#8B7BFF', '#232329', '#8E8EA0'];

@Component({
  selector: 'vx-controls',
  imports: [ColorPickerComponent],
  templateUrl: './controls.component.html',
  styleUrl: './controls.component.scss'
})
export class ControlsComponent {
  readonly st = inject(ConverterStateService);
  readonly vp = inject(ViewportService);

  readonly swatches = SWATCHES;
  readonly pickerOpen = signal(false);
  readonly pickerAnchor = signal({ left: 0, top: 0, bottom: 0 });

  /** Paleta real extraída del SVG resultante por el backend. */
  palette(): string[] {
    return this.st.result()?.palette ?? [];
  }

  num(ev: Event): number {
    return Number((ev.target as HTMLInputElement).value);
  }

  togglePicker(ev: Event): void {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    this.pickerAnchor.set({ left: rect.left, top: rect.top, bottom: rect.bottom });
    this.pickerOpen.update((v) => !v);
  }

  onHexInput(ev: Event): void {
    const raw = (ev.target as HTMLInputElement).value.trim().replace('#', '');
    if (/^[0-9a-fA-F]{6}$/.test(raw)) {
      this.st.patchSettings({ fillHex: ('#' + raw).toUpperCase() });
    }
  }

  modeHint(): string {
    return this.st.settings().mode === 'single'
      ? 'Traza una sola silueta sólida. Ideal para logos e iconos de un color.'
      : 'Conserva varios colores del original mediante un tracer multicolor.';
  }

  fillHint(): string {
    return this.st.settings().mode === 'single'
      ? 'Fuerza un color sólido, ideal para iconos de un color.'
      : 'Disponible solo en modo un solo color.';
  }
}
