/**
 * auth.service.ts — Angular auth service
 * Manages registration, login, JWT token storage, and user state.
 */
import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

export interface User {
  id: number;
  email: string;
  role: 'client' | 'provider';
  first_name: string;
  last_name: string;
  phone_number: string | null;
  business_name: string | null;
  business_type: string | null;
  business_email: string | null;
  created_at: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  role: 'client' | 'provider';
  firstName: string;
  lastName: string;
  phoneNumber?: string;
  businessName?: string;
  businessType?: string;
  businessEmail?: string;
}

export interface AuthResponse {
  success: boolean;
  token?: string;
  user?: User;
  error?: string;
}

const TOKEN_KEY = 'anmardi_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private apiBase = environment.apiBase;

  // ── Signals ───────────────────────────────────────────────────────────────
  currentUser = signal<User | null>(null);
  token = signal<string | null>(null);

  isLoggedIn = computed(() => !!this.token());
  isProvider = computed(() => this.currentUser()?.role === 'provider');
  isClient = computed(() => this.currentUser()?.role === 'client');

  constructor() {
    // Restore token from localStorage on app start
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      this.token.set(saved);
      this.loadCurrentUser();
    }
  }

  // ── Registration ──────────────────────────────────────────────────────────

  register(payload: RegisterPayload) {
    return this.http.post<AuthResponse>(`${this.apiBase}/auth/register`, payload);
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  login(email: string, password: string) {
    return this.http.post<AuthResponse>(`${this.apiBase}/auth/login`, { email, password });
  }

  // ── Handle auth response (store token + user) ─────────────────────────────

  handleAuthSuccess(res: AuthResponse): void {
    if (res.token && res.user) {
      this.token.set(res.token);
      this.currentUser.set(res.user);
      localStorage.setItem(TOKEN_KEY, res.token);
    }
  }

  // ── Load current user from token ──────────────────────────────────────────

  loadCurrentUser(): void {
    this.http.get<{ success: boolean; user: User }>(`${this.apiBase}/auth/me`).subscribe({
      next: (res) => {
        if (res.success) {
          this.currentUser.set(res.user);
        }
      },
      error: () => {
        this.logout();
      },
    });
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  logout(): void {
    this.token.set(null);
    this.currentUser.set(null);
    localStorage.removeItem(TOKEN_KEY);
  }

  // ── Get auth header for HTTP calls ────────────────────────────────────────

  getAuthHeaders(): { Authorization: string } | {} {
    const t = this.token();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
}
