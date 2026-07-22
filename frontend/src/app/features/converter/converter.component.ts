import { Component, ElementRef, HostListener, inject, signal, viewChild } from '@angular/core';
import { ConverterStateService } from './converter-state.service';
import { ViewportService } from '../../core/viewport.service';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';
import { ControlsComponent } from './controls.component';
import {
  formatKb,
  maxPngQuality,
  type PngQuality,
  type TeamFoldersResponse
} from '../../core/models';

@Component({
  selector: 'vx-converter',
  imports: [ControlsComponent],
  templateUrl: './converter.component.html',
  styleUrl: './converter.component.scss'
})
export class ConverterComponent {
  readonly st = inject(ConverterStateService);
  readonly vp = inject(ViewportService);
  private readonly auth = inject(AuthService);

  private readonly apiSvc = inject(ApiService);

  readonly dragging = signal(false);
  readonly sliderPos = signal(52);
  readonly pngMenuOpen = signal(false);
  readonly saveMenuOpen = signal(false);
  /** Carpetas del equipo (null = aún no consultado; NOTEAM = sin equipo). */
  readonly teamFolders = signal<TeamFoldersResponse | 'NOTEAM' | null>(null);
  private sliderDragging = false;

  /** Guardar: directo a la biblioteca personal, o menú si hay equipo. */
  onSave(ev: Event): void {
    ev.stopPropagation();
    const tf = this.teamFolders();
    if (tf === 'NOTEAM') {
      this.st.saveToLibrary();
      return;
    }
    if (tf === null) {
      this.apiSvc.teamFolders().subscribe({
        next: (data) => {
          this.teamFolders.set(data);
          this.saveMenuOpen.set(true);
        },
        error: () => {
          this.teamFolders.set('NOTEAM');
          this.st.saveToLibrary();
        }
      });
      return;
    }
    this.saveMenuOpen.set(!this.saveMenuOpen());
  }

  savePersonal(): void {
    this.saveMenuOpen.set(false);
    this.st.saveToLibrary();
  }

  saveToFolder(folderId: string, folderName: string): void {
    const tf = this.teamFolders();
    if (tf === null || tf === 'NOTEAM') return;
    this.saveMenuOpen.set(false);
    this.st.saveToLibrary({ teamId: tf.teamId, folderId, folderName });
  }

  /** Calidades de PNG con su disponibilidad según el plan. */
  readonly pngOptions: { q: PngQuality; label: string; size: string }[] = [
    { q: 'normal', label: 'Normal', size: '1024 px' },
    { q: 'fullhd', label: 'Full HD', size: '1920 px' },
    { q: '2k', label: '2K', size: '2560 px' },
    { q: '4k', label: '4K', size: '3840 px' }
  ];

  private static readonly ORDER: PngQuality[] = ['normal', 'fullhd', '2k', '4k'];

  qualityLocked(q: PngQuality): boolean {
    return (
      ConverterComponent.ORDER.indexOf(q) >
      ConverterComponent.ORDER.indexOf(maxPngQuality(this.auth.user()?.plan))
    );
  }

  isFreePlan(): boolean {
    return this.auth.user()?.plan === 'free';
  }

  pickPng(q: PngQuality): void {
    this.pngMenuOpen.set(false);
    this.st.exportPng(q);
  }

  @HostListener('document:click')
  closeMenus(): void {
    if (this.pngMenuOpen()) this.pngMenuOpen.set(false);
    if (this.saveMenuOpen()) this.saveMenuOpen.set(false);
  }

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  readonly formatKb = formatKb;

  browse(): void {
    this.fileInput().nativeElement.click();
  }

  onFileInput(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.accept(file);
    input.value = '';
  }

  onDrop(ev: DragEvent): void {
    ev.preventDefault();
    this.dragging.set(false);
    const file = ev.dataTransfer?.files?.[0];
    if (file) this.accept(file);
  }

  onDragOver(ev: DragEvent): void {
    ev.preventDefault();
    this.dragging.set(true);
  }

  private accept(file: File): void {
    if (!['image/png', 'image/jpeg'].includes(file.type)) return;
    if (file.size > 20 * 1024 * 1024) return;
    this.st.loadFile(file);
  }

  resultTag(): string {
    return this.st.settings().mode === 'single' ? 'SVG · Silueta' : 'SVG · Multicolor';
  }

  dims(): string {
    const r = this.st.result();
    if (r) return `${r.width} × ${r.height}`;
    const s = this.st.originalSize();
    return `${s.w} × ${s.h}`;
  }

  sizeText(): string {
    const r = this.st.result();
    return r ? formatKb(r.bytes) : '—';
  }

  sliderDown(ev: PointerEvent): void {
    this.sliderDragging = true;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.sliderUpdate(ev);
  }
  sliderMove(ev: PointerEvent): void {
    if (this.sliderDragging) this.sliderUpdate(ev);
  }
  sliderUp(): void {
    this.sliderDragging = false;
  }
  private sliderUpdate(ev: PointerEvent): void {
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const pct = ((ev.clientX - rect.left) / rect.width) * 100;
    this.sliderPos.set(Math.min(96, Math.max(4, pct)));
  }
}
