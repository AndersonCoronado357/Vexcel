import type { HttpInterceptorFn } from '@angular/common/http';

/**
 * Lee el token directo de localStorage (no inyecta AuthService: su constructor
 * dispara /auth/me y eso crearía una dependencia circular con el interceptor).
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = localStorage.getItem('vexcel_token');
  if (token && req.url.startsWith('/api')) {
    return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
  }
  return next(req);
};
