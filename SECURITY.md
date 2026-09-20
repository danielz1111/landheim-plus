# Security notes – Landheim Plus

## Grundsätze

1. Niemals einen Supabase `service_role`- oder Secret-Key in `config.js`, HTML, JavaScript oder GitHub speichern.
2. Schülerdaten niemals in das öffentliche Repository committen.
3. Importlisten mit Geburtsdaten ausschließlich lokal verwenden und anschließend sicher löschen/aufbewahren.
4. `bulk-create-students` und `manage-student-account` müssen die Lehrkraftrolle serverseitig prüfen.
5. RLS bleibt auf personenbezogenen Tabellen aktiviert.
6. Die Smartboard-Ansicht darf nur aggregierte Klassendaten ausgeben.
7. Fehlvergaben werden nicht unsichtbar gelöscht, sondern über Gegenbuchungen korrigiert.

## Datenminimierung

In `profiles` werden für Schüler nur die technisch notwendigen Daten geführt (z. B. Anzeigename, Benutzername, Rolle, Erstlogin-Status). Das Geburtsdatum ist kein Profilfeld.

## Schuljahreswechsel

Alte Klassen werden archiviert statt gelöscht. Für eine endgültige Löschung sollte die Schule eine Aufbewahrungs- und Löschfrist definieren.
