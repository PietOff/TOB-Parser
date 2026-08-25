/**
 * Locatiegegevens bij een adres ophalen uit de open PDOK-diensten.
 *
 * Levert twee dingen die de BDOK-quickscan zelf niet betrouwbaar geeft:
 *
 *  - de **gemeente**. De quickscan noemt de gemeente niet als apart veld, dus die
 *    werd uit de lopende tekst geraden. Dat gaat mis zodra plaats en gemeente
 *    verschillen: voor "Windmolenbosweg 4a Haelen" kwam er "Haelen" uit, terwijl
 *    Haelen een kern is in de gemeente Leudal. De BAG weet dit wél zeker.
 *  - het **bouwjaar** van de bebouwing, voor §2.2.
 *
 * Beide komen uit landelijke basisregistraties, dus dit is een bron met gezag —
 * geen gok op tekst uit een PDF.
 */

const LOCATIESERVER = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';
const BAG_WFS       = 'https://service.pdok.nl/lv/bag/wfs/v2_0';

/** Halve zijde van het zoekvierkant rond het adrespunt, in meters. */
const PAND_STRAAL_M = 12;

/**
 * Zoek het adres in de BAG en geef de bijbehorende gegevens terug.
 *
 * @param {string} adresQuery  bijv. "Windmolenbosweg 4a Haelen"
 * @param {string} [plaats]    plaatsnaam om de juiste treffer te kiezen
 * @returns {Promise<{gemeente,provincie,woonplaats,bouwjaar,weergavenaam,x,y}>}
 */
export async function zoekLocatiegegevens(adresQuery, plaats) {
    const doc = await zoekAdres(adresQuery, plaats);
    if (!doc) return null;

    const [x, y] = doc.centroide_rd
        .replace('POINT(', '').replace(')', '').split(' ').map(Number);

    const pand = await zoekPand(x, y);

    return {
        gemeente:     doc.gemeentenaam   || '',
        provincie:    doc.provincienaam  || '',
        woonplaats:   doc.woonplaatsnaam || '',
        weergavenaam: doc.weergavenaam   || '',
        bouwjaar:     pand.bouwjaar,
        pandId:       pand.pandId,
        x,
        y,
    };
}

/** Het adres opzoeken in de Locatieserver, met voorkeur voor de juiste plaats. */
async function zoekAdres(adresQuery, plaats) {
    const url = `${LOCATIESERVER}?q=${encodeURIComponent(adresQuery)}&rows=10&fq=type:adres`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`PDOK locatieserver: HTTP ${resp.status}`);
    const docs = (await resp.json())?.response?.docs || [];
    if (!docs.length) return null;

    // De vrije-tekstzoekopdracht rangschikt vooral op straat + huisnummer en laat
    // de plaatsnaam grotendeels buiten beschouwing, dus de bovenste treffer ligt
    // regelmatig in de verkeerde plaats. Geef voorrang aan de juiste woonplaats.
    const plaatsKlein = plaats?.trim().toLowerCase();
    const doc = (plaatsKlein &&
        docs.find(d => d.woonplaatsnaam?.toLowerCase() === plaatsKlein)) || docs[0];

    if (plaatsKlein && doc.woonplaatsnaam?.toLowerCase() !== plaatsKlein) {
        console.warn(
            `PDOK: geen adres gevonden in "${plaats}", dichtstbijzijnde treffer gebruikt: ${doc.weergavenaam}`
        );
    }
    return doc?.centroide_rd ? doc : null;
}

/**
 * Bouwjaar én pandidentificatie van het verblijfsobject op deze RD-coördinaat.
 *
 * De pandidentificatie is het nummer waarmee de BAG-viewer rechtstreeks op het
 * juiste pand opent (`?objectId=…`); §2.2 van de rapportage koppelt daarnaartoe.
 *
 * Bewust via een bbox en niet via een attribuutfilter: de PDOK-WFS negeert
 * `cql_filter` stilzwijgend en geeft dan gewoon de eerste willekeurige panden uit
 * de landelijke set terug — dat leverde bij een adres in Haelen een pand in
 * Appingedam op. Een bbox wordt wél toegepast.
 */
async function zoekPand(x, y) {
    const leeg = { bouwjaar: '', pandId: '' };
    const b = PAND_STRAAL_M;
    const url =
        `${BAG_WFS}?service=WFS&version=2.0.0&request=GetFeature` +
        `&typeNames=bag:verblijfsobject&outputFormat=application/json&count=20` +
        `&srsName=EPSG:28992&bbox=${x - b},${y - b},${x + b},${y + b},EPSG:28992`;

    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const nu = new Date().getFullYear() + 1;
        const panden = ((await resp.json())?.features || [])
            .map(f => ({
                jaar:   parseInt(f.properties?.bouwjaar, 10),
                pandId: f.properties?.pandidentificatie || '',
            }))
            .filter(p => !isNaN(p.jaar) && p.jaar > 1000 && p.jaar <= nu);
        if (!panden.length) return leeg;
        // Meerdere objecten binnen het vierkant: neem het oudste, want dat bepaalt
        // of de asbestverdachte periode (vóór 1994) in beeld komt. De koppeling
        // wijst naar hetzelfde pand als het jaartal, anders spreken ze elkaar tegen.
        const oudste = panden.reduce((a, p) => (p.jaar < a.jaar ? p : a));
        return { bouwjaar: String(oudste.jaar), pandId: oudste.pandId };
    } catch (e) {
        console.warn('PDOK: bouwjaar ophalen mislukt:', e.message);
        return leeg;
    }
}
