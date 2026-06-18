/**
 * BDOK Quickscan PDF Parser
 * Extracts key fields from BDOK Quickscan reports using pdfjs-dist
 */
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export async function extractPdfText(file, onProgress) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str).join(' ');
        pages.push(text);
        if (onProgress) onProgress(i, pdf.numPages);
    }

    return { pages, fullText: pages.join('\n') };
}

/**
 * Parse BDOK Quickscan and extract fields needed for AelmansForm
 * Returns an object with all extractable fields
 */
export async function parseBdok(file, onProgress) {
    if (onProgress) onProgress('PDF laden...');
    const { pages, fullText } = await extractPdfText(file, (i, n) => {
        if (onProgress) onProgress(`Pagina ${i}/${n} lezen...`);
    });

    if (onProgress) onProgress('Velden extraheren...');

    const result = {
        // Address fields
        straatnaam: '',
        huisnummer: '',
        plaatsnaam: '',
        gemeente: '',
        // Project fields
        amvNummer: '',
        sleuflengte: '',
        ontgravingsdiepte: '',
        isGroterDan25m3: null,    // true/false/null
        grondwaterstand: '',      // e.g. "1,0 m-mv"
        bodemtype: '',            // Landbouw/Natuur etc.
        typeVerharding: '',
        // Calculated
        boringDiepte: '',         // ontgravingsdiepte + 0,2
        aantalBoringen: '',
        bemaling: '',             // Ja / Nee / Ter plaatse beoordelen
        // Raw text for debugging
        _fullText: fullText,
    };

    // ── AMV nummer ──
    const amvMatch = fullText.match(/\b(AMV\d{6,}(?:\.\d+)?)\b/i);
    if (amvMatch) result.amvNummer = amvMatch[1];

    // ── Address from title / header ──
    // BDOK often has: "Locatie: Straat Huisnummer te Plaatsnaam"
    const locatiePatterns = [
        /[Ll]ocatie[:\s]+([A-Za-z][A-Za-zéèêëàáâùúûüïîíìöôóò\s\-\.\']+?)\s+(\d{1,5}[a-zA-Z]?)\s+te\s+([A-Za-z][A-Za-zéèêëàáâùúûüïîíìöôóò\s\-]+?)(?:\s*[\n,]|$)/,
        /[Aa]dres[:\s]+([A-Za-z][A-Za-zéèêëàáâùúûüïîíìöôóò\s\-\.\']+?)\s+(\d{1,5}[a-zA-Z]?)[,\s]+(\d{4}\s?[A-Z]{2}|[A-Za-z][A-Za-z\s\-]+?)(?:\s*[\n,]|$)/,
    ];
    for (const pat of locatiePatterns) {
        const m = fullText.match(pat);
        if (m) {
            result.straatnaam = m[1].trim();
            result.huisnummer = m[2].trim();
            result.plaatsnaam = m[3].trim();
            break;
        }
    }

    // ── Gemeente ──
    const gemeentePatterns = [
        /[Gg]emeente[:\s]+([A-Za-z][A-Za-zéèêëàáâùúûüïîíìöôóò\s\-]+?)(?:\s*[\n,]|$)/,
        /[Gg]emeente\s+([A-Z][a-z][A-Za-z\s\-]+?)(?:\s*[\n,]|$)/,
    ];
    for (const pat of gemeentePatterns) {
        const m = fullText.match(pat);
        if (m && m[1].trim().length > 1 && m[1].trim().length < 60) {
            result.gemeente = m[1].trim();
            break;
        }
    }

    // ── Sleuflengte ──
    const sleufPatterns = [
        /(?:lengte|sleuflengte|tracélengte|tracé\s*lengte)[^\d]*(\d+(?:[,\.]\d+)?)\s*(?:m(?:eter)?)\b/i,
        /(\d+(?:[,\.]\d+)?)\s*(?:m(?:eter)?)\s*(?:lang|lengte)/i,
    ];
    for (const pat of sleufPatterns) {
        const m = fullText.match(pat);
        if (m) {
            result.sleuflengte = m[1].replace(',', '.');
            break;
        }
    }

    // ── Ontgravingsdiepte ──
    const ontgravingsPatterns = [
        /(?:ontgravingsdiepte|graafdiepte|maximale\s+ontgravingsdiepte)[^\d]*(\d+(?:[,\.]\d+)?)\s*m(?:-mv)?/i,
        /(?:diepte)[^\d]*(\d+(?:[,\.]\d+)?)\s*m-mv/i,
    ];
    for (const pat of ontgravingsPatterns) {
        const m = fullText.match(pat);
        if (m) {
            result.ontgravingsdiepte = m[1].replace(',', '.');
            break;
        }
    }

    // ── >25 m³ ──
    if (/>25\s*m[³3]/i.test(fullText) || /meer\s+dan\s+25\s*m[³3]/i.test(fullText)) {
        result.isGroterDan25m3 = true;
    } else if (/<25\s*m[³3]/i.test(fullText) || /minder\s+dan\s+25\s*m[³3]/i.test(fullText) || /maximaal\s+25\s*m[³3]/i.test(fullText)) {
        result.isGroterDan25m3 = false;
    }

    // ── Grondwaterstand (GWS) from paragraph 2.1 ──
    const gwsPatterns = [
        /(?:grondwater(?:stand)?|gws|stijghoogte)[^\d]*(?:circa\s*)?(\d+(?:[,\.]\d+)?)\s*m[-\s]?(?:\+NAP|-mv)/i,
        /(?:grondwater(?:stand)?|gws)[^\d]*(?:op\s*)?(?:circa\s*)?(\d+(?:[,\.]\d+)?)\s*m(?:-mv)?/i,
        /(?:2\.1[^.]{0,200})(?:circa\s+)?(\d+(?:[,\.]\d+)?)\s*m[-\s]?(?:\+NAP|-mv)/is,
    ];
    for (const pat of gwsPatterns) {
        const m = fullText.match(pat);
        if (m) {
            result.grondwaterstand = m[1].replace(',', '.');
            break;
        }
    }

    // ── Bodemtype / background value ──
    if (/landbouw\s*\/?\s*natuur/i.test(fullText)) {
        result.bodemtype = 'Landbouw/Natuur';
    } else if (/wonen/i.test(fullText)) {
        result.bodemtype = 'Wonen';
    } else if (/industrie/i.test(fullText)) {
        result.bodemtype = 'Industrie';
    }

    // ── Type verharding ──
    const verhardingMatch = fullText.match(/(?:type\s+verharding|verhardingstype)[:\s]+([^\n,]{3,50})/i);
    if (verhardingMatch) result.typeVerharding = verhardingMatch[1].trim();

    // ── Derived / calculated fields ──
    if (result.ontgravingsdiepte) {
        const depth = parseFloat(result.ontgravingsdiepte);
        if (!isNaN(depth)) {
            result.boringDiepte = (depth + 0.2).toFixed(1);
        }
    }

    if (result.sleuflengte) {
        const len = parseFloat(result.sleuflengte);
        if (!isNaN(len)) {
            if (len < 5) result.aantalBoringen = '1';
            else if (len <= 75) result.aantalBoringen = '2';
            else result.aantalBoringen = String(Math.ceil(len / 50));
        }
    }

    if (result.grondwaterstand && result.ontgravingsdiepte) {
        const gws = parseFloat(result.grondwaterstand);
        const diepte = parseFloat(result.ontgravingsdiepte);
        if (!isNaN(gws) && !isNaN(diepte)) {
            const diff = gws - diepte;
            if (diff <= 0) result.bemaling = 'Ja';
            else if (diff <= 0.25) result.bemaling = 'Ter plaatse beoordelen';
            else result.bemaling = 'Nee';
        }
    }

    return result;
}

/**
 * Parse bodemrapportage PDF and extract soil investigation info
 */
export async function parseBodemrapportage(file, onProgress) {
    if (onProgress) onProgress('Bodemrapportage laden...');
    const { fullText } = await extractPdfText(file, (i, n) => {
        if (onProgress) onProgress(`Pagina ${i}/${n} lezen...`);
    });

    const result = {
        rapportNummer: '',
        rapportDatum: '',
        onderzoeksbureau: '',
        locatieNaam: '',
        gemeente: '',
        soortOnderzoek: '',
        conclusie: '',
        _fullText: fullText,
    };

    // Rapportnummer
    const rapportMatch = fullText.match(/(?:rapport(?:nummer)?|kenmerk)[:\s]+([A-Z0-9\-\.]{4,30})/i);
    if (rapportMatch) result.rapportNummer = rapportMatch[1].trim();

    // Datum
    const datumMatch = fullText.match(/(?:rapport)?datum[:\s]+(\d{1,2}[-\s]\w+[-\s]\d{4}|\d{2}-\d{2}-\d{4}|\d{1,2}\s+\w+\s+\d{4})/i);
    if (datumMatch) result.rapportDatum = datumMatch[1].trim();

    // Onderzoeksbureau
    const bureauMatch = fullText.match(/(?:uitgevoerd\s+door|opgesteld\s+door|onderzoeksbureau)[:\s]+([A-Za-z][A-Za-z\s&\-\.]{2,50})/i);
    if (bureauMatch) result.onderzoeksbureau = bureauMatch[1].trim();

    // Soort onderzoek
    if (/verkennend\s+bodemonderzoek/i.test(fullText)) result.soortOnderzoek = 'Verkennend bodemonderzoek';
    else if (/historisch\s+onderzoek/i.test(fullText)) result.soortOnderzoek = 'Historisch onderzoek';
    else if (/nader\s+onderzoek/i.test(fullText)) result.soortOnderzoek = 'Nader bodemonderzoek';

    // Conclusie
    if (/geen\s+(?:ernstige\s+)?verontreiniging/i.test(fullText)) result.conclusie = 'Geen (ernstige) verontreiniging';
    else if (/licht\s+verontreinigd/i.test(fullText)) result.conclusie = 'Licht verontreinigd';
    else if (/sterk\s+verontreinigd/i.test(fullText)) result.conclusie = 'Sterk verontreinigd';

    return result;
}
