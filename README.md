# Sammlerraum.de

> **Status:** Produktdesign in Arbeit  
> **Repository:** `acciento89-bot/sammlerraum`  
> **Stand:** 19.09.2026

Sammlerraum.de wird eine universelle Plattform zur digitalen Verwaltung privater Sammlungen mit optionalen Community-Funktionen und später vorbereiteten Marktplatz-/Tauschfunktionen.

Diese README dient während der Konzeptphase als **laufender, verbindlicher Entscheidungsstand** und wird bei neuen Festlegungen aktualisiert.

---

## 1. Produktkern

### Festgelegt

Sammlerraum folgt **Modell D**:

1. **Private digitale Sammlung als Kern**
   - Nutzer können ihre Sammlungen vollständig privat verwalten.
   - Sammlung und einzelne Objekte müssen nicht öffentlich sichtbar sein.

2. **Optionale öffentliche Community**
   - Nutzer können später selbst entscheiden, ob einzelne Sammlungen oder Objekte öffentlich gezeigt werden.
   - Community-Funktionen werden architektonisch von Anfang an berücksichtigt.

3. **Marktplatz/Tauschen später**
   - Kaufen, Verkaufen, Tauschen und Wunschlisten werden technisch vorbereitet.
   - Sie sind **kein Zwang für Version 1**.
   - Version 1 soll nicht durch einen komplexen Marktplatz unnötig aufgebläht werden.

---

## 2. Sammlungsarten

### Festgelegt: Universeller Kern + Kategorie-Vorlagen

Sammlerraum soll grundsätzlich für **praktisch jede Sammlung** funktionieren.

Beispiele:

- Trading Cards
- Münzen
- Briefmarken
- Uhren
- Comics
- Figuren
- Modellautos
- Vinyl
- Sneaker
- Spiele
- Bücher
- Kunst
- weitere freie Kategorien

Der Kern bleibt flexibel, typische Sammlerbereiche erhalten jedoch **eigene Kategorie-Vorlagen mit spezialisierten Feldern**.

Beispiele:

### Trading Cards
- Spiel/Franchise
- Set
- Kartennummer
- Sprache
- Variante
- Zustand
- Grading-Anbieter
- Grading-Note

### Münzen
- Land
- Jahrgang
- Nennwert
- Material
- Prägestätte
- Zustand
- Zertifizierung

### Uhren
- Hersteller
- Modell
- Referenz
- Werk
- Baujahr
- Seriennummer
- Box
- Papiere
- Zustand

Damit soll Sammlerraum nicht wie eine generische Inventar-App wirken.

---

## 3. Sammlungsstruktur

### Festgelegt: Mehrere Sammlungen + optionale Unterstruktur

Ein Nutzer kann mehrere eigenständige Sammlungen anlegen.

Beispiele:

- Pokémon
- Rolex
- 2-Euro-Münzen
- Marvel Comics

Zusätzlich können Sammlungen **optional weiter strukturiert** werden.

Beispiel:

```
Pokémon
├── Base Set
│   ├── 1st Edition
│   └── Unlimited
├── Jungle
└── Fossil
```

Die Unterstruktur ist optional:

- einfache Nutzer können ohne Unterordner arbeiten;
- große oder spezialisierte Sammlungen können beliebig sauber gegliedert werden.

Ziel ist, sowohl kleine Sammlungen als auch sehr große Sammlungsbestände sinnvoll abzubilden.

---

## 4. Erfassung von Sammlerstücken

### Festgelegt: Manuell + Barcode + AI-Fotoerkennung

Sammlerstücke können auf drei Wegen angelegt werden:

1. **Manuelle Eingabe**
   - über die zur Kategorie passende Eingabemaske;
   - inklusive freier Felder für Sonderfälle.

2. **Barcode-/Code-Erkennung**
   - EAN/UPC;
   - ISBN;
   - weitere strukturierte Produktcodes, sofern sinnvoll und verfügbar.

3. **Foto-/AI-Unterstützung**
   - Nutzer lädt ein oder mehrere Fotos hoch;
   - Sammlerraum analysiert das Objekt und schlägt passende Metadaten vor;
   - mögliche Vorschläge: Name, Hersteller, Serie/Set, Jahrgang, Kategorie und weitere erkennbare Merkmale;
   - der Nutzer bestätigt oder korrigiert die vorgeschlagenen Daten vor dem Speichern.

### Sicherheits-/Qualitätsregel

AI-Ausgaben sind **Vorschläge**, keine automatisch bestätigten Tatsachen.

Insbesondere dürfen folgende Angaben nicht ungeprüft als Fakt übernommen werden:

- Echtheit;
- Seltenheit;
- Marktwert;
- Zustand;
- Grading;
- Edition/Variante, wenn visuell nicht eindeutig;
- Herkunft/Provenienz.

Der Nutzer behält die Kontrolle über die endgültig gespeicherten Daten.

---

## 5. Wertverwaltung und Marktpreise

### Festgelegt: Eigene Werte + Historie + optionale externe Marktpreise

Sammlerraum verwaltet den finanziellen Wert eines Sammlerstücks mehrstufig.

### Eigene Werte

Pro Sammlerstück können insbesondere gepflegt werden:

- Kaufpreis;
- Kaufdatum;
- Währung;
- eigener aktueller Schätzwert;
- optionaler Kommentar zur Bewertung.

### Wert-Historie

Bewertungen werden historisiert, damit die Entwicklung eines Stücks und der gesamten Sammlung nachvollziehbar bleibt.

Mögliche Ansichten:

- aktueller Sammlungswert;
- Veränderung über Zeit;
- Wert pro Sammlung/Teil-Sammlung;
- Differenz zwischen Kaufpreis und aktuellem Wert;
- historische Einzelwerte eines Objekts.

Historische Werte dürfen nicht einfach überschrieben werden, wenn eine neue Bewertung erfasst wird.

### Externe Marktpreise

Für Kategorien mit verlässlichen Datenquellen können externe Marktwerte ergänzt werden.

Beispiele möglicher Kategorien:

- Trading Cards;
- Comics;
- Uhren;
- Münzen;
- weitere Bereiche mit belastbaren Markt- oder Verkaufsdaten.

Sammlerraum bleibt jedoch **vollständig funktionsfähig ohne externe Preisquelle**.

Wenn keine belastbare Quelle verfügbar ist:

- kann der Nutzer Werte selbst eintragen;
- Sammlerraum erfindet keine Marktpreise;
- AI darf einen Marktwert nicht ohne verlässliche Datenquelle als Tatsache darstellen.

### Trennung der Wertarten

Eigene Schätzung und externer Marktwert werden getrennt gespeichert und gekennzeichnet.

So bleibt nachvollziehbar:

- was der Nutzer selbst bewertet hat;
- welcher Wert von einer externen Quelle stammt;
- wann der jeweilige Wert ermittelt wurde;
- welche Quelle verwendet wurde.

---

## 6. Sichtbarkeit und Teilen

### Festgelegt: Privat + Öffentlich + Nicht gelistet

Sammlerraum unterstützt drei Sichtbarkeitsstufen:

1. **Privat**
   - nur für den Besitzer sichtbar;
   - nicht im öffentlichen Profil;
   - nicht in Suche oder Community-Feed;
   - nicht über einen öffentlichen Link aufrufbar.

2. **Öffentlich**
   - im öffentlichen Profil sichtbar;
   - grundsätzlich in Suche, Community-Bereichen und öffentlichen Sammlungsansichten auffindbar;
   - über einen normalen öffentlichen Link teilbar.

3. **Nicht gelistet**
   - über einen direkten Link sichtbar;
   - nicht im öffentlichen Profil gelistet;
   - nicht in Suche, Feed oder öffentlichen Entdeckungsseiten auffindbar.

### Sichtbarkeit auf mehreren Ebenen

Die Sichtbarkeit gilt sowohl für:

- ganze Sammlungen;
- Teil-Sammlungen/Unterordner;
- einzelne Sammlerstücke.

Ein einzelnes Stück kann restriktiver eingestellt werden als die übergeordnete Sammlung.

Beispiel:

```
Pokémon                 → öffentlich
├── Base Set            → öffentlich
│   ├── Karte A         → öffentlich
│   ├── Karte B         → nicht gelistet
│   └── Karte C         → privat
```

### Vererbungsregel

Untergeordnete Inhalte erben standardmäßig die Sichtbarkeit der übergeordneten Sammlung, können aber vom Nutzer explizit restriktiver eingestellt werden.

Eine private übergeordnete Sammlung darf nicht versehentlich durch ein öffentlich markiertes Unterobjekt nach außen sichtbar werden. Die effektiv sichtbare Stufe wird daher immer aus der gesamten Hierarchie abgeleitet.

---

## 7. Community

### Festgelegt: Profile + Folgen + Favoriten + Kommentare + Moderation

Sammlerraum erhält eine optionale Community-Ebene für Nutzer, die ihre Sammlungen öffentlich zeigen möchten.

### Öffentliche Profile

Ein Nutzer kann ein öffentliches Sammlerprofil führen.

Mögliche Inhalte:

- Profilbild;
- Anzeigename;
- Kurzbeschreibung/Bio;
- öffentlich sichtbare Sammlungen;
- öffentlich sichtbare Sammlerstücke;
- Follower-/Following-Beziehungen;
- Favoriten/Likes;
- optionale Sammler-Schwerpunkte.

Private Inhalte bleiben unabhängig vom öffentlichen Profil geschützt.

### Folgen

Nutzer können anderen öffentlichen Profilen folgen.

Dies bildet später die Grundlage für:

- einen persönlichen Community-Feed;
- neue öffentliche Sammlungen;
- neu veröffentlichte Sammlerstücke;
- Updates von gefolgten Sammlern.

### Likes / Favoriten

Öffentliche Sammlungen und Sammlerstücke können favorisiert bzw. geliked werden.

Favoriten dürfen keine private Sichtbarkeit umgehen.

### Kommentare

Kommentare können bei öffentlichen Sammlungen und öffentlichen Sammlerstücken aktiviert werden.

Der Eigentümer kann Kommentare:

- grundsätzlich erlauben;
- pro Sammlung deaktivieren;
- bei einzelnen Stücken deaktivieren.

Nicht gelistete Inhalte können nur dann kommentiert werden, wenn der direkte Zugriff erlaubt ist und Kommentare für das Objekt aktiviert sind.

Private Inhalte besitzen keine öffentliche Kommentarfunktion.

### Moderation und Sicherheit

Von Anfang an vorgesehen:

- Kommentar melden;
- Nutzer melden;
- Nutzer blockieren;
- eigene Kommentare löschen;
- Kommentare auf eigenen Inhalten moderieren;
- Kommentare für Inhalte deaktivieren;
- serverseitige Schutzmaßnahmen gegen Spam/Missbrauch.

Blockierte Nutzer dürfen keine direkten Community-Interaktionen mit dem blockierenden Nutzer durchführen.

### Grundsatz

Community-Funktionen sind **optional**.

Sammlerraum muss auch als vollständig privater Sammlungsmanager sinnvoll nutzbar bleiben.

---

## 8. Wunschliste, Dubletten und Tausch-/Verkaufsstatus

### Festgelegt: Wunschliste + Dubletten + vorbereiteter Handelsstatus

Sammlerraum bildet bereits in Version 1 wichtige Sammler-Workflows ab, ohne daraus sofort einen vollständigen Marktplatz zu machen.

### Wunschliste

Nutzer können gesuchte Sammlerstücke auf eine Wunschliste setzen.

Mögliche Informationen:

- gewünschtes Objekt;
- Kategorie und Sammlung;
- gewünschte Variante/Edition;
- gewünschter Zustand;
- optionaler Zielpreis;
- Priorität;
- Notiz;
- Referenzbild bzw. Produktreferenz, sofern rechtlich und technisch zulässig.

Ein Wunschlisten-Eintrag ist kein vorhandenes Sammlerstück und wird daher getrennt vom eigenen Bestand gespeichert.

### Dubletten

Vorhandene Sammlerstücke können als Dublette bzw. mehrfach vorhanden gekennzeichnet werden.

Sammlerraum muss dabei unterscheiden können zwischen:

- einem Bestandseintrag mit Stückzahl;
- mehreren tatsächlich getrennt erfassten Exemplaren;
- gezielt als Dublette markierten Exemplaren.

Das ist wichtig, weil verschiedene Exemplare desselben Motivs unterschiedliche Zustände, Gradings, Kaufpreise, Bilder oder Seriennummern haben können.

### Verfügbarkeitsstatus eines eigenen Stücks

Für einzelne Sammlerstücke kann ein Handelsstatus gesetzt werden:

- **Nicht verfügbar**;
- **Tauschbereit**;
- **Verkaufsbereit**.

Der Standard ist **Nicht verfügbar**.

Dieser Status allein stellt noch kein rechtsverbindliches Verkaufsangebot dar.

### Sichtbarkeit und Datenschutz

Tausch- oder Verkaufsbereitschaft wird nur bei Inhalten angezeigt, die aufgrund ihrer Sichtbarkeit überhaupt vom jeweiligen Betrachter gesehen werden dürfen.

Ein privates Stück wird durch den Handelsstatus niemals öffentlich.

### Vorbereitung für spätere Ausbaustufe

Das Datenmodell soll spätere Funktionen ermöglichen, ohne sie bereits in Version 1 vollständig umzusetzen:

- Tauschangebote;
- Kaufanfragen;
- Preisangebote;
- Match zwischen Wunschliste und Dubletten;
- Marktplatz-Inserate;
- Transaktionsstatus.

### V1-Abgrenzung

Nicht Bestandteil dieses ersten Schritts:

- Zahlungsabwicklung zwischen Mitgliedern;
- Treuhand/Escrow;
- Versandabwicklung;
- Käuferschutz;
- Verkäuferbewertungen;
- verbindlicher Checkout zwischen Sammlern.

---

## 9. Bilder, Dokumente und Nachweise

### Festgelegt: Strukturierte Medienverwaltung pro Sammlerstück

Jedes Sammlerstück kann mehrere Medien und Dokumente besitzen. Diese werden nicht als eine einzige ungeordnete Dateiliste behandelt, sondern nach Zweck strukturiert.

### Bilder

Vorgesehen sind:

- ein **Titelbild** als primäre Darstellung des Stücks;
- eine **Bildergalerie** mit mehreren Detailaufnahmen;
- frei sortierbare Reihenfolge;
- optionale Bildbeschreibungen;
- spätere Unterstützung für Detailansichten und Zoom.

Typische Fotos können z. B. zeigen:

- Vorderseite;
- Rückseite;
- Seriennummer;
- Signatur;
- Verpackung;
- Zubehör;
- Schäden oder besondere Merkmale.

### Kaufbelege

Kaufbelege werden als eigene Dokumentart geführt.

Mögliche Metadaten:

- Kaufdatum;
- Händler/Verkäufer;
- Kaufpreis;
- Währung;
- Belegdatum;
- Notiz.

Kaufbelege sind standardmäßig **privat** und werden nicht automatisch mit öffentlich sichtbaren Sammlerstücken geteilt.

### Echtheits- und Grading-Nachweise

Unterstützt werden strukturierte Nachweise wie:

- Echtheitszertifikate;
- Grading-Zertifikate;
- Zertifikatsnummern;
- Grading-Anbieter;
- Prüfberichte;
- Herkunfts-/Provenienzunterlagen.

Dokumente können mit passenden strukturierten Feldern am Sammlerstück verknüpft werden.

### Weitere private Dateien

Zusätzlich können weitere sammlungsrelevante Dateien hinterlegt werden, z. B.:

- Garantien;
- Versicherungsunterlagen;
- Rechnungen;
- Expertisen;
- Restaurierungsunterlagen;
- sonstige persönliche Dokumentation.

### Datenschutz und Sichtbarkeit

Dokumente und Nachweise erhalten eine eigene Sichtbarkeit und sind **nicht automatisch öffentlich**, nur weil das zugehörige Sammlerstück öffentlich ist.

Insbesondere bleiben standardmäßig privat:

- Kaufbelege;
- Rechnungen;
- Adressdaten;
- personenbezogene Dokumente;
- Versicherungsunterlagen;
- interne Notizen.

Öffentliche Nachweise müssen vom Nutzer ausdrücklich freigegeben werden.

### Technischer Grundsatz

Medien und Dokumente werden als eigene Objekte mit Typ, Sichtbarkeit, Metadaten und Zuordnung gespeichert. Dadurch bleiben spätere Funktionen wie Dokumentvorschau, OCR, Zertifikatsprüfung oder Export möglich, ohne das Kernmodell neu bauen zu müssen.

---

## 10. Tags und benutzerdefinierte Felder

### Festgelegt: Vorlagen + freie Tags + eigene Felder pro Sammlung

Sammlerraum kombiniert strukturierte Kategorie-Vorlagen mit flexiblen Erweiterungen durch den Nutzer.

### Kategorie-Vorlagen

Typische Sammlerbereiche besitzen weiterhin vorgefertigte Felder, damit häufige Angaben schnell und einheitlich erfasst werden können.

### Freie Tags

Nutzer können Sammlerstücke mit frei definierbaren Tags versehen.

Beispiele:

- signiert;
- limitiert;
- Fehlprägung;
- Convention;
- Geschenk;
- restauriert;
- Erstauflage;
- Lieblingsstück.

Tags dienen insbesondere für:

- Suche;
- Filter;
- Gruppierung;
- spätere Smart Collections bzw. dynamische Ansichten.

### Benutzerdefinierte Felder pro Sammlung

Zusätzlich kann der Nutzer eigene Felder für eine Sammlung definieren.

Beispiele:

- „Signiert von“;
- „Convention“;
- „Regal“;
- „Custom Grade“;
- „Edition“;
- „Provenienz-Code“;
- „Versicherungsnummer“.

Ein einmal definiertes Feld kann für alle Stücke der jeweiligen Sammlung wiederverwendet werden.

### Feldtypen

Das Datenmodell soll mindestens folgende Feldtypen unterstützen:

- kurzer Text;
- langer Text;
- Zahl;
- Dezimalzahl;
- Datum;
- Ja/Nein;
- Auswahlfeld;
- Mehrfachauswahl;
- URL;
- Währung/Geldwert.

### Grundsatz

Benutzerdefinierte Felder ergänzen das Standardschema, ersetzen aber nicht die strukturierten Kernfelder, die für Suche, Wertanalyse, Community oder spätere Markt-Funktionen benötigt werden.

Eigene Felder bleiben an die jeweilige Sammlung gebunden und dürfen das Datenmodell anderer Nutzer oder Kategorien nicht verändern.

---

## 11. Import und Export

### Festgelegt: CSV + Excel + wiederverwendbare Importprofile

Sammlerraum unterstützt den Umstieg von bestehenden Listen und Tabellen, damit Nutzer ihre Sammlung nicht vollständig neu erfassen müssen.

### Export

Vorgesehen sind mindestens:

- CSV-Export;
- Excel-/XLSX-Export.

Exportiert werden können abhängig vom gewählten Umfang:

- eine einzelne Sammlung;
- eine Teil-Sammlung;
- gefilterte Sammlerstücke;
- der vollständige eigene Bestand;
- Wunschlisten;
- Wert- und Bestandsdaten.

Private Dokumentdateien werden nicht automatisch in Tabellenexporte eingebettet.

### Import

Unterstützt werden mindestens:

- CSV-Dateien;
- Excel-/XLSX-Dateien.

Beim Import erhält der Nutzer eine Vorschau und ordnet Quellspalten den Feldern von Sammlerraum zu.

Beispiele:

```
Meine Tabelle             Sammlerraum
------------------------------------------------
Artikelname             → Titel
Hersteller              → Hersteller
Kaufdatum               → Kaufdatum
Preis                    → Kaufpreis
Schublade                → eigenes Feld „Schublade“
```

Vor dem endgültigen Import müssen Validierungsfehler, nicht zugeordnete Pflichtfelder und erkannte Dubletten nachvollziehbar angezeigt werden.

### Importprofile

Eine einmal vorgenommene Feldzuordnung kann als Importprofil gespeichert und erneut verwendet werden.

Das ermöglicht unter anderem:

- wiederkehrende Imports aus derselben eigenen Tabelle;
- vorbereitete Profile für bekannte Sammlerlisten;
- spätere spezielle Importer für externe Plattformen oder Katalogformate.

Importprofile dürfen nur dann für externe Dienste angeboten werden, wenn Format, Nutzungsbedingungen und Datenzugriff technisch und rechtlich belastbar sind.

### Datenqualität

Importe dürfen bestehende Daten nicht stillschweigend überschreiben.

Bei möglichen Konflikten oder Dubletten muss der Nutzer entscheiden können, ob ein Datensatz:

- neu angelegt;
- übersprungen;
- mit einem bestehenden Stück zusammengeführt;
- oder als separates Exemplar importiert wird.

### Grundsatz

Sammlerraum verwendet ein eigenes kanonisches internes Datenmodell. Importformate werden auf dieses Modell abgebildet, damit die Plattform nicht von einer einzelnen externen Tabellen- oder Anbieterstruktur abhängig wird.

---

## 12. Monetarisierung

### Festgelegt: Dauerhaft nutzbares Free-Modell + Premium-Ausbaustufe

Sammlerraum folgt einem Freemium-Modell.

Die kostenlose Version bleibt dauerhaft sinnvoll nutzbar. Nutzer sollen ihre Sammlung nicht nur während einer Testphase verwalten können.

### Free

Die Free-Stufe deckt die Kernnutzung ab.

Vorgesehen sind insbesondere:

- Anlegen und Verwalten eigener Sammlungen;
- mehrere Sammlungen und Teil-Sammlungen;
- Erfassung eigener Sammlerstücke;
- Basis-Bilder pro Stück;
- Wunschliste;
- Dublettenverwaltung;
- Basis-Community-Funktionen;
- öffentliche/private/nicht gelistete Sichtbarkeit;
- grundlegende Suche und Filter;
- manuelle Werteingabe.

Free kann hinsichtlich Umfang begrenzt werden, z. B. durch:

- maximale Anzahl an Sammlerstücken;
- geringere Anzahl an Bildern/Dokumenten je Stück;
- geringere Import-/Export-Kontingente;
- begrenzte AI-Nutzung.

Die konkreten Limits werden später anhand Kostenstruktur und Nutzungswert festgelegt.

### Premium

Premium erweitert Sammlerraum für größere oder intensiver gepflegte Sammlungen.

Vorgesehene Premium-Vorteile können sein:

- deutlich mehr oder unbegrenzt viele Sammlerstücke;
- mehr Bilder pro Stück;
- zusätzliche Dokumente und Nachweise;
- vollständige Wert-Historie;
- externe Marktpreisquellen;
- AI-gestützte Fotoerkennung mit höherem Kontingent;
- erweiterte Statistiken und Sammlungsanalysen;
- Excel-Import/-Export;
- umfangreichere Importprofile;
- erweiterte Such- und Filterfunktionen;
- Komfortfunktionen für große Sammlungen.

### Grundsätze

- kein Zwangsabo nach kurzer Testphase;
- bestehende Free-Daten bleiben erhalten;
- Premium darf Kernfunktionen nicht künstlich unbrauchbar machen;
- kostenintensive Funktionen wie AI oder externe Marktpreisdaten dürfen fair kontingentiert werden;
- Community-Grundfunktionen bleiben grundsätzlich auch ohne Premium nutzbar.

### Noch offen

Später festzulegen:

- Name der Premium-Stufe;
- Monats-/Jahrespreis;
- konkrete Free-Limits;
- konkrete Premium-Limits;
- eventuelle Lifetime-Option;
- Zahlungsanbieter und Billing-Architektur.

---

## 13. Authentifizierung und Account-Modell

### Festgelegt: Klassischer Login + Social Login + Passkeys

Sammlerraum unterstützt mehrere sichere Anmeldewege, damit Nutzer nicht an eine einzelne Login-Methode gebunden sind.

### Unterstützte Login-Methoden

- **E-Mail + Passwort**
- **Sign in with Apple**
- **Google Login**
- **Passkeys / WebAuthn**

Passkeys werden als zusätzliche moderne und passwortlose Anmeldung angeboten, nicht als einzige Zugangsmöglichkeit.

### Account-Verknüpfung

Mehrere Login-Methoden können demselben Sammlerraum-Account zugeordnet werden.

Beispiel:

- Registrierung mit E-Mail und Passwort;
- später Apple-Konto verknüpfen;
- anschließend Passkey auf dem eigenen Gerät hinzufügen.

Sammlerraum darf bei identischer E-Mail-Adresse nicht blind zwei Konten zusammenführen. Verknüpfungen müssen sicher verifiziert werden.

### Account-Sicherheit

Vorgesehen sind:

- sichere Passwort-Hashes;
- E-Mail-Verifizierung;
- Passwort-Zurücksetzen;
- Passkey-Verwaltung;
- Verwaltung verbundener Login-Anbieter;
- aktive Sitzungen anzeigen und widerrufen;
- Schutz gegen Brute-Force- und Credential-Stuffing-Angriffe;
- sichere Session-Cookies und serverseitige Autorisierungsprüfung.

### Account-Wiederherstellung

Nutzer müssen auch dann wieder Zugriff erhalten können, wenn ein Passkey oder Social-Login-Anbieter nicht mehr verfügbar ist.

Daher bleibt mindestens ein verifizierter Wiederherstellungsweg erforderlich.

### Grundsatz

Authentifizierung und Identität werden sauber von öffentlichen Profilinformationen getrennt.

Eine Login-E-Mail-Adresse wird niemals automatisch als öffentliche Kontaktadresse angezeigt.

---

## 14. Plattformstrategie

### Festgelegt: Responsive Web-App zuerst, native Apps vorbereitet

Sammlerraum startet als **responsive Web-Anwendung unter Sammlerraum.de**.

Die Web-App wird so umgesetzt, dass sie auf Desktop, Tablet und Smartphone vollständig nutzbar ist.

### Web zuerst

Version 1 konzentriert sich auf:

- Desktop-Browser;
- Tablet-Browser;
- mobile Browser;
- responsive Navigation und Eingabemasken;
- Kamera-Zugriff, soweit Browser und Gerät dies unterstützen;
- Barcode-/Code-Erfassung im Web, soweit technisch zuverlässig möglich;
- Upload von Fotos und Dokumenten direkt vom Mobilgerät.

### Architektur für spätere iOS-/Android-Apps

Backend, Datenmodell und Berechtigungslogik werden von Anfang an **client-unabhängig** aufgebaut.

Native Apps sollen später dieselben zentralen Dienste verwenden können, insbesondere:

- Authentifizierung;
- Sammlungen;
- Sammlerstücke;
- Medien;
- Wunschlisten;
- Community;
- Wert-Historie;
- Marktpreisdaten;
- Benachrichtigungen;
- Premium-/Billing-Status.

Geschäftslogik darf deshalb nicht ausschließlich in Web-Komponenten implementiert werden.

### API-Grundsatz

Die Web-App nutzt klar abgegrenzte Server-/API-Schnittstellen, die später auch native Clients bedienen können.

Autorisierung, Sichtbarkeit und Berechtigungen werden serverseitig geprüft und nicht dem Client überlassen.

### Spätere native Apps

iOS und Android sind ausdrücklich vorgesehen, aber **nicht Bestandteil des ersten Releases**.

Native Apps können später insbesondere Vorteile bieten bei:

- Kamera und Barcode-Scanner;
- Push-Benachrichtigungen;
- Foto-Workflows;
- Offline-/Caching-Funktionen;
- systemnahen Passkeys;
- Teilen aus anderen Apps.

### Grundsatz

Web-first bedeutet **keine Wegwerf-Weblösung**. Die erste Version bildet bereits die produktive Plattformbasis, auf der spätere Clients aufsetzen.

---

## 15. Internationalisierung

### Festgelegt: Deutsch + Englisch von Anfang an

Sammlerraum wird von Beginn an vollständig zweisprachig umgesetzt.

Unterstützte Sprachen zum Start:

- Deutsch;
- Englisch.

### UI und Systemtexte

Alle sichtbaren Texte werden über eine zentrale Internationalisierungsschicht verwaltet.

Dazu gehören insbesondere:

- Navigation;
- Formulare;
- Buttons;
- Fehlermeldungen;
- E-Mails;
- Benachrichtigungen;
- Onboarding;
- Preis- und Premium-Seiten;
- Community-Funktionen;
- Import-/Export-Assistenten;
- Hilfetexte.

Texte dürfen nicht fest in Komponenten verdrahtet werden.

### Kategorie-Vorlagen

Auch Kategorie-Vorlagen werden übersetzbar modelliert.

Beispiel:

```
DE: Hersteller
EN: Manufacturer

DE: Zustand
EN: Condition
```

Technische Feldschlüssel bleiben sprachneutral und stabil.

### Benutzerinhalte

Vom Nutzer eingegebene Inhalte werden nicht automatisch übersetzt.

Beispiele:

- Sammlungsname;
- Beschreibung;
- Notizen;
- Kommentare;
- benutzerdefinierte Felder.

Eine spätere optionale Übersetzungsfunktion kann darauf aufbauen, ist aber kein Bestandteil der Grundfunktion.

### URLs und öffentliche Seiten

Öffentliche Marketing- und Informationsseiten erhalten saubere DE-/EN-Strukturen.

Die eigentlichen Objekt-IDs und internen Daten bleiben sprachneutral, damit Links und Datenmodell nicht an eine einzelne Sprache gekoppelt sind.

### Locale-abhängige Darstellung

Mindestens folgende Werte werden locale-gerecht dargestellt:

- Datum;
- Uhrzeit;
- Dezimalzahlen;
- Tausendertrennzeichen;
- Währungen.

Gespeicherte Daten bleiben davon unabhängig in einem kanonischen Format.

### Grundsatz

Internationalisierung ist Bestandteil der Architektur und keine spätere Nachrüstung.

---

## 16. Benachrichtigungen

### Festgelegt: In-App + E-Mail, Push vorbereitet

Sammlerraum unterstützt zum Start zwei produktive Benachrichtigungskanäle:

- **In-App-Benachrichtigungen**
- **E-Mail-Benachrichtigungen**

Zusätzlich wird die Architektur so vorbereitet, dass spätere native iOS-/Android-Apps **Push-Benachrichtigungen** erhalten können, ohne das Benachrichtigungssystem neu bauen zu müssen.

### In-App

Im Sammlerraum-Konto gibt es ein Benachrichtigungszentrum mit mindestens:

- ungelesen/gelesen;
- Zeitstempel;
- Typ;
- Ziel-Link;
- Möglichkeit, Benachrichtigungen gesammelt als gelesen zu markieren.

Mögliche Ereignisse:

- neuer Follower;
- Like/Favorit auf eigenem Inhalt;
- neuer Kommentar;
- Antwort auf eigenen Kommentar;
- Meldungs-/Moderationsstatus;
- Wert- oder Marktpreis-Update;
- Import abgeschlossen oder fehlgeschlagen;
- Sicherheitsereignisse;
- Premium-/Billing-Ereignisse;
- spätere Tausch-/Verkaufsanfragen.

### E-Mail

E-Mail wird für relevante Ereignisse eingesetzt, insbesondere:

- E-Mail-Verifizierung;
- Passwort-Wiederherstellung;
- sicherheitsrelevante Hinweise;
- wichtige Account-Änderungen;
- optional abonnierte Community-Zusammenfassungen;
- Import-/Export-Abschluss;
- Premium-/Billing-Mitteilungen.

### Präferenzen

Nutzer können nicht-sicherheitskritische Benachrichtigungen nach Kategorie und Kanal ein- oder ausschalten.

Sicherheitsrelevante Systemmeldungen dürfen nicht vollständig deaktivierbar sein, wenn sie für Kontoschutz oder rechtliche Kommunikation erforderlich sind.

### Push-Vorbereitung

Das Benachrichtigungsmodell wird kanalunabhängig aufgebaut.

Ein Ereignis erzeugt zunächst eine interne Benachrichtigung. Zustellkanäle wie E-Mail oder später Push werden über getrennte Zustellmechanismen bedient.

Dadurch können spätere native Apps Push erhalten, ohne Geschäftslogik doppelt zu implementieren.

### Web-Push

Browser-Push ist für Version 1 **nicht erforderlich**. Die Architektur darf eine spätere Ergänzung ermöglichen, ohne daraus jetzt zusätzliche Komplexität zu machen.

---

## 17. Suche, Filter und Smart Collections

### Festgelegt: Erweiterte Suche + speicherbare dynamische Ansichten

Sammlerraum erhält eine leistungsfähige Suche, die auch bei großen Sammlungen nutzbar bleibt.

### Suche

Die Suche soll mindestens berücksichtigen können:

- Titel/Name;
- Hersteller;
- Serie/Set;
- Kategorie;
- Tags;
- benutzerdefinierte Felder;
- Serien-/Zertifikatsnummern;
- Notizen, soweit vom Nutzer gewünscht;
- Wunschlisten-Einträge.

### Erweiterte Filter

Filter können abhängig von Kategorie und vorhandenem Datenmodell kombiniert werden.

Beispiele:

- Sammlung / Teil-Sammlung;
- Kategorie;
- Hersteller;
- Jahrgang;
- Zustand;
- Grading-Anbieter;
- Grading-Note;
- Kaufpreis;
- aktueller eigener Wert;
- externer Marktwert;
- Wertspanne;
- Tags;
- Dublette;
- Wunschliste;
- Tauschbereit;
- Verkaufsbereit;
- Sichtbarkeit;
- mit/ohne Foto;
- mit/ohne Dokumente;
- mit/ohne Kaufbeleg;
- Erfassungsdatum;
- letzter Bearbeitungszeitpunkt.

### Smart Collections

Nutzer können eine Filterkombination als **Smart Collection** speichern.

Eine Smart Collection enthält keine duplizierten Sammlerstücke, sondern eine gespeicherte Abfrage auf den bestehenden Bestand.

Beispiele:

- „Alle PSA 10 Pokémon“;
- „Alle Stücke über 500 €“;
- „Alle Dubletten“;
- „Tauschbereit“;
- „Ohne Foto“;
- „2026 gekauft“;
- „Wertsteigerung über 20 %“;
- „Noch nicht vollständig erfasst“.

Wenn ein Sammlerstück später die Filterbedingungen erfüllt oder nicht mehr erfüllt, aktualisiert sich die Smart Collection automatisch.

### Abgrenzung

Smart Collections ersetzen nicht die echte Sammlungs-/Unterordnerstruktur.

- echte Sammlung = bewusst organisierter Bestand;
- Smart Collection = dynamische, gespeicherte Sicht auf vorhandene Daten.

### Architekturgrundsatz

Filterdefinitionen werden strukturiert gespeichert und nicht als schwer wartbare freie Abfragestrings.

Das Datenmodell muss neue Filtertypen später ergänzen können, ohne bestehende Smart Collections unbrauchbar zu machen.

---

## 18. Dashboard und Statistiken

### Festgelegt: Vollwertiges Sammler-Dashboard

Sammlerraum erhält ein persönliches Dashboard, das nicht nur Bestandszahlen zeigt, sondern den Zustand und die Entwicklung der eigenen Sammlung verständlich zusammenfasst.

### Kernkennzahlen

Vorgesehen sind mindestens:

- Gesamtzahl der Sammlerstücke;
- Anzahl der Sammlungen und Teil-Sammlungen;
- Summe der dokumentierten Kaufkosten;
- aktueller eigener Schätzwert;
- verfügbarer externer Marktwert;
- absolute und prozentuale Wertveränderung;
- Anzahl der Dubletten;
- Anzahl der Wunschlisten-Einträge;
- Anzahl tauschbereiter und verkaufsbereiter Stücke.

Eigene Schätzwerte und externe Marktwerte bleiben auch im Dashboard klar voneinander getrennt.

### Wertentwicklung

Das Dashboard zeigt historische Entwicklungen, soweit Daten vorhanden sind.

Beispiele:

- Gesamtwert über Zeit;
- Kaufkosten gegenüber aktuellem Wert;
- Wertentwicklung pro Sammlung;
- stärkste Wertsteigerungen;
- stärkste Wertverluste;
- neue Marktpreisänderungen.

Fehlende Marktpreisdaten dürfen nicht durch erfundene oder geschätzte Werte ersetzt werden.

### Sammlungsanalyse

Mögliche Auswertungen:

- größte Sammlungen;
- wertvollste Sammlungen;
- wertvollste Einzelstücke;
- Verteilung nach Kategorie;
- Verteilung nach Hersteller/Serie/Set;
- Verteilung nach Zustand;
- Verteilung nach Grading-Anbieter und Grading-Note;
- Käufe nach Jahr/Monat;
- Neuzugänge.

### Datenqualität

Das Dashboard soll auch auf unvollständige Daten hinweisen können.

Beispiele:

- Stücke ohne Foto;
- Stücke ohne Wert;
- fehlende Kaufdaten;
- fehlende Kategorie;
- Stücke ohne Zustand;
- nicht vollständig ausgefüllte Kategorie-Vorlagen;
- fehlende Nachweise bei entsprechend markierten Objekten.

Diese Hinweise dienen als Arbeitsliste und nicht als Zwang.

### Wunschliste und Dubletten

Vorgesehen sind Übersichten zu:

- offenen Wunschlisten-Einträgen;
- erfüllten Wünschen;
- Dubletten;
- möglichen späteren Wunschlisten-/Dubletten-Matches.

### Persönliche Meilensteine

Sammlerraum kann persönliche Meilensteine darstellen, z. B.:

- 100. Sammlerstück;
- neue Sammlung begonnen;
- Sammlung vervollständigt;
- bestimmter dokumentierter Gesamtwert erreicht;
- Wunschliste teilweise oder vollständig erfüllt.

Meilensteine sind informativ und dürfen nicht in manipulative Gamification oder Kaufdruck ausarten.

### Free / Premium

Basiskennzahlen bleiben für Free-Nutzer sinnvoll nutzbar.

Erweiterte historische Analysen, umfangreiche Marktpreis-Auswertungen und tiefergehende Statistiken können Bestandteil von Premium sein.

---

## 19. Globaler Referenzkatalog und Community-Pflege

### Festgelegt: Globaler Katalog + eigene Exemplare + moderierte Community-Korrekturen

Sammlerraum unterscheidet zwischen einem **globalen Referenzobjekt** und dem **konkreten Exemplar eines Nutzers**.

### Globales Referenzobjekt

Ein globales Katalogobjekt beschreibt ein allgemein bekanntes Sammlerstück unabhängig vom Besitzer.

Beispiele:

- eine bestimmte Pokémon-Karte;
- eine konkrete Münzausgabe;
- eine Uhr mit bestimmter Referenz;
- ein bestimmtes Comic-Heft;
- eine bestimmte Vinyl-Ausgabe;
- eine Sammelfigur in definierter Edition.

Mögliche globale Daten:

- offizieller Name/Titel;
- Hersteller/Herausgeber;
- Serie/Set;
- Katalog-/Referenznummer;
- Erscheinungsjahr;
- Variante/Edition;
- Sprache;
- technische Merkmale;
- offizielle oder allgemein etablierte Identifikatoren;
- Referenzbilder, sofern rechtlich zulässig;
- Kategorie-spezifische Stammdaten.

### Persönliches Exemplar

Das konkrete Stück eines Nutzers bleibt ein eigenes Objekt und verweist optional auf einen globalen Katalogeintrag.

Exemplar-spezifische Daten sind insbesondere:

- eigener Zustand;
- eigenes Grading;
- Seriennummer;
- Kaufdatum;
- Kaufpreis;
- eigene Bilder;
- Dokumente;
- Provenienz;
- persönlicher Schätzwert;
- Lagerort;
- Sichtbarkeit;
- Tausch-/Verkaufsstatus;
- Notizen.

Mehrere Nutzer können also dasselbe globale Referenzobjekt besitzen, ohne ihre individuellen Daten miteinander zu vermischen.

### Nicht katalogisierte Objekte

Ein Sammlerstück muss nicht zwingend bereits im globalen Katalog existieren.

Nutzer können weiterhin vollständig eigene Stücke erfassen.

Aus solchen Einträgen kann später ein Vorschlag für einen neuen globalen Katalogeintrag entstehen.

### Community-gestützte Katalogpflege

Nutzer können Änderungen oder neue Katalogeinträge vorschlagen.

Beispiele:

- fehlende Variante ergänzen;
- Erscheinungsjahr korrigieren;
- Katalognummer ergänzen;
- Übersetzung verbessern;
- falsche Zuordnung melden;
- neuen Referenzeintrag vorschlagen.

Änderungen werden nicht ungeprüft direkt in globale Stammdaten geschrieben.

### Moderation und Qualitätssicherung

Vorgesehen sind:

- Änderungsvorschläge mit nachvollziehbarem Änderungsverlauf;
- Quellen-/Belegangaben, wenn für die Korrektur relevant;
- Moderationsstatus;
- Annahme/Ablehnung;
- Versionshistorie globaler Katalogdaten;
- Rücknahme fehlerhafter Änderungen;
- Schutz vor Spam und Vandalismus.

Später kann ein Vertrauens-/Rollenmodell für erfahrene Katalogpfleger ergänzt werden.

### Datenherkunft

Globale Katalogdaten sollen ihre Herkunft nachvollziehbar machen können.

Mögliche Quellen:

- offizielle Herstellerdaten;
- lizenzierte APIs;
- öffentliche Datensätze;
- verifizierte Community-Beiträge;
- manuell gepflegte Referenzdaten.

Daten aus externen Quellen dürfen nur übernommen werden, wenn Nutzung, Lizenz und Aktualisierung rechtlich und technisch zulässig sind.

### Grundsatz

Der globale Katalog dient als **Referenz und Beschleuniger**, nicht als Zwang.

Sammlerraum bleibt auch für einzigartige, selbstgefertigte, historische oder nicht katalogisierbare Sammlerstücke vollständig nutzbar.

---

## 20. Gemeinsame Sammlungen und Rollen

### Festgelegt: Kollaborative Sammlungen mit Rollenmodell

Sammlungen können nicht nur einer einzelnen Person zur privaten Verwaltung dienen, sondern auch gemeinsam gepflegt werden.

### Rollen

Mindestens folgende Rollen sind vorgesehen:

- **Owner**
  - besitzt die Sammlung;
  - kann Rollen vergeben;
  - kann Eigentümerschaft übertragen;
  - kann Sammlung löschen;
  - verwaltet zentrale Einstellungen und Premium-relevante Funktionen.

- **Admin**
  - verwaltet Mitglieder und Rollen unterhalb Owner;
  - kann Sammlungsstruktur, Inhalte und Einstellungen bearbeiten;
  - kann Moderationsaufgaben innerhalb der Sammlung übernehmen.

- **Editor**
  - kann Sammlerstücke anlegen, bearbeiten und strukturieren;
  - kann Medien und Dokumente hinzufügen;
  - kann je nach Berechtigung Werte, Tags und benutzerdefinierte Felder pflegen.

- **Viewer**
  - kann die freigegebenen Inhalte ansehen;
  - darf keine Daten verändern.

### Einladungen

Mitglieder können über sichere Einladungen hinzugefügt werden.

Vorgesehen sind:

- Einladung per E-Mail;
- Einladungsstatus;
- Ablaufzeit;
- Widerruf;
- Annahme nur durch den vorgesehenen Account bzw. verifizierte Identität.

### Berechtigungsgrundsatz

Berechtigungen werden serverseitig geprüft.

Ein Client darf niemals allein entscheiden, ob eine Aktion erlaubt ist.

Rollen und Rechte müssen mindestens für folgende Bereiche berücksichtigt werden:

- Sammlung bearbeiten;
- Unterordner verwalten;
- Sammlerstücke anlegen/ändern/löschen;
- Medien/Dokumente;
- Sichtbarkeit;
- Kommentare;
- Import/Export;
- Wertdaten;
- Mitgliederverwaltung;
- Premium-/Billing-Funktionen.

### Eigentum und Verantwortlichkeit

Jede kollaborative Sammlung besitzt genau einen Owner.

Andere Mitglieder erhalten Zugriff über Rollen, aber keine implizite Eigentümerschaft an den Daten.

### Sichtbarkeit

Interne Rollen sind von öffentlicher Sichtbarkeit getrennt.

Eine private Sammlung bleibt privat, auch wenn mehrere Nutzer daran arbeiten.

### Spätere Nutzungsszenarien

Das Modell unterstützt später insbesondere:

- Familien-Sammlungen;
- gemeinsame Sammlungen von Paaren;
- Vereine;
- Sammlergruppen;
- gemeinschaftlich gepflegte Nachlässe oder Archive.

---

## 21. Lagerorte und physische Organisation

### Festgelegt: Hierarchische Lagerorte + QR-/Barcode-Labels

Sammlerraum bildet nicht nur digitale Sammlungen ab, sondern hilft auch dabei, physische Bestände schnell wiederzufinden.

### Hierarchische Lagerorte

Lagerorte können mehrstufig aufgebaut werden.

Beispiele:

```
Wohnzimmer
└── Vitrine
    └── Fach 2
```

oder:

```
Keller
└── Regal A
    └── Box 4
        └── Einsatz 2
```

Ein Sammlerstück kann einem konkreten Lagerort zugeordnet werden.

### Lagerort-Typen

Mögliche Typen sind beispielsweise:

- Raum;
- Schrank;
- Vitrine;
- Regal;
- Fach;
- Box;
- Ordner;
- Schublade;
- Tresor;
- frei definierter Lagerort.

Die Hierarchie bleibt flexibel und wird nicht auf eine feste Anzahl Ebenen begrenzt.

### QR-/Barcode-Labels

Lagerorte können ein eigenes scanbares Label erhalten.

Beim Scannen eines Labels soll Sammlerraum direkt den zugehörigen Lagerort öffnen und dessen Inhalt anzeigen.

Mögliche Funktionen:

- Inhalt eines Lagerorts anzeigen;
- neues Stück direkt diesem Lagerort zuordnen;
- Stück in einen anderen Lagerort verschieben;
- Lagerort-Details bearbeiten;
- Bestandsprüfung unterstützen.

### Labels

Sammlerraum kann druckbare Labels erzeugen.

Vorgesehen sind mindestens:

- QR-Code;
- menschenlesbarer Kurzname;
- eindeutige interne Kennung.

Später können zusätzliche Barcode-Formate ergänzt werden, wenn dies für bestimmte Scanner oder Etikettendrucker sinnvoll ist.

### Standort-Historie

Änderungen des Lagerorts können historisiert werden, damit nachvollziehbar bleibt, wann ein Stück verschoben wurde.

### Datenschutz

Ein interner physischer Lagerort wird **nicht automatisch öffentlich**, auch wenn ein Sammlerstück öffentlich sichtbar ist.

Bezeichnungen wie:

- „Tresor“;
- genaue Wohnungsbereiche;
- interne Box-/Regalnummern;

bleiben standardmäßig private Bestandsinformationen.

### Grundsatz

Die Standortverwaltung ist Teil des persönlichen Inventars und unabhängig von öffentlicher Community-Darstellung.

---

## 22. Versicherung und Bestandsnachweise

### Festgelegt: Strukturierter Versicherungsmodus + exportierbare Bestandsberichte

Sammlerraum unterstützt Nutzer dabei, wertvolle Sammlungen für eigene Unterlagen oder Versicherungszwecke nachvollziehbar zu dokumentieren.

### Versicherungsdaten

Für Sammlungen und einzelne Sammlerstücke können optionale Versicherungsinformationen hinterlegt werden.

Mögliche Felder:

- versicherter Wert;
- Bewertungsstichtag;
- Versicherer;
- Policen-/Vertragsreferenz;
- versicherte Sammlung;
- besondere Deckungshinweise;
- Kommentar/Notiz.

Versicherungsdaten sind standardmäßig **privat**.

### Nachweise

Versicherungsrelevante Dokumente können strukturiert mit Sammlungen oder Stücken verknüpft werden.

Beispiele:

- Kaufbelege;
- Rechnungen;
- Echtheitszertifikate;
- Grading-Nachweise;
- Gutachten;
- Expertisen;
- Versicherungsunterlagen;
- Fotos des Zustands;
- Provenienz-Dokumente.

### Bestandsbericht

Sammlerraum kann einen exportierbaren Bestandsbericht erzeugen.

Der Bericht kann je nach Auswahl enthalten:

- Sammlungsname;
- Objektbezeichnung;
- Kategorie;
- Referenz-/Katalognummer;
- Seriennummer;
- Zustand;
- Grading;
- Kaufdatum;
- Kaufpreis;
- eigener Schätzwert;
- externer Marktwert;
- versicherter Wert;
- Bewertungsstichtag;
- ausgewählte Bilder;
- ausgewählte Nachweise;
- Lagerort, nur wenn vom Nutzer ausdrücklich gewünscht.

### Exportformate

Vorgesehen sind mindestens:

- PDF-Bericht;
- Excel-/XLSX-Auswertung;
- CSV für strukturierte Weiterverarbeitung.

### Datenschutz

Sensible Informationen werden nicht automatisch in einen Export aufgenommen.

Der Nutzer entscheidet explizit, ob z. B. folgende Angaben enthalten sein sollen:

- Versicherer;
- Policennummer;
- Lagerort;
- Kaufbelege;
- personenbezogene Dokumente;
- private Notizen.

### Stichtagsprinzip

Ein Versicherungsbericht kann einen festen Stichtag besitzen.

Dadurch bleibt nachvollziehbar, auf welchem Datenstand ein Bericht basiert, auch wenn sich Werte oder Bestand später ändern.

### Grundsatz

Sammlerraum stellt Dokumentations- und Exportfunktionen bereit, übernimmt aber keine eigene versicherungsrechtliche Bewertung und ersetzt kein professionelles Gutachten.

---

## 23. Änderungsverlauf und Audit-Log

### Festgelegt: Vollständiger Verlauf für wichtige Änderungen

Sammlerraum protokolliert relevante Änderungen an Sammlungen und Sammlerstücken nachvollziehbar.

### Protokollierte Änderungen

Mindestens folgende Änderungen sollen historisiert werden:

- Titel/Name;
- Kategorie und Sammlung;
- Zustand;
- Grading und Grading-Anbieter;
- Kaufpreis und Kaufdatum;
- eigener Schätzwert;
- externer Marktwert;
- versicherter Wert;
- Lagerort;
- Sichtbarkeit;
- Tausch-/Verkaufsstatus;
- Tags;
- benutzerdefinierte Felder;
- Medien und Dokumente;
- Nachweise;
- Besitzer-/Rollenänderungen;
- Import-bedingte Änderungen;
- Lösch- und Wiederherstellungsaktionen.

### Audit-Daten

Ein Eintrag enthält mindestens:

- Zeitpunkt;
- Art der Änderung;
- betroffener Datensatz;
- vorheriger Wert;
- neuer Wert;
- ausführender Nutzer bzw. Systemprozess;
- Quelle der Änderung, z. B. manuell, Import, API, AI-Vorschlag oder Marktpreis-Update.

### Wiederherstellung

Für geeignete Änderungen soll eine gezielte Wiederherstellung möglich sein.

Beispiele:

- Zustand auf vorherigen Wert zurücksetzen;
- versehentlich geänderten Lagerort wiederherstellen;
- Sichtbarkeit zurücksetzen;
- frühere Metadaten wiederherstellen.

Nicht jede Aktion wird automatisch rückgängig gemacht. Kritische oder irreversible Vorgänge benötigen eine klare Bestätigung.

### Löschungen

Wo sinnvoll, werden Datensätze zunächst soft-deleted bzw. in einen Papierkorb verschoben, bevor sie endgültig entfernt werden.

Der Audit-Verlauf darf selbst nicht stillschweigend mitgelöscht werden, sofern gesetzliche oder datenschutzrechtliche Vorgaben dem nicht entgegenstehen.

### Gemeinsame Sammlungen

Bei kollaborativen Sammlungen ist nachvollziehbar, welches Mitglied welche Änderung vorgenommen hat.

Owner und berechtigte Admins können den Änderungsverlauf einsehen.

### Systemänderungen

Automatische Änderungen werden klar als solche gekennzeichnet, z. B.:

- Marktpreis-Import;
- AI-gestützter Vorschlag;
- Datenmigration;
- Importjob;
- Moderationsaktion.

### Grundsatz

Der Audit-Log dient Nachvollziehbarkeit, Zusammenarbeit und Datenintegrität.

Er darf nicht dazu verwendet werden, gelöschte personenbezogene Daten unbegrenzt gegen den erklärten Löschwunsch eines Nutzers aufzubewahren.

---

## 24. Hosting und Betrieb

### Festgelegt: Docker / Self-Hosted / PostgreSQL / Portainer

Sammlerraum wird auf eigener Server-Infrastruktur betrieben.

### Betriebsmodell

Vorgesehen sind:

- Docker-basierte Services;
- PostgreSQL als primäre relationale Datenbank;
- persistenter Datei-/Medienspeicher;
- Deployment aus GitHub;
- Betrieb und Redeploy über Portainer;
- reproduzierbare Produktionskonfiguration über Docker Compose.

### Datenbank

PostgreSQL dient als zentrale persistente Datenbank für insbesondere:

- Accounts und Authentifizierung;
- Sammlungen und Sammlerstücke;
- Rollen und Berechtigungen;
- Community-Daten;
- Wert-Historien;
- Audit-Logs;
- Benachrichtigungen;
- Katalogdaten;
- Import-/Export-Jobs;
- Premium-/Billing-Status.

Datenbankdaten werden in einem eigenen persistenten Volume gespeichert.

### Medien und Dokumente

Bilder, Kaufbelege, Zertifikate und andere Dateien werden nicht flüchtig im Container-Dateisystem abgelegt.

Vorgesehen ist ein persistenter Medien-/Dateispeicher mit:

- stabilen internen IDs;
- getrennten Metadaten in PostgreSQL;
- serverseitiger Zugriffskontrolle;
- Backups;
- klarer Trennung zwischen privaten und öffentlich freigegebenen Dateien.

Das Speicherbackend soll so gekapselt werden, dass ein späterer Wechsel zu objektbasiertem Storage möglich bleibt, ohne das fachliche Datenmodell umzubauen.

### Deployment

Produktionsänderungen laufen über GitHub und werden anschließend durch die Server-/Portainer-Infrastruktur ausgerollt.

Deployment muss mindestens berücksichtigen:

- Datenbankmigrationen;
- persistente Volumes;
- Secrets/Environment-Variablen;
- Healthchecks;
- reproduzierbare Builds;
- Rollback-fähige Releases.

### Backups

Für produktive Daten sind regelmäßige Backups vorgesehen.

Mindestens abzusichern sind:

- PostgreSQL;
- Medien/Dokumente;
- relevante Konfigurationen/Secrets außerhalb des Repositories.

Backup- und Restore-Prozesse müssen getestet werden und dürfen nicht nur theoretisch dokumentiert sein.

### Grundsatz

Container können jederzeit neu gebaut oder ersetzt werden, ohne dass produktive Daten verloren gehen.

Persistente Daten dürfen niemals an den Lebenszyklus eines einzelnen App-Containers gekoppelt sein.

---

## 25. AI-Architektur

### Festgelegt: Provider-Abstraktion mit zunächst einem produktiven Anbieter

Sammlerraum erhält eine eigene AI-Schicht im Backend.

Die Anwendung bindet AI-Funktionen nicht direkt an UI-Komponenten oder einen einzelnen Anbieter, sondern verwendet eine interne Provider-Schnittstelle.

### Erste produktive Nutzung

Zum Start wird ein konkreter AI-Anbieter produktiv integriert.

Die Architektur bleibt jedoch so aufgebaut, dass später weitere Anbieter ergänzt oder einzelne Aufgaben lokal ausgeführt werden können.

### Typische AI-Aufgaben

Vorgesehen sind insbesondere:

- Fotoanalyse zur Objekterkennung;
- Vorschläge für Kategorie und Unterkategorie;
- Vorschläge für Hersteller, Serie/Set, Jahrgang und weitere Metadaten;
- Erkennung sichtbarer Identifikatoren;
- Unterstützung bei der Zuordnung zu einem globalen Referenzobjekt;
- strukturierte Extraktion aus Bildern oder Dokumenten, sofern sinnvoll und rechtlich zulässig;
- spätere Unterstützung bei Katalogpflege und Datenbereinigung.

### Provider-Schnittstelle

Die interne AI-Schicht soll mindestens kapseln:

- Anbieter/Modell;
- Request-Aufbau;
- strukturierte Antwortschemas;
- Timeouts;
- Retries;
- Fehlerbehandlung;
- Kosten-/Nutzungserfassung;
- Rate Limits;
- Logging ohne unnötige Speicherung sensibler Nutzerdaten.

Fachlogik darf nicht von anbieterspezifischen Antwortformaten abhängen.

### Qualitäts- und Sicherheitsgrundsatz

AI-Ergebnisse werden als Vorschläge behandelt.

Insbesondere folgende Aussagen dürfen nicht allein aufgrund eines AI-Modells als gesicherte Fakten übernommen werden:

- Echtheit;
- Marktwert;
- Seltenheit;
- Provenienz;
- Grading;
- Zustand;
- exakte Edition/Variante bei unklarer visueller Evidenz.

Der Nutzer bestätigt oder korrigiert relevante Vorschläge vor der dauerhaften Übernahme.

### Datenschutz

Private Bilder und Dokumente dürfen nur für die vom Nutzer ausgelöste Funktion an einen externen AI-Anbieter übermittelt werden.

Vorgesehen sind:

- Datenminimierung;
- keine unnötige Weitergabe kompletter Dokumente;
- transparente Datenschutzhinweise;
- klare Trennung zwischen AI-Verarbeitung und öffentlichen Inhalten;
- keine Verwendung privater Nutzerdaten für eigene Modelltrainings ohne ausdrückliche Rechtsgrundlage und Einwilligung.

### Austauschbarkeit

Ein späterer Wechsel des AI-Anbieters oder eine Kombination aus Cloud- und lokalen Modellen darf keine Änderung des fachlichen Sammlungsdatenmodells erfordern.

---

## 26. Marktpreisquellen und Quellenvergleich

### Festgelegt: Mehrere externe Preisquellen mit transparenter Herkunft

Sammlerraum kann pro Kategorie mehrere externe Marktpreisquellen anbinden und deren Werte getrennt speichern.

Es gibt **keinen einzigen undurchsichtigen „Sammlerraum-Marktwert“**, wenn unterschiedliche Quellen verfügbar sind.

### Quellenmodell

Jeder externe Preisdatensatz enthält mindestens:

- Datenquelle;
- Referenz zum globalen Katalogobjekt bzw. zur erkannten Variante;
- Zeitpunkt der Ermittlung;
- Währung;
- Preis bzw. Preisbereich;
- Datenart;
- Qualitäts-/Vertrauensmetadaten, sofern verfügbar.

Mögliche Datenarten sind beispielsweise:

- letzter Verkauf;
- durchschnittlicher Verkaufspreis;
- Median;
- Angebotspreis;
- Preisbereich;
- Katalogwert;
- Händlerpreis.

Diese Arten dürfen nicht ohne Kennzeichnung miteinander vermischt werden.

### Quellenvergleich

Wenn mehrere Quellen vorliegen, kann der Nutzer diese nebeneinander vergleichen.

Beispiel:

```
Quelle A   Median verkaufter Artikel   420 €
Quelle B   letzter Verkauf             445 €
Quelle C   aktueller Angebotspreis     499 €
```

Sammlerraum darf daraus nicht automatisch eine vermeintlich exakte Wahrheit ableiten.

Eine optionale aggregierte Orientierung kann später angeboten werden, muss aber Methodik und zugrunde liegende Quellen transparent machen.

### Kategorieabhängige Anbieter

Preisquellen werden modular pro Sammlerbereich angebunden.

Beispiele:

- Trading Cards;
- Comics;
- Uhren;
- Münzen;
- Vinyl;
- weitere Kategorien mit belastbaren Datenanbietern.

Nicht jede Kategorie muss externe Marktdaten besitzen.

### Historisierung

Externe Werte werden historisiert, damit Preisentwicklungen nachvollziehbar bleiben.

Ein neuer Datenpunkt überschreibt nicht stillschweigend den vorherigen.

### Datenqualität

Vor Übernahme externer Preise muss möglichst eindeutig geklärt sein, welche Variante bewertet wird.

Relevant können beispielsweise sein:

- Edition;
- Sprache;
- Zustand;
- Grading-Anbieter;
- Grading-Note;
- Jahrgang;
- Referenznummer;
- Variantenmerkmale.

Bei unklarer Zuordnung wird der Wert als unsicher gekennzeichnet oder nicht automatisch übernommen.

### Recht und Nutzung

Externe Daten werden nur eingebunden, wenn API-Zugriff, Lizenz, Nutzungsbedingungen und Speicherung dies erlauben.

Web-Scraping wird nicht als stillschweigende Standardlösung vorausgesetzt.

### Kosten und Premium

Kostenpflichtige Marktpreisquellen können Bestandteil von Premium sein oder durch faire Kontingente begrenzt werden.

Die kostenlose manuelle Wertpflege bleibt davon unabhängig nutzbar.

---

## 27. Release-Umfang Version 1

### Festgelegt: Vollständiger Funktionsumfang bereits in V1

Version 1 von Sammlerraum umfasst **alle bisher verbindlich festgelegten Produktbereiche**.

Es wird bewusst kein künstlich reduziertes MVP veröffentlicht.

### V1 umfasst insbesondere

- private und öffentliche Sammlungen;
- mehrere Sammlungen und hierarchische Teil-Sammlungen;
- universelles Datenmodell mit Kategorie-Vorlagen;
- manuelle Erfassung;
- Barcode-/ISBN-/EAN-Erkennung;
- Foto-/AI-Unterstützung;
- Bilder, Dokumente und Nachweise;
- Kaufpreis, eigene Werte und Wert-Historie;
- mehrere externe Marktpreisquellen;
- Quellenvergleich;
- globalen Referenzkatalog;
- Community-gestützte Katalogpflege;
- Wunschlisten;
- Dubletten;
- Tausch-/Verkaufsstatus;
- öffentliche Profile;
- Folgen;
- Likes/Favoriten;
- Kommentare;
- Melden und Blockieren;
- Moderation;
- gemeinsame Sammlungen mit Rollen;
- Tags;
- benutzerdefinierte Felder;
- CSV-/Excel-Import und -Export;
- Importprofile;
- erweiterte Suche und Filter;
- Smart Collections;
- Sammler-Dashboard und Statistiken;
- Lagerorte;
- QR-/Barcode-Labels;
- Versicherungsmodus;
- PDF-/Excel-/CSV-Bestandsberichte;
- Audit-Log und Wiederherstellung;
- Freemium/Premium;
- E-Mail/Passwort, Apple, Google und Passkeys;
- In-App- und E-Mail-Benachrichtigungen;
- DE/EN;
- responsive Web-App;
- API-/Backend-Basis für spätere iOS-/Android-Apps;
- Docker-/PostgreSQL-/Portainer-Betrieb;
- persistente Medien;
- Backups und Restore-Prozess.

### Entwicklungsstrategie

Obwohl alles zu V1 gehört, wird die Implementierung intern in klar abgegrenzte Bauphasen zerlegt.

Ziel ist:

- saubere Architektur statt schneller Wegwerf-Prototypen;
- testbare Module;
- stabile Datenmigrationen;
- durchgängige Berechtigungsprüfung;
- reproduzierbare Deployments;
- vollständige Integrationstests;
- keine Veröffentlichung eines halbfertigen Teilprodukts.

### Release-Grundsatz

Sammlerraum.de wird erst als V1 veröffentlicht, wenn der vollständige vereinbarte Funktionsumfang integriert, getestet und produktionsreif ist.

Ein langer Entwicklungszeitraum ist ausdrücklich akzeptiert, wenn dadurch Qualität, Datenintegrität, Sicherheit und Wartbarkeit verbessert werden.

---

## 28. Systemarchitektur

### Festgelegt: Modularer Monolith + separater Background Worker

Sammlerraum wird als modularer Monolith aufgebaut.

Die Anwendung bleibt in einer gemeinsamen Codebasis, wird aber fachlich in klar abgegrenzte Module getrennt.

### Fachmodule

Vorgesehen sind mindestens:

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
- Imports / Exports;
- Insurance;
- Notifications;
- Billing;
- Moderation;
- Audit.

### Web- und API-Schicht

Die Web-Anwendung wird mit **Next.js + TypeScript** umgesetzt.

Geschäftslogik wird nicht ausschließlich in UI-Komponenten implementiert.

Serverseitige APIs/Services bilden die zentrale fachliche Logik, damit spätere iOS-/Android-Apps dieselben Regeln und Daten verwenden können.

### Background Worker

Langlaufende oder asynchrone Aufgaben werden über einen separaten Worker verarbeitet.

Dazu gehören insbesondere:

- AI-Fotoanalyse;
- Marktpreisabrufe;
- CSV-/Excel-Importe;
- Exporte und PDF-Erzeugung;
- Bildverarbeitung;
- E-Mail-Versand;
- Benachrichtigungen;
- Katalog-Synchronisation;
- periodische Statistiken;
- Wartungs- und Bereinigungsjobs.

### Job Queue

Web und Worker kommunizieren für Hintergrundaufgaben über eine Job-Queue.

Jobs erhalten mindestens:

- Typ;
- Payload;
- Status;
- Versuchsanzahl;
- Fehlerzustand;
- Zeitstempel;
- Bezug zu Nutzer/Objekt, soweit erforderlich.

Fehlgeschlagene Jobs müssen wiederholbar und nachvollziehbar sein.

### Datenbank

PostgreSQL bleibt die zentrale relationale Datenbank.

Die Module teilen sich zunächst dieselbe Datenbank, besitzen aber klar abgegrenzte Tabellen/Modelle und Service-Grenzen.

Direkte unkontrollierte Querabhängigkeiten zwischen Modulen werden vermieden.

### Berechtigungen

RBAC, Eigentum, Sichtbarkeit und Datenschutz werden serverseitig geprüft.

Kein Client darf allein entscheiden, ob ein Nutzer Daten lesen oder verändern darf.

### Medien

Dateispeicherung wird hinter einer Storage-Abstraktion gekapselt.

Die erste produktive Implementierung nutzt persistenten self-hosted Storage, kann später aber auf objektbasierten Storage migriert werden.

### Deployment

Docker Compose enthält mindestens getrennte Services für:

- Web;
- Worker;
- PostgreSQL;
- Queue/Infrastruktur, falls erforderlich.

Persistente Daten liegen außerhalb kurzlebiger Container.

### Entwicklungsgrundsatz

Die Architektur soll spätere Auslagerungen einzelner Module ermöglichen, ohne Sammlerraum von Anfang an in Microservices zu zerschneiden.

Microservices sind für V1 ausdrücklich **nicht** vorgesehen.

---

## 29. Datenmodell-Grundstruktur

### Festgelegt: Globales Referenzobjekt und persönliches Exemplar strikt getrennt

Sammlerraum trennt globale Katalogdaten von den individuellen Exemplaren der Nutzer.

### Account- und Profilbereich

```
User
├── Profile
├── AuthIdentity
├── Passkey
├── Subscription
└── NotificationPreference
```

Authentifizierungsdaten, öffentliche Profildaten und Premium-/Benachrichtigungseinstellungen bleiben fachlich getrennt.

### Sammlungen und Struktur

```
Collection
├── CollectionMember
├── CollectionNode
├── CustomFieldDefinition
├── StorageLocation
└── SmartCollection
```

Eine Sammlung kann mehrere Mitglieder besitzen.

`CollectionNode` bildet die echte hierarchische Struktur einer Sammlung ab.

`SmartCollection` speichert dagegen nur eine dynamische Filterdefinition und dupliziert keine Sammlerstücke.

### Globaler Referenzkatalog

```
CatalogEntry
├── CatalogVariant
├── CatalogAttribute
├── ExternalIdentifier
└── CatalogRevision
```

Ein globaler Katalogeintrag beschreibt ein allgemein bekanntes Objekt oder eine definierte Variante.

Beispiel:

```
Pokémon Charizard
└── Base Set
    └── 1st Edition
```

Globale Daten enthalten keine nutzerspezifischen Kauf-, Lager-, Zustands- oder Besitzinformationen.

### Persönliches Exemplar

```
CollectibleItem
├── optional CatalogEntry / CatalogVariant
├── ItemAttribute
├── CustomFieldValue
├── Tag
├── MediaAsset
├── Document
├── Provenance
├── Grading
├── Purchase
├── StorageLocation
└── Visibility
```

Ein `CollectibleItem` ist immer das konkrete Exemplar eines Nutzers bzw. einer Sammlung.

Beispiel:

Das globale Referenzobjekt kann „Charizard Base Set 1st Edition“ sein.

Das persönliche Exemplar besitzt separat:

- individuellen Zustand;
- eigene PSA-/Grading-Note;
- Zertifikatsnummer;
- Kaufdatum;
- Kaufpreis;
- persönliche Fotos;
- Provenienz;
- Lagerort;
- Sichtbarkeit;
- Wertverlauf.

Mehrere Nutzer können auf denselben globalen Referenzeintrag verweisen, ohne persönliche Daten miteinander zu vermischen.

### Werte

```
Valuation
├── ManualValuation
├── ExternalMarketPoint
├── InsuranceValue
└── HistoricalSnapshot
```

Eigene Bewertungen, externe Marktdaten und Versicherungswerte bleiben unterscheidbar und historisierbar.

### Wunschliste und Handelsvorbereitung

```
WishlistEntry
TradeStatus
DuplicateRelation
```

Wunschlisten-Einträge sind nicht identisch mit vorhandenen Exemplaren.

Dubletten können sowohl über identische Referenzobjekte als auch über explizite Nutzerzuordnung erkannt bzw. markiert werden.

### Community

```
Follow
Favorite
Comment
Block
Report
```

Community-Interaktionen werden von Sammlungs- und Katalogdaten getrennt modelliert.

### Systemobjekte

```
AuditEvent
Notification
ImportJob
ExportJob
AIJob
```

Langlaufende Prozesse und Audit-Ereignisse erhalten eigene persistente Modelle.

### Strukturierte statt rein JSON-basierte Daten

Sammlerraum speichert nicht das gesamte fachliche Modell in frei geformten JSON-Dokumenten.

Häufig gesuchte und fachlich zentrale Daten bleiben als echte typisierte Datenbankfelder bzw. Relationen erhalten.

Flexible Kategorie- und Nutzerfelder werden über typisierte Attributmodelle abgebildet.

Dadurch bleiben insbesondere folgende Funktionen performant und wartbar:

- Suche;
- Filter;
- Smart Collections;
- Statistiken;
- Marktpreis-Zuordnung;
- Datenmigrationen;
- Import/Export;
- spätere API-Erweiterungen.

JSON kann ergänzend für klar abgegrenzte Metadaten oder externe Rohdaten verwendet werden, ersetzt aber nicht das kanonische fachliche Datenmodell.

---

## 30. API, Berechtigungen und Sichtbarkeit

### Festgelegt: Versionierte REST-API + zentrale Policy-Schicht

Sammlerraum verwendet eine klar versionierte REST-API.

Beispielstruktur:

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

GraphQL ist für Version 1 ausdrücklich nicht vorgesehen.

### Gemeinsame Service-Schicht

Web-Oberfläche und API verwenden dieselbe fachliche Logik.

Der grundlegende Ablauf lautet:

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

Geschäftsregeln dürfen nicht ausschließlich in React-Komponenten oder anderem Client-Code liegen.

### Zentrale Berechtigungslogik

Berechtigungen werden nicht durch verstreute Einzelprüfungen umgesetzt, sondern über eine zentrale Policy-Schicht.

Sie berücksichtigt insbesondere:

- Owner / Admin / Editor / Viewer;
- Eigentümer und Sammlungszugehörigkeit;
- private / öffentliche / nicht gelistete Sichtbarkeit;
- Vererbung innerhalb der Sammlungshierarchie;
- Blockierungen;
- Moderationszustand;
- Premium-Berechtigungen;
- sensible Dokumenttypen;
- interne Daten wie Lagerorte, Audit-Logs und Versicherungsinformationen.

Typische Policies sind beispielsweise:

```
canViewItem(...)
canEditItem(...)
canDeleteItem(...)
canViewDocument(...)
canComment(...)
canManageMembers(...)
```

### Server-seitig erzwungene Sichtbarkeit

Private Inhalte dürfen nicht ausgeliefert werden, nur weil jemand eine interne ID oder UUID kennt.

Dies gilt unter anderem für:

- private Sammlerstücke;
- Kaufbelege;
- Rechnungen;
- Lagerorte;
- Versicherungs-/Policendaten;
- private Notizen;
- Audit-Logs;
- nicht freigegebene Wertdaten;
- private Medien und Dokumente.

Sichtbarkeit wird im Backend geprüft und nicht nur im Frontend ausgeblendet.

### Validierung

Alle externen Eingaben werden serverseitig gegen definierte Schemas geprüft.

Dazu gehören insbesondere:

- API-Requests;
- Formulare;
- Imports;
- Webhooks;
- AI-Ergebnisse;
- externe Marktpreisdaten.

### OpenAPI

Für die öffentliche/interne Client-API wird eine OpenAPI-Spezifikation gepflegt oder aus den verbindlichen Schemas generiert.

Ziel:

- stabile API-Verträge;
- dokumentierte Request-/Response-Formate;
- Grundlage für spätere Swift-/Kotlin-Clients;
- weniger Drift zwischen Web und nativen Apps.

### Einheitliches Fehlerformat

API-Endpunkte verwenden ein einheitliches Fehlerformat.

Beispiel:

```json
{
  "error": {
    "code": "ITEM_NOT_FOUND",
    "message": "...",
    "requestId": "..."
  }
}
```

Interne Stacktraces, Datenbankdetails oder sensible technische Informationen werden nicht an Clients ausgegeben.

### Race Conditions und Idempotenz

Kritische Vorgänge verwenden Datenbanktransaktionen, Constraints und bei Bedarf Idempotency Keys.

Besonders relevant für:

- Rollenwechsel;
- Einladungen;
- Imports;
- Dubletten-Zusammenführung;
- Premium-/Billing-Webhooks;
- Katalogfreigaben;
- Marktpreis-Synchronisation;
- Hintergrundjobs.

### REST-Grundsatz

REST wird für V1 bevorzugt, weil es für Web und spätere native Apps ausreichend klar, dokumentierbar und gut kontrollierbar ist.

Eine spätere zusätzliche Schnittstellentechnologie ist möglich, aber nicht Bestandteil des V1-Designs.

---

## 31. Background Jobs und Queue

### Festgelegt: PostgreSQL-basierte Queue + separater Worker

Langlaufende oder asynchrone Aufgaben werden nicht innerhalb normaler HTTP-Requests ausgeführt.

Die Architektur besteht aus:

```
Next.js Web
    │
    ├── normale Requests → PostgreSQL
    │
    └── längere Aufgaben → Job Queue
                            │
                            ▼
                      Worker-Prozess
                            │
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
            AI           Media        Market Data
             │              │              │
             └──────────────┴──────────────┘
                            │
                       PostgreSQL
```

### Queue-Technik

Für V1 wird eine **PostgreSQL-basierte Job-Queue** verwendet, z. B. über eine robuste Library wie `pg-boss`.

Dadurch bleibt die Infrastruktur schlank und benötigt nicht zwingend einen zusätzlichen Redis-Dienst.

Die Queue wird über eine interne Abstraktionsschicht angesprochen, damit ein späterer Wechsel auf Redis/BullMQ oder eine andere Queue-Technik möglich bleibt.

### Typische Job-Arten

- AI-Fotoanalyse;
- Bildverarbeitung;
- Marktpreisabrufe;
- Katalog-Synchronisation;
- CSV-/Excel-Importe;
- Exporte;
- PDF-Erzeugung;
- E-Mail-Versand;
- Benachrichtigungen;
- periodische Statistiken;
- Wartungs-/Bereinigungsjobs;
- spätere Push-Zustellung.

### Job-Zustände

Mindestens:

- `QUEUED`;
- `PROCESSING`;
- `SUCCEEDED`;
- `FAILED`;
- `CANCELLED`.

Zusätzlich können gespeichert werden:

- Fortschritt 0–100 %;
- aktueller Verarbeitungsschritt;
- Retry-Anzahl;
- letzter Fehler;
- Erstellungszeit;
- Startzeit;
- Endzeit;
- Initiator;
- betroffener Datensatz.

### Fortschritt

Längere Jobs wie Imports oder Exporte sollen ihren Fortschritt für die UI melden können.

Beispiel:

```
742 / 1.250 Objekte verarbeitet
```

### Idempotenz

Wichtige Jobs müssen wiederholbar sein, ohne doppelte Daten oder Seiteneffekte zu erzeugen.

Besonders relevant für:

- Imports;
- E-Mail-Versand;
- Marktpreis-Synchronisierung;
- AI-Auswertung;
- Bildvarianten;
- Katalog-Sync;
- Billing-Webhooks.

### Retries und Fehlerbehandlung

Fehlgeschlagene Jobs erhalten kontrollierte Wiederholungsversuche.

Dauerhaft fehlgeschlagene Jobs bleiben nachvollziehbar und dürfen nicht stillschweigend verschwinden.

### Concurrency

Schwere Job-Klassen können getrennte Concurrency-Limits erhalten.

Dadurch können z. B. viele AI- oder Bildjobs nicht gleichzeitig sämtliche Serverressourcen blockieren.

### Grundsatz

PostgreSQL dient für V1 als Queue-Backend, aber die fachlichen Module hängen nicht direkt von einer konkreten Queue-Library ab.

---

## 32. Medien- und Dateispeicher

### Festgelegt: Storage-Abstraktion + persistenter lokaler Storage für V1

Sammlerraum kapselt Datei- und Medienspeicherung hinter einer internen Storage-Schnittstelle.

### Storage-Architektur

```
MediaService
    ↓
StorageProvider
    ├── LocalPersistentStorage   ← V1
    └── S3CompatibleStorage      ← später möglich
```

Die Fachlogik darf nicht direkt von einem bestimmten Dateisystem oder Storage-Anbieter abhängen.

Für Version 1 wird persistenter lokaler Docker-Storage verwendet.

### Geschützte Dateiauslieferung

Private oder geschützte Dateien werden nicht über frei erratbare öffentliche Dateipfade ausgeliefert.

Stattdessen erfolgt der Zugriff über kontrollierte Endpunkte wie:

```
/api/v1/media/<asset-id>
```

Vor Auslieferung prüft das Backend insbesondere:

- eingeloggten Nutzer;
- Eigentum bzw. Sammlungsrolle;
- Sichtbarkeit;
- Dokumenttyp;
- Blockierungen;
- Moderationszustand;
- weitere Policy-Regeln.

### Bildverarbeitung

Originalbilder bleiben erhalten.

Der Background Worker erzeugt optimierte Varianten, z. B.:

```
original
thumbnail
medium
large
```

Dadurch müssen Listen, Community-Feeds und Vorschaubereiche keine unnötig großen Originaldateien laden.

Vorgesehen sind außerdem:

- echte Dateitypprüfung statt bloßer Dateiendung;
- Bild-Decoding zur Validierung;
- Größenlimits;
- Pixel-/Megapixel-Limits;
- Entfernen unnötiger EXIF-Metadaten, insbesondere GPS;
- moderne Auslieferungsformate wie WebP/AVIF, soweit sinnvoll.

### Dokumente

Kaufbelege, Zertifikate, Versicherungsunterlagen und weitere Dateien werden getrennt von normalen Bildern behandelt.

Vorgesehen sind:

- erlaubte Dateitypen;
- Größenlimits;
- MIME-/Magic-Byte-Prüfung;
- sichere interne Dateinamen bzw. UUIDs;
- kein direktes Ausführen hochgeladener Inhalte;
- Quarantäne-/Prüfmechanismen für verdächtige Dateien.

### Datenmodell

Dateiobjekt und fachliche Zuordnung werden getrennt modelliert.

Beispiel:

```
MediaAsset
├── storageKey
├── mimeType
├── size
├── checksum
├── width / height
└── processingStatus

MediaLink
├── itemId
├── purpose
├── visibility
├── sortOrder
└── caption
```

Dadurch kann dieselbe Storage-Schicht unter anderem verwenden:

- Sammlerstück-Bilder;
- Dokumente;
- Profilbilder;
- Katalogbilder;
- Versicherungsunterlagen;
- spätere Community-Medien.

### Backups und Restore

PostgreSQL und Dateispeicher werden als zusammengehöriger Produktdatenbestand behandelt.

Vorgesehen sind:

- regelmäßige Datenbank-Backups;
- regelmäßige Storage-Backups;
- definierter Restore-Prozess;
- tatsächliche Restore-Tests.

Ein Restore darf nicht zu einem Datenbankzustand führen, dessen referenzierte Dateien fehlen.

### Löschung und Bereinigung

Dateien werden nicht blind sofort endgültig gelöscht, sobald eine einzelne Referenz entfernt wird.

Ein Bereinigungsjob darf eine Datei erst endgültig entfernen, wenn:

- keine gültige Referenz mehr existiert;
- keine Aufbewahrungsregel entgegensteht;
- keine Wiederherstellungs-/Papierkorbfrist mehr läuft.

Dadurch werden sowohl Datenverlust als auch dauerhafte Dateileichen vermieden.

---

## 33. Bisherige Produktprinzipien

- private Nutzung muss vollständig möglich sein;
- Öffentlichkeit ist **Opt-in**, nicht Standard;
- universelles Datenmodell statt fest verdrahteter Einzel-App pro Sammelgebiet;
- spezialisierte Kategorie-Vorlagen für bessere UX;
- mehrere Sammlungen pro Account;
- optionale Teil-Sammlungen/Unterordner;
- Community von Anfang an architektonisch berücksichtigen;
- Kaufen/Verkaufen/Tauschen erst später als eigener Ausbau;
- keine unnötige Marktplatz-Komplexität in Version 1.

---

## 34. Zustandsbewertung und Grading

### Festgelegt: Kategorieabhängige Zustandsmodelle + getrenntes externes Grading

Sammlerraum verwendet **keine einzige globale Zustandsskala** für alle Sammlerbereiche.

Jede Kategorie kann ein eigenes fachlich passendes Zustandsschema besitzen.

### Beispiele

#### Trading Cards

Mögliche Zustandsstufen:

- Mint;
- Near Mint;
- Excellent;
- Good;
- Played;
- Poor.

#### Vinyl

Mögliche Stufen:

- M;
- NM;
- VG+;
- VG;
- G;
- F;
- P.

Bei Bedarf können Platte und Cover getrennt bewertet werden.

#### Uhren

Mögliche Stufen:

- ungetragen;
- sehr gut;
- gut;
- gebraucht;
- stark gebraucht;
- restaurierungsbedürftig.

#### Münzen

Für Münzen werden passende numismatische Zustandsmodelle verwendet, abhängig von Markt, Kategorie und verwendeter Vorlage.

### Zustand und Grading bleiben getrennt

Eine eigene Zustandseinschätzung ist nicht dasselbe wie ein externes Grading.

Beispiel:

```
Eigene Zustandseinschätzung: Near Mint
PSA-Grading: 9
```

Beide Werte werden separat gespeichert.

### Grading-Modell

Ein externer Grading-Datensatz kann insbesondere enthalten:

```
Grading
├── provider
├── grade
├── certificateNo
├── gradedAt
└── verificationUrl
```

Mögliche Anbieter sind z. B.:

- PSA;
- BGS;
- CGC;
- weitere fachlich etablierte Anbieter.

### Zustands-Historie

Änderungen des Zustands werden nicht stillschweigend überschrieben.

Historisiert werden mindestens:

- vorheriger Zustand;
- neuer Zustand;
- Zeitpunkt;
- Bearbeiter;
- optionale Begründung.

Der Verlauf wird zusätzlich im Audit-Log sichtbar.

### Kategorieübergreifende Vergleichbarkeit

Intern kann ergänzend eine grobe normalisierte Qualitätsstufe verwendet werden, z. B. für:

- Filter;
- Statistiken;
- Smart Collections;
- übergreifende Auswertungen.

Diese interne Normalisierung ersetzt **nicht** die fachliche Zustandsbezeichnung und wird nicht als vermeintlich exakte Übersetzung zwischen unterschiedlichen Sammlerstandards dargestellt.

### Eigene Zustandsschemata

Für spezielle oder frei definierte Sammlungen können Nutzer eigene Zustandsoptionen anlegen.

Benutzerdefinierte Schemata verändern nicht die offiziellen Kategorie-Vorlagen anderer Nutzer.

---

## 35. Sammlerstück-Grundmodell

### Festgelegt: Persönliches Exemplar als zentraler fachlicher Datensatz

Jedes konkrete Sammlerstück wird als eigener `CollectibleItem`-Datensatz modelliert.

Beispielstruktur:

```
CollectibleItem
├── id
├── collectionId
├── collectionNodeId
├── catalogEntryId? / catalogVariantId?
├── title
├── description
├── quantity
├── acquisitionType
├── purchase / acquisition data
├── condition
├── grading
├── visibility
├── tradeStatus
├── storageLocation
├── tags
├── customFields
├── media
├── documents
├── valuations
├── insurance
├── provenance
└── audit/history
```

### Menge oder einzelne Exemplare

Sammlerraum unterstützt beide Modelle:

1. **Mengenobjekt**
   - für mehrere praktisch austauschbare Exemplare;
   - Beispiel: 20 identische Stücke mit derselben relevanten Beschreibung.

2. **Einzelobjekte**
   - für Exemplare mit eigenen Merkmalen;
   - z. B. unterschiedliche Seriennummern, Zustände, Gradings, Kaufpreise, Bilder oder Provenienz.

Ein Mengenobjekt kann später in einzelne Exemplare aufgeteilt werden.

### Erwerbsart

Nicht jedes Sammlerstück wird gekauft.

Unterstützte Erwerbsarten umfassen mindestens:

- gekauft;
- Geschenk;
- geerbt;
- getauscht;
- gefunden;
- selbst hergestellt;
- sonstiges.

Die Eingabemaske kann je nach Erwerbsart passende Felder einblenden.

### Erwerbsdaten

Mögliche Daten:

- Erwerbsdatum;
- Kaufpreis;
- Währung;
- Händler/Quelle;
- Verkäufer;
- Notiz;
- verknüpfter Kaufbeleg.

### Provenienz

Die Herkunfts-/Besitzgeschichte kann über eigene Einträge gepflegt werden.

Beispiel:

```
ProvenanceEntry
├── date
├── type
├── source
├── description
└── linkedDocument
```

Beispiele:

- 2018 – gekauft bei Händler X;
- 2023 – restauriert durch Werkstatt Y;
- 2025 – geerbt;
- Zertifikat oder Rechnung als verknüpfter Nachweis.

### Identifikatoren

Ein Sammlerstück kann mehrere Kennungen besitzen.

Beispiele:

- Seriennummer;
- Zertifikatsnummer;
- EAN / UPC;
- ISBN;
- Katalognummer;
- Hersteller-Referenz;
- interne Sammler-ID;
- frei definierte Kennung.

Diese Kennungen werden über eine eigene strukturierte `ItemIdentifier`-Relation gespeichert und nicht als große Menge fest verdrahteter Spalten.

### Vollständigkeitsstatus

Sammlerraum kann optional einen Datenvollständigkeitsstatus berechnen.

Mögliche Hinweise:

- Basisdaten fehlen;
- kein Bild;
- kein Zustand;
- kein Erwerbsdatum;
- kein Wert;
- fehlender Nachweis.

Diese Hinweise unterstützen die Datenpflege, blockieren aber das Speichern eines Stücks nicht.

### Öffentliche Beschreibung und private Notizen

Es werden mindestens zwei Textbereiche getrennt:

- öffentliche bzw. freigabefähige Beschreibung;
- private Notizen.

Private Notizen werden niemals automatisch öffentlich, nur weil das Sammlerstück öffentlich oder nicht gelistet ist.

### Lebenszyklus

Mindestens folgende Zeitpunkte können gespeichert werden:

- erstellt am;
- zuletzt geändert;
- erworben am;
- optional verkauft/getauscht/abgegeben am;
- archiviert am.

Ein Stück, das die Sammlung verlässt, muss nicht gelöscht werden.

Es kann archiviert bzw. als abgegeben markiert werden, damit unter anderem erhalten bleiben:

- Kaufhistorie;
- Verkaufs-/Tauschhistorie;
- Wertverlauf;
- Provenienz;
- Audit-Verlauf.

---

## 36. Teilen und gezielte Freigaben

### Festgelegt: Öffentlich + nicht gelistet + private Freigabelinks + granulare Rechte

Sammlerraum unterstützt mehrere Arten, Sammlungen und einzelne Stücke gezielt zu teilen.

### Öffentliche Links

Öffentliche Sammlungen erhalten stabile, gut teilbare URLs.

Beispiel:

```
sammlerraum.de/@piotr/pokemon
```

Öffentliche Stücke innerhalb einer öffentlichen Sammlung können direkt geteilt werden.

### Nicht gelistete Links

Nicht gelistete Inhalte erhalten einen nicht erratbaren Freigabelink.

Beispiel:

```
sammlerraum.de/share/<token>
```

Diese Inhalte erscheinen nicht:

- in der öffentlichen Suche;
- im Profil;
- im Community-Feed;
- in Entdeckungsansichten.

### Private Freigabelinks

Auch private Sammlungen oder Stücke können gezielt temporär freigegeben werden, ohne ihre Grundsichtbarkeit auf öffentlich zu ändern.

Eine private Freigabe kann optional besitzen:

- Ablaufdatum;
- jederzeitigen Widerruf;
- Passwort/PIN;
- Nur-Lesen-Modus;
- Bilder anzeigen/ausblenden;
- Werte anzeigen/ausblenden;
- ausgewählte Dokumente anzeigen/ausblenden;
- Download/Export erlauben oder sperren.

Beispiel:

> Sammlung für 7 Tage für einen Versicherungsberater freigeben, inklusive Werte und ausgewählter Nachweise.

### Personenbezogene Freigabe

Ein registrierter Nutzer kann expliziten Zugriff erhalten, ohne Mitglied der Sammlung zu werden.

Unterschied:

```
CollectionMember
→ dauerhafte Zusammenarbeit mit Rollen

CollectionShare
→ gezielte Freigabe zum Ansehen
```

So kann z. B. ein Gutachter, Freund oder Interessent Zugriff erhalten, ohne in das Rollenmodell der Sammlung aufgenommen zu werden.

### Granulare Feldauswahl

Freigaben können festlegen, welche Daten sichtbar sind.

Beispiel:

```
✓ Titel / Beschreibung
✓ Bilder
✓ Zustand
✓ Grading
✓ Marktwerte
☐ Kaufpreis
☐ Verkäufer
☐ Lagerort
☐ private Notizen
☐ Versicherungsdaten
☐ Kaufbelege
```

Private Notizen und exakte Lagerorte bleiben standardmäßig ausgeschlossen.

### Einzelne Stücke

Dasselbe Freigabemodell gilt auch für einzelne Sammlerstücke.

Beispiel:

> Nur diese Uhr inklusive Zertifikat für den Gutachter freigeben.

### Sicherheitsmodell

Jede Freigabe besitzt mindestens:

- interne ID;
- kryptografisch sicheren Token;
- Ersteller;
- Erstellzeit;
- optionales Ablaufdatum;
- Widerrufsstatus;
- Berechtigungsumfang.

Bei Widerruf wird die Freigabe sofort ungültig.

### Audit

Mindestens folgende Aktionen werden protokolliert:

- Freigabe erstellt;
- Freigabe geändert;
- Freigabe widerrufen.

Eine detaillierte Besucherüberwachung ist standardmäßig nicht vorgesehen.

---

## 37. Marktplatz- und Tausch-Ausbaustufe

### Festgelegt: V1 bereitet Handel vollständig vor, echter Checkout folgt später

Sammlerraum Version 1 enthält bereits die sammlungsbezogenen Grundlagen für späteren Handel:

- Wunschlisten;
- Dubletten;
- Status `nicht verfügbar`;
- Status `tauschbereit`;
- Status `verkaufsbereit`;
- öffentliche Profile;
- Community;
- globale Katalogobjekte;
- strukturierte Freigaben.

In V1 findet **keine Zahlungsabwicklung zwischen Nutzern** statt.

### Spätere Handelsobjekte

Das Datenmodell und die IDs werden so vorbereitet, dass später unter anderem folgende Objekte ergänzt werden können:

```
Listing
├── seller
├── item
├── type            # SALE / TRADE / SALE_OR_TRADE
├── askingPrice?
├── currency?
├── conditionSnapshot
├── description
├── status
└── createdAt

TradeOffer
├── sender
├── recipient
├── offeredItems[]
├── requestedItems[]
├── optionalCashAdjustment
└── status

PurchaseInquiry
Offer
Transaction
```

### Snapshot-Prinzip

Ein Inserat speichert einen Snapshot der für das Angebot relevanten Zustands- und Objektdaten.

Eine spätere Änderung des zugrunde liegenden Sammlerstücks darf nicht stillschweigend die Bedeutung eines bereits veröffentlichten Angebots verändern.

### Wunschlisten-Matching

Später kann Sammlerraum passende Konstellationen erkennen.

Beispiel:

- Nutzer A sucht Referenzobjekt X;
- Nutzer B besitzt X als Dublette;
- Nutzer B hat dieses Exemplar als tauschbereit markiert.

Das System darf daraus einen Match-Hinweis erzeugen, aber niemals automatisch einen Kontakt, Handel oder Vertragsabschluss auslösen.

### Marktpreise

Externe Marktpreisdaten dürfen als Orientierung dienen.

Der tatsächliche Angebots- oder Verkaufspreis wird vom Verkäufer festgelegt.

### Strukturierte Handelskommunikation

Eine spätere Handelsfunktion soll zunächst über strukturierte Vorgänge arbeiten:

- Anfrage;
- Angebot;
- Gegenangebot;
- Annahme;
- Ablehnung;
- optionaler Nachrichtentext.

Ein vollständig freier Handelschat ist nicht Voraussetzung für die erste Marktplatz-Ausbaustufe.

### Zahlungen als eigenes Subsystem

Wenn Sammlerraum später echte Käufe oder bezahlte Transaktionen zwischen Mitgliedern ermöglicht, wird dies als eigenes Subsystem entworfen.

Mindestens zu berücksichtigen sind dann:

```
Order
Payment
Refund
Shipping
Dispute
Payout
```

Vor Aktivierung müssen insbesondere geklärt werden:

- Zahlungsanbieter;
- Verkäuferidentifizierung/KYC, soweit erforderlich;
- Plattformhaftung;
- Gebührenmodell;
- Verbraucherschutz;
- Steuer- und Reportingpflichten;
- Rückerstattungen;
- Streitfälle;
- Betrugsschutz;
- Versand- und Nachweislogik.

### Architekturgrundsatz

Die V1-Grenzen werden so gewählt, dass später der Pfad

```
CollectibleItem → Listing → Offer → Transaction
```

ergänzt werden kann, ohne das Kernmodell von Sammlungen und Exemplaren neu aufzubauen.

Der vollständige Marktplatz mit Zahlungen bleibt eine spätere Produktphase.

---

## 38. Dokumentationsregel

Neue, vom Nutzer bestätigte Produktentscheidungen werden in dieser README ergänzt, damit der Projektstand unabhängig von der Chatlänge erhalten bleibt.

Noch nicht bestätigte Ideen werden **nicht** als festgelegt eingetragen.
