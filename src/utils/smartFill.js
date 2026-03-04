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
 * Determines TOB assessment priority and fills template columns
 */
export function assessLocation(location) {
    const enriched = location._enriched || {};
    const pdok = enriched.pdok || {};
    const hbb = enriched.hbb || [];
    const buildings = enriched.buildings || [];
    const bkk = enriched.bodemkwaliteit || [];

    // Protocol Constants
    const ASBEST_START = 1945;
    const ASBEST_END = 1995;

    let isVerdacht = false;
    let reasons = [];
    let asbestVerdacht = false;

    // 1. Check Asbest (BAG Bouwjaar)
    const asbestBuildings = buildings.filter(b => b.bouwjaar >= ASBEST_START && b.bouwjaar <= ASBEST_END);
    if (asbestBuildings.length > 0) {
        asbestVerdacht = true;
        isVerdacht = true;
        reasons.push(`Asbestverdacht bouwjaar (${asbestBuildings[0].bouwjaar}) voor pand ${asbestBuildings[0].id}`);
    }

    // 2. Check HBB (Activities)
    const activeHbb = hbb.filter(h => h.type === 'Activiteit');
    if (activeHbb.length > 0) {
        isVerdacht = true;
        reasons.push(`Historische activiteit: ${activeHbb.map(h => h.naam).join(', ')}`);
    }
    if (hbb.some(h => h.type === 'Asbestverdacht')) {
        asbestVerdacht = true;
        isVerdacht = true;
        reasons.push('HBB melding: Asbestverdacht terrein/ophoging');
    }

    // 3. Check BKK (Bodemkwaliteitskaart)
    // ONLY flag if explicitly 'verontreinigd' or specific high-risk zones. 
    // 'wonen' and 'industrie' are normal classes in NL and should not be 'verdacht' by default.
    const suspectKlassen = ['verontreinigd', 'overschrijding', 'sanering', 'vbo'];
    const suspectBkk = bkk.filter(b => suspectKlassen.some(k => b.klasse?.toLowerCase().includes(k)));
    if (suspectBkk.length > 0) {
        isVerdacht = true;
        reasons.push(`BKK Verdacht: ${suspectBkk[0].klasse}`);
    }

    // 4. Check parsed findings from DOCX/PDF
    const originalConclusie = (location.conclusie || '').toLowerCase();
    const originalOpmerking = (location.opmerking || '').toLowerCase();
    const searchString = `${location.locatienaam} ${originalOpmerking} ${originalConclusie}`.toLowerCase();

    // Protocol Annex 1: Historical Activities (Refined)
    const histKeywords = [
        'gasfabriek', 'tankstation', 'benzinestation', 'stoomgemaal',
        'spoorlijn', 'rwzi', 'loswal', 'ijzergieterij', 'sloperij',
        'ophoging', 'demping', 'sloodemping', 'gracht', 'grondverontreiniging'
    ];

    if (histKeywords.some(k => searchString.includes(k))) {
        // Double check if it's not a negation like "geen gasfabriek"
        const foundKeyword = histKeywords.find(k => searchString.includes(k));
        const context = searchString.substring(searchString.indexOf(foundKeyword) - 10, searchString.indexOf(foundKeyword));
        if (!context.includes('geen') && !context.includes('niet')) {
            isVerdacht = true;
            reasons.push(`Protocol-marker gevonden: ${foundKeyword}`);
        }
    }

    // Explicit conclusion check
    if (['verontreinigd', 'complex', 'vbo verdacht'].includes(originalConclusie)) {
        isVerdacht = true;
        reasons.push(`Rapportage adviseert als: ${location.conclusie}`);
    }

    // OVERRIDE: If the original report explicitly says "Onverdacht", we respect that unless strong WFS evidence exists
    if (originalConclusie.includes('onverdacht') && reasons.filter(r => !r.includes('Rapportage')).length === 0) {
        isVerdacht = false;
        reasons = [];
    }

    if (location.stoffen?.some(s => {
        const key = s.stof.toLowerCase().replace(/[^a-z_]/g, '').replace('minerale olie', 'minerale_olie');
        const info = STOF_DATA[key];
        return info && s.waarde > info.interventie_grond;
    })) {
        isVerdacht = true;
        reasons.push('Interventiewaarde overschrijding in analyseresultaten');
    }

    // ── Derive additional fields from enriched data ──
    const rd = enriched.rd || {};
    const gemeente = enriched.gemeente || '';
    const provincie = enriched.provincie || '';
    const rdX = rd.x || '';
    const rdY = rd.y || '';
    const bodemkwaliteitsklasse = bkk?.[0]?.klasse || '';
    const topotijdreisLink = enriched.topotijdreisHuidig || '';
    const bodemloketLink = enriched.bodemloket || '';
    const rapportJaar = location.rapportJaar || '';
    const afstandTrace = location.afstandTrace || '';

    // ── Beoordeling (protocol-level judgment) ──
    let beoordeling = 'onverdacht';
    if (isVerdacht) {
        if (location.stoffen?.some(s => {
            const key = s.stof?.toLowerCase().replace(/[^a-z_]/g, '').replace('minerale olie', 'minerale_olie');
            const info = STOF_DATA[key];
            return info && s.waarde > info.interventie_grond;
        })) {
            beoordeling = 'verontreinigd_zeker';
        } else if (reasons.some(r => r.includes('BKK') || r.includes('HBB') || r.includes('Historische'))) {
            beoordeling = 'verdacht';
        } else {
            beoordeling = 'verontreinigd_onzeker';
        }
    }

    // ── Prioriteit ──
    let prioriteit = 'laag';
    if (isVerdacht) {
        const recentReport = rapportJaar && parseInt(rapportJaar) >= 2021;
        const manyReasons = reasons.length >= 3;
        if (manyReasons || beoordeling === 'verontreinigd_zeker') prioriteit = 'hoog';
        else if (recentReport || reasons.length >= 2) prioriteit = 'midden';
        else prioriteit = 'laag';
    } else {
        prioriteit = 'geen';
    }

    // ── Toelichting & Actie ──
    const toelichting = reasons.length > 0
        ? reasons.join('; ')
        : 'Geen aanwijzingen voor bodemverontreiniging gevonden op basis van beschikbare bronnen.';

    let actie = 'Geen actie vereist.';
    if (beoordeling === 'verontreinigd_zeker') {
        actie = 'Nader afperkend onderzoek starten. Sanering plannen. Melding bevoegd gezag.';
    } else if (beoordeling === 'verdacht') {
        actie = 'Verkennend bodemonderzoek laten uitvoeren voorafgaand aan graafwerkzaamheden.';
    } else if (beoordeling === 'verontreinigd_onzeker') {
        actie = 'Nader onderzoek aanbevolen om ernst en omvang vast te stellen.';
    }

    // ── Result compilation ──
    const status = location.status || (rapportJaar ? `rap ${Math.min(4, Math.max(1, 2024 - parseInt(rapportJaar)))}` : 'geen rapporten');

    let conclusie = 'onverdacht';
    if (isVerdacht) {
        const exceedingStof = location.stoffen?.find(s => {
            const key = s.stof?.toLowerCase().replace(/[^a-z_]/g, '').replace('minerale olie', 'minerale_olie');
            const info = STOF_DATA[key];
            return info && s.waarde > info.interventie_grond;
        });
        if (exceedingStof) {
            conclusie = `VBO verdacht (boorpunt ${exceedingStof.stof} >I)`;
        } else {
            conclusie = 'verdacht';
        }
    }

    const veiligheidsklasse = 'basishygiene'; // Default from protocol
    const melding = isVerdacht ? 'mba' : 'nee'; // 'mba' if verdacht
    const mkb = isVerdacht ? 'ja laagscheiding' : 'nee';
    const brl7000 = isVerdacht ? 'ja' : 'nee';
    const complex = isVerdacht;
    const statusAbel = isVerdacht ? 'Ter controle' : 'Gereed';
    const opmerkingenAbel = reasons.length > 0 ? reasons.join('; ') : 'geen';

    return {
        ...location,
        status,
        conclusie,
        veiligheidsklasse,
        melding,
        mkb,
        brl7000,
        opmerking: reasons[0] || 'geen',
        complex,
        statusAbel,
        opmerkingenAbel,
        // NEW: All the missing columns
        beoordeling,
        prioriteit,
        toelichting,
        actie,
        gemeente,
        provincie,
        rdX,
        rdY,
        bodemkwaliteitsklasse,
        topotijdreisLink,
        bodemloketLink,
        rapportJaar,
        afstandTrace,
    };
}

/**
 * Generates smart-fill content for a complex case
 */
export function generateSmartContent(caseData) {
    const { stoffen, naam, straat, locatiecode } = caseData;
    const firstStof = stoffen?.[0] || { stof: 'lood', waarde: 0 };
    const stofKey = firstStof.stof?.toLowerCase().replace(/[^a-z_]/g, '').replace('minerale olie', 'minerale_olie') || 'lood';
    const stofInfo = STOF_DATA[stofKey] || STOF_DATA.lood;
    const waardeNum = parseFloat(String(firstStof.waarde).replace(',', '.')) || 0;
    const interventie = stofInfo.interventie_grond;
    const overschrijding = interventie ? (waardeNum / interventie).toFixed(1) : '?';

    return {
        locatie: {
            functie: `De locatie (${naam || locatiecode}) is gelegen aan ${straat || '[adres]'} en is momenteel in gebruik als openbare ruimte / woongebied.`,
        },
        verontreiniging: {
            stof_beschrijving: stofInfo.naam,
            toetsing: `${stofInfo.naam}: ${waardeNum} mg/kg ds overschrijdt de interventiewaarde (${interventie} mg/kg ds) met factor ${overschrijding}. Streefwaarde: ${stofInfo.streef_grond} mg/kg ds.`,
            bron: stofInfo.bron,
            gezondheid: stofInfo.gezondheid,
            volume: `Op basis van de boorresultaten wordt het volume sterk verontreinigde grond geschat op circa 10-25 m³. Nader afperkend onderzoek is noodzakelijk.`,
            horizontaal: `De verontreiniging is aangetoond ter hoogte van een recent boorpunt. Horizontale omvang nader te bepalen.`,
            verticaal: `Verontreiniging aangetroffen op een diepte van ca. 0.5-1.0 m-mv. Verticale afperking nader vast te stellen.`,
            grondwater: `Op basis van beschikbare gegevens geen indicatie van grondwaterverontreiniging met ${stofInfo.naam}. ${stofInfo.mobiliteit}`,
        },
        historisch: {
            situatie: `De locatie is geregistreerd onder code ${locatiecode}. Voor details: zie bronrapport.`,
            onderzoeken: 'Verkennend bodemonderzoek uitgevoerd. Resultaten vormen basis voor deze beoordeling.',
            calamiteiten: 'Geen bekende calamiteiten met bodembedreigende stoffen gemeld.',
            asbest: asbestVerdacht
                ? `LET OP: Bouwjaar valt in asbestverdacht bereik (${ASBEST_START}-${ASBEST_END}). Asbestinventarisatie aanbevolen vóór sloop/renovatie.`
                : 'Op basis van historisch gebruik en zintuiglijke waarnemingen geen aanleiding voor asbestonderzoek.',
        },
        risico: {
            humaan: `Humaan risico bij graafwerkzaamheden kan optreden door blootstelling aan ${stofInfo.naam}. ${stofInfo.gezondheid}`,
            eco: `${stofInfo.eco} Gezien de diepteligging is het directe risico voor het oppervlakte-ecosysteem beperkt.`,
            verspreiding: stofInfo.mobiliteit,
            ernst: `Gelet op de overschrijding van de interventiewaarde is er mogelijk sprake van ernstige bodemverontreiniging, mits het volume > 25 m³.`,
            spoedeisendheid: `De verontreiniging vormt bij het huidige gebruik geen acuut gevaar. Classificatie: niet spoedeisend, wel saneringsplichtig.`,
        },
        conclusie: {
            samenvatting: `Ter plaatse van ${naam || locatiecode} is een verontreiniging met ${stofInfo.naam} aangetroffen van ${waardeNum} mg/kg ds.`,
            conclusie: `Er is sprake van verontreiniging boven de interventiewaarde. Nader afperkend onderzoek wordt aanbevolen.`,
            advies: `1. Nader afperkend onderzoek\n2. Saneringsplan opstellen\n3. Sanering onder BRL 7000 met MKB\n4. Na sanering: evaluatierapport`,
        },
        planVanAanpak: {
            variant: `Ontgraving (conventionele sanering): verontreinigde grond ontgraven tot terugsaneerwaarde. Afvoer naar erkende verwerker.`,
            doel: `Functiegericht saneren: verwijdering ${stofInfo.naam} tot beneden interventiewaarde.`,
            bestemming: `Verontreinigde grond afvoeren naar erkende grondverwerker conform Besluit bodemkwaliteit.`,
            kosten: `Indicatieve kostenraming bijgevoegd in de uitgebreide rapportage.`,
            planning: `Voorbereiding: 4-6 weken\nUitvoering: 1-2 weken\nAfronding: 2-4 weken`,
            aannemer: `BRL SIKB 7000 gecertificeerd.`,
        },
        melding: {
            bevoegdGezag: 'Bevoegd Gezag (Gemeente/Provincie). Melding via Omgevingsloket.',
            teMelden: `Overschrijding interventiewaarde ${stofInfo.naam} op locatie ${locatiecode}.`,
        },
        mkb: {
            protocol: 'BRL SIKB 7000, Protocol 7005',
            veiligheid: 'Basishygiëne: standaard PBM\'s.',
        },
    };
}

// ══════════════════════════════════════
// Column Definitions — ALL 28 columns
// ══════════════════════════════════════

export function getTobColumns() {
    return [
        { key: 'locatiecode', label: 'Locatiecode' },
        { key: 'locatienaam', label: 'Locatienaam' },
        { key: 'straatnaam', label: 'Straatnaam' },
        { key: 'huisnummer', label: 'Huisnummer' },
        { key: 'postcode', label: 'Postcode' },
        { key: 'status', label: 'Status rapport' },
        { key: 'conclusie', label: 'Conclusie' },
        { key: 'veiligheidsklasse', label: 'Veiligheidsklasse' },
        { key: 'melding', label: 'Melding' },
        { key: 'mkb', label: 'MKB' },
        { key: 'brl7000', label: 'BRL 7000' },
        { key: 'opmerking', label: 'Opmerking' },
        { key: 'complex', label: 'Complex' },
        { key: 'beoordeling', label: 'Beoordeling' },
        { key: 'prioriteit', label: 'Prioriteit' },
        { key: 'rapportJaar', label: 'Rapportjaar' },
        { key: 'afstandTrace', label: 'Afstand trace (m)' },
        { key: 'statusAbel', label: 'Status AbelTalent' },
        { key: 'opmerkingenAbel', label: 'Opmerkingen AbelTalent' },
        { key: 'gemeente', label: 'Gemeente' },
        { key: 'provincie', label: 'Provincie' },
        { key: 'rdX', label: 'RD-X' },
        { key: 'rdY', label: 'RD-Y' },
        { key: 'bodemkwaliteitsklasse', label: 'Bodemkwaliteitsklasse' },
        { key: 'topotijdreisLink', label: 'Topotijdreis Link' },
        { key: 'bodemloketLink', label: 'Bodemloket Link' },
        { key: 'toelichting', label: 'Toelichting' },
        { key: 'actie', label: 'Actie' },
    ];
}
