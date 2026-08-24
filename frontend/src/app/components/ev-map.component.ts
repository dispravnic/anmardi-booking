/**
 * ev-map.component.ts
 * Angular 20 standalone component — Signals + inject() + Google Maps
 * Template and styles are in external files (templateUrl / styleUrl).
 */
import {
  Component,
  OnInit,
  AfterViewInit,
  ViewChild,
  ElementRef,
  signal,
  inject,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { HttpClient }   from '@angular/common/http';
import { environment }  from '../../environments/environment';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvStation {
  id: number;
  name: string;
  address: string;
  lat: number;
  lng: number;
  connectors: number;
  powerKw: number;
}

export interface BookingForm {
  date: string;
  time: string;
  targetPhone: string;
  simSlot: number;
}

export interface ConsoleEntry {
  ts: string;
  label: string;
  kind: 'request' | 'response' | 'error' | 'info';
  payload: unknown;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BUCHAREST_CENTER = { lat: 44.4323, lng: 26.1063 };
const API_BASE = environment.apiBase;

/** Fallback seed — displayed immediately before GET /api/ev-stations resolves */
const STATION_SEED: EvStation[] = [
  { id: 1, name: 'iHunt EV Charging Station',
    address: 'Str. Biharia 67-77, București', lat: 44.4268, lng: 26.1025, connectors: 2, powerKw: 22 },
  { id: 2, name: 'Stație de încărcare E.ON Drive Public ParkLake',
    address: 'ParkLake Shopping Center, București', lat: 44.4391, lng: 26.1317, connectors: 4, powerKw: 50 },
  { id: 3, name: 'Renovatio e-charge',
    address: 'Calea Floreasca 169, București', lat: 44.4502, lng: 26.0856, connectors: 3, powerKw: 22 },
  { id: 4, name: 'Plugpoint Charging Station',
    address: 'Bd. Unirii 22, București', lat: 44.4189, lng: 26.0963, connectors: 2, powerKw: 11 },
];

// ── Component ─────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-ev-map',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ev-map.component.html',
  styleUrl: './ev-map.component.css',
})
export class EvMapComponent implements OnInit, AfterViewInit {
  @ViewChild('mapCanvas', { static: true })
  mapCanvasRef!: ElementRef<HTMLDivElement>;

  @ViewChild('consoleEl')
  consoleElRef?: ElementRef<HTMLDivElement>;

  private http = inject(HttpClient);
  private cdr  = inject(ChangeDetectorRef);

  // ── Signals ───────────────────────────────────────────────────────────────
  stations        = signal<EvStation[]>(STATION_SEED);
  selectedStation = signal<EvStation | null>(null);
  simAssignments  = signal<Record<string, { assignedTo: string | null; lastUsed: string | null }>>({});
  submitting      = signal(false);
  calling         = signal(false);
  consoleLog      = signal<ConsoleEntry[]>([]);
  mapError        = signal('');

  // ── Statics ───────────────────────────────────────────────────────────────
  readonly simSlots = Array.from({ length: 16 }, (_, i) => i + 1);
  readonly today    = new Date().toISOString().split('T')[0];

  // ── Form model ────────────────────────────────────────────────────────────
  form: BookingForm = { date: '', time: '', targetPhone: '', simSlot: 1 };

  // ── Google Map ────────────────────────────────────────────────────────────
  private map: google.maps.Map | null = null;
  private markerElements: any[] = [];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadStations();
    this.loadSims();
  }

  ngAfterViewInit(): void {
    this.initMap();
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  private loadStations(): void {
    this.log('info', 'GET /api/ev-stations', { url: `${API_BASE}/ev-stations` });
    this.http.get<{ stations: EvStation[] }>(`${API_BASE}/ev-stations`).subscribe({
      next: (res) => {
        this.stations.set(res.stations);
        this.log('response', 'GET /api/ev-stations', res);
        this.placeMarkers();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.log('error', 'GET /api/ev-stations FAILED', { error: err.message });
      },
    });
  }

  private loadSims(): void {
    this.http
      .get<{ simSlots: Record<string, { assignedTo: string | null; lastUsed: string | null }> }>(
        `${API_BASE}/sims`,
      )
      .subscribe({
        next: (res) => {
          this.simAssignments.set(res.simSlots);
          this.log('response', 'GET /api/sims', res.simSlots);
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.log('error', 'GET /api/sims FAILED', { error: err.message });
        },
      });
  }

  // ── Map ───────────────────────────────────────────────────────────────────

  private initMap(): void {
    // If the Maps API is already loaded (fast connection), init immediately.
    // Otherwise register a callback that fires once the script calls initGoogleMaps().
    if (typeof google !== 'undefined' && google?.maps) {
      this.buildMap();
    } else {
      (window as any)['onGoogleMapsReady'] = () => {
        this.buildMap();
      };
    }
  }

  private buildMap(): void {
    // Use a simple map options object — no mapId required for standard markers
    this.map = new google.maps.Map(this.mapCanvasRef.nativeElement, {
      center: BUCHAREST_CENTER,
      zoom: 13,
      disableDefaultUI: false,
      backgroundColor: '#0d1117',
      styles: [
        { elementType: 'geometry',           stylers: [{ color: '#0d1117' }] },
        { elementType: 'labels.text.stroke', stylers: [{ color: '#161b22' }] },
        { elementType: 'labels.text.fill',   stylers: [{ color: '#8b949e' }] },
        { featureType: 'road', elementType: 'geometry',
          stylers: [{ color: '#21262d' }] },
        { featureType: 'road', elementType: 'geometry.stroke',
          stylers: [{ color: '#161b22' }] },
        { featureType: 'road', elementType: 'labels.text.fill',
          stylers: [{ color: '#58a6ff' }] },
        { featureType: 'water', elementType: 'geometry',
          stylers: [{ color: '#0d1117' }] },
        { featureType: 'poi',     stylers: [{ visibility: 'off' }] },
        { featureType: 'transit', stylers: [{ visibility: 'off' }] },
      ],
    });

    this.log('info', 'Google Map initialised', { center: BUCHAREST_CENTER, zoom: 13 });
    this.cdr.markForCheck();
    this.placeMarkers();
  }

  private placeMarkers(): void {
    if (!this.map) return;

    // Clear existing markers
    this.markerElements.forEach((m) => (m.map = null));
    this.markerElements = [];

    for (const station of this.stations()) {
      // Use legacy Marker — works without a Cloud Map ID
      const marker = new google.maps.Marker({
        map: this.map,
        position: { lat: station.lat, lng: station.lng },
        title: station.name,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#2ecc71',
          fillOpacity: 1,
          strokeColor: '#0d1117',
          strokeWeight: 2,
          scale: 10,
        },
        label: {
          text: '⚡',
          fontSize: '12px',
        },
      });

      marker.addListener('click', () => this.selectStation(station));
      // Cast to any so the array type stays compatible
      this.markerElements.push(marker as any);
    }
  }

  // ── Station selection ─────────────────────────────────────────────────────

  selectStation(station: EvStation): void {
    this.selectedStation.set(station);
    this.map?.panTo({ lat: station.lat, lng: station.lng });
    this.log('info', 'Station selected', { id: station.id, name: station.name });
    this.cdr.markForCheck();
  }

  // ── Submit booking ────────────────────────────────────────────────────────

  submitBooking(): void {
    if (this.submitting()) return;
    const station = this.selectedStation();
    if (!station) return;

    this.submitting.set(true);

    const payload = {
      stationName: station.name,
      date:        this.form.date,
      time:        this.form.time,
      targetPhone: this.form.targetPhone,
      simSlot:     Number(this.form.simSlot),
    };

    this.log('request', 'POST /api/ev-bookings/create', payload);

    this.http.post<unknown>(`${API_BASE}/ev-bookings/create`, payload).subscribe({
      next: (res) => {
        this.submitting.set(false);
        this.log('response', 'POST /api/ev-bookings/create', res);
        this.loadSims(); // refresh SIM assignment display
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.submitting.set(false);
        this.log('error', 'POST /api/ev-bookings/create FAILED',
          { status: err.status, error: err.error ?? err.message });
        this.cdr.markForCheck();
      },
    });
  }

  // ── Trigger call ──────────────────────────────────────────────────────────

  triggerCall(): void {
    if (this.calling() || !this.form.targetPhone) return;

    this.calling.set(true);

    const payload = {
      targetPhone: this.form.targetPhone,
      simSlot:     Number(this.form.simSlot),
    };

    this.log('request', 'POST /api/telecom/trigger-call', payload);

    this.http.post<unknown>(`${API_BASE}/telecom/trigger-call`, payload).subscribe({
      next: (res) => {
        this.calling.set(false);
        this.log('response', 'POST /api/telecom/trigger-call', res);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.calling.set(false);
        this.log('error', 'POST /api/telecom/trigger-call FAILED',
          { status: err.status, error: err.error ?? err.message });
        this.cdr.markForCheck();
      },
    });
  }

  // ── Console helpers ───────────────────────────────────────────────────────

  private log(kind: ConsoleEntry['kind'], label: string, payload: unknown): void {
    const entry: ConsoleEntry = {
      ts: new Date().toLocaleTimeString('en-GB', {
        hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
      }),
      label,
      kind,
      payload,
    };
    this.consoleLog.update((prev) => [entry, ...prev]); // newest first
    this.cdr.markForCheck();
  }

  clearConsole(): void {
    this.consoleLog.set([]);
  }
}
