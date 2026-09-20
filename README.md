# Landheim Plus – Version 3 (onlinefähig)

Diese Version ist für **Supabase + Vercel** vorbereitet.

## Was funktioniert
- E-Mail/Passwort-Login über Supabase Auth
- Rollen: Lehrkraft / Schüler/in
- Lehrkraft kann Klassen anlegen
- jede Klasse erhält einen Beitrittscode
- Schüler/innen können per Code beitreten
- Lehrkraft vergibt individuelle Pluspunkte nach Kategorien
- 10 individuelle Nettopunkte = 1 Klassenpunkt (serverseitig in PostgreSQL)
- Klassenbonus, Serie, Challenge, Freischaltung
- Schüler sehen nur ihre eigenen individuellen Punktedaten
- gemeinsamer Klassenstand ist für Klassenmitglieder sichtbar
- Row Level Security (RLS) schützt die Datenbank

## 1. Supabase-Projekt anlegen
1. https://supabase.com öffnen und ein neues Projekt anlegen.
2. SQL Editor öffnen.
3. `supabase.sql` vollständig ausführen.
4. Unter Authentication -> Users zunächst Testkonten anlegen.
5. Das Lehrerkonto nach der Kontoanlage im SQL Editor einmalig auf `teacher` setzen:

```sql
update public.profiles
set role='teacher', display_name='Herr Zech'
where id='<UUID DES LEHRERKONTOS>';
```

Alle neu angelegten Konten sind bewusst standardmäßig `student`.

## 2. Konfiguration
1. In Supabase unter Project Settings / API die **Project URL** und den **Publishable Key** kopieren.
2. `config.js` öffnen.
3. Platzhalter ersetzen:

```js
window.LANDHEIM_PLUS_CONFIG = {
  SUPABASE_URL: "https://....supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_..."
};
```

Der Publishable/Anon-Key ist für Browser-Apps vorgesehen. Die eigentliche Zugriffssicherheit liegt in RLS. Niemals den Service-Role-Key in die Webseite eintragen.

## 3. Lokal testen
Am zuverlässigsten über einen kleinen lokalen Webserver:

```bash
python -m http.server 8080
```

Dann im Browser:
`http://localhost:8080`

## 4. Vercel
Den gesamten Ordner auf GitHub legen oder direkt als Projekt deployen. Für diese statische Version ist kein Build-Schritt nötig.

## Datenschutz
Vor echten Schülerdaten:
- schulische Freigabe / Verantwortlichkeit klären
- nur notwendige Daten verwenden
- vorzugsweise Schul-E-Mail-Konten und sparsame Anzeigenamen
- keine öffentliche Rangliste
- Lösch- und Schuljahreswechsel-Konzept festlegen
- Auftragsverarbeitung / Hostingstandort nach den schulischen Vorgaben prüfen

## Dateien
- `index.html` – Oberfläche
- `styles.css` – Design
- `app.js` – Supabase-Logik
- `config.js` – deine lokale Konfiguration
- `config.example.js` – Vorlage
- `supabase.sql` – Datenbank, Trigger und RLS

## Nächster Ausbau
- Schülerimport
- Jahres-/Klassenarchiv
- Bronze/Silber/Gold/Platin sauber als individuelle Entwicklungsstufen
- QR-Code für Beitritt
- Live-Aktualisierung via Supabase Realtime
- Belohnungskatalog / Mystery-Unlocks
- Lehreraktivitätsverlauf und Korrekturfunktion
