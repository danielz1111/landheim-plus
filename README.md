# Landheim Plus 1.0

Landheim Plus ist ein webbasiertes Klassen- und Fortschrittssystem für den Unterricht. Die produktive Version nutzt **Supabase** für Authentifizierung/Datenbank und **Vercel** für das Hosting.

## Pädagogische Logik

- Zwei Doppelstunden pro Woche
- maximal **2 individuelle Pluspunkte pro Schüler/in und Woche**
- maximal **2 Klassenpunkte pro Woche**
- individuelle Stufen:
  - Bronze ab 4 Punkten
  - Silber ab 10 Punkten
  - Gold ab 20 Punkten **und** mindestens 3 aktiven Entwicklungsbereichen
  - Platin als besondere Jahresauszeichnung, höchstens einmal pro Klasse/Schuljahr
- Entwicklungsbereiche: Mitarbeit, Zuverlässigkeit, Teamwork, Fokus, Hilfsbereitschaft
- keine öffentliche Rangliste
- Klassen-Season: 20 Punkte mit Freischaltungen bei 4 / 8 / 12 / 16 / 20

## Funktionen

### Lehrkraft
- Klassen und Schüler/innen verwalten
- Schülerimport mit Einmal-Passwort und Pflicht-Passwortwechsel
- schnelle Punktevergabe am Handy
- Wochenlimits werden serverseitig erzwungen
- Klassenpunkte je Doppelstunde
- Challenges
- editierbarer Freischaltungskatalog inkl. Mystery Unlock
- Verlauf mit dokumentierter Korrekturfunktion
- Passwort-Reset / Schüler aus Klasse entfernen
- Platin-Auszeichnung
- Schuljahreswechsel mit Archiv und optionaler Übernahme der Schülerkonten
- Smartboard-Link ohne Schülernamen

### Schüler/in
- eigener Punktestand
- Bronze / Silber / Gold / Platin
- fünf Entwicklungsbereiche und Abzeichen
- eigene Punkthistorie
- gemeinsamer Klassenfortschritt
- Freischaltungen und Challenge
- keine Punktestände anderer Schüler/innen

### Smartboard
Die URL `?display=<TOKEN>` zeigt nur:
- Klassenfortschritt
- Wochenstand
- Challenge
- Freischaltungen

Es werden keine Schülernamen, Benutzernamen oder individuellen Punktestände ausgegeben.

## Einmalige Migration auf 1.0

Vor dem Merge der 1.0-Weboberfläche muss `supabase_final.sql` **einmal vollständig** im Supabase SQL Editor ausgeführt werden.

Die Migration erhält bestehende Konten, Klassen, Mitgliedschaften und individuelle Punkte.

## Sicherheit / Datenschutz

- keine öffentliche Rangliste
- Geburtsdaten werden nicht als Profilfeld gespeichert
- Passwörter werden ausschließlich über Supabase Auth verarbeitet
- Schüler sehen über RLS nur ihre eigenen individuellen Punktdaten
- Klassenstände sind aggregiert
- Admin-/Service-Schlüssel gehören ausschließlich in serverseitige Supabase Edge Functions
- der Publishable Key in `config.js` ist für Browser-Anwendungen vorgesehen; die Zugriffskontrolle erfolgt über RLS/RPC

Eine schulische Datenschutzprüfung sowie die formale Datenschutzerklärung des Verantwortlichen bleiben organisatorische Aufgaben der Schule.

## Deployment

- Repository: GitHub
- Hosting: Vercel
- Datenbank/Auth: Supabase
- Änderungen an `main` werden von Vercel automatisch deployed.


## Hinweis zur bestehenden Installation
Die finale Migration berücksichtigt jetzt ausdrücklich die bereits installierte
`get_my_classes()`-Funktion aus der bisherigen Version und ersetzt sie sicher.
Bestehende Schülerkonten, Klassen und Punkte werden dabei nicht gelöscht.
