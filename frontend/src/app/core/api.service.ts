import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type {
  ApiStatus,
  HistoryDetail,
  HistoryItem,
  PaymentRecord,
  Plan,
  TeamFolderInfo,
  TeamFoldersResponse,
  TeamInfo,
  TeamLibraryItem,
  TeamRole,
  TraceSettings,
  User,
  VectorizeResponse
} from './models';
import { toTracerParams } from './models';

export interface AuthResponse {
  user: User;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  status(): Observable<ApiStatus> {
    return this.http.get<ApiStatus>(`${this.base}/status`);
  }

  register(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/auth/register`, { name, email, password });
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/auth/login`, { email, password });
  }

  recover(email: string): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/auth/recover`, { email });
  }

  resetPassword(email: string, token: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.base}/auth/reset`, { email, token, password });
  }

  me(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${this.base}/auth/me`);
  }

  /** Estado de sesión al arrancar (lee la cookie httpOnly); user o null. */
  session(): Observable<{ user: User | null }> {
    return this.http.get<{ user: User | null }>(`${this.base}/auth/session`);
  }

  /** Cierra sesión: el backend borra la cookie httpOnly. */
  logout(): Observable<{ ok: boolean }> {
    return this.http.post<{ ok: boolean }>(`${this.base}/auth/logout`, {});
  }

  setPlan(plan: Plan): Observable<{ user: User }> {
    return this.http.put<{ user: User }>(`${this.base}/me/plan`, { plan });
  }

  authProviders(): Observable<{ google: boolean }> {
    return this.http.get<{ google: boolean }>(`${this.base}/auth/providers`);
  }

  payStatus(): Observable<{ enabled: boolean; env: string }> {
    return this.http.get<{ enabled: boolean; env: string }>(`${this.base}/pay/status`);
  }

  checkout(plan: Plan): Observable<{
    publicKey: string;
    currency: string;
    amountInCents: number;
    reference: string;
    signature: string;
    redirectUrl: string;
    checkoutUrl: string;
    customerEmail: string;
  }> {
    return this.http.post<{
      publicKey: string;
      currency: string;
      amountInCents: number;
      reference: string;
      signature: string;
      redirectUrl: string;
      checkoutUrl: string;
      customerEmail: string;
    }>(`${this.base}/pay/checkout`, { plan });
  }

  verifyPayment(id: string): Observable<{ status: string; activated: boolean; user: User | null }> {
    return this.http.get<{ status: string; activated: boolean; user: User | null }>(
      `${this.base}/pay/verify?id=${encodeURIComponent(id)}`
    );
  }

  cancelSubscription(): Observable<{ ok: boolean; plan: Plan; planUntil: string | null; autoRenew: boolean }> {
    return this.http.post<{ ok: boolean; plan: Plan; planUntil: string | null; autoRenew: boolean }>(
      `${this.base}/pay/cancel`,
      {}
    );
  }

  subscription(): Observable<{ plan: Plan; planUntil: string | null; autoRenew: boolean }> {
    return this.http.get<{ plan: Plan; planUntil: string | null; autoRenew: boolean }>(
      `${this.base}/pay/subscription`
    );
  }

  paymentHistory(): Observable<{ payments: PaymentRecord[] }> {
    return this.http.get<{ payments: PaymentRecord[] }>(`${this.base}/pay/history`);
  }

  usage(): Observable<{ used: number; limit: number | null }> {
    return this.http.get<{ used: number; limit: number | null }>(`${this.base}/me/usage`);
  }

  setAvatar(image: string): Observable<{ user: User }> {
    return this.http.put<{ user: User }>(`${this.base}/me/avatar`, { image });
  }

  /** Guarda la preferencia de tema en el servidor (no en el navegador). */
  saveTheme(theme: 'light' | 'dark'): Observable<{ ok: boolean }> {
    return this.http.put<{ ok: boolean }>(`${this.base}/me/theme`, { theme });
  }

  /** Busca un usuario por correo (preview al invitar). */
  lookupUser(email: string): Observable<{ exists: boolean; name?: string; avatar?: string }> {
    return this.http.get<{ exists: boolean; name?: string; avatar?: string }>(
      `${this.base}/me/lookup?email=${encodeURIComponent(email)}`
    );
  }

  /** Autoriza (y en Free cuenta) una descarga PNG según su calidad. */
  registerDownload(quality: string): Observable<{ ok: boolean; usage: { used: number; limit: number | null } }> {
    return this.http.post<{ ok: boolean; usage: { used: number; limit: number | null } }>(
      `${this.base}/me/download`,
      { quality }
    );
  }

  team(): Observable<{ team: TeamInfo }> {
    return this.http.get<{ team: TeamInfo }>(`${this.base}/team`);
  }

  renameTeam(name: string): Observable<{ team: TeamInfo }> {
    return this.http.put<{ team: TeamInfo }>(`${this.base}/team`, { name });
  }

  addTeamMember(email: string, role: TeamRole): Observable<{ team: TeamInfo; detected: string | null }> {
    return this.http.post<{ team: TeamInfo; detected: string | null }>(`${this.base}/team/members`, {
      email,
      role
    });
  }

  teamInvite(): Observable<{ code: string; url: string; qr: string }> {
    return this.http.get<{ code: string; url: string; qr: string }>(
      `${this.base}/team/invite?origin=${encodeURIComponent(location.origin)}`
    );
  }

  joinTeam(code: string): Observable<{ ok: boolean; teamName: string }> {
    return this.http.post<{ ok: boolean; teamName: string }>(`${this.base}/team/join`, { code });
  }

  setTeamMemberRole(email: string, role: TeamRole): Observable<{ team: TeamInfo }> {
    return this.http.put<{ team: TeamInfo }>(
      `${this.base}/team/members/${encodeURIComponent(email)}`,
      { role }
    );
  }

  removeTeamMember(email: string): Observable<{ team: TeamInfo }> {
    return this.http.delete<{ team: TeamInfo }>(
      `${this.base}/team/members/${encodeURIComponent(email)}`
    );
  }

  vectorize(file: File, s: TraceSettings, countUsage: boolean): Observable<VectorizeResponse> {
    const form = new FormData();
    form.append('image', file, file.name);
    form.append('countUsage', String(countUsage));
    const params = toTracerParams(s);
    for (const [k, v] of Object.entries(params)) {
      if (v !== '') form.append(k, v);
    }
    return this.http.post<VectorizeResponse>(`${this.base}/vectorize`, form);
  }

  saveToLibrary(body: {
    originalName: string;
    mode: 'mono' | 'color';
    params: Record<string, unknown>;
    svg: string;
    width: number;
    height: number;
    originalBytes: number;
    preview: string;
    teamId?: string;
    folderId?: string;
  }): Observable<{ id: string }> {
    return this.http.post<{ id: string }>(`${this.base}/history`, body);
  }

  teamFolders(): Observable<TeamFoldersResponse> {
    return this.http.get<TeamFoldersResponse>(`${this.base}/team/folders`);
  }

  createTeamFolder(name: string): Observable<{ folder: TeamFolderInfo }> {
    return this.http.post<{ folder: TeamFolderInfo }>(`${this.base}/team/folders`, { name });
  }

  deleteTeamFolder(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/team/folders/${id}`);
  }

  teamLibrary(folderId: string): Observable<TeamLibraryItem[]> {
    return this.http.get<TeamLibraryItem[]>(`${this.base}/team/library?folder=${folderId}`);
  }

  deleteTeamItem(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/team/library/${id}`);
  }

  history(): Observable<HistoryItem[]> {
    return this.http.get<HistoryItem[]>(`${this.base}/history`);
  }

  historyDetail(id: string): Observable<HistoryDetail> {
    return this.http.get<HistoryDetail>(`${this.base}/history/${id}`);
  }

  deleteHistory(id: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.base}/history/${id}`);
  }
}
