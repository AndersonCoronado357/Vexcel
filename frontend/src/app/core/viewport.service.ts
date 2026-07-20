import { Injectable, signal } from '@angular/core';

/** El diseño usa 760px como corte escritorio/móvil. */
@Injectable({ providedIn: 'root' })
export class ViewportService {
  readonly isMobile = signal(window.innerWidth < 760);

  constructor() {
    const update = () => this.isMobile.set(window.innerWidth < 760);
    window.addEventListener('resize', update, { passive: true });
    window.matchMedia('(max-width: 759px)').addEventListener('change', update);
  }
}
