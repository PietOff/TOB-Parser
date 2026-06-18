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
        betalingskenmerk: '',
        aanvrager: '',
        sleuflengte: '',
        ontgravingsdiepte: '',
        isGroterDan25m3: null,    // true/false/null
        grondwaterstand: '',      // numeric string m-mv
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

    // ── Betalingskenmerk / project ID ──
    const betalingMatch = fullText.match(/Betalingskenmerk:\s*(\d+)/i);
    if (betalingMatch) result.betalingskenmerk = betalingMatch[1];

    // ── Aanvrager ──
    const aanvragerMatch = fullText.match(/Aanvrager:\s*([^\n]+)/);
    if (aanvragerMatch) result.aanvrager = aanvragerMatch[1].trim();

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
    // Avoid matching generic phrases like "gemeente" in bodemkwaliteitskaart descriptions
    const gemeentePatterns = [
        /[Gg]emeente[:\s]+([A-Z][a-z][A-Za-zéèêëàáâùúûüïîíìöôóò\-]+(?:\s+[A-Za-z][A-Za-zéèêëàáâùúûüïîíìöôóò\-]+){0,3})(?=\s*[\n,\.])/,
    ];
    for (const pat of gemeentePatterns) {
        const m = fullText.match(pat);
        if (m && m[1].trim().length > 2 && m[1].trim().length < 50) {
            result.gemeente = m[1].trim();
            break;
        }
    }

    // ── Ontgravingsdiepte ──
    // BDOK cover format: "Ontgravingsdiepte: 120 cm" (centimetres) or "X m-mv"
    const ontgravingCm = fullText.match(/Ontgravingsdiepte:\s*(\d+(?:[,\.]\d+)?)\s*cm/i);
    const ontgravingM = fullText.match(/Ontgravingsdiepte:\s*(\d+(?:[,\.]\d+)?)\s*m(?!\w)/i);
    if (ontgravingCm) {
        result.ontgravingsdiepte = (parseFloat(ontgravingCm[1]) / 100).toFixed(2);
    } else if (ontgravingM) {
        result.ontgravingsdiepte = parseFloat(ontgravingM[1].replace(',', '.')).toFixed(2);
    } else {
        // Fallback to older patterns (m-mv mentions elsewhere)
        const mMatch = fullText.match(/(?:graafdiepte|maximale\s+ontgravingsdiepte)[^\d]*(\d+(?:[,\.]\d+)?)\s*m(?:-mv)?/i);
        if (mMatch) result.ontgravingsdiepte = mMatch[1].replace(',', '.');
    }

    // ── Sleuflengte ──
    // BDOK cover: "lengte: X m" — only meaningful if > 0 (0 means point location)
    const sleufCoverMatch = fullText.match(/\blengte:\s*(\d+(?:[,\.]\d+)?)\s*m\b/i);
    if (sleufCoverMatch) {
        const len = parseFloat(sleufCoverMatch[1].replace(',', '.'));
        if (len > 0) result.sleuflengte = String(len);
    }
    if (!result.sleuflengte) {
        // Try other patterns (tracélengte, sleuflengte mentions)
        const sleufAlt = fullText.match(/(?:sleuflengte|tracélengte|tracé\s*lengte)[^\d]*(\d+(?:[,\.]\d+)?)\s*m(?:eter)?\b/i);
        if (sleufAlt) result.sleuflengte = sleufAlt[1].replace(',', '.');
    }

    // ── >25 m³ ──
    // BDOK cover: ">25 m3: Nee" — must check the Ja/Nee after the marker, not just presence
    const m3CoverMatch = fullText.match(/>25\s*m[³3]:\s*(Ja|Nee)/i);
    const m3TableMatch = fullText.match(/Graafactiviteit meer dan 25\s*m[³3]\?\s*(Ja|Nee)/i);
    if (m3CoverMatch) {
        result.isGroterDan25m3 = m3CoverMatch[1].toLowerCase() === 'ja';
    } else if (m3TableMatch) {
        result.isGroterDan25m3 = m3TableMatch[1].toLowerCase() === 'ja';
    }

    // ── Bemaling — derived from "Contact met grondwater" question in Quickscan table ──
    // Try inline (pdfjs-dist row-order extraction): "...werkzaamheden? Nee"
    const gwContactInline = fullText.match(/Contact met grondwater verwacht[^?]*\?\s*(Ja|Nee)/i);
    if (gwContactInline) {
        const isJa = gwContactInline[1].toLowerCase() === 'ja';
        result.bemaling = isJa ? 'Ter plaatse beoordelen' : 'Nee';
    } else {
        // Fallback: positional — first value after "Ja/Nee" header in table
        const jaNeeSectionMatch = fullText.match(/Ja\/Nee\s+((?:(?:Ja|Nee)\s*)+)/i);
        if (jaNeeSectionMatch) {
            const firstVal = jaNeeSectionMatch[1].trim().split(/\s+/)[0];
            if (firstVal) result.bemaling = firstVal.toLowerCase() === 'ja' ? 'Ter plaatse beoordelen' : 'Nee';
        }
    }

    // ── Grondwaterstand (GWS) from paragraph 2.1 ──
    // The BDOK §2.1 shows a map with GWS bands; try to find a specific value in the text.
    // Only match explicit "circa X m-mv" mentions, not map legend ranges.
    const gwsPatterns = [
        /(?:grondwater(?:stand)?|GHG|gws)[^.]*?(?:circa\s+)?(\d+(?:[,\.]\d+)?)\s*m-mv/i,
        /(?:2\.1[^.]{0,300})(?:circa\s+)?(\d+(?:[,\.]\d+)?)\s*m[-\s]?(?:\+NAP|-mv)/is,
    ];
    for (const pat of gwsPatterns) {
        const m = fullText.match(pat);
        if (m) {
            const val = parseFloat(m[1].replace(',', '.'));
            // Sanity check: GWS should be between 0.1 and 10 m-mv
            if (!isNaN(val) && val >= 0.1 && val <= 10) {
                result.grondwaterstand = val.toFixed(1);
                break;
            }
        }
    }

    // ── Bodemtype / background value ──
    if (/landbouw\s*\/?\s*natuur/i.test(fullText)) {
        result.bodemtype = 'Landbouw/Natuur';
    } else if (/\bwonen\b/i.test(fullText)) {
        result.bodemtype = 'Wonen';
    } else if (/\bindustrie\b/i.test(fullText)) {
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
