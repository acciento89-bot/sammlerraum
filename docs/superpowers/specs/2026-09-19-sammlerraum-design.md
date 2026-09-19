# Sammlerraum.de – Produkt- und Systemdesign

**Status:** zur Freigabe  
**Datum:** 19.09.2026  
**Repository:** `acciento89-bot/sammlerraum`  
**Zieldomain:** `sammlerraum.de`

---

## 1. Zielbild

Sammlerraum.de ist eine universelle Plattform zur digitalen Verwaltung physischer und digitaler Sammlungen.

Der Kern ist ein vollständig nutzbarer privater Sammlungsmanager. Darauf bauen optional öffentliche Community-Funktionen, ein globaler Referenzkatalog, Marktpreis- und Analysefunktionen sowie später ein echter Handelsbereich auf.

Sammlerraum richtet sich nicht nur an eine einzelne Sammler-Nische. Die Plattform muss gleichermaßen für kleine private Sammlungen und umfangreiche Bestände funktionieren, z. B.:

- Trading Cards;
- Münzen;
- Briefmarken;
- Uhren;
- Comics;
- Figuren;
- Modellautos;
- Vinyl;
- Sneaker;
- Bücher;
- Spiele;
- Kunst;
- frei definierte Sammlungsarten.

Die Plattform soll dabei nicht wie eine generische Inventar-App wirken. Typische Sammlerbereiche erhalten fachlich passende Kategorie-Vorlagen, Zustandsmodelle und spezielle Metadaten.

---

## 2. Verbindlicher V1-Umfang

Version 1 wird nicht als künstlich reduziertes MVP veröffentlicht.

V1 umfasst den vollständigen vereinbarten Kern:

- Accounts mit E-Mail/Passwort, Apple, Google und Passkeys;
- öffentliche Profile;
- private, öffentliche und nicht gelistete Sammlungen;
- mehrere Sammlungen pro Account;
- hierarchische Teil-Sammlungen;
- gemeinsame Sammlungen mit Rollen;
- universelles Sammlerstück-Modell;
- Kategorie-Vorlagen;
- Tags und benutzerdefinierte Felder;
- manuelle Erfassung;
- EAN/UPC/ISBN- bzw. Code-Erkennung;
- AI-gestützte Fotoerkennung als Vorschlagssystem;
- Bildergalerien;
- private Dokumente und Nachweise;
- Kauf- und Erwerbsdaten;
- Provenienz;
- Zustandsmodelle;
- externes Grading;
- eigene Bewertungen;
- Wert-Historien;
- mehrere externe Marktpreisquellen;
- Marktpreis-Quellenvergleich;
- Versicherungsmodus;
- Bestandsberichte;
- Wunschlisten;
- Dubletten;
- Tausch-/Verkaufsstatus;
- globale Referenzkataloge;
- Community-gestützte Katalogpflege;
- Folgen;
- Likes/Favoriten;
- Kommentare;
- Melden und Blockieren;
- Moderation;
- Suche und kombinierbare Filter;
- Smart Collections;
- Dashboard und Statistiken;
- CSV-/Excel-Import und -Export;
- Importprofile;
- Lagerorte;
- QR-/Barcode-Labels für Lagerorte;
- In-App- und E-Mail-Benachrichtigungen;
- Freemium/Premium;
- Audit-Log und Wiederherstellung;
- gezielte Freigaben;
- DE/EN;
- responsive Web-App;
- API-Basis für spätere iOS-/Android-Apps;
- Docker-/PostgreSQL-/Portainer-Betrieb;
- Backups und Restore-Prozess.

Ein vollständiger Marktplatz mit Zahlungen zwischen Nutzern gehört **nicht** zu V1. V1 enthält jedoch alle vorbereitenden Daten- und Produktgrenzen für spätere Listings, Tauschangebote und Transaktionen.

---

## 3. Produktprinzipien

### 3.1 Privat zuerst

Sammlerraum muss vollständig sinnvoll nutzbar sein, ohne dass ein Nutzer etwas öffentlich macht.

Öffentliche Sichtbarkeit ist Opt-in.

### 3.2 Nutzer behält Kontrolle

AI, Marktpreise und globale Katalogdaten unterstützen den Nutzer, ersetzen aber nicht seine Kontrolle über persönliche Exemplardaten.

AI-Ausgaben sind Vorschläge.

### 3.3 Referenzdaten und persönliche Daten bleiben getrennt

Ein global bekanntes Objekt ist nicht dasselbe wie das konkrete Exemplar eines Nutzers.

### 3.4 Flexible Fachlichkeit statt unstrukturiertem JSON

Zentrale Daten bleiben typisiert, suchbar und relational.

Flexible Felder werden strukturiert erweitert.

### 3.5 Serverseitige Sicherheit

Sichtbarkeit und Berechtigungen werden im Backend erzwungen.

### 3.6 Architektur für Wachstum, nicht für verfrühte Verteilung

V1 wird als modularer Monolith mit Worker gebaut, nicht als Microservice-Landschaft.

### 3.7 Vollständige V1, interne Etappen

Die Implementierung wird in klar getrennte Bauphasen zerlegt. Veröffentlicht wird erst, wenn der vollständige V1-Umfang integriert und releasefähig ist.

---

## 4. Plattform- und Technologiearchitektur

### 4.1 Architekturtyp

Sammlerraum wird als **modularer Monolith mit separatem Background Worker** umgesetzt.

Eine gemeinsame Codebasis enthält klar getrennte fachliche Module.

Mindestens folgende Module sind vorgesehen:

- Identity & Accounts;
- Collections;
- Catalog;
- Items;
- Media & Documents;
- Valuation;
- Market Data;
- AI;
- Community;
- Collaboration;
- Wishlist & Trading;
- Search;
- Imports & Exports;
- Insurance;
- Notifications;
- Billing;
- Moderation;
- Audit.

### 4.2 Web-Anwendung

Die Web-Anwendung wird mit **Next.js + TypeScript** umgesetzt.

Geschäftslogik liegt nicht ausschließlich in UI-Komponenten.

### 4.3 Datenbank

**PostgreSQL** ist die zentrale relationale Datenbank.

Die Module teilen sich zunächst dieselbe Datenbank, besitzen aber definierte fachliche Grenzen.

### 4.4 Worker

Langlaufende Aufgaben laufen in einem separaten Worker-Prozess.

Dazu gehören insbesondere:

- AI-Fotoanalyse;
- Bildverarbeitung;
- Marktpreisabrufe;
- CSV-/Excel-Importe;
- Exporte;
- PDF-Erzeugung;
- E-Mail-Versand;
- Katalog-Synchronisation;
- Benachrichtigungen;
- Statistiken;
- Wartungsjobs.

### 4.5 Job-Queue

V1 nutzt eine **PostgreSQL-basierte Queue** hinter einer internen Queue-Schnittstelle.

Eine robuste Bibliothek wie `pg-boss` ist geeignet; die Fachmodule dürfen jedoch nicht direkt von einer konkreten Queue-Bibliothek abhängen.

Unterstützt werden mindestens:

- Retries;
- Prioritäten;
- Zeitplanung;
- Timeouts;
- Fehlerzustände;
- Fortschrittsanzeige;
- Idempotenz;
- Concurrency-Limits.

### 4.6 Self-hosted Betrieb

Produktivbetrieb:

- Docker;
- Docker Compose;
- PostgreSQL;
- persistenter Medien-/Dateispeicher;
- GitHub als Codequelle;
- Portainer für Deployment/Redeploy.

Container bleiben austauschbar. Persistente Daten sind vom Lebenszyklus einzelner Container getrennt.

---

## 5. Datenmodell

### 5.1 Account und Profil

```
User
├── Profile
├── AuthIdentity
├── Passkey
├── Subscription
└── NotificationPreference
```

Authentifizierungsidentität und öffentliches Profil sind getrennte Konzepte.

Die Login-E-Mail wird nicht automatisch öffentlich.

### 5.2 Sammlungen

```
Collection
├── CollectionMember
├── CollectionNode
├── CustomFieldDefinition
├── StorageLocation
└── SmartCollection
```

`CollectionNode` bildet die echte Hierarchie ab.

`SmartCollection` ist eine gespeicherte Abfrage und dupliziert keine Stücke.

### 5.3 Globaler Katalog

```
CatalogEntry
├── CatalogVariant
├── CatalogAttribute
├── ExternalIdentifier
└── CatalogRevision
```

Globale Katalogdaten enthalten keine persönlichen Besitz-, Kauf-, Lager- oder Versicherungsdaten.

### 5.4 Persönliches Exemplar

```
CollectibleItem
├── collectionId
├── collectionNodeId
├── catalogEntryId?
├── catalogVariantId?
├── title
├── description
├── privateNotes
├── quantity
├── acquisitionType
├── condition
├── visibility
├── tradeStatus
├── ItemIdentifier[]
├── Grading[]
├── Tag[]
├── CustomFieldValue[]
├── MediaLink[]
├── DocumentLink[]
├── ProvenanceEntry[]
├── Purchase/Acquisition
├── Valuation[]
├── InsuranceData?
├── storageLocationId?
└── audit/history
```

### 5.5 Menge und Einzelobjekte

Beide Modelle werden unterstützt.

Ein Mengenobjekt ist geeignet, wenn Exemplare fachlich austauschbar sind.

Unterschiedliche Seriennummern, Zustände, Gradings, Kaufpreise oder Provenienzen werden als separate Exemplare geführt.

Ein Mengenobjekt kann später in Einzelobjekte aufgeteilt werden.

### 5.6 Identifikatoren

Mehrere Kennungen pro Stück werden über strukturierte `ItemIdentifier`-Einträge abgebildet.

Beispiele:

- Seriennummer;
- Zertifikatsnummer;
- EAN;
- UPC;
- ISBN;
- Katalognummer;
- Herstellerreferenz;
- interne Kennung.

### 5.7 Flexible Felder

Kategorie-Vorlagen liefern vordefinierte Felder.

Zusätzlich können Nutzer eigene Felder pro Sammlung definieren.

Mindestens unterstützte Typen:

- kurzer Text;
- langer Text;
- Zahl;
- Dezimalzahl;
- Datum;
- Boolean;
- Auswahl;
- Mehrfachauswahl;
- URL;
- Geldwert.

---

## 6. Sichtbarkeit und Freigaben

### 6.1 Sichtbarkeitsstufen

- **Privat**
- **Öffentlich**
- **Nicht gelistet**

Diese Stufen gelten für Sammlungen, Unter-Sammlungen und einzelne Stücke.

### 6.2 Vererbung

Untergeordnete Inhalte erben standardmäßig die übergeordnete Sichtbarkeit.

Ein Kindobjekt darf restriktiver sein.

Eine private Oberstruktur darf nicht versehentlich durch ein öffentlich markiertes Unterobjekt nach außen geöffnet werden.

### 6.3 Freigabelinks

Zusätzlich zur Grundsichtbarkeit gibt es gezielte Freigaben.

Eine Freigabe kann enthalten:

- Ablaufdatum;
- Widerruf;
- Passwort/PIN;
- Nur-Lesen;
- Bilder ein/aus;
- Werte ein/aus;
- ausgewählte Dokumente;
- Download/Export ein/aus.

Sensible Felder wie private Notizen und Lagerorte bleiben standardmäßig ausgeschlossen.

### 6.4 Personenbezogene Freigabe

Ein registrierter Nutzer kann Leserechte erhalten, ohne Mitglied der Sammlung zu werden.

`CollectionMember` und `CollectionShare` bleiben getrennt.

---

## 7. Zusammenarbeit und Rollen

Gemeinsame Sammlungen besitzen genau einen Owner.

Rollen:

- **Owner**
- **Admin**
- **Editor**
- **Viewer**

Berechtigungen werden serverseitig geprüft.

Einladungen sind zeitlich begrenzbar und widerrufbar.

Rollen betreffen unter anderem:

- Bearbeitung;
- Mitglieder;
- Sichtbarkeit;
- Medien;
- Dokumente;
- Werte;
- Import/Export;
- Billing;
- Moderation innerhalb gemeinsamer Sammlungen.

---

## 8. Authentifizierung

Unterstützte Login-Methoden:

- E-Mail + Passwort;
- Sign in with Apple;
- Google Login;
- Passkeys/WebAuthn.

Mehrere Login-Methoden können sicher mit einem Account verknüpft werden.

Account-Zusammenführung erfolgt nicht blind anhand identischer E-Mail-Adressen.

Vorgesehen sind:

- E-Mail-Verifizierung;
- Passwort-Reset;
- Passkey-Verwaltung;
- Verwaltung verbundener Anbieter;
- aktive Sitzungen;
- Sitzungswiderruf;
- Rate Limits;
- Schutz gegen Brute Force und Credential Stuffing.

Mindestens ein verifizierter Wiederherstellungsweg bleibt erforderlich.

---

## 9. API und Service-Schicht

### 9.1 Versionierte REST-API

Beispiel:

```
/api/v1/auth/...
/api/v1/collections/...
/api/v1/items/...
/api/v1/catalog/...
/api/v1/community/...
/api/v1/valuations/...
/api/v1/imports/...
/api/v1/notifications/...
```

GraphQL ist für V1 nicht vorgesehen.

### 9.2 Schichten

```
Route / Server Action
        ↓
Validation
        ↓
Authorization
        ↓
Domain Service
        ↓
Repository / Database
```

### 9.3 Policy-Schicht

Mindestens folgende Regeln werden zentral modelliert:

- `canViewItem`;
- `canEditItem`;
- `canDeleteItem`;
- `canViewDocument`;
- `canComment`;
- `canManageMembers`.

Die Policy-Schicht berücksichtigt:

- Rolle;
- Eigentum;
- Hierarchie;
- Sichtbarkeit;
- Blockierungen;
- Moderation;
- Premium;
- Dokumenttyp.

### 9.4 OpenAPI

Die Client-API besitzt eine OpenAPI-Spezifikation oder wird aus verbindlichen Schemas generiert.

Diese bildet später die Basis für Swift-/Kotlin-Clients.

### 9.5 Fehlerformat

Einheitliches Fehlerformat:

```json
{
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "...",
    "requestId": "..."
  }
}
```

Interne Stacktraces oder Datenbankdetails werden nicht an Clients ausgegeben.

---

## 10. Medien und Dokumente

### 10.1 Storage-Abstraktion

```
MediaService
    ↓
StorageProvider
    ├── LocalPersistentStorage
    └── S3CompatibleStorage
```

V1 verwendet persistenten lokalen Storage.

### 10.2 Geschützte Auslieferung

Private Dateien werden über autorisierte Endpunkte ausgeliefert, nicht über erratbare öffentliche Upload-Pfade.

### 10.3 Bildvarianten

Originale bleiben erhalten.

Der Worker erzeugt mindestens:

- Thumbnail;
- Medium;
- Large.

### 10.4 Upload-Sicherheit

Mindestens:

- echte Dateitypprüfung;
- MIME-/Magic-Byte-Prüfung;
- Größenlimits;
- Pixel-/Megapixel-Limits;
- Bild-Decoding;
- Entfernung unnötiger EXIF-Daten;
- keine Ausführung hochgeladener Inhalte.

### 10.5 Dokumenttypen

Strukturierte Typen:

- Kaufbeleg;
- Rechnung;
- Echtheitszertifikat;
- Grading-Nachweis;
- Gutachten;
- Versicherungsunterlage;
- Provenienz;
- Garantie;
- sonstiges privates Dokument.

Sensible Dokumente sind standardmäßig privat.

---

## 11. Erfassung

Sammlerstücke können auf drei Wegen angelegt werden:

1. manuell;
2. über Barcode/EAN/UPC/ISBN oder andere strukturierte Kennungen;
3. über AI-gestützte Fotoanalyse.

AI kann Vorschläge liefern für:

- Kategorie;
- Hersteller;
- Set/Serie;
- Jahr;
- erkennbare Kennungen;
- weitere Metadaten.

Nicht automatisch als gesicherte Tatsache übernommen werden:

- Echtheit;
- Marktwert;
- Seltenheit;
- Grading;
- Zustand;
- Provenienz;
- unklare Editionen/Varianten.

Der Nutzer bestätigt oder korrigiert relevante Vorschläge.

---

## 12. AI-Architektur

AI wird über eine eigene Provider-Schnittstelle angebunden.

Gekapselt werden:

- Provider;
- Modell;
- Request-Aufbau;
- strukturierte Antwortschemas;
- Timeouts;
- Retries;
- Rate Limits;
- Nutzung/Kosten;
- Fehlerbehandlung.

Der konkrete produktive Provider ist austauschbar.

Private Inhalte werden nur für die vom Nutzer ausgelöste Funktion verarbeitet.

Datenminimierung ist Pflicht.

---

## 13. Katalog

### 13.1 Referenzobjekte

Ein globaler Katalogeintrag beschreibt ein allgemeines Objekt oder eine definierte Variante.

### 13.2 Community-Pflege

Nutzer können vorschlagen:

- neue Einträge;
- Varianten;
- Korrekturen;
- Referenznummern;
- Übersetzungen;
- Quellen.

### 13.3 Moderation

Globale Stammdaten werden nicht ungeprüft überschrieben.

Es gibt:

- Vorschlagsstatus;
- Annahme/Ablehnung;
- Quellen;
- Versionshistorie;
- Rücknahme fehlerhafter Änderungen;
- Spam-/Vandalismusschutz.

---

## 14. Zustand und Grading

Zustandsmodelle sind kategorieabhängig.

Beispiele:

- Trading Cards: Mint, Near Mint, Excellent, Good, Played, Poor;
- Vinyl: M, NM, VG+, VG, G, F, P;
- Uhren: ungetragen bis restaurierungsbedürftig;
- Münzen: numismatisch passendes Schema.

Zustand und externes Grading bleiben getrennt.

```
Grading
├── provider
├── grade
├── certificateNo
├── gradedAt
└── verificationUrl
```

Eine grobe interne Qualitätsnormalisierung darf für Statistik und Filter verwendet werden, ersetzt aber nie die fachliche Zustandsangabe.

---

## 15. Werte und Marktpreise

### 15.1 Persönliche Werte

- Kaufpreis;
- Kaufdatum;
- Währung;
- eigener Schätzwert;
- Bewertungskommentar.

### 15.2 Historisierung

Neue Bewertungen überschreiben alte Datenpunkte nicht.

### 15.3 Externe Marktpreise

Mehrere Quellen können parallel existieren.

Jeder Datenpunkt enthält mindestens:

- Quelle;
- Zeitpunkt;
- Währung;
- Datentyp;
- Preis oder Preisbereich;
- Bezug auf Referenzobjekt/Variante.

Datentypen wie letzter Verkauf, Median, Angebotspreis und Händlerpreis bleiben unterscheidbar.

### 15.4 Keine erfundene Genauigkeit

Sammlerraum zeigt nicht automatisch einen einzigen angeblich exakten Marktwert, wenn Quellen unterschiedliche Aussagen liefern.

Eine spätere Aggregation muss Methode und Quellen transparent machen.

---

## 16. Suche und Smart Collections

Suche berücksichtigt unter anderem:

- Titel;
- Hersteller;
- Serie/Set;
- Kategorie;
- Tags;
- benutzerdefinierte Felder;
- Seriennummern;
- Zertifikatsnummern;
- Wunschlisten.

Filter können kombiniert werden, z. B.:

- Sammlung;
- Kategorie;
- Zustand;
- Grading;
- Kaufpreis;
- Marktwert;
- Tags;
- Dublette;
- Tauschstatus;
- Sichtbarkeit;
- Bilder vorhanden;
- Dokumente vorhanden;
- Zeitraum.

Smart Collections speichern eine Filterdefinition.

Sie enthalten keine duplizierten Stücke.

---

## 17. Import und Export

Unterstützt werden:

- CSV-Import;
- CSV-Export;
- XLSX-Import;
- XLSX-Export.

Der Import bietet:

- Vorschau;
- Spaltenzuordnung;
- Validierung;
- Dublettenprüfung;
- Konfliktbehandlung;
- wiederverwendbare Importprofile.

Konfliktoptionen:

- neu anlegen;
- überspringen;
- zusammenführen;
- als separates Exemplar importieren.

Importe überschreiben bestehende Daten nicht stillschweigend.

---

## 18. Community

Öffentliche Community-Funktionen:

- öffentliche Profile;
- Folgen;
- Likes/Favoriten;
- Kommentare;
- Feed-Grundlage.

Moderation:

- Nutzer melden;
- Kommentar melden;
- Nutzer blockieren;
- eigene Kommentare löschen;
- Kommentare auf eigenen Inhalten moderieren;
- Kommentare deaktivieren.

Private Inhalte bleiben von Community-Funktionen ausgeschlossen.

---

## 19. Wunschliste, Dubletten und Handelsvorbereitung

V1 unterstützt:

- Wunschliste;
- Dubletten;
- `nicht verfügbar`;
- `tauschbereit`;
- `verkaufsbereit`.

Ein Verkaufsstatus ist kein rechtsverbindliches Verkaufsangebot.

Spätere Handelsobjekte können auf dem Modell ergänzen:

```
CollectibleItem → Listing → Offer → Transaction
```

Ein echter Checkout zwischen Nutzern folgt erst in einer späteren Produktphase.

---

## 20. Lagerorte

Lagerorte sind hierarchisch.

Beispiel:

```
Wohnzimmer
└── Vitrine
    └── Fach 2
```

Lagerorte können eigene QR-/Barcode-Labels besitzen.

Scan-Funktionen:

- Inhalt anzeigen;
- Stück zuordnen;
- Stück verschieben;
- Lagerort öffnen.

Lagerorte sind standardmäßig privat.

---

## 21. Versicherung und Berichte

Optionale Versicherungsdaten:

- versicherter Wert;
- Stichtag;
- Versicherer;
- Policenreferenz;
- Hinweise.

Bestandsberichte unterstützen:

- PDF;
- XLSX;
- CSV.

Ein Bericht kann Bilder, Werte und ausgewählte Nachweise enthalten.

Sensible Daten werden nur auf ausdrückliche Auswahl exportiert.

Sammlerraum ersetzt kein professionelles Gutachten.

---

## 22. Dashboard und Statistiken

Mindestens:

- Stückzahl;
- Sammlungszahl;
- Kaufkosten;
- eigene Schätzwerte;
- externe Marktwerte;
- Wertveränderung;
- Dubletten;
- Wunschliste;
- tausch-/verkaufsbereite Stücke;
- wertvollste Stücke;
- größte Sammlungen;
- Neuzugänge;
- Zustands-/Grading-Verteilung;
- Datenqualitäts-Hinweise;
- persönliche Meilensteine.

Basiskennzahlen bleiben für Free sinnvoll.

Erweiterte historische Analysen können Premium sein.

---

## 23. Benachrichtigungen

V1:

- In-App;
- E-Mail.

Später:

- native Push-Benachrichtigungen.

Der Kern ist kanalunabhängig.

Benachrichtigungen besitzen mindestens:

- Typ;
- gelesen/ungelesen;
- Zeitstempel;
- Ziel-Link.

Nicht sicherheitskritische Kategorien können konfigurierbar sein.

---

## 24. Freemium und Billing

Free bleibt dauerhaft nutzbar.

Free enthält die Kernverwaltung, Basis-Community, Sichtbarkeit, Wunschliste, Dubletten, grundlegende Suche und manuelle Wertpflege.

Premium erweitert insbesondere:

- Umfang großer Sammlungen;
- Bilder/Dokumente;
- AI-Kontingente;
- Marktpreisdaten;
- Wert-Historie;
- erweiterte Analysen;
- Excel;
- Importprofile;
- erweiterte Filter.

Exakte Preis- und Kontingentwerte sind **Produktkonfiguration**, nicht Teil dieser Architekturentscheidung. Das System muss sie zentral konfigurierbar umsetzen.

Das Billing-Modul kapselt den Zahlungsanbieter, damit Entitlements nicht direkt von anbieterspezifischen API-Objekten abhängen.

---

## 25. Internationalisierung

Startsprachen:

- Deutsch;
- Englisch.

Alle Systemtexte sind zentral internationalisiert.

Auch Kategorie-Vorlagen sind übersetzbar.

Technische Feldschlüssel bleiben sprachneutral.

Nutzerinhalte werden nicht automatisch übersetzt.

Locale-gerecht dargestellt werden mindestens:

- Datum;
- Uhrzeit;
- Zahlen;
- Währungen.

---

## 26. Audit und Wiederherstellung

Relevante Änderungen werden historisiert.

Mindestens:

- Zustand;
- Grading;
- Kaufdaten;
- Werte;
- Lagerort;
- Sichtbarkeit;
- Handelsstatus;
- Tags;
- benutzerdefinierte Felder;
- Medien;
- Dokumente;
- Rollen;
- Importe;
- Lösch-/Restore-Aktionen.

Ein Audit-Eintrag enthält:

- Zeitpunkt;
- Nutzer/System;
- Änderungstyp;
- Altwert;
- Neuwert;
- Quelle.

Geeignete Änderungen können gezielt wiederhergestellt werden.

Löschungen verwenden, wo fachlich sinnvoll, zunächst Soft Delete/Papierkorb.

---

## 27. Background Jobs

Job-Zustände:

- `QUEUED`;
- `PROCESSING`;
- `SUCCEEDED`;
- `FAILED`;
- `CANCELLED`.

Optionale Fortschrittsdaten:

- Prozent;
- aktueller Schritt;
- verarbeitet/gesamt;
- Retry-Zähler;
- letzter Fehler;
- Start/Ende.

Kritische Jobs sind idempotent.

---

## 28. Sicherheit

Mindestens folgende Grundsätze gelten:

- serverseitige Autorisierung;
- sichere Session-Cookies;
- CSRF-Schutz, wo erforderlich;
- Rate Limits;
- Upload-Validierung;
- kein Vertrauen in Client-Felder;
- sichere Secret-Verwaltung;
- keine Secrets im Repository;
- minimale Fehlerdetails nach außen;
- Webhook-Signaturprüfung;
- Transaktionen bei kritischen Mehrschritt-Aktionen;
- Constraints gegen inkonsistente Zustände;
- sichere Share-Tokens;
- sichere Passkey-/Account-Verknüpfung.

---

## 29. Backups und Restore

Gesichert werden mindestens:

- PostgreSQL;
- Medien-/Dokument-Storage;
- relevante Betriebs-Konfiguration außerhalb des Repositories.

Backups allein gelten nicht als ausreichend.

Der Restore-Prozess muss tatsächlich getestet werden.

Datenbank und Storage werden logisch konsistent wiederhergestellt.

---

## 30. Beobachtbarkeit und Betrieb

V1 muss mindestens ermöglichen:

- Healthcheck für Web;
- Healthcheck für Worker;
- strukturierte Server-Logs;
- Request-ID;
- Job-Fehlerdiagnose;
- nachvollziehbare Migrationen;
- sichere Produktionskonfiguration;
- reproduzierbare Docker-Builds.

Fehlerlogs dürfen keine sensiblen Dokumentinhalte oder Secrets enthalten.

---

## 31. Teststrategie

Die Implementierung folgt testbarer Modultrennung.

Mindestens vorgesehen:

### Unit-/Domain-Tests

Für:

- Policies;
- Sichtbarkeit;
- Rollen;
- Wertberechnung;
- Smart-Collection-Filter;
- Import-Mapping;
- Zustandsmodelle;
- Entitlements.

### Integrationstests

Für:

- Datenbank;
- API;
- Auth;
- Worker;
- Queue;
- Storage;
- Imports;
- Exporte;
- Marktpreisadapter;
- AI-Adapter;
- Billing-Webhooks.

### End-to-End-Tests

Mindestens kritische Nutzerpfade:

- Registrierung/Login;
- Sammlung anlegen;
- Stück erfassen;
- Bild hochladen;
- Sichtbarkeit prüfen;
- Mitglied einladen;
- Import durchführen;
- Smart Collection erstellen;
- Freigabe erzeugen;
- Premium-Berechtigung;
- Account-/Session-Sicherheit.

### Sicherheits-/Berechtigungstests

Explizit prüfen:

- private IDs nicht lesbar;
- untergeordnete Sichtbarkeit;
- Rollenrechte;
- Blockierungen;
- sensible Dokumente;
- widerrufene Share-Tokens;
- abgelaufene Freigaben.

---

## 32. Spätere native Apps

iOS und Android sind nicht Teil des ersten Web-Releases, aber ausdrücklich vorgesehen.

Sie verwenden dieselbe Backend- und Berechtigungslogik.

Vorteile späterer nativer Clients:

- Kamera;
- Barcode-Scanner;
- Push;
- Offline-/Caching;
- systemnahe Passkeys;
- Teilen aus anderen Apps.

Die Web-Architektur darf diesen Weg nicht blockieren.

---

## 33. Spätere Marktplatzphase

Ein echter Marktplatz mit Nutzer-zu-Nutzer-Zahlungen ist eine eigene Produktphase nach V1.

Vorbereitete Konzepte:

```
Listing
TradeOffer
PurchaseInquiry
Offer
Transaction
```

Spätere Zahlungsphase:

```
Order
Payment
Refund
Shipping
Dispute
Payout
```

Vor Aktivierung sind rechtliche, steuerliche, KYC-, Verbraucherschutz-, Betrugs- und Zahlungsfragen separat zu lösen.

V1 erzeugt keine automatische Transaktion aus Wunschlisten-Matches.

---

## 34. Release-Kriterien für V1

Sammlerraum V1 ist erst releasefähig, wenn:

1. alle in Abschnitt 2 definierten V1-Funktionsbereiche implementiert sind;
2. DE und EN vollständig sind;
3. mobile und Desktop-Nutzung funktionieren;
4. Rollen- und Sichtbarkeitspolicies getestet sind;
5. private Medien und Dokumente geschützt ausgeliefert werden;
6. Import/Export robust gegen ungültige und doppelte Daten ist;
7. Worker-Jobs Retry/Fehlerzustände korrekt behandeln;
8. AI-Ausgaben als Vorschläge behandelt werden;
9. Marktpreisquellen Herkunft und Zeitstempel bewahren;
10. Premium-Entitlements serverseitig durchgesetzt werden;
11. Audit-Log und Restore-Funktionen für vorgesehene Fälle funktionieren;
12. Backups existieren und ein Restore erfolgreich getestet wurde;
13. Produktion über Docker/Portainer reproduzierbar deploybar ist;
14. Healthchecks und Logs verfügbar sind;
15. die kritischen End-to-End-Pfade grün sind;
16. kein vollständiger Nutzer-Marktplatz oder Nutzer-zu-Nutzer-Checkout versehentlich aktiviert ist.

---

## 35. Bewusste Nicht-Ziele von V1

Nicht Bestandteil des ersten Releases:

- native iOS-App;
- native Android-App;
- vollständiger Checkout-Marktplatz zwischen Nutzern;
- Escrow/Treuhand;
- Versandabwicklung;
- Verkäuferauszahlungen;
- Käuferschutz-/Dispute-System;
- verpflichtender freier Handelschat;
- Microservice-Architektur;
- GraphQL;
- Browser-Push als Pflichtfunktion.

Diese Nicht-Ziele widersprechen nicht dem vollständigen V1-Anspruch. Sie gehören ausdrücklich zu späteren Produktphasen und sind nicht Teil des bisher vereinbarten ersten Releases.

---

## 36. Implementierungszerlegung

Der Umfang ist zu groß für einen einzigen unstrukturierten Entwicklungsschritt.

Die Umsetzung wird deshalb in aufeinander aufbauende Bauphasen zerlegt, ohne den V1-Zielumfang zu reduzieren.

Die Planungsphase muss mindestens getrennt behandeln:

1. Plattformfundament, CI, Docker, DB, i18n;
2. Identity/Auth/Policies;
3. Collections/Items/Custom Fields/Storage Locations;
4. Media/Documents;
5. Catalog/Condition/Grading;
6. Valuation/Market Data;
7. Search/Smart Collections/Dashboard;
8. Import/Export/Reports/Insurance;
9. Collaboration/Sharing/Audit;
10. Community/Moderation/Notifications;
11. AI-assisted capture;
12. Premium/Billing;
13. vollständige Integration, Hardening, Backup/Restore und Release-QA.

Alle Phasen arbeiten gegen dieselben in diesem Dokument definierten Domänengrenzen.

---

## 37. Verbindlichkeit

Diese Spezifikation ist die konsolidierte fachliche und technische Grundlage für Sammlerraum V1.

Die README bleibt der laufende Entscheidungsverlauf.

Bei Widersprüchen zwischen älteren Konzeptnotizen und dieser freigegebenen Spezifikation gilt nach Freigabe dieses Dokuments die Spezifikation, sofern eine spätere ausdrücklich bestätigte Änderung nichts anderes festlegt.
