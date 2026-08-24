/**
 * register.component.ts — Registration form with Client/Provider toggle
 * When Provider is selected, dynamic fields appear:
 *   businessName, businessType (hotel, ev_charger, petrol_station, airbnb),
 *   phoneNumber (required), businessEmail (optional)
 */
import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, RegisterPayload } from '../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './register.component.html',
  styleUrl: './register.component.css',
})
export class RegisterComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  // ── Form model ────────────────────────────────────────────────────────────
  form = {
    email: '',
    password: '',
    confirmPassword: '',
    role: 'client' as 'client' | 'provider',
    firstName: '',
    lastName: '',
    phoneNumber: '',
    businessName: '',
    businessType: '' as '' | 'hotel' | 'ev_charger' | 'petrol_station' | 'airbnb',
    businessEmail: '',
  };

  // ── State ─────────────────────────────────────────────────────────────────
  submitting = signal(false);
  errorMsg = signal('');
  successMsg = signal('');

  readonly businessTypes = [
    { value: 'hotel', label: 'Hotel' },
    { value: 'ev_charger', label: 'EV Charger' },
    { value: 'petrol_station', label: 'Petrol Station' },
    { value: 'airbnb', label: 'Airbnb' },
  ];

  get isProvider(): boolean {
    return this.form.role === 'provider';
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  submit(): void {
    this.errorMsg.set('');
    this.successMsg.set('');

    // Client-side validation
    if (this.form.password !== this.form.confirmPassword) {
      this.errorMsg.set('Passwords do not match');
      return;
    }

    if (this.form.password.length < 6) {
      this.errorMsg.set('Password must be at least 6 characters');
      return;
    }

    if (this.isProvider && !this.form.businessName) {
      this.errorMsg.set('Business name is required for providers');
      return;
    }

    if (this.isProvider && !this.form.businessType) {
      this.errorMsg.set('Business category is required for providers');
      return;
    }

    if (this.isProvider && !this.form.phoneNumber) {
      this.errorMsg.set('Phone number is required for providers (SMS notifications)');
      return;
    }

    this.submitting.set(true);

    const payload: RegisterPayload = {
      email: this.form.email,
      password: this.form.password,
      role: this.form.role,
      firstName: this.form.firstName,
      lastName: this.form.lastName,
      phoneNumber: this.form.phoneNumber || undefined,
      businessName: this.isProvider ? this.form.businessName : undefined,
      businessType: this.isProvider ? this.form.businessType || undefined : undefined,
      businessEmail: this.isProvider ? this.form.businessEmail || undefined : undefined,
    };

    this.auth.register(payload).subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res.success) {
          this.auth.handleAuthSuccess(res);
          this.successMsg.set('Registration successful! Redirecting…');
          setTimeout(() => {
            const dest = this.form.role === 'provider' ? '/dashboard/provider' : '/dashboard/client';
            this.router.navigate([dest]);
          }, 1000);
        } else {
          this.errorMsg.set(res.error ?? 'Registration failed');
        }
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMsg.set(err?.error?.error ?? err.message ?? 'Network error');
      },
    });
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
