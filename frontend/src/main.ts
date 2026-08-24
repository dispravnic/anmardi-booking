/**
 * main.ts — Angular 20 standalone bootstrap
 */
import 'tslib';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient }    from '@angular/common/http';
import { AppComponent }         from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
  ],
}).catch((err) => console.error('Bootstrap error:', err));
