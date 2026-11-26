# heben – Fitness & Lifestyle

Installierbare Fitness-PWA (React, TypeScript, Tailwind CSS, IndexedDB/Dexie, Recharts, Supabase): Training mit Timern,
Ernährungstagebuch mit Barcode-Scanner, Aktivität und Körpergewicht – plus **Freunde**: Feed, Ranglisten, Challenges und Live-Duelle.
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
node tests/e2e/social.mjs http://localhost:4173           # E2E Freunde (gegen nachgebildeten Supabase-Server)
npm run test:sql                                           # Supabase-Schema + Zugriffsregeln gegen lokales Postgres 16
```

Zum Installieren auf dem Handy muss die App über **HTTPS** ausgeliefert werden (z. B. Netlify, Vercel, Cloudflare Pages – `dist/` als statische Seite, alle Pfade auf `index.html` umleiten).
Android/Chrome: „App installieren“. iOS/Safari: Teilen → „Zum Home-Bildschirm“.

## Ersteinrichtung & Speichern

Beim ersten Start fragt ein Onboarding in 6 Schritten alles ab, was die App braucht: Name und Gewichtseinheit, Geschlecht/Alter/Größe/Gewicht, Ziel und Zielgewicht, Trainings pro Woche, Aktivitätslevel, Satzpause, Schrittziel und Darstellung. Am Ende zeigt es das berechnete Kalorien- und Makroziel.

- Jede Eingabe wird sofort als Entwurf gesichert. Beim Verlassen der App (App-Wechsel, Bildschirm aus, Tab schließen) landen alle gültigen Angaben zusätzlich in der Datenbank. Beim nächsten Öffnen geht es am selben Schritt weiter.
- Bestehende Daten werden vorausgefüllt. Einstellungen → „Einrichtung erneut durchlaufen“ startet das Onboarding neu.
- Danach startet eine **App-Tour** mit 5 Stationen – eine pro Menüpunkt, von links nach rechts: Heute, Training, Ernährung, Freunde und „Mehr“ (fasst Pläne, Verlauf, Statistik, Übungen, Aktivität, Körpergewicht, Datenquellen und Einstellungen zusammen). Sie hebt den Menüpunkt hervor und öffnet die passende Seite. Man kann sie jederzeit beenden. Wird die App mittendrin verlassen, geht es an derselben Station weiter. Unter Einstellungen → „App-Tour“ lässt sie sich erneut starten. Am Ende kehrt die App zur Ausgangsseite zurück, damit z. B. ein Einladungslink nicht verloren geht.
- Die App startet standardmäßig im **hellen Modus**. Installationen, die noch auf dem alten Standard „Dunkel“ standen, werden einmalig umgestellt; „System“ bleibt erhalten.
- App-weit gilt: Ein Feld, in dem beim Verlassen der App noch getippt wird, wird gespeichert. Der Plan-Editor stellt ungespeicherte Pläne wieder her.

## Gestaltung

- Jeder Bereich hat eine feste Farbe (Training Grün, Ernährung Orange, Aktivität Cyan, Körper Violett, Freunde Pink). Im Menü tragen die Symbole immer ihre Bereichsfarbe; der ausgewählte Bereich wird einheitlich mit einer getönten Fläche in derselben Farbe hervorgehoben. „Mehr“ übernimmt die Farbe des geöffneten Unterbereichs.
- Kompakte Darstellung: etwas kleinere Schrift, engere Abstände, zusammengefasste Kacheln – im Schnitt rund 17 % weniger Scrollen, auf der Startseite rund ein Drittel.

## Kettli – Begleiter mit Tagesaufgaben

Unten in der Leiste (anstelle von „Freunde“) lebt **Kettli**, ein kleines Kettlebell-Wesen. Sein Level steht wie das Gewicht einer Kettlebell auf dem Bauch („12 kg“).

- **Tagesaufgaben:** Schrittziel erreichen, ein Workout absolvieren (mit mindestens einem Satz), Kalorienziel einhalten (90–105 % des Ziels) und als Bonus „alle drei geschafft“. Belohnungen werden per Tipp abgeholt, jede genau einmal pro Tag.
- **Level & Entwicklung:** XP lassen Kettli steigen (Level 2 nach 100 XP, danach je +20 XP mehr). Ab Level 5 Junior (Arme), ab 10 Athlet (Muskeln), ab 20 Legende (goldene Aura). Jedes Level gibt 20 Gains.
- **Währung „Gains“** (Hantelscheibe): pro Aufgabe 10–25, dazu ein Serienbonus von bis zu +10 pro Tag in Folge. Im **Shop** gibt es Farben, Accessoires (Stirnband, Cap, Brille, Kopfhörer, Medaille, Krone) und Hintergründe; manche erst ab einem Level.
- **Stimmung:** Kettli freut sich über erledigte Aufgaben, wird müde bei Pausen und vermisst dich nach mehreren Tagen; bestraft wird nie. Antippen lässt ihn springen und sprechen.
- Fortschritt ist im JSON-Backup enthalten. Der Freunde-Bereich ist im Code erhalten und lässt sich in `src/config/features.ts` wieder einschalten.

## Startseite anpassen

Die Startseite besteht aus Widgets: Workout starten, Schnellzugriffe, Training, Ernährung, Aktivität, Körper, Trainingsfortschritt, Letztes Workout und Bestleistungen. Über das Regler-Symbol oben rechts („Startseite anpassen“) lassen sie sich per Ziehen oder mit den Pfeilen verschieben, mit ✕ entfernen und über „Widget hinzufügen“ wieder einfügen. Mit ⤡/⤢ wird jede Kachel klein (halbe Breite, kompakte Ansicht) oder groß (ganze Breite). „Standard wiederherstellen“ setzt Reihenfolge und Größen zurück. Jede Änderung wird sofort gespeichert. Die Trainingspläne stehen nicht mehr auf der Startseite, sondern auf der Seite **Training**, mit Vorschau der Übungen, „Neuer Plan“ und „Verwalten“.

## Bewegung & Animationen

Seiten gleiten beim Wechsel herein, Listen erscheinen gestaffelt, Kacheln gleiten beim Verschieben und Größenwechsel an ihren neuen Platz (FLIP), Zahlen zählen hoch, Balken und der Kalorienring laufen auf, Sheets schließen mit einer Gleitbewegung, Segment-Schalter haben eine gleitende Auswahl, und der Wechsel zwischen hell und dunkel blendet weich über. Ist auf dem Gerät „Bewegung reduzieren“ eingestellt, werden alle Animationen abgeschaltet.

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


| Quelle | Weg | Voraussetzung | Status in heben |
|---|---|---|---|
| **Apple Health** | Export der Health-App (Export.zip) | – | Datei-Import, Streaming im Web Worker |
| **Google Health Connect / HealthKit live** | Native Brücke `window.ForgeHealthBridge` | Native App-Hülle (Capacitor), siehe docs/NATIVE_BRIDGE.md | Schnittstelle fertig, native Hülle nicht enthalten |
| **Manuell** | Eingabe in der App | – | immer verfügbar |

Die frühere Anbindung an Google Health / Fitbit wurde entfernt (Migration v6 trennt die Verbindung und löscht den gespeicherten Login). Früher übernommene Werte bleiben erhalten und lassen sich unter Datenquellen löschen.

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

## Freunde & Wettkämpfe (online)

Backend: **Supabase** (Postgres + Auth + Realtime), Einrichtung in `docs/SUPABASE_SETUP.md`, Schnittstelle in
`docs/SOCIAL_SCHEMA.md`, Schema in `supabase/migrations/`. Login per E-Mail + Passwort.

- **Feed** mit Reaktionen, **Ranglisten** (Wochen-/Monatsvolumen, 1RM, Maximalgewicht je Standardübung),
  **Challenges** mit Zeitraum (Volumen, 1RM, Gewicht, Workouts, Sätze – serverseitig berechnet),
  **Live-Duelle** (abgeschlossene Sätze werden sofort übertragen, Echtzeit-Spielstand, Abfrage-Fallback ohne Socket).
- Geteilt werden nur Zusammenfassungen (keine Notizen, keine Einzelsätze, keine Ernährungs-/Körperdaten).
  Sichtbarkeit: nur du und bestätigte Freunde (Row Level Security, lokal mit `npm run test:sql` geprüft).
- **Offline-Warteschlange** (IndexedDB): Uploads werden nachgeholt, sobald Verbindung und Anmeldung bestehen.
- **Einladungslink** bringt die Server-Verbindung mit – Freunde müssen nichts konfigurieren.
- Ergebnisse beruhen auf den eigenen Eingaben (kein Anti-Cheat) – gedacht für Freundeskreise.

**Ehrlicher Hinweis:** Die Supabase-Anbindung wurde gegen ein lokales Postgres mit nachgebildeter Supabase-Auth
(Schema, Zugriffsregeln, Funktionen) und im Browser gegen einen nachgebildeten Server (App-Abläufe) getestet,
nicht gegen ein echtes Supabase-Projekt – das war aus der Entwicklungsumgebung nicht erreichbar.
