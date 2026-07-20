import { Component, computed, input } from '@angular/core';

/** Logo real de Vexcel (la "V" con flecha y puntos). */
@Component({
  selector: 'vx-mark',
  template: `
    <img [src]="src()" [style.width.px]="size()" [style.height.px]="size()"
      alt="Logo de Vexcel" style="display:block" />
  `
})
export class MarkComponent {
  readonly size = input(26);
  readonly variant = input<'default' | 'white'>('default');
  readonly src = computed(() =>
    this.variant() === 'white' ? 'assets/vexcel-icon-white.svg' : 'assets/vexcel-icon.svg'
  );
}
