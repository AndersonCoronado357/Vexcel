import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiService } from '../../core/api.service';
import { ToastService } from '../../core/toast.service';
import {
  DEFAULT_SETTINGS,
  toTracerParams,
  type PngQuality,
  type TraceSettings,
  type VectorizeResponse
} from '../../core/models';

/**
 * Estado del conversor compartido entre la pantalla y el header
 * ("Nueva imagen" vive en el shell, como en el diseño).
 */
@Injectable({ providedIn: 'root' })
export class ConverterStateService {
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);

  readonly file = signal<File | null>(null);
  readonly fileName = signal('imagen.svg');
  readonly srcFmt = signal<'PNG' | 'JPG'>('PNG');
  readonly originalUrl = signal('');
  readonly originalSize = signal<{ w: number; h: number }>({ w: 512, h: 512 });
  readonly settings = signal<TraceSettings>({ ...DEFAULT_SETTINGS });
  readonly result = signal<VectorizeResponse | null>(null);
  readonly svgUrl = signal('');
  readonly processing = signal(false);
  readonly codeView = signal(false);
  readonly sheetOpen = signal(false);
  readonly usage = signal<{ used: number; limit: number | null }>({ used: 0, limit: null });

  readonly isLoaded = computed(() => this.file() !== null);

  private debounceId: ReturnType<typeof setTimeout> | null = null;
  /** La primera pasada de cada imagen cuenta para el límite del plan Free. */
  private mustCountUsage = false;

  loadFile(file: File): void {
    this.revoke(this.originalUrl());
    this.cache.clear();
    this.file.set(file);
    this.srcFmt.set(file.type.includes('png') ? 'PNG' : 'JPG');
    this.fileName.set((file.name || 'imagen').replace(/\.[^.]+$/, '') + '.svg');
    const url = URL.createObjectURL(file);
    this.originalUrl.set(url);
    const img = new Image();
    img.onload = () => this.originalSize.set({ w: img.naturalWidth || 512, h: img.naturalHeight || 512 });
    img.src = url;
    this.codeView.set(false);
    this.mustCountUsage = true;
    this.convert();
    this.toast.show('ok', 'Imagen cargada', 'Ajusta los controles para afinar el trazo.');
  }

  patchSettings(partial: Partial<TraceSettings>): void {
    this.settings.update((s) => ({ ...s, ...partial }));
    if (!this.file()) return;
    // Cambiar de modo debe ser instantáneo: normalmente ya está en caché
    // (lo precalculamos en paralelo), así que convertimos de inmediato.
    if ('mode' in partial) this.convert();
    else this.schedule();
  }

  reset(): void {
    this.revoke(this.originalUrl());
    this.revoke(this.svgUrl());
    this.cache.clear();
    if (this.debounceId) clearTimeout(this.debounceId);
    this.file.set(null);
    this.originalUrl.set('');
    this.svgUrl.set('');
    this.result.set(null);
    this.processing.set(false);
    this.codeView.set(false);
    this.sheetOpen.set(false);
  }

  /** Caché de resultados por firma de parámetros (incluye el modo). */
  private readonly cache = new Map<string, VectorizeResponse>();

  private sig(settings: TraceSettings): string {
    return JSON.stringify(toTracerParams(settings));
  }

  private schedule(): void {
    if (this.debounceId) clearTimeout(this.debounceId);
    this.debounceId = setTimeout(() => this.convert(), 400);
  }

  private applyResult(res: VectorizeResponse): void {
    this.result.set(res);
    this.revoke(this.svgUrl());
    this.svgUrl.set(URL.createObjectURL(new Blob([res.svg], { type: 'image/svg+xml' })));
  }

  private convert(): void {
    const file = this.file();
    if (!file) return;
    const settings = this.settings();
    const key = this.sig(settings);

    // Ya calculado (p. ej. al alternar de modo): se muestra al instante.
    const cached = this.cache.get(key);
    if (cached) {
      this.mustCountUsage = false;
      this.applyResult(cached);
      this.processing.set(false);
      this.prefetchOther(settings);
      return;
    }

    this.processing.set(true);
    const countUsage = this.mustCountUsage;
    this.mustCountUsage = false;
    this.api.vectorize(file, settings, countUsage).subscribe({
      next: (res) => {
        this.cache.set(key, res);
        this.applyResult(res);
        this.usage.set(res.usage);
        this.processing.set(false);
        this.prefetchOther(settings);
      },
      error: (err) => {
        this.processing.set(false);
        if (err?.error?.code === 'LIMIT') {
          this.toast.show('err', 'Límite del plan Free', err.error.error);
          if (countUsage) this.reset();
        } else {
          this.toast.show('err', 'No se pudo vectorizar', err?.error?.error ?? 'Intenta de nuevo.');
        }
      }
    });
  }

  /**
   * Precalcula EN PARALELO el otro modo (silueta ↔ color) con los mismos
   * ajustes, para que alternar de modo sea instantáneo. Es una petición de
   * fondo: no cuenta para el límite, no toca la UI ni muestra errores.
   */
  private prefetchOther(active: TraceSettings): void {
    const file = this.file();
    if (!file) return;
    const other: TraceSettings = {
      ...active,
      mode: active.mode === 'single' ? 'color' : 'single'
    };
    const key = this.sig(other);
    if (this.cache.has(key)) return;
    this.api.vectorize(file, other, false).subscribe({
      next: (res) => this.cache.set(key, res),
      error: () => {
        /* silencioso: es solo un adelanto */
      }
    });
  }

  saveToLibrary(target?: { teamId: string; folderId: string; folderName: string }): void {
    const r = this.result();
    if (!r) return;
    this.api
      .saveToLibrary({
        originalName: this.fileName(),
        mode: this.settings().mode === 'color' ? 'color' : 'mono',
        params: toTracerParams(this.settings()),
        svg: r.svg,
        width: r.width,
        height: r.height,
        originalBytes: r.originalBytes,
        preview: r.preview,
        teamId: target?.teamId,
        folderId: target?.folderId
      })
      .subscribe({
        next: () =>
          this.toast.show(
            'ok',
            target ? `Guardado en "${target.folderName}"` : 'Guardado en tu biblioteca',
            target ? 'Todo el equipo puede verlo.' : ''
          ),
        error: (err) =>
          this.toast.show('err', 'No se pudo guardar', err?.error?.error ?? 'Intenta de nuevo.')
      });
  }

  copySvg(): void {
    const r = this.result();
    if (!r) return;
    navigator.clipboard.writeText(r.svg).then(
      () => this.toast.show('ok', 'Código SVG copiado'),
      () => this.toast.show('err', 'No se pudo copiar')
    );
  }

  download(): void {
    const r = this.result();
    if (!r) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([r.svg], { type: 'image/svg+xml' }));
    a.download = this.fileName();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    this.toast.show('ok', 'Descarga iniciada', this.fileName());
  }

  /** Lado mayor del PNG por calidad. */
  private static readonly PNG_SIZES: Record<PngQuality, number> = {
    normal: 1024,
    fullhd: 1920,
    '2k': 2560,
    '4k': 3840
  };

  /**
   * Exporta el SVG rasterizado a PNG en la calidad pedida. El backend autoriza
   * según el plan (y en Free descuenta las descargas Full HD del mes).
   */
  exportPng(quality: PngQuality): void {
    const r = this.result();
    if (!r) return;
    this.api.registerDownload(quality).subscribe({
      next: ({ usage }) => {
        this.usage.set(usage);
        this.renderPng(quality);
      },
      error: (err) => {
        if (err?.error?.usage) this.usage.set(err.error.usage);
        this.toast.show(
          err?.error?.code === 'LIMIT' ? 'err' : 'info',
          err?.error?.code === 'LIMIT' ? 'Límite Full HD del mes' : 'Calidad de plan superior',
          err?.error?.error ?? 'No se pudo autorizar la descarga.'
        );
      }
    });
  }

  private renderPng(quality: PngQuality): void {
    const r = this.result();
    if (!r) return;
    const target = ConverterStateService.PNG_SIZES[quality];
    const f = target / Math.max(r.width, r.height);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(r.width * f);
      canvas.height = Math.round(r.height * f);
      canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (!blob) return;
        const label = quality === 'normal' ? '' : `-${quality}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = this.fileName().replace(/\.svg$/, '') + `${label}.png`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        this.toast.show('ok', 'PNG exportado', `${canvas.width} × ${canvas.height} px`);
      }, 'image/png');
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(r.svg);
  }

  private revoke(url: string): void {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
  }
}
