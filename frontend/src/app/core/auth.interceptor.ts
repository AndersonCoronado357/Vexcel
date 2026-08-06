import type { HttpInterceptorFn } from '@angular/common/http';

/**
 * La sesión viaja en una cookie httpOnly (no en localStorage ni en cabeceras
 * que maneje el JS). Solo marcamos withCredentials para que la cookie se envíe.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/api')) {
    return next(req.clone({ withCredentials: true }));
  }
  return next(req);
};
