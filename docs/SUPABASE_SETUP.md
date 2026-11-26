# Online-Funktionen einrichten (Supabase)

Für Freunde, Feed, Ranglisten, Challenges und Live-Duelle braucht heben einen kleinen Server.
Dafür nutzt die App **Supabase** (kostenloser Tarif reicht). Einmalige Einrichtung: ca. 10 Minuten.

## 1. Projekt anlegen

1. Auf **supabase.com** registrieren (z. B. mit GitHub) und **„New project“** wählen.
2. Name z. B. `forge`, ein sicheres Datenbank-Passwort vergeben (wird für die App nicht gebraucht),
   Region **Frankfurt (eu-central-1)** wählen.
3. Warten, bis das Projekt bereit ist (1–2 Minuten).

## 2. Datenbank einrichten

1. Links **SQL Editor** öffnen → **„New query“**.
2. Den kompletten Inhalt der Datei `supabase/migrations/20261126000000_social.sql` einfügen.
3. **„Run“** klicken. Es sollte „Success. No rows returned“ erscheinen.

Das Skript legt alle Tabellen, Zugriffsregeln (Row Level Security), Funktionen und die
Echtzeit-Freigabe für Live-Duelle an. Es kann gefahrlos erneut ausgeführt werden (z. B. nach Updates).

## 3. Anmeldung (Authentication)

1. **Authentication → Sign In / Providers → Email**: muss aktiviert sein (Standard).
2. **„Confirm email“** – zwei Möglichkeiten:
   - **Aus (am einfachsten):** Nach der Registrierung ist man sofort angemeldet. Für einen privaten
     Freundeskreis meist die bequemste Wahl.
   - **An (sicherer):** Nach der Registrierung kommt eine Bestätigungs-E-Mail. Erst nach dem Klick auf
     den Link kann man sich in der App anmelden. Der kostenlose Supabase-Mailversand ist auf wenige
     E-Mails pro Stunde begrenzt.
3. **Authentication → URL Configuration**:
   - **Site URL**: die Adresse deiner App, z. B. `https://deine-app.netlify.app`
   - **Redirect URLs**: dieselbe Adresse noch einmal eintragen (für Bestätigungs- und Passwort-Links).

## 4. Schlüssel in die App eintragen

1. **Project Settings → API** (bzw. „Data API“ / „API Keys“) öffnen.
2. Kopieren:
   - **Project URL** – z. B. `https://abcdefgh.supabase.co`
   - **anon public** Schlüssel (beginnt mit `eyJ…`, bzw. „publishable key“)
3. In heben: unten auf **Freunde** tippen → „Online-Server verbinden“ und beide Werte einfügen. Freunde musst du nicht einzeln einrichten: Unter Freunde → „Einladen“ teilst du einen Link, der die Server-Verbindung automatisch mitbringt.
   (Alternativ beim Bauen als `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` setzen.)

**Ist der anon-Schlüssel geheim?** Nein. Er ist dafür gedacht, in Apps zu stehen. Was jemand damit tun
darf, regeln ausschließlich die Zugriffsregeln der Datenbank: Ohne Anmeldung ist gar nichts möglich,
angemeldete Nutzer sehen nur ihr eigenes Training und das ihrer bestätigten Freunde. Den
**service_role**-Schlüssel dagegen niemals in die App oder weitergeben.

## 5. Echtzeit (Live-Duelle)

Wird vom SQL-Skript erledigt (Tabellen werden zur Publikation `supabase_realtime` hinzugefügt).
Kontrolle: **Database → Publications → supabase_realtime** enthält `duel_sets`, `duels`,
`friendships`, `challenge_members`, `reactions`.

## Was wird online gespeichert?

Nur, was für die Wettbewerbe nötig ist: dein Benutzername, Anzeigename, eine Farbe und **Zusammenfassungen**
deiner Workouts (Dauer, Volumen, Sätze, je Übung bestes Gewicht/geschätztes 1RM) sowie Duell-Sätze.
Notizen, Ernährung, Körpergewicht und Aktivitätsdaten bleiben ausschließlich auf deinem Gerät.
E-Mail-Adressen sind für andere Nutzer nie sichtbar. In der App kannst du das Teilen ausschalten,
alle Online-Daten löschen oder dein Konto komplett entfernen.

## Kostenloser Tarif – gut zu wissen

- Für einen Freundeskreis reichen die Grenzen des Free-Tarifs (Datenbank 500 MB, viele tausend Nutzer) bei Weitem.
- **Projekte ohne Aktivität werden nach ca. 1 Woche pausiert.** Dann im Supabase-Dashboard auf
  „Restore project“ klicken – die Daten bleiben erhalten. Die App funktioniert in der Zwischenzeit
  offline weiter und lädt Workouts nach, sobald der Server wieder erreichbar ist.
- Pro Konto sind zwei kostenlose Projekte möglich.

## Für Entwickler: Schema lokal testen

```bash
npm run test:sql
```

Startet einen temporären PostgreSQL-16-Cluster, spielt `supabase/test/auth_stub.sql` (Nachbildung von
`auth.uid()`, Rollen, Realtime-Publikation) und die Migration zweimal ein (Idempotenz) und prüft mit
`supabase/test/social_test.sql` Zugriffsregeln, Funktionen und Berechnungen.
