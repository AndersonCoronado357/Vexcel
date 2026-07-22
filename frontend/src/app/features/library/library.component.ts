import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { AvatarEditorComponent } from './avatar-editor.component';
import {
  formatKb,
  type HistoryItem,
  type TeamFolderInfo,
  type TeamFoldersResponse,
  type TeamLibraryItem
} from '../../core/models';

@Component({
  selector: 'vx-library',
  imports: [RouterLink, DatePipe, FormsModule, AvatarEditorComponent],
  templateUrl: './library.component.html',
  styleUrl: './library.component.scss'
})
export class LibraryComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly items = signal<HistoryItem[]>([]);
  readonly loaded = signal(false);

  /** Carpetas compartidas (null = sin equipo). */
  readonly team = signal<TeamFoldersResponse | null>(null);
  readonly openFolder = signal<TeamFolderInfo | null>(null);
  readonly folderItems = signal<TeamLibraryItem[]>([]);
  readonly folderLoading = signal(false);
  readonly creatingFolder = signal(false);
  newFolderName = '';

  readonly formatKb = formatKb;

  ngOnInit(): void {
    this.api.history().subscribe({
      next: (items) => {
        this.items.set(items);
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true)
    });
    this.api.teamFolders().subscribe({
      next: (data) => this.team.set(data),
      error: () => this.team.set(null)
    });
  }

  countText(): string {
    const n = this.items().length;
    return n + (n === 1 ? ' archivo guardado' : ' archivos guardados');
  }

  /** Fuente que se está editando en el modal de recorte (null = cerrado). */
  readonly avatarSrc = signal<string | null>(null);
  readonly savingAvatar = signal(false);

  onAvatar(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      this.toast.show('err', 'Imagen muy grande', 'La foto debe pesar menos de 8 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.avatarSrc.set(reader.result as string);
    reader.readAsDataURL(file);
  }

  /** El modal devolvió la foto ya recortada (data URL cuadrada). */
  onAvatarSave(dataUrl: string): void {
    this.savingAvatar.set(true);
    this.api.setAvatar(dataUrl).subscribe({
      next: ({ user }) => {
        this.auth.setUser(user);
        this.avatarSrc.set(null);
        this.savingAvatar.set(false);
        this.toast.show('ok', 'Foto de perfil actualizada');
      },
      error: (err) => {
        this.savingAvatar.set(false);
        this.toast.show('err', 'No se pudo actualizar', err?.error?.error ?? '');
      }
    });
  }

  open(item: HistoryItem | TeamLibraryItem): void {
    this.api.historyDetail(item.id).subscribe({
      next: (d) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([d.svg], { type: 'image/svg+xml' }));
        a.download = d.originalName.endsWith('.svg') ? d.originalName : d.originalName + '.svg';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        this.toast.show('ok', 'Descarga iniciada', a.download);
      },
      error: () => this.toast.show('err', 'No se pudo abrir el archivo')
    });
  }

  remove(item: HistoryItem, ev: Event): void {
    ev.stopPropagation();
    this.api.deleteHistory(item.id).subscribe({
      next: () => {
        this.items.update((list) => list.filter((i) => i.id !== item.id));
        this.toast.show('info', 'Eliminado de tu biblioteca');
      },
      error: () => this.toast.show('err', 'No se pudo eliminar')
    });
  }

  /* ---------- Carpetas del equipo ---------- */

  enterFolder(folder: TeamFolderInfo): void {
    this.openFolder.set(folder);
    this.folderLoading.set(true);
    this.api.teamLibrary(folder.id).subscribe({
      next: (items) => {
        this.folderItems.set(items);
        this.folderLoading.set(false);
      },
      error: (err) => {
        this.folderLoading.set(false);
        this.toast.show('err', 'No se pudo abrir la carpeta', err?.error?.error ?? '');
        this.openFolder.set(null);
      }
    });
  }

  backToFolders(): void {
    this.openFolder.set(null);
    this.folderItems.set([]);
    this.refreshFolders();
  }

  private refreshFolders(): void {
    this.api.teamFolders().subscribe({
      next: (data) => this.team.set(data),
      error: () => undefined
    });
  }

  createFolder(): void {
    const name = this.newFolderName.trim();
    if (!name) {
      this.creatingFolder.set(false);
      return;
    }
    this.api.createTeamFolder(name).subscribe({
      next: ({ folder }) => {
        this.team.update((t) => (t ? { ...t, folders: [...t.folders, folder] } : t));
        this.newFolderName = '';
        this.creatingFolder.set(false);
        this.toast.show('ok', 'Carpeta creada', `"${folder.name}" ya está disponible para el equipo.`);
      },
      error: (err) => this.toast.show('err', 'No se pudo crear', err?.error?.error ?? '')
    });
  }

  deleteFolder(folder: TeamFolderInfo, ev: Event): void {
    ev.stopPropagation();
    this.api.deleteTeamFolder(folder.id).subscribe({
      next: () => {
        this.refreshFolders();
        this.toast.show('info', 'Carpeta eliminada', 'Sus archivos pasaron a "General".');
      },
      error: (err) => this.toast.show('err', 'No se pudo eliminar', err?.error?.error ?? '')
    });
  }

  removeTeamItem(item: TeamLibraryItem, ev: Event): void {
    ev.stopPropagation();
    this.api.deleteTeamItem(item.id).subscribe({
      next: () => {
        this.folderItems.update((list) => list.filter((i) => i.id !== item.id));
        this.toast.show('info', 'Eliminado de la carpeta');
      },
      error: (err) => this.toast.show('err', 'No se pudo eliminar', err?.error?.error ?? '')
    });
  }

  canManageFolders(): boolean {
    const t = this.team();
    return t !== null && (t.isOwner || t.role === 'admin');
  }

  goConvert(): void {
    this.router.navigateByUrl('/');
  }
}
