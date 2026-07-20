import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.component').then((m) => m.RegisterComponent)
  },
  {
    path: 'recuperar',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/recover.component').then((m) => m.RecoverComponent)
  },
  {
    path: 'restablecer',
    loadComponent: () => import('./features/auth/reset.component').then((m) => m.ResetComponent)
  },
  {
    path: 'unirse',
    loadComponent: () => import('./features/team/join.component').then((m) => m.JoinComponent)
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/converter/converter.component').then((m) => m.ConverterComponent)
      },
      {
        path: 'biblioteca',
        loadComponent: () =>
          import('./features/library/library.component').then((m) => m.LibraryComponent)
      },
      {
        path: 'planes',
        loadComponent: () =>
          import('./features/plans/plans.component').then((m) => m.PlansComponent)
      },
      {
        path: 'pagos',
        loadComponent: () =>
          import('./features/payments/payments.component').then((m) => m.PaymentsComponent)
      },
      {
        path: 'equipo',
        loadComponent: () =>
          import('./features/team/team.component').then((m) => m.TeamComponent)
      }
    ]
  },
  { path: '**', redirectTo: '' }
];
