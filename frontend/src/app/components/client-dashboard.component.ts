/**
 * client-dashboard.component.ts — Client/End-User dashboard
 * Shows:
 *   - Browse providers by category filter
 *   - Quick-book EV stations (existing map flow)
 *   - Booking history with status tracking
 */
import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { environment } from '../../environments/environment';

interface Provider {
  id: number;
  first_name: string;
  last_name: string;
  business_name: string;
  business_type: string;
  phone_number: string;
  business_email: string | null;
}

interface Booking {
  id: number;
  station_name: string;
  date: string;
  time: string;
  target_phone: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  sms_client_status: string;
  created_at: string;
}

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-dashboard.component.html',
  styleUrl: './client-dashboard.component.css',
})
export class ClientDashboardComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);
  private apiBase = environment.apiBase;

  user = this.auth.currentUser;

  // ── State ─────────────────────────────────────────────────────────────────
  providers = signal<Provider[]>([]);
  bookings = signal<Booking[]>([]);
  loadingProviders = signal(true);
  loadingBookings = signal(true);

  // Category filter
  selectedCategory = '';
  readonly categories = [
    { value: '', label: 'All Categories' },
    { value: 'hotel', label: 'Hotel' },
    { value: 'ev_charger', label: 'EV Charger' },
    { value: 'petrol_station', label: 'Petrol Station' },
    { value: 'airbnb', label: 'Airbnb' },
  ];

  // ── Active tab ────────────────────────────────────────────────────────────
  activeTab = signal<'browse' | 'bookings'>('browse');

  ngOnInit(): void {
    this.loadProviders();
    this.loadBookings();
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  loadProviders(): void {
    this.loadingProviders.set(true);
    const url = this.selectedCategory
      ? `${this.apiBase}/providers?type=${this.selectedCategory}`
      : `${this.apiBase}/providers`;

    this.http.get<{ success: boolean; providers: Provider[] }>(url).subscribe({
      next: (res) => {
        this.providers.set(res.providers ?? []);
        this.loadingProviders.set(false);
      },
      error: () => this.loadingProviders.set(false),
    });
  }

  loadBookings(): void {
    this.loadingBookings.set(true);
    this.http.get<{ success: boolean; bookings: Booking[] }>(`${this.apiBase}/ev-bookings/my`).subscribe({
      next: (res) => {
        this.bookings.set(res.bookings ?? []);
        this.loadingBookings.set(false);
      },
      error: () => this.loadingBookings.set(false),
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  onCategoryChange(): void {
    this.loadProviders();
  }

  goToMap(): void {
    this.router.navigate(['/map']);
  }

  getCategoryLabel(type: string): string {
    const map: Record<string, string> = {
      hotel: '🏨 Hotel',
      ev_charger: '⚡ EV Charger',
      petrol_station: '⛽ Petrol Station',
      airbnb: '🏠 Airbnb',
    };
    return map[type] ?? type;
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
