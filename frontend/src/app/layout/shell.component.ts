import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { ViewportService } from '../core/viewport.service';
import { ThemeService } from '../core/theme.service';
import { ConverterStateService } from '../features/converter/converter-state.service';
import { MarkComponent } from '../shared/mark.component';
import { isTeamPlan } from '../core/models';

@Component({
  selector: 'vx-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MarkComponent],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss'
})
export class ShellComponent {
  readonly auth = inject(AuthService);
  readonly vp = inject(ViewportService);
  readonly theme = inject(ThemeService);
  readonly converter = inject(ConverterStateService);
  private readonly router = inject(Router);

  readonly menuOpen = signal(false);
  readonly hasTeam = computed(() => isTeamPlan(this.auth.user()?.plan));

  @HostListener('document:click')
  closeMenu(): void {
    if (this.menuOpen()) this.menuOpen.set(false);
  }

  toggleMenu(ev: Event): void {
    ev.stopPropagation();
    this.menuOpen.update((v) => !v);
  }

  newImage(): void {
    this.converter.reset();
    this.router.navigateByUrl('/');
  }

  logout(): void {
    this.converter.reset();
    this.auth.logout();
  }
}
