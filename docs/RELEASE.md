# Storm Voice Hub 3: Release und Telefonie

Diese Anleitung beschreibt den aktuellen Code. Die beiden vom Auftraggeber bereitgestellten PDFs bleiben unverändert unter `docs/` archiviert. Frühere Dokumente beschreiben teilweise den vorherigen MVP-Stand; für Umgebungsvariablen, Telefonie und Release gilt dieses Dokument.

## Was implementiert ist

- Hub in weichem Schiefergrau oder heller Ansicht mit Monitor, Outlook-Center, Mitarbeiter-/Routing-Matrix, Simulator, Kunden und Agent-Konfiguration ohne Seitenwechsel. Hell/Dunkel oben rechts umschalten; die Auswahl wird lokal im Browser gespeichert.
- Native Vapi-/Retell-Tools für Kundenlookup, Routing, Outlook-Abschluss und Mitarbeiter-Übernahme.
- Gewählter Telefonie-Hauptpfad: **Twilio Programmable Voice + Retell Custom Telephony über SIP**.
- Signierte Twilio-Callbacks, SIP-Registrierung mit Caller-ID und Metadaten, Wartekonferenz, Mitarbeiter-Zusammenfassung, Annahme mit Taste 1 und bestätigter Konferenzbeitritt.
- Gesprächsberichte, Dauer, Status, Transkript und vom Anbieter gelieferte Aufnahme-Referenzen. Mehrere KI-Gesprächsabschnitte nach einem Rückfall werden separat gespeichert und zusammengeführt.
- SQLite lokal und ein separates, vollständiges PostgreSQL-Schema samt Initialmigration für neue Serverinstallationen.
- Tatsächliche Microsoft-Graph-Implementierung mit Client Credentials und sichtbarem Mock-Fallback. Interne Tests ersetzen keine Prüfung mit den produktiven Anbieter-Konten.

## Lokal starten

Voraussetzungen: Node.js 24 LTS, npm und Zugriff auf npm/Prisma-Binaries beim Installieren.

```bash
cd /workspace/storm-voice
npm ci
cp .env.example .env
npm run db:migrate
npm run admin:create
npm run db:seed
npm run dev
```

Vorhandene `.env` nicht überschreiben. Bereits angelegte Admin-Konten bleiben erhalten; `admin:create` ist nur für die Ersteinrichtung. Danach `http://localhost:3000` öffnen. Es gibt kein voreingestelltes Admin-Passwort. Im vorbereiteten Workspace reichen gegebenenfalls Admin-Einrichtung und `npm run dev`.

Im Simulator bleiben alle Outlook-Aktionen und Kundenkontakte unter `mode=demo`. Er liefert ein echtes NDJSON-Fortschrittsprotokoll über `/api/smart/simulate?stream=1`. Der Monitor zeigt gespeicherte Ereignisse und aktualisiert sich alle zwei Sekunden.

## Microsoft 365: Auto-/Mock-Modus

```dotenv
MOCK_MODE=auto
MICROSOFT_TENANT_ID=...
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
```

- `auto`: Solange mindestens ein Schlüssel fehlt, werden neue Outlook-Aktionen lokal simuliert. Sobald alle drei Werte vorhanden sind, arbeitet die **Echtdatenansicht** mit Microsoft Graph.
- `true`: Erzwingt lokale Outlook-Simulation auch bei vorhandenen Schlüsseln.
- `false`: Erzwingt echte Microsoft-Aufrufe; unvollständige oder ungültige Zugangsdaten führen zu Fehlern statt einem vorgetäuschten Erfolg.
- Demo-Szenarien und Browser-Sprachtests bleiben für Outlook immer lokal, auch wenn Microsoft-Schlüssel vorhanden sind.

Die früheren Namen `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` und `MICROSOFT_GRAPH_MOCK_MODE` bleiben als Fallback unterstützt. Die neuen Variablen haben Vorrang. Nach Änderungen den Server neu starten. Bereits angelegte simulierte Aktionen werden nicht nachträglich automatisch in echte Postfächer übertragen. Bereits als echt gestartete Aktionen bleiben bei fehlenden Schlüsseln fehlgeschlagen und werden nicht still als simuliert bestätigt.

Die Entra-App benötigt Application Permissions `Calendars.ReadWrite`, `Mail.ReadWrite`, `Mail.Send` und Administratorzustimmung. Den Postfachzugriff mit Exchange Application RBAC auf die benötigten Mitarbeiterpostfächer begrenzen. Das System verwendet `calendarView`, weil der App-Only-Ablauf keine delegierte Benutzeranmeldung voraussetzt.

Öffentliche Servicefunktionen in `lib/microsoft-graph.ts`:

```ts
getEmployeeCalendarSlots(upn, { mode: 'live' })
createOutlookCalendarEvent(upn, { subject, bodyText, start, end, transactionId })
createOutlookDraftMessage(upn, { subject, bodyText, to, operationId })
sendOutlookEmail(upn, { subject, bodyText, to, operationId, draftId })
```

Die Workflow-Schicht speichert zugehörige lokale Aktionsdatensätze, Status und externe IDs. Kalendertermine verwenden einen stabilen `transactionId`; E-Mail-Entwürfe einen Extended-Property-Schlüssel und Immutable IDs. Bei unklarer vorheriger Entwurfsanlage wird kein zweiter Entwurf blind erzeugt. Versand-Annahme durch Microsoft ist kein Zustellnachweis. Antwortentwürfe bleiben ungesendet zur menschlichen Prüfung; nur die Eingangsbestätigung wird automatisch übermittelt.

Unvollständige Abläufe erscheinen als `PARTIAL`. Die Disposition kann über „Outlook-Aktionen erneut abgleichen“ vorhandene Aktionsdatensätze fortsetzen. Unklare Versand-/Anlagezustände verlangen gegebenenfalls eine manuelle Prüfung im Postfach. Bereits bestätigte Aktionen werden wiederverwendet.

## Echte Mitarbeiter anlegen

```bash
cp deploy/employees.example.json /tmp/storm-employees.json
# Namen, UPNs, Direktwahlen, Gebiete und Rollen mit tatsächlichen Firmendaten ersetzen.
npm run employees:import -- /tmp/storm-employees.json
```

Beispiel-Postfächer werden vom Import abgelehnt. Der Import schreibt ausschließlich `mode=live`, setzt vorhandene Mitarbeiter anhand ihres UPNs fort und startet keine Anrufe oder Microsoft-Aktionen. Die manuell gepflegte Verfügbarkeit beginnt standardmäßig als `OFFLINE` und kann in der Routing-Matrix geändert werden. Kalenderfreiheit und diese Verfügbarkeit sind keine verifizierte Teams-Präsenz.

Leere PLZ-Listen bedeuten alle konfigurierten Gebiete der jeweiligen Rolle, keine geografische Zusage für beliebige reale Adressen. Verbindliche Zuständigkeiten müssen mit Storm gepflegt werden. Bei fehlender Zuständigkeit wird manuell disponiert.

## Twilio + Retell verbinden

### Variablen

```dotenv
APP_URL=https://voice.ihre-domain.de
VOICE_PROVIDER=retell
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+4960...
RETELL_API_KEY=key_...
RETELL_AGENT_ID=agent_...
EMERGENCY_TECHNICIAN_PHONE=+4917...
STORE_CALL_RECORDINGS=true
```

`APP_URL` muss der tatsächlich von Twilio aufgerufenen öffentlichen HTTPS-Adresse entsprechen. Signaturen werden gegen diese kanonische URL inklusive Query geprüft; zufällige Proxy-/Host-Header ersetzen sie nicht. Nur das konfigurierte Twilio-Konto und die konfigurierte Eingangsnummer werden akzeptiert.

### Rufnummer mit einer Zeile verknüpfen

Nach Hinterlegen der Variablen:

```bash
npm run telephony:link
```

Das Skript sucht die konfigurierte eigene Rufnummer im angegebenen Twilio-Konto und setzt:

- Voice URL: `https://IHRE-DOMAIN/api/voice/telephony-incoming`, Methode POST.
- Status Callback: `https://IHRE-DOMAIN/api/voice/call-ended`, Methode POST.

Das Skript ändert eine echte Rufnummer und ist bewusst ein expliziter Einrichtungsschritt. Es wurde ohne echte Zugangsdaten nicht ausgeführt.

### Retell-Agent konfigurieren

Im Hub unter „KI-Assistent“ die Retell-Konfiguration exportieren. Prompt und `general_tools` in die LLM-Konfiguration übernehmen; `agent_settings.webhook_url` separat am Agenten setzen. Modell, Stimme und Sprache im Retell-Konto konfigurieren. Die drei Geschäfts-Tools gehen an `/api/voice/webhook?provider=retell`, das Transfer-Tool an `/api/voice/transfer?provider=retell`. Beide verlangen eine gültige `x-retell-signature` des unveränderten JSON-Bodys. Die Agent-Webhook-URL nimmt auch `call_started`, `call_ended` und `call_analyzed` an. Alternativ kann ein separater Berichtskanal auf `/api/voice/call-ended?provider=retell` zeigen.

### Eingehender Anruf

1. Twilio sendet signierte Formulardaten an `telephony-incoming`.
2. Ein lokaler Anruf wird idempotent anhand der Twilio `CallSid` gespeichert. Caller-ID unterstützt den Kundenlookup, ersetzt aber keine Identitätsbestätigung.
3. Der Server registriert den Retell-Anruf mit `from_number`, `to_number`, `customer_phone`, lokalem Ticket und Twilio-Metadaten.
4. TwiML verbindet den Kunden per `<Dial><Sip>` mit `sip:{retell_call_id}@sip.retellai.com`. Eine HTTP-Webhook-URL ist kein Audioziel.
5. Retell ruft die Geschäfts-Tools auf. Der Provider-Call wird über eine gespeicherte Voice-Leg-Zuordnung mit dem ursprünglichen Ticket verbunden.
6. Fehler beim Registrieren oder beim SIP-Dial werden sichtbar erfasst; es wird kein erfolgreiches Gespräch behauptet.

Retell Custom Telephony über Dial-to-SIP bietet keinen automatischen Carrier-Transfer. Deshalb steuert dieses Projekt die eigene Twilio-Konferenz.

### Mitarbeiter-Übernahme

Der Agent ruft `transfer_to_employee({reason, caller_confirmed:true})` erst nach Zustimmung und für einen dringenden, zugeordneten Fall auf. Der Server akzeptiert keine frei vom Anrufer vorgegebene Zielrufnummer. Er verwendet die gespeicherte Direktwahl des verfügbaren zuständigen Mitarbeiters; `EMERGENCY_TECHNICIAN_PHONE` ist nur der serverseitige Fallback, wenn diese fehlt.

- Kundenanruf wird über die Twilio REST API in eine Wartekonferenz gesetzt.
- Twilio ruft den Mitarbeiter mit der eigenen konfigurierten Rufnummer an.
- Mitarbeiter hört eine Zusammenfassung und drückt **1** zur Annahme.
- Erst ein signiertes `participant-join`-Ereignis des Mitarbeiter-CallSids bestätigt `CONNECTED`.
- Klingeln, Voicemail und bloße HTTP-Annahme zählen nicht als erfolgreiche Verbindung.
- Bei Nichtannahme wird der Kunde nach Möglichkeit erneut mit Retell verbunden, mit `transfer_failed=true` und demselben lokalen Ticket. Der Agent vereinbart dann einen Rückruf.
- Wiederholte Tool-/Callback-Zustellungen lösen keinen zweiten Mitarbeiteranruf aus. Hängt der Kunde auf, wird ein noch ausstehender Mitarbeiteranruf nach Möglichkeit beendet.

Als periodischen Abgleich für ausgebliebene Status-Callbacks mindestens minütlich ausführen, mit derselben Serverumgebung:

```bash
npm run telephony:reconcile
```

Der Abgleich behandelt nicht bestätigte Übernahmen nach 90 Sekunden. Er ersetzt kein externes Monitoring für Provider-Ausfälle. Die implementierte Übernahme hat eine automatisierte Zusammenfassung und Mitarbeiter-Annahme; es ist kein zusätzliches privates, bidirektionales KI-Beratungsgespräch mit dem Techniker.

## Vapi und sipgate als Alternativen

Vapi Function Calling bleibt über `/api/voice/webhook?provider=vapi` mit einem mindestens 32 Zeichen langen `VAPI_WEBHOOK_SECRET` und Header `x-storm-webhook-secret` nutzbar. Der optionale Twilio-SIP-Bridge-Modus nutzt `VOICE_PROVIDER=vapi` und eine im Vapi-Konto eingerichtete `VAPI_SIP_URI`. Native Vapi-Telefonnummern können ebenfalls die Geschäfts-Webhooks ansprechen. Für Carrier-Transfers muss eine verifizierte Carrier-Zuordnung vorhanden sein; ohne Zuordnung verweigert der Server einen PSTN-Transfer. Der vollständig implementierte und durch interne Vertragstests abgedeckte Hauptpfad dieses Releases ist Twilio + Retell.

sipgate kann als alternativer Carrier über ein geeignetes SIP-Trunk-/BYOC-Produkt direkt mit Retell/Vapi verbunden werden. Dafür sind Routing, SIP-Zugang und der jeweilige Provider-native Transfer im Anbieter einzurichten. Die Twilio-Webhooks und Twilio-Konferenzen dürfen nicht als sipgate-Callbacks konfiguriert werden. Ein eigener sipgate-REST-Transferadapter gehört nicht zum gewählten Twilio-Hauptpfad.

## Echter Browser-Sprachtest

Im Simulator ist ein echter Retell-Sprachtest vorhanden. Der Button wird erst bei `RETELL_API_KEY` und `RETELL_AGENT_ID` aktiv. Ein Klick und Mikrofonfreigabe starten einen WebRTC-Anruf; es wird keine PSTN-Nummer gewählt. Der API-Schlüssel bleibt serverseitig. Das Retell-Browser-SDK erhält nur ein kurzlebiges Call-Token über einen angemeldeten, gegen CSRF geschützten Server-Endpunkt.

Jeder Browser-Test wird vor der Audioverbindung in der Datenbank dem Demo-Modus zugeordnet. Geschäfts-Webhooks für diese bekannte Call-ID bleiben dadurch für Outlook simuliert. Retell-/Audioverarbeitung ist dennoch ein echter kostenpflichtiger Anbieteraufruf. Maximal zehn Starts pro Admin und 15 Minuten. Der Test verlangt HTTPS oder localhost. Stoppen beendet den Anbieteranruf; bei unbestätigtem Ende wird lokal getrennt und ein Fehler angezeigt.

## Transkripte und Aufnahmen

Der Provider liefert Gesprächsberichte an den signaturgeschützten Endpunkt. Final analysierte Berichte haben Vorrang vor später eintreffenden vorläufigen Berichten. Ein Ende des KI-SIP-Abschnitts beendet nicht automatisch das noch laufende Kunden-/Mitarbeitergespräch; dessen endgültige Dauer und Status kommen aus Twilios Carrier-Callback.

`STORE_CALL_RECORDINGS=true` speichert ausschließlich eine vom authentifizierten Anbieter gelieferte HTTPS-Aufnahme-URL. Der Code startet keine Aufzeichnung. Bei `false` wird keine neue Aufnahme-Referenz übernommen. Die Oberfläche zeigt einen Audio-Player nur bei vorhandener URL; geschützte oder abgelaufene Provider-URLs können eine zusätzliche Anbieterfreigabe erfordern. Die Referenz ersetzt keinen dauerhaften Medienspeicher und belegt nicht, dass auch das Mitarbeitergespräch aufgezeichnet wurde. Aufzeichnung, Ansagen, Datenschutzvereinbarungen und Löschfristen müssen vor echten Kundengesprächen im Telefonie-/Voice-Anbieter und betrieblich eingerichtet sein.

## Server-Release mit PostgreSQL

Für eine neue PostgreSQL-Datenbank, zum Beispiel auf einem Server oder bei einem verwalteten Anbieter:

```bash
npm ci
cp .env.production.example .env
# DATABASE_URL, öffentliche APP_URL und Anbieter-Zugangsdaten eintragen.
npm run db:postgres:generate
npm run db:postgres:migrate
npm run admin:create
npm run employees:import -- /pfad/storm-employees.json
npm run build
npm start
```

Die PostgreSQL-Initialmigration ist für eine **neue, leere** Datenbank. Bereits verwendete SQLite-Daten werden nicht automatisch übertragen. `prisma/schema.prisma` bleibt das SQLite-Entwicklungsschema, `prisma/postgresql/schema.prisma` der PostgreSQL-Release-Pfad. Nicht mit SQLite-Migrationen auf PostgreSQL arbeiten. Nach Schemaänderungen beide Migrationspfade gepflegt fortschreiben; `db:postgres:sync` aktualisiert nur die Schema-Kopie und erzeugt keine neue produktive Migration.

`npm ci` erzeugt standardmäßig den SQLite-Client, daher vor einem PostgreSQL-Build ausdrücklich `db:postgres:generate` ausführen. Vor SQLite-Tests zurück auf `npm run db:generate` wechseln. Der generierte Prisma-Client wird nicht eingecheckt.

Für einen Linux-Server sind eine Systemd-Vorlage unter `deploy/storm.service` und ein Caddy-Reverse-Proxy unter `deploy/Caddyfile` enthalten. Projektverzeichnis, Node-/npm-Pfad, Systembenutzer und EnvironmentFile an den Server anpassen; `APP_URL` bleibt die öffentliche HTTPS-Adresse. Der Node-Port gehört hinter den Reverse-Proxy. Umgebungsdateien nur für den Dienstbenutzer lesbar halten. Unter `/api/health` kann ein externer Monitor Datenbank-Erreichbarkeit prüfen.

Die private ChatGPT-Sites-Klick-Demo ist eine getrennte browserlokale Vorschau mit fiktiven Daten. Sie hostet nicht das Node-/PostgreSQL-Backend und verwendet keine echten Anbieter-Schlüssel.

## Verifikation und Abnahme

```bash
npm run db:generate
npm run typecheck
npm test
npm run build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npm run test:e2e
```

Auf anderen Rechnern zuerst `npx playwright install chromium`, dann `npm run test:e2e` ohne den systemabhängigen Executable-Pfad.

Intern geprüft werden Signaturen, Call-ID-Zuordnung, Lookup, Routing, Retry-Verhalten, Kalenderkonflikte, Entwurfs-/Versandstatus, Transfer-Annahme, Nichtannahme, Gesprächsberichte, Datenmodi und Browserabläufe. Die Tests verwenden isolierte temporäre SQLite-Datenbanken und simulierte Providerantworten. Die PostgreSQL-17-Initialmigration, Beziehungen, JSON-Felder, Transaktionen und Anruf-/Outlook-Datenspeicherung wurden zusätzlich in einem temporären Docker-Container geprüft. Der Test ist mit `npm run test:postgres` reproduzierbar (Docker und Python 3 erforderlich). Anbieter-live und die konkrete Serverinstallation bleiben separat zu prüfen.

Für die echte Freigabe mit den vorgesehenen Konten durchführen: eingehender Testanruf; erkannter Bestandskunde; Outlook-Kalendertermin; Entwurf; Eingangsbestätigung; Mitarbeiter nimmt an; Mitarbeiter nimmt nicht an; Kunde legt während des Wartens auf; verspäteter/doppelter Callback; verifizierte Ansagen/Aufnahme-Einstellungen. Ohne Rufnummer, Zugangsdaten, Mitarbeiterpostfächer und reale Testanrufe gibt es keine ehrliche Aussage, dass die komplette Produktionstelefonie bereits freigeschaltet oder live abgenommen ist.

## Primärquellen

- [Retell: eigene Rufnummer und Dial-to-SIP](https://www.retellai.com/learn/how-to-keep-your-existing-phone-number-using-a-sip-connection)
- [Retell: Register Phone Call](https://docs.retellai.com/api-references/register-phone-call)
- [Retell: Browser-Web-Calls](https://docs.retellai.com/deploy/web-call)
- [Twilio: Webhook-Signaturen](https://www.twilio.com/docs/usage/security)
- [Twilio: Conference](https://www.twilio.com/docs/voice/twiml/conference)
- [Microsoft: App-Only Authentifizierung](https://learn.microsoft.com/en-us/graph/auth-v2-service)
- [Mobbin: Linear-Designreferenz](https://mobbin.com/screens/267d16a1-982b-4479-85b5-22294fdab01a)
