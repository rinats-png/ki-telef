# STORM · Voice Hub 3

Geschütztes, lokal startbares Voice-AI-MVP mit Smart-Routing, Bestandskunden-Erkennung und Microsoft-365-Integration für die Storm Schädlingsbekämpfung GmbH. Next.js App Router, TypeScript, Tailwind CSS, Prisma und SQLite. Das Dashboard arbeitet mit gespeicherten Daten und fragt Änderungen alle zwei Sekunden ab.

**Schritt 1 ist lokal.** Telefonie, ElevenLabs, externe Alarmierung, Rufweiterleitung und Foto-Upload sind noch nicht aktiviert. Es werden keine Nachrichten versendet oder Audioaufnahmen gestartet. Beide Provider sind über native Webhook-Adapter und exportierbare Tool-Konfigurationen vorbereitet.


## Release 3: Dark Hub, Microsoft 365 und Twilio + Retell

Der aktuelle Release umfasst den Dark-Mode Interactive Hub, automatische Microsoft-365-Konfiguration, echte Twilio-/Retell-Endpunkte, Mitarbeiter-Übernahme, Browser-Sprachtest und den PostgreSQL-Release-Pfad. **Aktuelle Einrichtung und Serverbefehle: [Release-Dokumentation](docs/RELEASE.md).** Die älteren Abschnitte unten beschreiben teilweise den vorherigen MVP-Stand.

## Outlook-Anbindung: Übergabe an die nächste Person

Die bereitgestellte [Anleitung zur Microsoft Graph API und Outlook-Anbindung](docs/microsoft-graph-outlook-anbindung.pdf) ist unverändert im Projekt unter `docs/microsoft-graph-outlook-anbindung.pdf` abgelegt. Sie dient als Referenz für die Einrichtung durch die nächste betreuende Person.

Der aktuelle Implementierungsstand und die tatsächlich verwendeten Umgebungsvariablen stehen in dieser README und in `.env.example`. Der Graph-Service liegt in `lib/microsoft-graph.ts`. Standardmäßig bleiben alle Outlook-Aktionen im lokalen Mock-Modus; echte Mandanten-Zugangsdaten gehören ausschließlich in die lokale `.env` bzw. den Secret Store des Deployments.


Das ergänzende [Handbuch zu Hosting, Kostenkalkulation und Voice-AI-Integration](docs/handbuch-hosting-kosten-voice-ai-integration.pdf) ist ebenfalls unverändert unter `docs/` hinterlegt und dient als Referenz für die weitere Einrichtung und Übergabe.

## Neu: Smart-Routing & Outlook-Center

Die Startseite zeigt jetzt den Live-Call-Monitor, die Mitarbeiter-/Routing-Matrix, Kundenkontakte und das Outlook-Center. Drei Ein-Klick-Szenarien spielen Identifikation, Zuständigkeit, Rückrufbuchung, Antwortentwurf und Eingangsbestätigung durch. Der Microsoft-Graph-Service enthält sowohl den lokalen Mock-Modus als auch echten App-Only-API-Code.

Der neue Voice-Endpunkt lautet `/api/voice/webhook?provider=vapi|retell`; der bisherige Endpunkt bleibt kompatibel. Das bisherige Disponenten-Dashboard ist weiterhin unter `/tickets` erreichbar.

**Für die Übergabe:** [Implementierung, Umgebungsvariablen und Microsoft-365-Einrichtung](docs/SMART_ROUTING.md) sowie die [bereitgestellte PDF-Anleitung](docs/microsoft-graph-outlook-anbindung.pdf). Die nachfolgenden älteren Ticket-/Tool-Beschreibungen gelten für die klassische Ansicht.

## Lokal starten

Voraussetzungen: Node.js 22.12+ (getestet mit 24.19) und npm. Der erste Installationslauf benötigt Internet für npm-Pakete und Prisma-Binaries.

```bash
cd /workspace/storm-voice
npm ci
cp .env.example .env
npm run db:migrate
npm run admin:create
npm run db:seed
npm run dev
```

Dann **http://localhost:3000** öffnen. Den selbst gewählten Admin-Zugang verwenden. `admin:create` fragt Benutzername und Passwort interaktiv ab, zeigt das Passwort nicht an und verlangt mindestens 12 Zeichen sowie eine Bestätigung. Es gibt kein voreingestelltes Passwort. Das Skript überschreibt kein vorhandenes Admin-Konto.

Im bereits vorbereiteten Workspace sind Installation, Migration und Demo-Seed ausgeführt; dort genügen `npm run admin:create` und `npm run dev`. Eine vorhandene `.env` nicht versehentlich überschreiben.

Ein alternativer Port benötigt eine passende `APP_URL` in `.env`, da schreibende Browseranfragen gegen diese Origin geprüft werden. Beispielsweise `APP_URL="http://localhost:3001"` und `npm run dev -- --port 3001`.

Produktionsbuild lokal prüfen:

```bash
npm run build
npm start
```

Die Build- und Dev-Skripte verwenden Webpack, damit sie auch in Umgebungen funktionieren, in denen Turbopacks interne Socket-Erstellung eingeschränkt ist.

## Präsentationsablauf

1. Auf der Startseite erscheinen drei Smart-Routing-Abläufe mit vier fiktiven Mitarbeitern und neun simulierten Outlook-Aktionen. Unter `/tickets` bleiben sieben klassische Demo-Anrufe und drei Demo-Techniker verfügbar.
2. **Test-Anruf simulieren** öffnen: Restaurant mit Ratten oder Familie mit vermutetem Wespennest auswählen; Vapi oder Retell wählen.
3. Die Simulation schickt PLZ-Prüfung, Lead-Erfassung, bei Notfall interne Eskalation und abschließenden Gesprächsbericht an `/api/voice-webhook?provider=…&mode=demo`.
4. Neues Ticket öffnen, Zusammenfassung und Transkript lesen, Techniker zuweisen und als erledigt markieren. Änderungen überstehen einen Neustart.
5. **Echtdaten** umschalten: Demo-Tickets, Demo-KPIs und Demo-Techniker erscheinen dort nicht. Die Simulation ist dort deaktiviert.
6. Unter **KI-Assistent** den deutschen System-Prompt ansehen und die Provider-Konfiguration herunterladen. Der Export enthält keine echten Zugangsdaten.

Alle Kontakte, Firmen, Telefonnummern, Gesprächsverläufe und Techniker im Demo-Seed sind erfunden. Die Demo-Telefonnummern sind bewusst nicht als echte Rückrufnummern nutzbar. Der Seed fügt fehlende Startbeispiele hinzu und überschreibt keine bestehenden Tickets oder Echtdaten. Wiederholte Simulationen erzeugen hingegen absichtlich neue Anrufe.

### Kennzahlen

- **Angenommene Anrufe:** gespeicherte Anrufe im aktuellen UTC-Kalendermonat. Auch noch nicht vollständig qualifizierte Anrufe können enthalten sein.
- **Umsatzpotenzial · geschätzt:** qualifizierte Leads des Monats × `ESTIMATED_LEAD_VALUE_EUR` (Standard 250 €). Kein tatsächlicher Umsatz oder Nachweis geretteter Verkäufe.
- **Akute Notfälle offen:** eindeutige Anrufe mit offenem Notfallticket oder einer offenen internen Eskalation. Doppelzählung ist ausgeschlossen. Erledigte Tickets schließen ihre Eskalation für die Anzeige.
- **B2B-Anfragen:** Gewerbe/HACCP und Hausverwaltungen des Monats. B2B allein macht aus einem Ticket keinen Notfall.

Die Liste enthält maximal 200 aktuelle Tickets. KPIs und Eskalationen werden unabhängig von dieser Begrenzung berechnet. Ticketzeiten erscheinen in Europe/Berlin, Monatsgrenzen sind explizit UTC.

## Architektur und Schnittstellen

```text
app/                  App Router, Login, geschützte APIs
components/           Dashboard, Ticketdialog, Simulator und Login
config/               Storm-System-Prompt und Provider-Konfigurationsgenerator
lib/voice/            Anbieteradapter und transaktionale Tool-Verarbeitung
lib/                  Authentifizierung, Validierung, Dashboard-Abfragen, Demo-Fixtures
prisma/               SQLite-Schema und versionierte Initialmigration
scripts/              Migration, Admin-Einrichtung, Demo-Seed und Konfigurationsexport
tests/                Vertragstests, Integrationstests und Browserabläufe
```

| Schnittstelle | Zugriff | Verhalten |
| --- | --- | --- |
| `POST /api/auth/login` | Origin-Prüfung | Admin-Anmeldung, fünf Versuche je 15 Minuten |
| `POST /api/auth/logout` | Origin-Prüfung | Sitzung löschen |
| `GET /api/dashboard?mode=demo\|live` | Admin-Sitzung | Kennzahlen, Tickets, Techniker, Eskalationen |
| `PATCH /api/leads/:id` | Admin + Origin | `{mode, status?, technicianId?}`; `OPEN`, `IN_PROGRESS`, `DONE`; `null` hebt Zuweisung auf |
| `GET /api/agent?provider=vapi\|retell` | Admin-Sitzung | System-Prompt und Konfiguration ohne Geheimnisse |
| `POST /api/voice-webhook?provider=vapi\|retell` | Anbieter-Authentifizierung | Echte Tool-Aufrufe und Anrufberichte |
| Derselbe Webhook mit `&mode=demo` | Admin + Origin | Ausschließlich Demo-Daten; keine Anbieter-Geheimnisse im Browser |

### Gemeinsame Agent-Tools

`check_service_area({postal_code})` akzeptiert fünfstellige Strings inklusive führender Nullen. **Jede gültige PLZ liefert `manual_review`**. Es gibt keine automatisch bestätigte Gebietszusage.

`create_lead_ticket({...})` erwartet flache Parameter:

```json
{
  "name": "Julia Schneider",
  "phone": "+49 000 000002",
  "street": "Musterweg 7",
  "postal_code": "61184",
  "city": "Karben",
  "customer_type": "PRIVATE",
  "company": "",
  "pest_type": "WASPS",
  "urgency": "ACUTE",
  "summary": "Vermutetes Wespennest am Rollladenkasten. Rückruf gewünscht.",
  "duration": "Seit drei Tagen",
  "location": "Rollladenkasten",
  "children_or_pets": "Zwei Kinder, ein Hund"
}
```

`customer_type`: `PRIVATE`, `BUSINESS_HACCP`, `PROPERTY_MANAGEMENT`. `pest_type`: `WASPS`, `RODENTS`, `BEDBUGS`, `COCKROACHES`, `PIGEONS`, `BEES`, `HORNETS`, `UNKNOWN`. `urgency`: `EMERGENCY`, `ACUTE`, `STANDARD`. `company`, `duration`, `location`, `children_or_pets` sind optional; unbekannte Angaben bleiben leer. Kein Ticket mit erfundenen Pflichtangaben erstellen.

`trigger_emergency_escalation({reason, phone})` kann auch vor vollständiger Lead-Erfassung ausgeführt werden. Der Alarm wird sofort dauerhaft gespeichert, mit `delivery_status: "not_configured"` beantwortet und im Dashboard angezeigt. **Das bedeutet keine externe Zustellung oder Rufweiterleitung.** Eskalationen ohne vollständiges Ticket bleiben über das Glockensymbol sichtbar.

### Idempotenz und Berichte

Ein Anruf ist durch Anbieter, externe Anruf-ID und Datenmodus eindeutig. Ein Call besitzt höchstens einen Lead und eine Eskalation. Vapi-Tool-Antworten werden nach Tool-ID gespeichert und bei Wiederholungen wiederverwendet. Retell liefert bei Custom Functions keine garantierte Tool-Aufruf-ID; schreibende Tools werden daher je Tool-Name und Anruf dedupliziert. Weitere Aufrufe erstellen keine zweite Anfrage. Wiederholte PLZ-Prüfungen mit korrigierten Angaben sind möglich.

Vapi `status-update`/`end-of-call-report` und Retell `call_started`/`call_ended`/`call_analyzed` ergänzen den Anruf. Leere Berichte löschen kein Transkript. Unbekannte Events werden quittiert, ohne Daten zu erzeugen. Ungültige Tool-Batches werden vor jeglicher Speicherung zurückgewiesen. Fehlerantworten enthalten keine Kundendaten.

### Anbieter in Schritt 2 verbinden

**Vapi:** In `.env` ein zufälliges `VAPI_WEBHOOK_SECRET` mit mindestens 32 Zeichen setzen. Im Anbieter dieselbe Zeichenfolge als Header `x-storm-webhook-secret` an Server-URL und Function-Tools hinterlegen. Die URL lautet `https://IHRE-DOMAIN/api/voice-webhook?provider=vapi`. Ohne Geheimnis antwortet der Live-Endpunkt mit 503, bei ungültigem Header mit 401. Native `message.toolCallList`-Aufrufe erhalten `results` mit zugehörigen `toolCallId`-Werten und serialisiertem Tool-Ergebnis.

**Retell:** `RETELL_API_KEY` nur serverseitig konfigurieren. Die URL `https://IHRE-DOMAIN/api/voice-webhook?provider=retell` wird als Custom-Function-URL und Agent-Webhook eingetragen. Geprüft wird `x-retell-signature` über den offiziellen Retell-SDK gegen den **unveränderten Request-Body**, einschließlich Zeitfenster. Custom Functions senden `{name,args,call:{call_id}}`. Das Ergebnis wird als JSON-Objekt zurückgegeben.

Konfigurationen können auch über die CLI erzeugt werden:

```bash
npm run agent:export -- vapi
npm run agent:export -- retell
```

Der Vapi-Export liefert eine Assistant-Vorlage. Beim Retell-Export gehören `general_prompt`, `begin_message` und `general_tools` zur LLM-Konfiguration; `agent_settings` wird separat auf den Agenten übertragen. Exporte provisionieren keine Anbieterressourcen. Modell, Stimme, Transkriptionssprache, Telefonnummer, Aufnahme-Einstellungen und HTTPS-Erreichbarkeit werden bei echten Testanrufen final geprüft. Die internen Vertrags- und Signaturtests ersetzen keinen Test mit einem verbundenen Telefonie-Anbieter.

## Sicherheit und Betriebsgrenzen

Passwörter werden mit gesalzenem scrypt gehasht. Zufällige Sitzungstokens werden nur als SHA-256-Hash gespeichert; der Browser erhält ein HttpOnly-/SameSite-Strict-Cookie mit acht Stunden Laufzeit. Bei HTTPS ist es `Secure`. Produktion außerhalb von localhost erfordert eine HTTPS-`APP_URL`. Login-Versuche werden persistent und global begrenzt, damit wechselnde Benutzernamen und gefälschte Proxy-Header die Sperre nicht umgehen. Eine erfolgreiche Anmeldung setzt den Fehlversuchszähler zurück.

Jede interne API prüft die Sitzung unabhängig vom Frontend. Schreibende Browseranfragen und Demo-Webhooks prüfen zusätzlich `Origin` gegen `APP_URL`. Live-Webhooks vertrauen keiner Browser-Sitzung und verlangen ihre Anbieter-Authentifizierung. Maximal 256 KiB JSON pro Anfrage. Secrets bleiben serverseitig; `.env` und Datenbankdateien sind ignoriert.

SQLite ist für einen einzelnen Node-Prozess und ein dauerhaftes lokales Volume vorgesehen; kein Einsatz auf flüchtigem Serverless-Dateisystem und keine horizontale Skalierung ohne Datenbankwechsel. Vor einem öffentlichen Produktivbetrieb sind tatsächliche Mitarbeiter/Techniker, verifizierte Gebiete, Benachrichtigungskanal, Backups, Aufbewahrungs-/Löschfristen und Datenschutzvereinbarungen mit den Voice-Anbietern festzulegen. Das ist ein geschütztes MVP-Grundgerüst, keine bereits aktivierte Telefonzentrale. Der aktuelle Admin ist ein gemeinsames lokales Konto, ohne MFA oder Mitarbeiterrollen.

Audioaufnahmen werden nicht gestartet oder aus Webhooks importiert. `recordingUrl` ist für eine spätere, ausdrücklich konfigurierte Integration reserviert; die Oberfläche zeigt einen deaktivierten Audio-Platzhalter. Transkripte werden gespeichert, wenn ein authentifizierter Anbieter sie liefert; Aufzeichnung, Information/Einwilligung und Rechtsgrundlage sind vor echten Gesprächen separat einzurichten. Der Prompt allein ersetzt keine Anbieter-Einstellungen.

Der Prompt nennt keine garantierten Einsatzzeiten oder Preise, empfiehlt keine eigene Nestentfernung und stellt Artenschutzprüfung/Umsiedlung bei Bienen und Hornissen heraus. Bei erkennbarer Lebensgefahr verweist er auf 112. Foto-Link-Versand wird erst nach tatsächlicher Integration angeboten.

## Tests

```bash
npm run typecheck
npm test
npm run build
```

Die Integrationstests legen eine isolierte temporäre SQLite-Datei an, migrieren sie und entfernen sie anschließend. Geprüft werden beide Provider, Retry-Deduplizierung, PLZ-Validierung, Datentrennung, Notfälle ohne Lead, Transkriptberichte, Login/Sitzung/Ablauf/Abmeldung, CSRF, Ratenbegrenzung, Payload-Limits sowie Ticketzuweisung und Erledigung. Auch gültige, veränderte und veraltete Retell-Signaturen werden geprüft.

Browsertests verwenden einen separaten lokalen Server auf Port 3100, eine temporäre Datenbank und ausschließlich ein Testkonto. Sie verändern die normale Datenbank nicht.

```bash
npx playwright install chromium
npm run test:e2e
```

Alternativ vorhandenes Chromium verwenden, wie in dieser Umgebung:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

## Design und Firmenkontext

Die Ticketübersicht orientiert sich an der Struktur der [Zendesk-Referenz auf Mobbin](https://mobbin.com/screens/6d092d6c-e458-4351-9bf5-d88a8d095750): Navigation, Kennzahlen und gut scanbare Tickets. Keine fremden Screenshots oder Markenassets werden in die Anwendung eingebettet.

Firmenkontext: [storm.gmbh](https://storm.gmbh/) nennt Karben/Großraum Frankfurt und Bürozeiten Montag bis Freitag 7:00–16:30. Daraus wird weder eine verbindliche PLZ-Liste noch eine 24/7-Technikerverfügbarkeit abgeleitet. Die Farbgestaltung ist eine eigenständige Blau-Grün-Adaption, keine behauptete offizielle CI-Freigabe.

Nächster Schritt: **A** Telefonie (Vapi/Retell + ElevenLabs), **B** Benachrichtigungen mit Foto-Link oder **C** verbindliche Storm-Prompt-/Gebietskonfiguration.
