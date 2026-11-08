import { isPublicLocale } from "./public-pages";
export { legalHref, legalLocaleHref, type LegalDocumentKind } from "./legal-routes";

type OptionalIntegrations = { ai: boolean; billing: boolean; market: boolean };
type LegalSection = {
  id: string;
  title: string;
  paragraphs: string[];
  links?: { label: string; href: string }[];
};
export type LegalDocument = {
  title: string;
  updated: string;
  sections: LegalSection[];
};

const email = { label: "contact@kamilunavo.com", href: "mailto:contact@kamilunavo.com" };
const controller = (de: boolean): LegalSection => ({
  id: "controller",
  title: de ? "Verantwortlicher und Kontakt" : "Controller and contact",
  paragraphs: [
    "Piotr Kaminski – Kamilunavo",
    de
      ? "Einzelunternehmen · Otto-Braun-Straße 14 · 40595 Düsseldorf · Deutschland"
      : "Sole proprietorship · Otto-Braun-Straße 14 · 40595 Düsseldorf · Germany",
  ],
  links: [email],
});

function optionalSection(de: boolean, flags: OptionalIntegrations): LegalSection {
  return {
    id: "optional",
    title: de ? "Optionale externe Funktionen" : "Optional external features",
    paragraphs: de
      ? [
          flags.ai
            ? "Wenn du eine KI-Bildanalyse ausdrücklich startest, werden das ausgewählte verarbeitete Bild und begrenzte Erkennungshinweise an OpenAI übermittelt. Das Projekt verwendet globale Verarbeitung; eine Verarbeitung in den USA ist möglich. Wir fordern keine Speicherung der Analyseantworten an (store: false); dies schließt die Sicherheitsaufbewahrung des Anbieters nicht aus. Das Ergebnis ist ein Vorschlag; Änderungen an deiner Sammlung bestätigst du selbst. Lade dafür keine unnötigen personenbezogenen Angaben hoch."
            : "Die optionale OpenAI-Bildanalyse ist derzeit nicht aktiviert. Es werden dafür keine Sammlungsbilder automatisch an OpenAI gesendet.",
          flags.billing
            ? "Wenn du einen angebotenen Premium-Kauf oder die Zahlungsverwaltung startest, verarbeitet Stripe die dafür erforderlichen Kunden-, Zahlungs- und Abonnementdaten. Zahlungsdetails gibst du bei Stripe ein; Sammlerraum erhält Zuordnungen und Zahlungs-/Tarifstatus, keine vollständigen Kartendaten."
            : "Die Zahlungsabwicklung über Stripe ist derzeit nicht aktiviert. Diese Datenschutzhinweise lösen keinen Kauf und kein Abonnement aus.",
          flags.market
            ? "Freigeschaltete Marktpreisfunktionen fragen aktivierte Anbieter anhand produktbezogener Kennungen ab. Persönliche Notizen und private Dokumente werden nicht für Marktpreisabfragen übertragen. Die jeweilige Quelle wird am Ergebnis angegeben."
            : "Externe Marktpreisabfragen sind derzeit nicht aktiviert. Persönliche Sammlungsinhalte werden dafür nicht automatisch an Marktanbieter übertragen.",
        ]
      : [
          flags.ai
            ? "When you explicitly start image analysis, the selected processed image and limited identification context are sent to OpenAI. The project uses global processing, which may take place in the USA. We request no storage of analysis responses (store: false); this does not exclude provider security retention. Results are suggestions; you approve changes to your collection. Do not upload unnecessary personal information for analysis."
            : "Optional OpenAI image analysis is not enabled. Collection images are not automatically sent to OpenAI for this feature.",
          flags.billing
            ? "When you start an available Premium purchase or payment-management flow, Stripe processes the necessary customer, payment and subscription information. Payment details are entered with Stripe; Sammlerraum receives references and payment/plan status, not complete card details."
            : "Stripe payment processing is not enabled. This privacy notice does not start a purchase or subscription.",
          flags.market
            ? "Enabled market-price features query activated providers using product identifiers. Personal notes and private documents are not sent with market-price queries. The source is identified with the result."
            : "External market-price queries are not enabled. Private collection content is not automatically sent to market providers for this feature.",
        ],
    links: [
      { label: "OpenAI privacy", href: "https://openai.com/policies/privacy-policy/" },
      { label: "Stripe privacy", href: "https://stripe.com/privacy" },
    ],
  };
}

export function legalDocument(
  locale: string,
  kind: string,
  flags: OptionalIntegrations = { ai: false, billing: false, market: false },
): LegalDocument | null {
  if (!isPublicLocale(locale) || (kind !== "privacy" && kind !== "imprint")) return null;
  const de = locale === "de";
  if (kind === "imprint") {
    return {
      title: de ? "Impressum" : "Legal notice",
      updated: "2026-11-08",
      sections: [
        controller(de),
        {
          id: "supplier",
          title: de ? "Angaben zum Diensteanbieter" : "Service provider information",
          paragraphs: [
            de
              ? "Angaben gemäß § 5 Digitale-Dienste-Gesetz (DDG)."
              : "Provider information under section 5 of the German Digital Services Act (DDG).",
            de ? "Telefon: +49 151 14082801" : "Phone: +49 151 14082801",
            de
              ? "Wirtschafts-Identifikationsnummer: DE464473083-00001"
              : "German economic identification number: DE464473083-00001",
            de
              ? "Wir sind weder bereit noch verpflichtet, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen."
              : "We are neither willing nor obliged to participate in dispute-resolution proceedings before a consumer arbitration board.",
          ],
        },
      ],
    };
  }
  return {
    title: de ? "Datenschutzerklärung" : "Privacy notice",
    updated: "2026-11-08",
    sections: [
      controller(de),
      {
        id: "account",
        title: de ? "Konto, Anmeldung und Sicherheit" : "Account, sign-in and security",
        paragraphs: de
          ? [
              "Für dein Konto verarbeiten wir Name, E-Mail-Adresse, Profilangaben und die von dir gewählte Anmeldemethode. Passwörter werden als Hash verarbeitet. Bei Google- oder Apple-Anmeldung erhalten wir die zur Anmeldung erforderliche Anbieterkennung und freigegebene Basisprofil-/E-Mail-Angaben; Apple kann eine Weiterleitungsadresse bereitstellen. Diese Anmeldung ist freiwillig. Bei Passkeys verarbeiten wir den öffentlichen Schlüssel; die biometrische Prüfung erfolgt auf deinem Gerät.",
              "Technisch erforderliche Sitzungsdaten, Browser-/Geräteangaben, Verbindungsdaten und Sicherheitsereignisse dienen Anmeldung, Missbrauchsschutz und der Verwaltung deiner Sitzungen. Sicherheits- und Bestätigungslinks sind zeitlich begrenzt; Bestätigungs- und Passwort-Reset-Links gelten höchstens eine Stunde. Die Spracheinstellung wird bei Auswahl der Startsprache bis zu einem Jahr gespeichert. Wir setzen keine eigenen Werbe- oder Analyse-Tracker ein.",
              "Die Verarbeitung zur Bereitstellung des angeforderten Kontos und seiner Funktionen erfolgt nach Art. 6 Abs. 1 lit. b DSGVO, Sicherheits- und Betriebsmaßnahmen nach Art. 6 Abs. 1 lit. f DSGVO. Erforderliche Anmeldedaten werden für die Kontonutzung benötigt; zusätzliche Profilangaben sind freiwillig.",
            ]
          : [
              "We process your name, email address, profile information and chosen sign-in method for your account. Passwords are processed as hashes. Google or Apple sign-in provides the identifier and permitted basic profile/email information needed for sign-in; Apple may provide a relay address. Social sign-in is optional. For passkeys we process the public key; biometric checks take place on your device.",
              "Necessary session data, browser/device information, connection data and security events support sign-in, abuse prevention and session management. Security links expire; verification and password-reset links are valid for no more than one hour. The language preference selected on a localized home page is stored for up to one year. We do not use our own advertising or analytics trackers.",
              "Account functionality you request is processed under Article 6(1)(b) GDPR; security and operational measures under Article 6(1)(f). Required sign-in data is necessary to use an account; additional profile details are voluntary.",
            ],
        links: [
          { label: "Google privacy", href: "https://policies.google.com/privacy" },
          { label: "Apple privacy", href: "https://www.apple.com/legal/privacy/" },
        ],
      },
      {
        id: "collections",
        title: de
          ? "Sammlungen, Freigaben und Öffentlichkeit"
          : "Collections, sharing and public content",
        paragraphs: de
          ? [
              "Wir speichern die von dir angelegten Sammlungen, Objekte, Bilder, Dokumente, Werte, Notizen, Kommentare und weiteren Eingaben, um die gewählten Verwaltungs-, Such-, Import-/Export- und Gemeinschaftsfunktionen bereitzustellen. Dateien können eigene Metadaten enthalten. Bitte lade nur Daten hoch, für deren Verarbeitung und Freigabe du berechtigt bist.",
              "Private Inhalte werden nicht allein durch die Registrierung öffentlich. Eingeladene Mitwirkende und Freigabe-Empfänger erhalten die von dir eingeräumten Zugriffe. Öffentliche Profile und ausdrücklich öffentliche Inhalte können auch ohne Konto gelesen und kopiert werden. Die Aufnahme geeigneter öffentlicher Inhalte in unsere Suchmaschinen-Sitemaps setzt eine gesonderte, standardmäßig ausgeschaltete Einstellung voraus. Ein Widerruf kann bereits entstandene fremde Kopien oder Suchmaschinen-Caches nicht sofort entfernen.",
              "Benachrichtigungen, Meldungen, Moderationsentscheidungen und Bearbeitungshistorien werden für Zusammenarbeit, Nachvollziehbarkeit und Missbrauchsschutz verarbeitet. Kontofunktionen beruhen auf Art. 6 Abs. 1 lit. b, Sicherheits-/Moderationsinteressen auf lit. f; eine gesonderte Suchmaschinen-Einwilligung auf lit. a DSGVO. Du kannst diese Einwilligung in den Profileinstellungen widerrufen.",
            ]
          : [
              "We store collections, items, images, documents, values, notes, comments and other information you enter to provide the management, search, import/export and community features you choose. Files may contain metadata. Only upload information you are entitled to process and share.",
              "Registering does not itself make private content public. Invited collaborators and share recipients receive the access you grant. Public profiles and explicitly public content can be read and copied without an account. Including eligible public content in our search-engine sitemaps requires a separate setting that is off by default. Withdrawal cannot immediately remove copies or search-engine caches already held by others.",
              "Notifications, reports, moderation decisions and change history support collaboration, accountability and abuse prevention. Requested account features rely on Article 6(1)(b), security/moderation interests on (f), and separate search-engine consent on (a) GDPR. You can withdraw that consent in profile settings.",
            ],
      },
      {
        id: "processors",
        title: de
          ? "Hosting, Konto-E-Mails und Übermittlungen"
          : "Hosting, account email and transfers",
        paragraphs: de
          ? [
              "Sammlerraum läuft auf eigener Server-Infrastruktur bei Hetzner Online GmbH. Dabei werden notwendige Verbindungs-, Betriebs- und gespeicherte Anwendungsdaten verarbeitet. Domain und DNS werden über one.com verwaltet.",
              "Konto-Bestätigungen und Passwort-Reset-E-Mails werden über Resend (Plus Five Five, Inc., USA) versendet. Der Dienst erhält dafür Empfängeradresse, Nachrichteninhalt einschließlich des jeweiligen Anmeldelinks sowie Zustellinformationen, keine Sammlungsbilder oder privaten Dokumente. Die Übermittlung erfolgt verschlüsselt; wir verwenden einen gesonderten Versandzugang. Der Resend-Auftragsverarbeitungsvertrag enthält Regelungen zu Unterauftragnehmern und EU-Standardvertragsklauseln für einschlägige Drittlandübermittlungen.",
              "Bei freiwilliger Google-/Apple-Anmeldung stellen die Anbieter eigene Anmeldedienste bereit. Anbieter können Daten auch außerhalb des EWR verarbeiten. Die unten verlinkten Informationen erläutern ihre Verarbeitung und Übermittlungsmechanismen. Für Auskünfte zu unseren konkreten Dienstleistervereinbarungen wende dich an den oben genannten Kontakt.",
            ]
          : [
              "Sammlerraum runs on our server infrastructure at Hetzner Online GmbH, processing necessary connection, operational and stored application data. Domain and DNS administration use one.com.",
              "Account-verification and password-reset emails use Resend (Plus Five Five, Inc., USA). It receives the recipient address, message content including the relevant account link, and delivery information, not collection images or private documents. Transport is encrypted and uses a separate sending credential. Resend's processing addendum includes subprocessors and EU standard contractual clauses for applicable third-country transfers.",
              "Optional Google/Apple sign-in uses their own authentication services. Providers may process data outside the EEA. Their linked notices describe their processing and transfer mechanisms. Contact us above for information about our particular service-provider arrangements.",
            ],
        links: [
          { label: "Hetzner privacy", href: "https://www.hetzner.com/legal/privacy-policy/" },
          { label: "Resend privacy", href: "https://resend.com/legal/privacy-policy" },
          { label: "Resend DPA", href: "https://resend.com/legal/dpa" },
        ],
      },
      optionalSection(de, flags),
      {
        id: "retention",
        title: de ? "Aufbewahrung und Löschanfragen" : "Retention and erasure requests",
        paragraphs: de
          ? [
              "Konten und Sammlungsinhalte werden für die von dir genutzte Verwaltung aufbewahrt. Ein Papierkorb-/Soft-Delete-Vorgang ist noch keine endgültige Löschung sämtlicher Daten. Erforderliche Sicherheits-, Streitfall- und gesetzliche Nachweise können nach Zweck und geltenden Pflichten länger aufbewahrt werden. Sicherungen sind getrennt und zugriffsbeschränkt; bei Wiederherstellungen müssen bereits bestätigte Löschungen berücksichtigt werden.",
              "Auskunfts-, Export- oder Löschanfragen einschließlich der Schließung deines Kontos kannst du an contact@kamilunavo.com richten. Wir prüfen die Zuordnung zum Konto und die betroffenen Daten und bearbeiten den Antrag nach den gesetzlichen Vorgaben.",
            ]
          : [
              "Accounts and collection content are retained to provide the management you use. Moving an entry to trash/soft-deleting it does not permanently erase all related data. Necessary security, dispute and statutory records may be retained longer according to their purpose and applicable duties. Backups are separate and access-controlled; confirmed erasure requests must be respected when restoring them.",
              "You can request access, export or erasure, including account closure, at contact@kamilunavo.com. We check account ownership and affected data and handle requests under the applicable legal requirements.",
            ],
      },
      {
        id: "rights",
        title: de ? "Deine Rechte" : "Your rights",
        paragraphs: de
          ? [
              "Unter den gesetzlichen Voraussetzungen hast du Rechte auf Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit und Widerspruch gegen Verarbeitungen auf Grundlage berechtigter Interessen. Eine Einwilligung kannst du mit Wirkung für die Zukunft widerrufen. Zudem kannst du dich bei einer Datenschutzaufsichtsbehörde beschweren, insbesondere bei der Landesbeauftragten für Datenschutz und Informationsfreiheit Nordrhein-Westfalen.",
              "Sammlerraum trifft keine ausschließlich automatisierten Entscheidungen mit rechtlicher oder ähnlich erheblicher Wirkung über dich. Eine optionale Bilderkennung ist eine von dir zu prüfende Hilfestellung.",
            ]
          : [
              "Subject to the applicable legal conditions, you have rights of access, rectification, erasure, restriction, portability and objection to processing based on legitimate interests. You can withdraw consent for the future. You may complain to a data-protection supervisory authority, including the authority for North Rhine-Westphalia.",
              "Sammlerraum does not make solely automated decisions producing legal or similarly significant effects about you. Optional image recognition provides suggestions for you to review.",
            ],
        links: [{ label: "LDI Nordrhein-Westfalen", href: "https://www.ldi.nrw.de/" }],
      },
    ],
  };
}
