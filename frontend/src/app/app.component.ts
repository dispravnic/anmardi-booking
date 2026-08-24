/**
 * app.component.ts — Root shell component
 * Standalone, imports EvMapComponent directly.
 */
import { Component } from '@angular/core';
import { EvMapComponent } from './components/ev-map.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [EvMapComponent],
  templateUrl: './app.component.html',
})
export class AppComponent {}
