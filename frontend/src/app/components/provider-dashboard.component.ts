/**
 * provider-dashboard.component.ts — Provider/Business Owner dashboard
 * Shows:
 *   - Business info card
 *   - Incoming bookings list with confirm/cancel actions
 *   - Stats summary
 */
import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthService, User } from '../services/auth.service';
import { environment } from '../../environments/environment';

interface Booking {
  id: number;
  client_id: number;
  station_name: string;
  date: string;
  time: string;
  target_phone: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: string;
}

@Component({
  selector: 'app-provider-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './provider-dashboard.component.html',
  styleUrl: './provider-dashboard.component.css',
})
export class ProviderDashboardComponent implements OnInit {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private router = inject(Router);
  private apiBase = environment.apiBase;

  user = this.auth.currentUser;
  bookings = signal<Booking[]>([]);
  loading = signal(true);
  actionLoading = signal<number | null>(null); // booking id being acted on

  // Stats
  get pendingCount() { return this.bookings().filter(b => b.status === 'pending').length; }
  get confirmedCount() { return this.bookings().filter(b => b.status === 'confirmed').length; }
  get totalCount() { return this.bookings().length; }

  ngOnInit(): void {
    this.loadBookings();
  }

  loadBookings(): void {
    this.loading.set(true);
    this.http.get<{ success: boolean; bookings: Booking[] }>(`${this.apiBase}/ev-bookings/my`).subscribe({
      next: (res) => {
        this.bookings.set(res.bookings ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  updateStatus(bookingId: number, status: 'confirmed' | 'cancelled'): void {
    this.actionLoading.set(bookingId);
    this.http.put<{ success: boolean }>(`${this.apiBase}/ev-bookings/${bookingId}/status`, { status }).subscribe({
      next: () => {
        this.actionLoading.set(null);
        // Update local state
        this.bookings.update(list =>
          list.map(b => b.id === bookingId ? { ...b, status } : b)
        );
      },
      error: () => {
        this.actionLoading.set(null);
      },
    });
  }

  getBusinessTypeLabel(type: string | null): string {
    const map: Record<string, string> = {
      hotel: 'Hotel',
      ev_charger: 'EV Charger',
      petrol_station: 'Petrol Station',
      airbnb: 'Airbnb',
    };
    return map[type ?? ''] ?? type ?? '—';
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
