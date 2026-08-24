/**
 * login.component.ts — Login form
 * Submits email + password → stores JWT → redirects to role-based dashboard.
 */
import { Component, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  form = { email: '', password: '' };

  submitting = signal(false);
  errorMsg = signal('');

  submit(): void {
    this.errorMsg.set('');

    if (!this.form.email || !this.form.password) {
      this.errorMsg.set('Email and password are required');
      return;
    }

    this.submitting.set(true);

    this.auth.login(this.form.email, this.form.password).subscribe({
      next: (res) => {
        this.submitting.set(false);
        if (res.success) {
          this.auth.handleAuthSuccess(res);
          const dest = res.user?.role === 'provider' ? '/dashboard/provider' : '/dashboard/client';
          this.router.navigate([dest]);
        } else {
          this.errorMsg.set(res.error ?? 'Login failed');
        }
      },
      error: (err) => {
        this.submitting.set(false);
        this.errorMsg.set(err?.error?.error ?? err.message ?? 'Network error');
      },
    });
  }

  goToRegister(): void {
    this.router.navigate(['/register']);
  }
}
