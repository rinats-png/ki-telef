# Smart-Routing und Microsoft 365: Betriebs- und Entwicklungsnotizen

**Versionshinweis:** Für den aktuellen Dark-Hub-/Telefonie-Release, automatische Microsoft-Konfiguration und PostgreSQL gilt die [Release-Anleitung](RELEASE.md). Die folgenden Notizen dokumentieren den vorherigen Grundgerüst-Stand.

Ergänzend zur bereitgestellten [PDF-Anleitung](microsoft-graph-outlook-anbindung.pdf). Die PDF ist unverändert archiviert; die folgenden Angaben beschreiben die aktuelle Implementierung.

## Start und Seiten

Nach `npm ci` und dem Anlegen der `.env`:

```bash
npm run db:migrate
npm run admin:create
npm run db:seed
npm run dev
```

`admin:create` nur einmal ausführen. Die Startseite ist das neue Smart-Routing-Dashboard. Die bisherige Ticketansicht bleibt unter `/tickets` erhalten. Der Seed ist wiederholbar und verändert keine Echtdaten. Alle Mitarbeiter sind ausdrücklich fiktive Demopersonen; echte Mitarbeiter werden separat angelegt.

Die neue Datenstruktur ergänzt die bestehenden Tabellen um `Customer`, `Employee`, `CallTicket`, `SlotOffer` und `OutlookArtifact`. Kunden und Mitarbeiter sind nach `mode=demo|live` getrennt. Telefonnummern werden als internationale Strings normalisiert, nicht als Zahlen gespeichert. SQLite wird durch versionierte Migrationen aktualisiert. Für PostgreSQL ist eine eigene Initialmigration zu erzeugen; SQLite-Migrations-SQL darf nicht unverändert auf PostgreSQL angewendet werden.

## Endpunkte und Agent-Tools

- `POST /api/voice/webhook?provider=vapi|retell`: native Provider-Nachrichten, Caller-ID-Erkennung bei Call-Start und die drei neuen Function-Tools. Gleiche Header-/Signaturprüfung wie der frühere Endpunkt `/api/voice-webhook`, der kompatibel erhalten bleibt.
- `lookup_customer_by_phone({phone})`: Lookup nach Modus und normalisierter Nummer; liefert Name, Vertragskategorie und maximal drei frühere abgeschlossene Anliegen als Kategorie/Datum. Caller-ID ist kein Identitätsnachweis. Der Agent lässt Name/Objekt bestätigen, bevor er Details bespricht oder Daten aktualisiert.
- `determine_and_check_employee({customer_type,pest_type,urgency,issue_type,postal_code})`: serverseitige Zuständigkeit und bis zu drei angebotene Slots. Die Mitarbeiter-ID wird nicht vom LLM frei gewählt.
- `finalize_call_action({contact,slot_id,summary,transcript,appointment_type,email_confirmed})`: bestätigte Kontaktangaben, ausgewählter Slot und Gesprächsergebnis. Die vollständigen Parameterschemata liegen in `lib/smart/validation.ts`. Nur bestätigte E-Mail und Identität zulässig. Ohne vollständige Daten bleibt der Anruf zur manuellen Bearbeitung offen.
- `GET /api/smart/dashboard?mode=demo|live`: geschützte Anzeige von Routing, Kunden, Mitarbeitern und Outlook-Aktionen.
- `POST /api/smart/simulate`: `{scenario:"wasps"|"restaurant"|"existing",provider:"vapi"|"retell"}`. Admin-Sitzung und Origin-Prüfung; führt ausschließlich den Demo-Modus durch.
- `PATCH /api/smart/employees/:id`: manuell gepflegte Verfügbarkeit `AVAILABLE|BUSY|OFFLINE` und Datenmodus. Diese Angabe ist keine Teams-Präsenz.
- `GET /api/smart/agent?provider=vapi|retell`: System-Prompt und Konfigurationsvorlage. Geheimnisse bleiben serverseitig.

## Routing und Buchung

Priorität: `CRITICAL` → `EMERGENCY_TECH`; Rechnung, Terminänderung, Dokumentation, Nachkontrolle oder Wartung → `BACKOFFICE`; sonst Gewerbe/Hausverwaltung → `B2B_SPECIALIST`; Privat mit `HIGH` → `EMERGENCY_TECH`; übrige Privatfälle → `PEST_EXPERT`. Anschließend werden aktive Mitarbeiter, PLZ und Schädlingszuständigkeit berücksichtigt. Leere PLZ-/Schädlingslisten bedeuten alle konfigurierten Gebiete/Fälle der Rolle. Keine passende Zuständigkeit führt zur manuellen Disposition statt einer stillen Falschzuordnung.

`CRITICAL` plus `AVAILABLE` wird als Warm-Transfer-Kandidat gekennzeichnet. Ein echter SIP/Warm Transfer ist erst Phase B; bis dahin bucht der Ablauf einen Rückruf und behauptet keine Weiterleitung. Die drei Simulatorfälle zeigen Fachberatung, B2B und Bestandskunden-Service; kritische Notfälle werden zusätzlich durch Tests geprüft.

Slots sind 30 Minuten lang, mindestens 15 Minuten in der Zukunft, Montag bis Freitag zwischen 08:00 und 16:30 Europe/Berlin, Horizont sieben Tage. Das ist eine anpassbare Prototyp-Regel, keine zugesagte Einsatzzeit. Zeitumstellung und Wochenenden werden berücksichtigt. Angebote verfallen nach zehn Minuten. Vor der Buchung werden Kalender und lokale Reservierungen erneut geprüft. Feiertage, Abwesenheitsregeln außerhalb der Outlook-Belegung und Fahrzeiten sind noch nicht gesondert hinterlegt.

Die Datenbank serialisiert lokale Reservierungen je Mitarbeiter. Ein fremder Kalenderclient kann zwischen Prüfung und Graph-Buchung weiterhin einen Termin eintragen: Microsoft Graph bietet hier keine organisationsübergreifende atomare Slot-Reservierung. Vor einem Mehrsystem-Produktivbetrieb sind Buchungshoheit und Konfliktabgleich festzulegen. Der aktuelle Standard bucht Rückrufe; bestehende Termine werden nicht automatisch verschoben.

## Mock-Modus und echte Microsoft-Anbindung

`MICROSOFT_GRAPH_MOCK_MODE=true` ist der sichere Standard. Termine, Entwürfe und Bestätigungen werden in der Datenbank mit `isMock=true` und Zustand `SIMULATED` angelegt und im Outlook-Center angezeigt. Auch bei hinterlegten Zugangsdaten bleibt ein ausdrücklich gesetzter Mock-Modus aktiv. Demo-Simulationen bleiben immer lokal.

Für echte Aktionen sind alle Schritte erforderlich:

1. App in Microsoft Entra ID im richtigen Mandanten registrieren.
2. Microsoft Graph **Application Permissions** `Calendars.ReadWrite`, `Mail.ReadWrite`, `Mail.Send` hinterlegen und Administratorzustimmung erteilen.
3. Zugriff auf die tatsächlich benötigten Exchange-Postfächer beschränken, beispielsweise mit Exchange Online Application RBAC. Eine unbeschränkte mandantenweite Mail-App ist kein erforderlicher Bestandteil des MVP.
4. `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` ausschließlich in `.env` oder dem Deployment-Secret-Store setzen.
5. Echte Mitarbeiter unter `mode=live` mit gültigem `upn`, Rolle, Zuständigkeiten und Verfügbarkeit anlegen. Beispielsweise über `npx prisma studio` auf der lokalen, geschützten Entwicklungsmaschine; Demo-Mitarbeiter werden nicht in den Live-Modus kopiert.
6. `MICROSOFT_GRAPH_MOCK_MODE=false` setzen und den Server neu starten. Bei fehlenden Schlüsseln schlägt die echte Aktion fehl; es gibt keinen stillen Rückfall auf simulierten Erfolg.
7. Mit einem kontrollierten Testpostfach und einem bestätigten Kundenkontakt zunächst Kalenderzugriff, Rückrufbuchung, Entwurf und Bestätigung prüfen. Ein echter Test wurde in dieser Umgebung mangels Mandanten-Zugangsdaten nicht durchgeführt.

Der Service verwendet Client Credentials mit `scope=https://graph.microsoft.com/.default`, einen kurzzeitig gecachten Token, `calendarView` inklusive Folgeseiten, `POST /users/{upn}/events`, `POST /users/{upn}/messages` und zum Versand der Bestätigung `POST /users/{upn}/messages/{id}/send`. `findMeetingTimes` wird für diesen App-Only-Ablauf nicht benötigt. Kalendertermine enthalten die strukturierten Notizen; der Antwortentwurf ist ausdrücklich zur menschlichen Prüfung bestimmt und wird nicht automatisch verschickt. Ein neu angelegter Kontakt erhält nicht automatisch einen HACCP-Vertrag.

## Fehler, Wiederholung und Versandstatus

Finalisierung ist pro Anruf gesperrt und anhand bestätigter Eingabedaten wiederholbar. Ein bereits bestätigter Abschluss erzeugt keine weiteren Outlook-Aktionen. Abweichende spätere Abschlussdaten werden abgelehnt. Termin, Entwurf und Bestätigung werden jeweils genau einmal lokal angelegt.

Der Service nutzt für Termine einen stabilen `transactionId`, für Nachrichten einen anwendungsbezogenen Extended-Property-Schlüssel und unveränderliche Message-IDs. Nach einer Unterbrechung wird nach vorhandenen Nachrichten gesucht. Vor einem möglicherweise erneut ausgelösten Mailversand wird der vorhandene Entwurf geprüft. `UNKNOWN` wird nicht blind erneut versendet. Microsofts HTTP 202 wird als `ACCEPTED` dargestellt, nicht als bewiesene Zustellung.

Ein Teilfehler führt zu `PARTIAL`, sichtbarer Fehlerbeschreibung und erhaltenen Aktionsreferenzen. Reservierungen werden bei unklarem externem Ergebnis nicht automatisch freigegeben. Vor einem produktiven Dauerbetrieb sind Wiederanlauf/Abgleich, Monitoring, Zustellfehler und operative Zuständigkeiten mit dem Team festzulegen.

## Referenzen

- [Microsoft: App-Only Client Credentials](https://learn.microsoft.com/en-us/graph/auth-v2-service)
- [Microsoft: calendarView](https://learn.microsoft.com/en-us/graph/api/user-list-calendarview?view=graph-rest-1.0)
- [Microsoft: Kalendertermin erstellen](https://learn.microsoft.com/en-us/graph/api/user-post-events?view=graph-rest-1.0)
- [Microsoft: bestehenden Entwurf senden](https://learn.microsoft.com/en-us/graph/api/message-send?view=graph-rest-1.0)
- [Vom Auftraggeber bereitgestellte PDF-Anleitung](microsoft-graph-outlook-anbindung.pdf)
- [Handbuch: Hosting, Kostenkalkulation und Voice-AI-Integration](handbuch-hosting-kosten-voice-ai-integration.pdf)
