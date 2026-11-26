# Forge – Workout, Ernährung & Gesundheit

Installierbare Fitness-PWA (React, TypeScript, Tailwind CSS, IndexedDB/Dexie, Recharts): Training mit Timern,
Ernährungstagebuch mit Barcode-Scanner, Aktivität (Schritte, Bewegung, Energie) und Körpergewicht.
Alle Daten bleiben lokal auf dem Gerät; Training und Tagebuch funktionieren offline.

## Starten

```bash
npm install
npm run dev        # Entwicklung: http://localhost:5173
npm run build      # Produktions-Build inkl. Service Worker → dist/
npm run preview    # Build lokal ausliefern (PWA/Offline testbar)
npm test           # Unit- & Integrationstests (Vitest + fake-indexeddb)
node tests/e2e/smoke.mjs http://localhost:4173            # E2E Training (Playwright, gegen preview)
node tests/e2e/health-nutrition.mjs http://localhost:4173 # E2E Aktivität, Körper & Ernährung
```

Zum Installieren auf dem Handy muss die App über **HTTPS** ausgeliefert werden (z. B. Netlify, Vercel, Cloudflare Pages – `dist/` als statische Seite, alle Pfade auf `index.html` umleiten).
Android/Chrome: „App installieren“. iOS/Safari: Teilen → „Zum Home-Bildschirm“.

## Architektur

```
src/
  db/            Datenmodell (types.ts), Dexie-Schema, Seed (20 Übungen + 3 Startpläne)
    repo/        Datenzugriff: workouts, exercises, plans, records, timers, settings, backup
  lib/           Reine Logik: Timer (time.ts), Volumen/1RM/Rekorde (metrics.ts), Statistik, Einheiten
  hooks/         Live-Queries (useLiveQuery) & useNow-Ticker
  components/    UI-Bausteine, Layout (Navigation, Mini-Player, globale Watcher), Workout-Komponenten, Charts
  pages/         Dashboard, Training, Pläne, Plan-Editor, Übungen, Übungsdetail, Verlauf, Workout-Detail,
                 Statistik, Bestleistungen, Einstellungen
```

- **Timer** basieren ausschließlich auf Zeitstempeln (`startedAt`, `pausedAt`, `pausedMs`, `endsAt`) und werden aus IndexedDB rekonstruiert – korrekt nach Reload, Navigation und Hintergrund-Pausen des Betriebssystems.
- **Getrennte Tabellen**: Übungen, Übungsnotizen (dauerhaft), Pläne, Workouts (mit Workout-Notiz), Workout-Übungen (mit Einmal-Notiz und Übungs-Snapshot), Sätze, Bestleistungen (Zeitleiste), Timer, Einstellungen.
- **Historie ist unveränderlich gegenüber Plänen**: Pläne liefern nur Struktur; Vorwerte werden als Vorschlag angezeigt und nie in alte Daten geschrieben. Gelöschte Übungen sind Soft-Deletes; Workouts behalten einen Snapshot.
- **Bestleistungen** werden aus dem Verlauf deterministisch neu berechnet (auch nach Löschen/Import). Gewicht, Wiederholungen (nur gegen gleiches/höheres Gewicht), 1RM (Epley, nur 1–12 Wdh, als Schätzwert gekennzeichnet), Übungsvolumen, Haltezeit, Workout-Volumen. Aufwärmsätze zählen nicht. Die allererste Einheit einer Übung gilt als Ausgangswert, nicht als Rekord.
- **Volumen** = Gewicht × Wiederholungen nur für abgeschlossene Sätze; Körpergewichts- und Halteübungen erzeugen keine erfundenen Kilogramm.
- **Sync-fähig**: UUIDs und `updatedAt` an allen Datensätzen; JSON-Export/-Import als Backup.

## Bekannte Plattform-Einschränkungen

- **iOS**: Im Hintergrund pausiert Safari JavaScript. Timer zählen trotzdem richtig weiter (Zeitstempel), aber das Pausenende-Signal (Ton) kommt erst, wenn die App wieder im Vordergrund ist. System-Benachrichtigungen gibt es auf iOS nur bei installierter App (ab iOS 16.4), und auch dort nicht zeitgesteuert ohne Server-Push.
- **Vibration** wird von iOS-Browsern nicht unterstützt.
- **Bildschirm aktiv halten** nutzt die Wake-Lock-API (aktuelle Chrome- und Safari-Versionen).
- Die Oberfläche ist auf Deutsch; Übungsnamen lassen sich auf Englisch umschalten. Eine vollständige englische UI ist nicht enthalten.
- Eine Cloud-Synchronisierung ist nicht eingebaut (das Datenmodell ist dafür vorbereitet).

## Aktivität & Körper: Datenquellen

Übernommen werden Schritte, Distanz, Etagen, aktive Minuten, Aktivitäts-/Ruhe-/Gesamtenergie, Gewicht und Körperfett.
Schlaf- und Vitalwerte (Ruhepuls, HRV usw.) sowie Recovery/Readiness sind bewusst nicht Teil der App; die
Datenbank-Migration v3 entfernt eventuell früher importierte Werte.


| Quelle | Weg | Voraussetzung | Status in Forge |
|---|---|---|---|
| **Fitbit / Fitbit Air** | Google Health API (REST, OAuth im Browser) | Eigene OAuth-Client-ID (Google Cloud, Testmodus genügt für private Nutzung) | live, manuell + automatisch synchronisiert |
| **Apple Health** | Export der Health-App (Export.zip) | – | Datei-Import, Streaming im Web Worker |
| **Google Health Connect / HealthKit live** | Native Brücke `window.ForgeHealthBridge` | Native App-Hülle (Capacitor), siehe docs/NATIVE_BRIDGE.md | Schnittstelle fertig, native Hülle nicht enthalten |
| **Manuell** | Eingabe in der App | – | immer verfügbar |

**Kompatibilität Fitbit Air:** Die Fitbit Air synchronisiert in die Google-Health-App (die frühere Fitbit-App). Die alte
Fitbit Web API wurde von Google im Herbst 2026 abgeschaltet; ihr offizieller Nachfolger ist die Google Health API
(`https://health.googleapis.com/v4/users/me/dataTypes/{type}/dataPoints`), die Forge nutzt. Einrichtung: Google Cloud
Projekt → Google Health API aktivieren → OAuth-Zustimmungsbildschirm im Testmodus mit dem eigenen Konto als Testnutzer →
OAuth-Client „Webanwendung“ mit der App-URL als JavaScript-Quelle → Client-ID in Forge (Mehr → Datenquellen) eintragen.
Google-Tokens im Browser gelten ca. 1 Stunde; danach genügt ein Tipp auf „Synchronisieren“.

**Ehrlicher Hinweis:** Die Google-Health-Anbindung wurde gegen Googles veröffentlichte Referenz implementiert und mit
nachgebildeten Antworten getestet, konnte aber in der Entwicklungsumgebung nicht gegen ein echtes Konto laufen
(kein Netzwerkzugriff auf Google, keine Zugangsdaten). Die Parser sind defensiv; jede Rohantwort ist unter
„Datenquellen → Rohdaten“ einsehbar, damit Abweichungen sichtbar statt still falsch sind.

Zusammenführung: pro Metrik und Tag gewinnt genau eine Quelle (einstellbare Priorität) – Werte werden nie addiert.
Beim Apple-Import gewinnt pro Tag das Gerät mit der höchsten Summe (iPhone + Watch werden nicht doppelt gezählt).

## Ernährung

Mifflin-St-Jeor-Grundumsatz × Aktivitätsfaktor (Schätzwerte, jederzeit manuell überschreibbar), Makroziele,
Tagebuch mit vier Mahlzeiten, Kalender, Rezepte, Mahlzeiten kopieren, Statistik.
Barcode: native `BarcodeDetector` (Chrome/Android) oder ZXing (iOS Safari), Kamera braucht HTTPS.
Produktdaten von **Open Food Facts** (offene Datenbank, sehr gute Abdeckung DE/EU, ohne API-Key); unvollständige
Einträge werden markiert, fehlende Werte nie mit 0 ergänzt. Gescannte Produkte werden lokal gespeichert und sind
danach offline verfügbar. Nicht gefundene Produkte lassen sich mit Barcode als eigenes Produkt anlegen.
Kalorienbudget „fest“ (TDEE-Schätzung) oder „mit Aktivitätsdaten“ (BMR × 1,2 + gemessene Aktivitätskalorien) – nie beides.
