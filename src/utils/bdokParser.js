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
    // pdfjs-dist may insert spaces around colons, so use \s*:\s* throughout
    const betalingMatch = fullText.match(/Betalingskenmerk\s*:\s*(\d+)/i);
    if (betalingMatch) result.betalingskenmerk = betalingMatch[1];

    // ── Aanvrager ──
    const aanvragerMatch = fullText.match(/Aanvrager\s*:\s*(.+?)(?:\n|Datum|Tijd|$)/);
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
    // BDOK PDFs rarely have "Gemeente: X" directly — try several patterns in order of reliability
    const gemeentePatterns = [
        // "gemeente Venloa" / "gemeente Nederweert" — most common in BDOK text
        /\bgemeente\s+([A-Z][A-Za-zéèêëàáâùúûüïîíìöôóò][A-Za-zéèêëàáâùúûüïîíìöôóò\s\-]{1,40}?)(?=[\s,;\.\n])/,
        // "te Plaatsnaam" from address line — fallback (plaatsnaam ≈ gemeente for small towns)
        /\bte\s+([A-Z][A-Za-zéèêëàáâùúûüïîíìöôóò][A-Za-zéèêëàáâùúûüïîíìöôóò\-]+(?:\s?-\s?[A-Za-z]+)?)\b/,
    ];
    for (const pat of gemeentePatterns) {
        const m = fullText.match(pat);
        if (m) {
            const name = m[1].trim();
            // Skip generic words that aren't actual municipality names
            const skip = /^(Bron|Naam|Locatie|Bevoegd|Gezag|Info|Data)$/i.test(name);
            if (!skip && name.length > 2 && name.length < 50) {
                result.gemeente = name;
                break;
            }
        }
    }

    // ── Ontgravingsdiepte ──
    // BDOK cover: "Ontgravingsdiepte: 100 cm" — pdfjs-dist may add spaces around colons/units
    // Try cm first (most common in BDOK), then direct metre value
    const ontgravingCm = fullText.match(/Ontgravingsdiepte\s*:\s*(\d+(?:[,\.]\d+)?)\s*cm/i);
    const ontgravingM  = fullText.match(/Ontgravingsdiepte\s*:\s*(\d+(?:[,\.]\d+)?)\s*m(?![\w])/i);
    if (ontgravingCm) {
        result.ontgravingsdiepte = (parseFloat(ontgravingCm[1]) / 100).toFixed(2);
    } else if (ontgravingM) {
        result.ontgravingsdiepte = parseFloat(ontgravingM[1].replace(',', '.')).toFixed(2);
    } else {
        const mMatch = fullText.match(/(?:graafdiepte|maximale\s+ontgravingsdiepte)\s*[^\d]*(\d+(?:[,\.]\d+)?)\s*m(?:-mv)?/i);
        if (mMatch) result.ontgravingsdiepte = parseFloat(mMatch[1].replace(',', '.')).toFixed(2);
    }

    // ── Sleuflengte ──
    // BDOK cover line: "lengte: 2 m" — 0 means point location (not a tracé), skip those
    const sleufCoverMatch = fullText.match(/\blengte\s*:\s*(\d+(?:[,\.]\d+)?)\s*m\b/i);
    if (sleufCoverMatch) {
        const len = parseFloat(sleufCoverMatch[1].replace(',', '.'));
        if (len > 0) result.sleuflengte = String(len);
    }
    if (!result.sleuflengte) {
        const sleufAlt = fullText.match(/(?:sleuflengte|trac[eé]lengte)\s*[^\d]*(\d+(?:[,\.]\d+)?)\s*m(?:eter)?\b/i);
        if (sleufAlt) result.sleuflengte = String(parseFloat(sleufAlt[1].replace(',', '.')));
    }

    // ── >25 m³ ──
    // BDOK cover: ">25 m³: Nee" — pdfjs-dist may split as "> 25 m 3 : Nee"
    // Allow optional spaces between every component
    const m3CoverMatch = fullText.match(/>\s*25\s*m\s*[³3]?\s*:\s*(Ja|Nee)/i);
    const m3TableMatch = fullText.match(/Graafactiviteit meer dan\s+25\s*m\s*[³3]?\s*\?\s*(Ja|Nee)/i);
    if (m3CoverMatch) {
        result.isGroterDan25m3 = m3CoverMatch[1].toLowerCase() === 'ja';
    } else if (m3TableMatch) {
        result.isGroterDan25m3 = m3TableMatch[1].toLowerCase() === 'ja';
    }

    // ── Bemaling — derived from "Contact met grondwater" question ──
    // pdfjs-dist row-order: question and answer on same line → "...werkzaamheden? Nee"
    const gwContactInline = fullText.match(/Contact met grondwater verwacht[^?]*\?\s*(Ja|Nee)/i);
    if (gwContactInline) {
        const isJa = gwContactInline[1].toLowerCase() === 'ja';
        result.bemaling = isJa ? 'Ter plaatse beoordelen' : 'Nee';
    } else {
        // Fallback: column-separated table — first value after "Ja/Nee" header
        const jaNeeSectionMatch = fullText.match(/Ja\s*\/\s*Nee\s+((?:(?:Ja|Nee)\s*)+)/i);
        if (jaNeeSectionMatch) {
            const firstVal = jaNeeSectionMatch[1].trim().split(/\s+/)[0];
            if (firstVal) result.bemaling = firstVal.toLowerCase() === 'ja' ? 'Ter plaatse beoordelen' : 'Nee';
        }
    }

    // ── Grondwaterstand (GWS) from paragraph 2.1 / grondwaterstandenkaart ──
    // BDOK grondwaterstandenkaart gives a range: "DN 2,5 - 4,5 m-mv" or "GHG 1,0 - 2,0 m-mv"
    // Use the minimum (shallowest) value for conservative dewatering assessment.
    const gwsPatterns = [
        // BDOK grondwaterstandenkaart range: "DN X - Y m-mv" / "GHG X - Y m-mv"
        /\b(?:DN|GHG|GLG)\s*[:\s]*(\d+(?:[,\.]\d+)?)\s*[-–]\s*\d+(?:[,\.]\d+)?\s*m\s*-\s*mv/i,
        // Single m-mv value near grondwater keywords
        /(?:grondwater(?:stand)?|GHG|gws)[^.]*?(?:circa\s+)?(\d+(?:[,\.]\d+)?)\s*m-mv/i,
        // Fallback: section 2.1 context
        /(?:2\.1[^.]{0,300})(?:circa\s+)?(\d+(?:[,\.]\d+)?)\s*m[-\s]?(?:\+NAP|-mv)/is,
    ];
    for (const pat of gwsPatterns) {
        const m = fullText.match(pat);
        if (m) {
            const val = parseFloat(m[1].replace(',', '.'));
            // Sanity check: GWS should be between 0.1 and 15 m-mv
            if (!isNaN(val) && val >= 0.1 && val <= 15) {
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

/**
 * Render the first page of a PDF file to a JPEG blob.
 * Used to convert a tekening PDF into an embeddable image.
 * Returns { blob, widthPx, heightPx }
 */
export async function renderPdfPageToJpeg(file, scaleFactor = 2) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: scaleFactor });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) resolve({ blob, widthPx: canvas.width, heightPx: canvas.height });
                else reject(new Error('Canvas toBlob failed'));
            },
            'image/jpeg',
            0.92,
        );
    });
}
