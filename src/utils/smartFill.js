/**
 * Smart-fill engine: generates contextual text for each TOB field
 * based on the extracted contamination data.
 * 
 * Interventiewaarden bron: RIVM / Circulaire bodemsanering
 */

const STOF_DATA = {
    lood: {
        naam: 'lood (Pb)',
        interventie_grond: 530,
        streef_grond: 85,
        interventie_gw: 75,
        bron: 'Lood kan afkomstig zijn van historische ophogingen, oude verflagen, loodleidingen of industriële activiteiten.',
        gezondheid: 'Lood is schadelijk bij ingestie en kan bij langdurige blootstelling leiden tot neurologische schade, met name bij kinderen.',
        mobiliteit: 'Lood is weinig mobiel in de bodem en bindt sterk aan organisch materiaal en kleimineralen. Het verspreidingsrisico via grondwater is daardoor beperkt.',
        eco: 'Lood kan bij uitloging negatieve effecten hebben op het bodemecosysteem.',
    },
    koper: {
        naam: 'koper (Cu)',
        interventie_grond: 190,
        streef_grond: 36,
        interventie_gw: 75,
        bron: 'Koper kan afkomstig zijn van historische industriële activiteiten, bestrijdingsmiddelen, of koperen leidingwerk.',
        gezondheid: 'Koper is in hoge concentraties schadelijk bij ingestie en kan maag-darmklachten veroorzaken.',
        mobiliteit: 'Koper bindt relatief sterk aan bodemdeeltjes. Het verspreidingsrisico via grondwater is beperkt, maar afhankelijk van pH en organisch stofgehalte.',
        eco: 'Koper is toxisch voor bodemorganismen en waterorganismen.',
    },
    zink: {
        naam: 'zink (Zn)',
        interventie_grond: 720,
        streef_grond: 140,
        interventie_gw: 800,
        bron: 'Zink kan afkomstig zijn van gegalvaniseerd materiaal, dakgoten, industriële activiteiten of verkeer.',
        gezondheid: 'Zink is in hoge concentraties schadelijk, maar het lichaam heeft ook zink nodig als sporenelement.',
        mobiliteit: 'Zink is matig mobiel in de bodem. Bij lage pH kan uitloging naar grondwater optreden.',
        eco: 'Zink kan in hoge concentraties toxisch zijn voor waterorganismen.',
    },
    minerale_olie: {
        naam: 'minerale olie',
        interventie_grond: 5000,
        streef_grond: 50,
        interventie_gw: 600,
        bron: 'Minerale olie is vermoedelijk afkomstig van de (voormalige) ondergrondse tank en/of lekkage bij vul-/ontluchtingspunten.',
        gezondheid: 'Minerale olie kan bij huidcontact irritatie veroorzaken. Vluchtige fracties kunnen schadelijk zijn bij inademing.',
        mobiliteit: 'Minerale olie kan zich via de onverzadigde zone naar het grondwater verspreiden, met name lichte fracties.',
        eco: 'Minerale olie kan het bodemecosysteem verstoren en is toxisch voor waterorganismen.',
    },
    pak: {
        naam: 'PAK (polycyclische aromatische koolwaterstoffen)',
        interventie_grond: 40,
        streef_grond: 1,
        interventie_gw: null,
        bron: 'PAK kan afkomstig zijn van verbrandingsprocessen, teerhoudend asfalt, of verontreinigde ophooglagen.',
        gezondheid: 'Diverse PAK-verbindingen zijn kankerverwekkend bij langdurige blootstelling.',
        mobiliteit: 'PAK is relatief immobiel in de bodem en bindt sterk aan organisch materiaal.',
        eco: 'PAK kan toxisch zijn voor bodemorganismen.',
    },
};

/**
 * Determines TOB assessment priority
 */
export function assessLocation(location) {
    const { rapportJaar, afstandTrace, conclusie, verdachteActiviteiten } = location;
    const currentYear = new Date().getFullYear();
    const rapportLeeftijd = rapportJaar ? currentYear - rapportJaar : null;

    // Rule 1: Prioritize recent reports with "wel" or >5 verdachte activiteiten
    let prioriteit = 'laag';
    if (verdachteActiviteiten > 5 || conclusie === 'wel') {
        prioriteit = 'hoog';
    }

    // Rule 2: Recent reports (2021+) get extra priority
    if (rapportJaar && rapportJaar >= 2021) {
        prioriteit = prioriteit === 'hoog' ? 'hoog' : 'midden';
    }

    // Rule 3: Onverdacht
    if (conclusie === 'onverdacht') {
        return {
            beoordeling: 'onverdacht',
            prioriteit: 'geen',
            toelichting: 'Op basis van het rapport is de locatie beoordeeld als onverdacht.',
            actie: 'Geen verdere actie nodig.',
        };
    }

    // Rule 4a: Zeker verontreinigd — recent (<5 jaar) + binnen 5m
    if (conclusie === 'verontreinigd' && rapportLeeftijd !== null && rapportLeeftijd < 5 && afstandTrace !== null && afstandTrace <= 5) {
        return {
            beoordeling: 'verontreinigd_zeker',
            prioriteit: 'hoog',
            toelichting: `Met zekerheid verontreinigd: verontreiniging aangetroffen binnen ${afstandTrace}m van het tracé in een rapport van ${rapportJaar} (${rapportLeeftijd} jaar oud).`,
            actie: 'Sanering en/of milieukundige begeleiding vereist.',
        };
    }

    // Rule 4b: Onzeker — oud rapport (>5 jaar) + binnen 25m
    if (conclusie === 'verontreinigd' && rapportLeeftijd !== null && rapportLeeftijd >= 5 && afstandTrace !== null && afstandTrace <= 25) {
        return {
            beoordeling: 'verontreinigd_onzeker',
            prioriteit: 'midden',
            toelichting: `Geen zekerheid: verontreiniging aangetroffen binnen ${afstandTrace}m van het tracé, maar rapport is van ${rapportJaar} (${rapportLeeftijd} jaar oud). Nader onderzoek aanbevolen.`,
            actie: 'Nader onderzoek / actualisatie aanbevolen.',
        };
    }

    // Rule 5: Onvoldoende informatie
    if (!conclusie || conclusie === 'onbekend') {
        return {
            beoordeling: 'onvoldoende_info',
            prioriteit: prioriteit,
            toelichting: 'Onvoldoende informatie beschikbaar. Aanvullende locatiecodes en rapporten moeten worden beoordeeld.',
            actie: 'Aanvullend onderzoek naar andere locatiecodes.',
        };
    }

    // Rule 6: Verdacht
    if (conclusie === 'verdacht' || (verdachteActiviteiten && verdachteActiviteiten > 0)) {
        return {
            beoordeling: 'verdacht',
            prioriteit: 'hoog',
            toelichting: `Locatie is verdacht${verdachteActiviteiten ? ` (${verdachteActiviteiten} verdachte activiteiten)` : ''}. Dit is reden voor nader onderzoek.`,
            actie: 'Nader bodemonderzoek uitvoeren.',
        };
    }

    return {
        beoordeling: 'onbekend',
        prioriteit: prioriteit,
        toelichting: 'Beoordeling niet automatisch mogelijk. Handmatige review vereist.',
        actie: 'Handmatig beoordelen.',
    };
}

/**
 * Generates smart-fill content for a complex case
 */
export function generateSmartContent(caseData) {
    const { stof, waarde, diepte, boorpunt, naam, straat, code } = caseData;
    const stofKey = stof?.toLowerCase().replace(/[^a-z_]/g, '').replace('minerale olie', 'minerale_olie') || 'lood';
    const stofInfo = STOF_DATA[stofKey] || STOF_DATA.lood;
    const waardeNum = parseFloat(String(waarde).replace(',', '.')) || 0;
    const interventie = stofInfo.interventie_grond;
    const overschrijding = interventie ? (waardeNum / interventie).toFixed(1) : '?';

    return {
        locatie: {
            functie: `De locatie (${naam || code}) is gelegen aan ${straat || '[adres]'} in Utrecht en is momenteel in gebruik als openbare ruimte / woongebied.`,
        },
        verontreiniging: {
            stof_beschrijving: stofInfo.naam,
            toetsing: `${stofInfo.naam}: ${waardeNum} mg/kg ds overschrijdt de interventiewaarde (${interventie} mg/kg ds) met factor ${overschrijding}. Streefwaarde: ${stofInfo.streef_grond} mg/kg ds.`,
            bron: stofInfo.bron,
            gezondheid: stofInfo.gezondheid,
            volume: `Op basis van de boorresultaten wordt het volume sterk verontreinigde grond geschat op circa 10-25 m³. Nader afperkend onderzoek is noodzakelijk.`,
            horizontaal: `De verontreiniging is aangetoond ter hoogte van ${boorpunt || '[boorpunt]'}. Horizontale omvang nader te bepalen.`,
            verticaal: `Verontreiniging aangetroffen op ${diepte || '[diepte]'}. Verticale afperking nader vast te stellen.`,
            grondwater: `Op basis van beschikbare gegevens geen indicatie van grondwaterverontreiniging met ${stofInfo.naam}. ${stofInfo.mobiliteit}`,
        },
        historisch: {
            situatie: `De locatie is bij Tauw geregistreerd onder code ${code}. Voor details: zie bronrapport.`,
            onderzoeken: 'Verkennend bodemonderzoek uitgevoerd (rapport bij Tauw). Resultaten vormen basis voor deze beoordeling.',
            calamiteiten: 'Geen bekende calamiteiten met bodembedreigende stoffen gemeld.',
            asbest: 'Op basis van historisch gebruik en zintuiglijke waarnemingen geen aanleiding voor asbestonderzoek.',
        },
        risico: {
            humaan: `${diepte ? `De verontreiniging bevindt zich op ${diepte}, waardoor` : 'Afhankelijk van de diepte is'} direct huidcontact bij normaal gebruik beperkt, maar bij graafwerkzaamheden kan blootstelling optreden. ${stofInfo.gezondheid}`,
            eco: `${stofInfo.eco} Gezien de diepteligging is het directe risico voor het oppervlakte-ecosysteem beperkt.`,
            verspreiding: stofInfo.mobiliteit,
            ernst: `Gelet op de overschrijding van de interventiewaarde voor ${stofInfo.naam} (${waardeNum} > ${interventie} mg/kg ds) is er ${waardeNum > interventie ? 'mogelijk' : 'geen'} sprake van ernstige bodemverontreiniging, mits het volume > 25 m³.`,
            spoedeisendheid: `De verontreiniging vormt bij het huidige gebruik geen acuut gevaar. Sanering noodzakelijk voorafgaand aan (her)inrichting of graafwerkzaamheden. Classificatie: niet spoedeisend, wel saneringsplichtig.`,
        },
        conclusie: {
            samenvatting: `Ter plaatse van ${naam || code} (${straat || '[adres]'}, Utrecht) is een verontreiniging met ${stofInfo.naam} aangetroffen van ${waardeNum} mg/kg ds, wat de interventiewaarde (${interventie} mg/kg ds) overschrijdt met factor ${overschrijding}. Diepteligging: ${diepte || '[onbekend]'}.`,
            conclusie: `Er is sprake van verontreiniging boven de interventiewaarde. Nader afperkend onderzoek wordt aanbevolen om het exacte volume en de omvang vast te stellen.`,
            advies: `1. Nader afperkend onderzoek\n2. Saneringsplan opstellen en indienen bij bevoegd gezag\n3. Sanering onder BRL 7000 met MKB (laagscheiding)\n4. Na sanering: evaluatierapport`,
        },
        planVanAanpak: {
            variant: `Ontgraving (conventionele sanering): verontreinigde grond ontgraven tot terugsaneerwaarde. Afvoer naar erkende verwerker.`,
            doel: `Functiegericht saneren: verwijdering ${stofInfo.naam} tot beneden interventiewaarde (${interventie} mg/kg ds).`,
            bestemming: `Verontreinigde grond (> interventiewaarde ${stofInfo.naam}) afvoeren naar erkende grondverwerker conform Besluit bodemkwaliteit.`,
            kosten: `Indicatief (excl. BTW):\n• Nader afperkend onderzoek: € 3.000 - € 5.000\n• Ontgraving en afvoer (10-25 m³): € 15.000 - € 30.000\n• MKB: € 5.000 - € 8.000\n• Evaluatierapport: € 2.000 - € 3.000\n• Totaal: € 25.000 - € 46.000`,
            planning: `Voorbereiding: 4-6 weken\nUitvoering: 1-2 weken\nAfronding: 2-4 weken`,
            aannemer: `BRL SIKB 7000 gecertificeerd (protocol 7005: graven in de bodem en saneren).`,
        },
        melding: {
            bevoegdGezag: 'Gemeente Utrecht, afdeling VTH. Via www.utrecht.nl/bodem of Omgevingsloket.',
            teMelden: `Overschrijding interventiewaarde ${stofInfo.naam} (${waardeNum} mg/kg ds) op locatie ${naam || code}. Sanering conform BRL SIKB 7000 met MKB (laagscheiding) is voorgenomen.`,
        },
        mkb: {
            protocol: 'BRL SIKB 7000, Protocol 7005 (Graven in de bodem en saneren)',
            veiligheid: 'Basishygiëne: standaard PBM\'s (handschoenen, veiligheidsschoenen). Bij onverwachte waarnemingen: werk stilleggen, MKB-er informeren.',
        },
    };
}

/**
 * Get the complete list of fields/columns for a TOB location
 */
export function getTobColumns() {
    return [
        // Overzicht kolommen (uit bronbestand)
        { key: 'locatiecode', label: 'Locatiecode', section: 'overzicht', type: 'source' },
        { key: 'locatienaam', label: 'Locatienaam', section: 'overzicht', type: 'source' },
        { key: 'straatnaam', label: 'Straatnaam', section: 'overzicht', type: 'source' },
        { key: 'huisnummer', label: 'Huisnummer', section: 'overzicht', type: 'source' },
        { key: 'postcode', label: 'Postcode', section: 'overzicht', type: 'source' },
        { key: 'status', label: 'Status rapport', section: 'overzicht', type: 'source' },
        { key: 'conclusie', label: 'Conclusie', section: 'overzicht', type: 'source' },
        { key: 'veiligheidsklasse', label: 'Veiligheidsklasse', section: 'overzicht', type: 'source' },
        { key: 'melding', label: 'Melding', section: 'overzicht', type: 'source' },
        { key: 'mkb', label: 'MKB', section: 'overzicht', type: 'source' },
        { key: 'brl7000', label: 'BRL 7000', section: 'overzicht', type: 'source' },
        { key: 'opmerking', label: 'Opmerking', section: 'overzicht', type: 'source' },

        // Assessment kolommen (berekend door tool)
        { key: 'complex', label: 'Complex', section: 'assessment', type: 'draft' },
        { key: 'beoordeling', label: 'Beoordeling', section: 'assessment', type: 'draft' },
        { key: 'prioriteit', label: 'Prioriteit', section: 'assessment', type: 'draft' },
        { key: 'rapportJaar', label: 'Rapportjaar', section: 'assessment', type: 'source' },
        { key: 'afstandTrace', label: 'Afstand tracé (m)', section: 'assessment', type: 'empty' },
        { key: 'verdachteActiviteiten', label: 'Verdachte activiteiten', section: 'assessment', type: 'source' },

        // Status AbelTalent
        { key: 'statusAbel', label: 'Status AbelTalent', section: 'tracking', type: 'empty' },
        { key: 'opmerkingenAbel', label: 'Opmerkingen AbelTalent', section: 'tracking', type: 'empty' },
    ];
}
