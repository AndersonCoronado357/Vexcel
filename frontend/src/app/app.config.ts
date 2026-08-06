import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners
} from '@angular/core';
import { provideRouter, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeEs from '@angular/common/locales/es';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';
import { AuthService } from './core/auth.service';

registerLocaleData(localeEs);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // Rehidrata la sesión (cookie httpOnly) ANTES de activar el router, para que
    // los guards ya conozcan al usuario al recargar en una ruta protegida.
    provideAppInitializer(() => inject(AuthService).loadSession()),
    // View Transitions: las rutas cruzan con animación (login <-> registro
    // hace morph del panel violeta y el formulario).
    provideRouter(routes, withViewTransitions({ skipInitialTransition: true })),
    { provide: LOCALE_ID, useValue: 'es' }
  ]
};
