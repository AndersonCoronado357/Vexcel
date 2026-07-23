import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { SelectComponent, type SelectOption } from '../../shared/select.component';
import { ROLE_LABELS, type TeamInfo, type TeamRole } from '../../core/models';

@Component({
  selector: 'vx-team',
  imports: [FormsModule, SelectComponent],
  templateUrl: './team.component.html',
  styleUrl: './team.component.scss'
})
export class TeamComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly team = signal<TeamInfo | null>(null);
  readonly editingName = signal(false);
  readonly roleOptions: SelectOption[] = (['admin', 'editor', 'viewer'] as TeamRole[]).map((r) => ({
    value: r,
    label: ROLE_LABELS[r]
  }));

  nameDraft = '';
  readonly inviteRole = signal<TeamRole>('editor');

  /** Preview del correo a invitar: si existe, su foto/nombre. */
  private _inviteEmail = '';
  readonly lookup = signal<{ exists: boolean; name?: string; avatar?: string } | null>(null);
  private lookupTimer: ReturnType<typeof setTimeout> | null = null;

  get inviteEmail(): string {
    return this._inviteEmail;
  }
  set inviteEmail(value: string) {
    this._inviteEmail = value;
    if (this.lookupTimer) clearTimeout(this.lookupTimer);
    const email = value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.lookup.set(null);
      return;
    }
    this.lookupTimer = setTimeout(() => {
      this.api.lookupUser(email).subscribe({
        next: (r) => this.lookup.set(r),
        error: () => this.lookup.set(null)
      });
    }, 350);
  }

  inviteInitials(): string {
    const src = this.lookup()?.name || this._inviteEmail;
    return src.trim().split(/[\s@.]+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  }

  /** Invitación por enlace/código/QR (tarjeta inline, sin modal). */
  readonly inviteData = signal<{ code: string; url: string; qr: string } | null>(null);
  readonly copied = signal<'link' | 'code' | null>(null);

  readonly seatsPct = computed(() => {
    const t = this.team();
    if (!t || t.seatLimit === null) return 0;
    return Math.min(100, (t.seatsUsed / t.seatLimit) * 100);
  });

  readonly seatsText = computed(() => {
    const t = this.team();
    if (!t) return '';
    return t.seatLimit === null
      ? `${t.seatsUsed} miembros · asientos ilimitados`
      : `${t.seatsUsed} de ${t.seatLimit} asientos usados`;
  });

  readonly seatsFull = computed(() => {
    const t = this.team();
    return t !== null && t.seatLimit !== null && t.seatsUsed >= t.seatLimit;
  });

  ngOnInit(): void {
    this.api.team().subscribe({
      next: ({ team }) => {
        this.team.set(team);
        this.api.teamInvite().subscribe({
          next: (data) => this.inviteData.set(data),
          error: () => undefined
        });
      },
      error: (err) => {
        this.toast.show('err', 'Equipo no disponible', err?.error?.error ?? 'Intenta de nuevo.');
        if (err?.error?.code === 'PLAN') this.router.navigateByUrl('/planes');
      }
    });
  }

  initialsOf(name: string): string {
    return name.trim().split(/\s+/).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
  }

  roleLabel(role: string): string {
    return ROLE_LABELS[role as TeamRole] ?? role;
  }

  startEditName(): void {
    this.nameDraft = this.team()?.name ?? '';
    this.editingName.set(true);
  }

  saveName(): void {
    const name = this.nameDraft.trim();
    this.editingName.set(false);
    if (!name || name === this.team()?.name) return;
    this.api.renameTeam(name).subscribe({
      next: ({ team }) => {
        this.team.set(team);
        this.toast.show('ok', 'Nombre del equipo actualizado');
      },
      error: (err) => this.toast.show('err', 'No se pudo renombrar', err?.error?.error ?? '')
    });
  }

  invite(): void {
    const email = this.inviteEmail.trim();
    if (!email) return;
    this.api.addTeamMember(email, this.inviteRole()).subscribe({
      next: ({ team, detected }) => {
        this.team.set(team);
        this.toast.show(
          'ok',
          detected ? 'Usuario detectado' : 'Invitación enviada',
          detected ? `${detected} ya tiene cuenta: se unió como activo.` : `${email} quedó como invitado.`
        );
        this._inviteEmail = '';
        this.lookup.set(null);
        this.inviteRole.set('editor');
      },
      error: (err) => this.toast.show('err', 'No se pudo invitar', err?.error?.error ?? '')
    });
  }

  copy(kind: 'link' | 'code'): void {
    const d = this.inviteData();
    if (!d) return;
    navigator.clipboard.writeText(kind === 'link' ? d.url : d.code).then(() => {
      this.copied.set(kind);
      setTimeout(() => this.copied.set(null), 1500);
      this.toast.show('ok', kind === 'link' ? 'Enlace copiado' : 'Código copiado', 'Compártelo con quien quieras invitar.');
    });
  }

  changeRole(email: string, role: string): void {
    this.api.setTeamMemberRole(email, role as TeamRole).subscribe({
      next: ({ team }) => {
        this.team.set(team);
        this.toast.show('ok', 'Rol actualizado');
      },
      error: (err) => this.toast.show('err', 'No se pudo cambiar el rol', err?.error?.error ?? '')
    });
  }

  remove(email: string, name: string): void {
    this.api.removeTeamMember(email).subscribe({
      next: ({ team }) => {
        this.team.set(team);
        this.toast.show('info', 'Miembro eliminado', `${name} ya no está en el equipo.`);
      },
      error: (err) => this.toast.show('err', 'No se pudo eliminar', err?.error?.error ?? '')
    });
  }

  goPlans(): void {
    this.router.navigateByUrl('/planes');
  }
}
