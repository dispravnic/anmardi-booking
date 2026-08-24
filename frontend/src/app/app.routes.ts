/**
 * app.routes.ts — Angular router configuration with role-based guards
 */
import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './services/auth.service';

// ── Guards ────────────────────────────────────────────────────────────────────

/** Redirect to /login if not authenticated */
const authGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn()) return true;
  router.navigate(['/login']);
  return false;
};

/** Redirect to /login if not a provider */
const providerGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn() && auth.currentUser()?.role === 'provider') return true;
  router.navigate(['/login']);
  return false;
};

/** Redirect to /login if not a client */
const clientGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn() && auth.currentUser()?.role === 'client') return true;
  router.navigate(['/login']);
  return false;
};

/** Redirect authenticated users away from auth pages */
const guestGuard = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn()) return true;
  const dest = auth.currentUser()?.role === 'provider' ? '/dashboard/provider' : '/dashboard/client';
  router.navigate([dest]);
  return false;
};

// ── Routes ────────────────────────────────────────────────────────────────────

export const routes: Routes = [
  // Auth pages (guest only)
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./components/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./components/register.component').then(m => m.RegisterComponent),
  },

  // Dashboards (role-guarded)
  {
    path: 'dashboard/provider',
    canActivate: [providerGuard],
    loadComponent: () => import('./components/provider-dashboard.component').then(m => m.ProviderDashboardComponent),
  },
  {
    path: 'dashboard/client',
    canActivate: [clientGuard],
    loadComponent: () => import('./components/client-dashboard.component').then(m => m.ClientDashboardComponent),
  },

  // EV Map (authenticated — any role)
  {
    path: 'map',
    canActivate: [authGuard],
    loadComponent: () => import('./components/ev-map.component').then(m => m.EvMapComponent),
  },

  // Default redirect
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: '**', redirectTo: 'login' },
];
