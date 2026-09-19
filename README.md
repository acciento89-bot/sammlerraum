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

## 6. Bisherige Produktprinzipien

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

## 7. Noch offen

Folgende Bereiche werden im weiteren Produktdesign festgelegt:

- Objekt-/Gegenstandsmodell
- Bilder pro Sammlerstück
- Zustandsbewertung
- Seriennummern und Echtheitsnachweise
- Tags und freie Felder
- Dubletten
- Wunschlisten
- öffentliche Profile
- Folgen / Likes / Kommentare
- Teilen einzelner Sammlungen
- Such- und Filterlogik
- Import / Export
- Statistik und Sammlungswert
- Monetarisierung
- Free-/Premium-Grenzen
- Authentifizierung
- Datenschutz / Sichtbarkeitsmodell
- technische Architektur
- Hosting / Datenbank / Bildspeicherung
- DE/EN
- spätere Apps für iOS/Android
- Marktplatz-/Tausch-Ausbaustufe

---

## 8. Dokumentationsregel

Neue, vom Nutzer bestätigte Produktentscheidungen werden in dieser README ergänzt, damit der Projektstand unabhängig von der Chatlänge erhalten bleibt.

Noch nicht bestätigte Ideen werden **nicht** als festgelegt eingetragen.
