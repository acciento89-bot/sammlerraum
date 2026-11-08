/** Authored bilingual collection vocabulary. Stable maintenance keys never come from translated labels. */
export type CollectingCategoryDefinition = {
  readonly key: string;
  readonly labels: { readonly de: string; readonly en: string };
  readonly examples: { readonly de: string; readonly en: string };
  readonly fields: readonly (readonly [key: string, de: string, en: string])[];
  readonly pageKey: "tradingCards" | "vinyl" | "coins" | "stamps" | "comics" | "watches" | null;
};
export const COLLECTING_CATEGORIES: readonly CollectingCategoryDefinition[] = [
  {
    key: "trading_cards",
    labels: {
      de: "Sammelkarten",
      en: "Trading cards",
    },
    examples: {
      de: "Spielkarten, Sportkarten und vollständige Sets",
      en: "Game cards, sports cards and complete sets",
    },
    fields: [
      ["set", "Set", "Set"],
      ["collector_number", "Sammlernummer", "Collector number"],
    ],
    pageKey: "tradingCards",
  },
  {
    key: "vinyl",
    labels: {
      de: "Schallplatten",
      en: "Vinyl records",
    },
    examples: {
      de: "Singles, Alben, Pressungen und Sondereditionen",
      en: "Singles, albums, pressings and special editions",
    },
    fields: [
      ["artist", "Interpret", "Artist"],
      ["label", "Label", "Label"],
      ["catalogue_number", "Katalognummer", "Catalogue number"],
    ],
    pageKey: "vinyl",
  },
  {
    key: "coins",
    labels: {
      de: "Münzen",
      en: "Coins",
    },
    examples: {
      de: "Umlaufmünzen, Gedenkmünzen und historische Prägungen",
      en: "Circulation coins, commemoratives and historical issues",
    },
    fields: [
      ["year", "Jahrgang", "Year"],
      ["mint", "Prägestätte", "Mint"],
      ["denomination", "Nennwert", "Denomination"],
    ],
    pageKey: "coins",
  },
  {
    key: "banknotes",
    labels: {
      de: "Banknoten & Geldscheine",
      en: "Banknotes",
    },
    examples: {
      de: "Historische Geldscheine, Serien und Notgeld",
      en: "Historical banknotes, series and emergency money",
    },
    fields: [
      ["issuer", "Herausgeber", "Issuer"],
      ["series", "Serie", "Series"],
      ["denomination", "Nennwert", "Denomination"],
    ],
    pageKey: null,
  },
  {
    key: "stamps",
    labels: {
      de: "Briefmarken",
      en: "Stamps",
    },
    examples: {
      de: "Einzelmarken, Ersttagsbriefe, Blöcke und Serien",
      en: "Individual stamps, first-day covers, sheets and sets",
    },
    fields: [
      ["country", "Ausgabeland", "Country of issue"],
      ["issue_year", "Ausgabejahr", "Issue year"],
      ["catalogue_number", "Katalognummer", "Catalogue number"],
    ],
    pageKey: "stamps",
  },
  {
    key: "postcards",
    labels: {
      de: "Ansichtskarten",
      en: "Postcards",
    },
    examples: {
      de: "Ortsansichten, Künstlerkarten und historische Motive",
      en: "Town views, artist postcards and historical scenes",
    },
    fields: [
      ["place", "Ort oder Motiv", "Place or subject"],
      ["publisher", "Verlag", "Publisher"],
      ["period", "Zeitraum", "Period"],
    ],
    pageKey: null,
  },
  {
    key: "comics",
    labels: {
      de: "Comics & Manga",
      en: "Comics & manga",
    },
    examples: {
      de: "Einzelhefte, Sammelbände, Manga und Originalausgaben",
      en: "Single issues, collected editions, manga and first editions",
    },
    fields: [
      ["series", "Reihe", "Series"],
      ["issue_number", "Ausgabe oder Band", "Issue or volume"],
      ["publisher", "Verlag", "Publisher"],
    ],
    pageKey: "comics",
  },
  {
    key: "books",
    labels: {
      de: "Bücher & Zeitschriften",
      en: "Books & magazines",
    },
    examples: {
      de: "Erstausgaben, antiquarische Bücher und Zeitschriften",
      en: "First editions, antiquarian books and magazines",
    },
    fields: [
      ["author", "Autor", "Author"],
      ["edition", "Auflage", "Edition"],
      ["publisher", "Verlag", "Publisher"],
    ],
    pageKey: null,
  },
  {
    key: "cds_cassettes",
    labels: {
      de: "CDs & Kassetten",
      en: "CDs & cassettes",
    },
    examples: {
      de: "Musikalben, Musikkassetten und seltene Tonträger",
      en: "Music albums, cassette tapes and rare recordings",
    },
    fields: [
      ["artist", "Interpret", "Artist"],
      ["label", "Label", "Label"],
      ["catalogue_number", "Katalognummer", "Catalogue number"],
    ],
    pageKey: null,
  },
  {
    key: "movies",
    labels: {
      de: "Filme & Serien",
      en: "Films & TV",
    },
    examples: {
      de: "DVDs, Blu-rays, VHS, Steelbooks und Filmeditionen",
      en: "DVDs, Blu-rays, VHS, steelbooks and film editions",
    },
    fields: [
      ["title", "Film oder Serie", "Film or series"],
      ["format", "Format", "Format"],
      ["edition", "Edition", "Edition"],
    ],
    pageKey: null,
  },
  {
    key: "videogames",
    labels: {
      de: "Videospiele",
      en: "Video games",
    },
    examples: {
      de: "Retrospiele, physische Spiele und Sammlereditionen",
      en: "Retro games, physical games and collector editions",
    },
    fields: [
      ["platform", "Plattform", "Platform"],
      ["publisher", "Publisher", "Publisher"],
      ["edition", "Edition", "Edition"],
    ],
    pageKey: null,
  },
  {
    key: "consoles",
    labels: {
      de: "Konsolen & Zubehör",
      en: "Consoles & accessories",
    },
    examples: {
      de: "Konsolen, Handhelds, Controller und Zubehör",
      en: "Consoles, handhelds, controllers and accessories",
    },
    fields: [
      ["manufacturer", "Hersteller", "Manufacturer"],
      ["model", "Modell", "Model"],
      ["region", "Region", "Region"],
    ],
    pageKey: null,
  },
  {
    key: "figures",
    labels: {
      de: "Figuren & Toys",
      en: "Figures & toys",
    },
    examples: {
      de: "Actionfiguren, Sammelfiguren, Statuen und Spielzeug",
      en: "Action figures, collectible figures, statues and toys",
    },
    fields: [
      ["series", "Reihe", "Series"],
      ["character", "Figur oder Motiv", "Character or subject"],
      ["manufacturer", "Hersteller", "Manufacturer"],
    ],
    pageKey: null,
  },
  {
    key: "model_cars",
    labels: {
      de: "Modellautos",
      en: "Model cars",
    },
    examples: {
      de: "Miniaturfahrzeuge, Rennwagen und Nutzfahrzeugmodelle",
      en: "Miniature vehicles, racing cars and commercial models",
    },
    fields: [
      ["manufacturer", "Modellhersteller", "Model manufacturer"],
      ["scale", "Maßstab", "Scale"],
      ["model", "Fahrzeugmodell", "Vehicle model"],
    ],
    pageKey: null,
  },
  {
    key: "model_railways",
    labels: {
      de: "Modelleisenbahn",
      en: "Model railways",
    },
    examples: {
      de: "Lokomotiven, Wagen, Gleise und Anlagenzubehör",
      en: "Locomotives, rolling stock, tracks and layout accessories",
    },
    fields: [
      ["manufacturer", "Hersteller", "Manufacturer"],
      ["gauge", "Spurweite", "Gauge"],
      ["era", "Epoche", "Era"],
    ],
    pageKey: null,
  },
  {
    key: "model_building",
    labels: {
      de: "Modellbau",
      en: "Scale models",
    },
    examples: {
      de: "Flugzeuge, Schiffe, Bausätze und fertige Dioramen",
      en: "Aircraft, ships, model kits and completed dioramas",
    },
    fields: [
      ["manufacturer", "Hersteller", "Manufacturer"],
      ["scale", "Maßstab", "Scale"],
      ["subject", "Vorbild oder Motiv", "Prototype or subject"],
    ],
    pageKey: null,
  },
  {
    key: "construction_toys",
    labels: {
      de: "Klemmbausteine",
      en: "Building bricks",
    },
    examples: {
      de: "Bausteinsets, Minifiguren und eigene Bauwerke",
      en: "Building sets, minifigures and original constructions",
    },
    fields: [
      ["brand", "Marke", "Brand"],
      ["set_number", "Setnummer", "Set number"],
      ["theme", "Thema", "Theme"],
    ],
    pageKey: null,
  },
  {
    key: "dolls",
    labels: {
      de: "Puppen",
      en: "Dolls",
    },
    examples: {
      de: "Spielpuppen, Künstlerpuppen und Puppenzubehör",
      en: "Play dolls, artist dolls and doll accessories",
    },
    fields: [
      ["maker", "Hersteller oder Künstler", "Maker or artist"],
      ["series", "Reihe", "Series"],
      ["year", "Jahr", "Year"],
    ],
    pageKey: null,
  },
  {
    key: "plush_toys",
    labels: {
      de: "Plüschtiere & Teddys",
      en: "Plush toys & teddy bears",
    },
    examples: {
      de: "Teddybären, Stofftiere und limitierte Plüschfiguren",
      en: "Teddy bears, stuffed animals and limited plush figures",
    },
    fields: [
      ["maker", "Hersteller", "Maker"],
      ["series", "Reihe", "Series"],
      ["size", "Größe", "Size"],
    ],
    pageKey: null,
  },
  {
    key: "board_games",
    labels: {
      de: "Brett- & Kartenspiele",
      en: "Board & card games",
    },
    examples: {
      de: "Brettspiele, Kartenspiele, Erweiterungen und Würfel",
      en: "Board games, card games, expansions and dice",
    },
    fields: [
      ["publisher", "Verlag", "Publisher"],
      ["edition", "Ausgabe", "Edition"],
      ["language", "Sprache", "Language"],
    ],
    pageKey: null,
  },
  {
    key: "watches",
    labels: {
      de: "Uhren",
      en: "Watches",
    },
    examples: {
      de: "Armbanduhren, Taschenuhren und mechanische Zeitmesser",
      en: "Wristwatches, pocket watches and mechanical timepieces",
    },
    fields: [
      ["brand", "Marke", "Brand"],
      ["reference", "Referenz", "Reference"],
      ["movement", "Uhrwerk", "Movement"],
    ],
    pageKey: "watches",
  },
  {
    key: "jewelry",
    labels: {
      de: "Schmuck & Accessoires",
      en: "Jewelry & accessories",
    },
    examples: {
      de: "Schmuckstücke, Broschen, Manschettenknöpfe und Accessoires",
      en: "Jewelry, brooches, cufflinks and accessories",
    },
    fields: [
      ["maker", "Hersteller oder Künstler", "Maker or artist"],
      ["material", "Material", "Material"],
      ["hallmark", "Punze oder Signatur", "Hallmark or signature"],
    ],
    pageKey: null,
  },
  {
    key: "art",
    labels: {
      de: "Kunst & Drucke",
      en: "Art & prints",
    },
    examples: {
      de: "Gemälde, Drucke, Grafiken und künstlerische Objekte",
      en: "Paintings, prints, graphic art and artistic objects",
    },
    fields: [
      ["artist", "Künstler", "Artist"],
      ["technique", "Technik", "Technique"],
      ["edition", "Auflage", "Edition"],
    ],
    pageKey: null,
  },
  {
    key: "antiques",
    labels: {
      de: "Antiquitäten & Vintage",
      en: "Antiques & vintage",
    },
    examples: {
      de: "Historische Alltagsobjekte, Designstücke und Vintage",
      en: "Historical everyday objects, design pieces and vintage items",
    },
    fields: [
      ["period", "Epoche oder Zeitraum", "Era or period"],
      ["maker", "Hersteller", "Maker"],
      ["material", "Material", "Material"],
    ],
    pageKey: null,
  },
  {
    key: "porcelain_glass",
    labels: {
      de: "Porzellan, Keramik & Glas",
      en: "Porcelain, ceramics & glass",
    },
    examples: {
      de: "Figuren, Vasen, Geschirr und dekorative Glasobjekte",
      en: "Figurines, vases, tableware and decorative glass",
    },
    fields: [
      ["maker", "Manufaktur", "Maker"],
      ["pattern", "Dekor oder Form", "Pattern or shape"],
      ["mark", "Bodenmarke", "Maker mark"],
    ],
    pageKey: null,
  },
  {
    key: "cameras",
    labels: {
      de: "Kameras & Fotografie",
      en: "Cameras & photography",
    },
    examples: {
      de: "Kameras, Objektive, Fotoapparate und fotografisches Zubehör",
      en: "Cameras, lenses, photographic equipment and accessories",
    },
    fields: [
      ["manufacturer", "Hersteller", "Manufacturer"],
      ["model", "Modell", "Model"],
      ["format", "Film- oder Sensorformat", "Film or sensor format"],
    ],
    pageKey: null,
  },
  {
    key: "technology",
    labels: {
      de: "Technik & Elektronik",
      en: "Technology & electronics",
    },
    examples: {
      de: "Computer, Radios, Telefone und historische Elektronik",
      en: "Computers, radios, telephones and historical electronics",
    },
    fields: [
      ["manufacturer", "Hersteller", "Manufacturer"],
      ["model", "Modell", "Model"],
      ["year", "Baujahr", "Year of manufacture"],
    ],
    pageKey: null,
  },
  {
    key: "sports_memorabilia",
    labels: {
      de: "Sport-Memorabilia",
      en: "Sports memorabilia",
    },
    examples: {
      de: "Trikots, Sportabzeichen, Tickets und Erinnerungsstücke",
      en: "Jerseys, sports badges, tickets and memorabilia",
    },
    fields: [
      ["sport", "Sportart", "Sport"],
      ["team", "Team oder Sportler", "Team or athlete"],
      ["event", "Ereignis oder Saison", "Event or season"],
    ],
    pageKey: null,
  },
  {
    key: "music_memorabilia",
    labels: {
      de: "Musik-Memorabilia",
      en: "Music memorabilia",
    },
    examples: {
      de: "Konzerttickets, Tourposter, Fanartikel und Musikobjekte",
      en: "Concert tickets, tour posters, fan items and music objects",
    },
    fields: [
      ["artist", "Künstler oder Band", "Artist or band"],
      ["tour", "Tour oder Veranstaltung", "Tour or event"],
      ["year", "Jahr", "Year"],
    ],
    pageKey: null,
  },
  {
    key: "autographs",
    labels: {
      de: "Autogramme",
      en: "Autographs",
    },
    examples: {
      de: "Signierte Karten, Fotografien und andere Unterschriften",
      en: "Signed cards, photographs and other signatures",
    },
    fields: [
      ["person", "Person", "Person"],
      ["support", "Signiertes Objekt", "Signed object"],
      ["provenance", "Herkunft oder Nachweis", "Provenance or evidence"],
    ],
    pageKey: null,
  },
  {
    key: "minerals_fossils",
    labels: {
      de: "Mineralien & Fossilien",
      en: "Minerals & fossils",
    },
    examples: {
      de: "Mineralien, Gesteine, Kristalle und Fossilien",
      en: "Minerals, rocks, crystals and fossil specimens",
    },
    fields: [
      ["species", "Art oder Bezeichnung", "Species or name"],
      ["locality", "Fundort", "Locality"],
      ["size", "Abmessungen", "Dimensions"],
    ],
    pageKey: null,
  },
  {
    key: "patches_badges",
    labels: {
      de: "Abzeichen, Pins & Patches",
      en: "Badges, pins & patches",
    },
    examples: {
      de: "Anstecker, Vereinsabzeichen, Aufnäher und Medaillen",
      en: "Pins, club badges, patches and medals",
    },
    fields: [
      ["organization", "Organisation oder Thema", "Organization or theme"],
      ["year", "Jahr", "Year"],
      ["material", "Material", "Material"],
    ],
    pageKey: null,
  },
  {
    key: "keyrings",
    labels: {
      de: "Schlüsselanhänger & Souvenirs",
      en: "Keyrings & souvenirs",
    },
    examples: {
      de: "Reiseandenken, Schlüsselanhänger und kleine Souvenirs",
      en: "Travel mementos, keyrings and small souvenirs",
    },
    fields: [
      ["place", "Ort oder Herkunft", "Place or origin"],
      ["theme", "Thema", "Theme"],
      ["material", "Material", "Material"],
    ],
    pageKey: null,
  },
  {
    key: "advertising",
    labels: {
      de: "Werbung & Reklame",
      en: "Advertising collectibles",
    },
    examples: {
      de: "Reklameschilder, Verpackungen, Werbeartikel und Automaten",
      en: "Advertising signs, packaging, promotional items and machines",
    },
    fields: [
      ["brand", "Marke", "Brand"],
      ["period", "Zeitraum", "Period"],
      ["type", "Objektart", "Object type"],
    ],
    pageKey: null,
  },
  {
    key: "ephemera",
    labels: {
      de: "Papier & Dokumente",
      en: "Paper & ephemera",
    },
    examples: {
      de: "Historische Dokumente, Tickets, Plakate und Sammelbilder",
      en: "Historical documents, tickets, posters and paper collectibles",
    },
    fields: [
      ["type", "Dokumentart", "Document type"],
      ["date", "Datum oder Zeitraum", "Date or period"],
      ["origin", "Herkunft", "Origin"],
    ],
    pageKey: null,
  },
  {
    key: "other",
    labels: {
      de: "Sonstiges",
      en: "Other",
    },
    examples: {
      de: "Besondere Sammelgebiete und individuell beschriebene Stücke",
      en: "Special collecting interests and individually described items",
    },
    fields: [
      ["subject", "Sammelgebiet oder Thema", "Collecting interest or subject"],
      ["maker", "Hersteller oder Urheber", "Maker or creator"],
      ["notes", "Besonderheiten", "Special details"],
    ],
    pageKey: null,
  },
];
