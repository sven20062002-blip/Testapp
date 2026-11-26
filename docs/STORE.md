# heben in App Store und Play Store

App-Name: **heben – Fitness & Lifestyle** (27 Zeichen, Grenze 30) · App-ID: **`app.heben.fitness`** (nicht mehr änderbar)

## Was fertig ist

| Bereich | Stand |
|---|---|
| Native Projekte | `android/` und `ios/` (Capacitor 8), gleicher Code wie die Web-App |
| Schritte & Co. | Apple Health / Health Connect über `@capgo/capacitor-health`, nur **lesend**; Tagessummen vom Betriebssystem (keine Doppelzählung) |
| Android-Berechtigungen | genau 8 Lese-Rechte + Verlauf (Schritte, Distanz, Etagen, Aktiv-/Ruhe-/Gesamt-kcal, Gewicht, Körperfett); alle übrigen Plugin-Rechte entfernt |
| iOS | HealthKit-Entitlement, Begründungstext (`NSHealthShareUsageDescription`), keine Schreibrechte |
| Symbol & Startbildschirm | `npm run icons` erzeugt alle Größen; Play-Icon 512 px in `store/` |
| Datenschutzerklärung | `public/privacypolicy.html` – in der App unter Einstellungen verlinkt und im Health-Connect-Dialog |
| Android-Testversion | `npm run android:apk` → `android/app/build/outputs/apk/debug/app-debug.apk` |

## Was du erledigen musst

1. **Datenschutzerklärung ergänzen:** In `public/privacypolicy.html` die gelb markierten Platzhalter ausfüllen (Name, Anschrift, Kontakt-E-Mail, Supabase-Region). Die Stores verlangen eine öffentlich erreichbare URL, z. B. `https://<deine-netlify-seite>/privacypolicy.html`.
2. **Konten anlegen** (Preise laut Apple/Google, Stand Ende 2026 – bitte vor Ort prüfen):
   - Google Play Console: einmalig 25 US-$, Identitätsprüfung.
   - Apple Developer Program: 99 €/Jahr, Identitätsprüfung.
3. **GitHub verbinden:** Für iOS-Builds ohne eigenen Mac richte ich einen Build in GitHub Actions (macOS-Rechner) ein; dafür muss der Code auf GitHub liegen.

## Google Play – Ablauf

1. **Upload-Schlüssel**: Ich erzeuge einen Signaturschlüssel (`upload.jks`). Den bewahrst **du** sicher auf (Passwort-Manager + Backup). Er gehört nie ins Git-Repository. Danach baue ich ein signiertes App-Bundle (`.aab`).
2. **Interner Test** in der Play Console: AAB hochladen, auf eigenen Geräten installieren.
3. **Geschlossener Test**: Neue *private* Entwicklerkonten müssen vor der Veröffentlichung einen geschlossenen Test mit mindestens **12 Testern über 14 Tage** durchführen – dein Freundeskreis eignet sich gut.
4. **Health-Connect-Erklärung** (App-Inhalte → Gesundheits-Apps / Health Connect): pro Berechtigung den Zweck angeben, z. B. „Schritte: Anzeige der täglichen Aktivität und des Schrittziels“. Nur die 8 Lese-Rechte + Verlauf angeben.
5. **Datensicherheit** (Data safety):
   - Gesundheit & Fitness: *gesammelt, nicht geteilt*, verarbeitet nur auf dem Gerät → bei „auf Gerät verarbeitet“ ankreuzen; nicht übertragen.
   - Online-Funktionen (optional): E-Mail, Benutzername, Fitness-Zusammenfassungen werden *übertragen* (Konto/Funktion), verschlüsselt, löschbar.
   - Keine Werbung, keine Analysedienste.
6. **Inhaltsbewertung**, Zielgruppe ab 16, Store-Eintrag (Texte unten), Screenshots (mind. 2 Handy-Screenshots).

## Apple App Store – Ablauf

1. In App Store Connect die App mit der Bundle-ID `app.heben.fitness` anlegen; Capability **HealthKit** ist im Projekt bereits gesetzt.
2. Build: per GitHub Actions (macOS) oder auf einem Mac mit Xcode → TestFlight → Freunde testen lassen.
3. **App-Datenschutz** (Nutrition Label): Gesundheit & Fitness – *nicht mit dir verknüpft, nicht gesammelt* (bleibt auf dem Gerät); bei Online-Funktionen: E-Mail, Benutzer-ID, Fitness-Zusammenfassungen *mit dir verknüpft, für App-Funktionalität*.
4. **Prüfhinweis** für Apple: „HealthKit wird nur gelesen (Schritte, Distanz, Energie, Etagen, Gewicht, Körperfett) und nur in der App angezeigt; keine Übertragung. Online-Funktionen sind optional; Konto kann in der App gelöscht werden (Freunde → Konto).“ Für die Prüfung ein Test-Konto für die Freunde-Funktion angeben.
5. Altersfreigabe 4+ (keine bedenklichen Inhalte), Kategorie *Gesundheit & Fitness*.

## Store-Texte (Entwurf)

**Name:** heben – Fitness & Lifestyle

**Untertitel (iOS, max. 30):** Training, Ernährung, Freunde

**Kurzbeschreibung (Play, max. 80):** Workouts tracken, Kalorien zählen und gegen Freunde heben – alles in einer App.

**Beschreibung:**

> heben ist dein Trainingspartner für Gym, Ernährung und Alltag.
>
> TRAINING
> • Workouts mit Plänen oder frei starten, Sätze in Sekunden eintragen
> • Pausentimer startet automatisch – auch im Hintergrund zuverlässig
> • Persönliche Rekorde werden sofort erkannt und gefeiert
> • Verlauf, Statistiken und Volumen-Entwicklung pro Übung
>
> ERNÄHRUNG
> • Lebensmittel per Barcode-Scanner erfassen
> • Kalorien- und Makroziele passend zu deinem Ziel
> • Eigene Rezepte und Favoriten
>
> AKTIVITÄT & KÖRPER
> • Schritte, Kalorien und Gewicht aus Apple Health bzw. Health Connect
> • Gewichtsverlauf mit Trend
>
> FREUNDE
> • Feed, Ranglisten und Challenges unter Freunden
> • Live-Duell: gleichzeitig trainieren, jeder Satz zählt sofort
>
> DEINE DATEN
> • Alles bleibt auf deinem Gerät und funktioniert offline
> • Keine Werbung, kein Tracking
> • Startseite frei anpassbar

**Schlüsselwörter (iOS, max. 100):** gym,workout,krafttraining,fitness,trainingsplan,kalorien,ernährung,schritte,rekorde,freunde
