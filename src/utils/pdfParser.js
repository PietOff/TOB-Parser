/**
 * PDF Parser: extracts structured data from TOB bodemonderzoek PDF reports
 * Uses pdf.js (Mozilla) for client-side PDF text extraction
 */
import * as pdfjsLib from 'pdfjs-dist';
import { extractTraceCoordinates } from './apiIntegrations';

// Set worker path
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/**
 * Extract all text from a PDF file
 */
export async function extractPdfText(file, onProgress) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const pages = [];

    for (let i = 1; i <= numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        pages.push(text);
        if (onProgress) onProgress(i, numPages);
    }

    return { pages, fullText: pages.join('\n\n') };
}

/**
 * Parse TOB report text and extract structured data
 */
export function parseTobReport(fullText) {
    const data = {
        locatiecodes: [],
        stoffen: [],
        conclusies: [],
        veiligheidsklasse: null,
        dieptes: [],
        rapportJaar: null,
        rawSections: {},
    };

    // ── Extract locatiecodes ──
    // Patterns: ST034401142, AA034409286, UT034400363, etc.
    const locCodeRegex = /\b([A-Z]{2}\d{9,12})\b/g;
    const locCodes = new Set();
    let match;
    while ((match = locCodeRegex.exec(fullText)) !== null) {
        locCodes.add(match[1]);
    }
    data.locatiecodes = [...locCodes];

    // ── Extract stoffen + waarden ──
    // Patterns: "lood 541 mg/kg", "koper > I (358)", "minerale olie 2300 mg/kg ds"
    const stofPatterns = [
        { regex: /\b(lood|Pb)\s*[>:=]?\s*(\d+[\.,]?\d*)\s*(?:mg\/kg|mg\/l)/gi, stof: 'lood' },
        { regex: /\b(koper|Cu)\s*[>:=]?\s*(\d+[\.,]?\d*)\s*(?:mg\/kg|mg\/l)/gi, stof: 'koper' },
        { regex: /\b(zink|Zn)\s*[>:=]?\s*(\d+[\.,]?\d*)\s*(?:mg\/kg|mg\/l)/gi, stof: 'zink' },
        { regex: /\b(minerale\s*olie)\s*[>:=]?\s*(\d+[\.,]?\d*)\s*(?:mg\/kg|mg\/l)/gi, stof: 'minerale_olie' },
        { regex: /\b(PAK)\s*[>:=]?\s*(\d+[\.,]?\d*)\s*(?:mg\/kg|mg\/l)/gi, stof: 'pak' },
        { regex: /\b(nikkel|Ni)\s*[>:=]?\s*(\d+[\.,]?\d*)\s*(?:mg\/kg|mg\/l)/gi, stof: 'nikkel' },
        { regex: /\b(chroom|Cr)\s*[>:=]?\s*(\d+[\.,]?\d*)\s*(?:mg\/kg|mg\/l)/gi, stof: 'chroom' },
        { regex: /\b(barium|Ba)\s*[>:=]?\s*(\d+[\.,]?\d*)\s*(?:mg\/kg|mg\/l)/gi, stof: 'barium' },
    ];

    for (const { regex, stof } of stofPatterns) {
        let m;
        while ((m = regex.exec(fullText)) !== null) {
            const waarde = parseFloat(m[2].replace(',', '.'));
            if (waarde > 0) {
                data.stoffen.push({ stof, waarde, raw: m[0] });
            }
        }
    }

    // ── Also detect "interventiewaarde" mentions ──
    const ivRegex = /(\w+)\s*(?:>|boven|overschrijdt?)\s*(?:de\s+)?(?:interventiewaarde|I-waarde|I\b)\s*(?:\(?\s*(\d+[\.,]?\d*)\s*\)?)?/gi;
    while ((match = ivRegex.exec(fullText)) !== null) {
        const stofName = match[1].toLowerCase();
        const waarde = match[2] ? parseFloat(match[2].replace(',', '.')) : null;
        data.conclusies.push({
            type: 'interventiewaarde_overschreden',
            stof: stofName,
            waarde,
            raw: match[0],
        });
    }

    // ── Extract dieptes ──
    const diepteRegex = /(\d+[\.,]?\d*)\s*[-–]\s*(\d+[\.,]?\d*)\s*m[-\s]?mv/gi;
    while ((match = diepteRegex.exec(fullText)) !== null) {
        data.dieptes.push(`${match[1]}-${match[2]} m-mv`);
    }

    // ── Extract veiligheidsklasse ──
    if (/basishygi[eë]ne/i.test(fullText)) {
        data.veiligheidsklasse = 'basishygiëne';
    } else if (/T\s*&\s*F|T&F/i.test(fullText)) {
        data.veiligheidsklasse = 'T&F';
    } else if (/3T/i.test(fullText)) {
        data.veiligheidsklasse = '3T';
    }

    // ── Extract rapport year ──
    // Look for dates like "maart 2023", "2024", "januari 2022"
    const yearRegex = /\b((?:januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+)?(20[12]\d)\b/gi;
    const years = [];
    while ((match = yearRegex.exec(fullText)) !== null) {
        years.push(parseInt(match[2]));
    }
    if (years.length > 0) {
        data.rapportJaar = Math.max(...years); // Most recent year
    }

    // ── Detect conclusions ──
    if (/onverdacht/i.test(fullText)) {
        data.conclusies.push({ type: 'onverdacht', raw: 'onverdacht' });
    }
    if (/VBO\s*verdacht/i.test(fullText)) {
        data.conclusies.push({ type: 'VBO_verdacht', raw: 'VBO verdacht' });
    }
    if (/ernstig\s*geval/i.test(fullText)) {
        data.conclusies.push({ type: 'ernstig_geval', raw: 'ernstig geval' });
    }
    if (/nader\s*onderzoek/i.test(fullText)) {
        data.conclusies.push({ type: 'nader_onderzoek_nodig', raw: 'nader onderzoek' });
    }
    if (/geen\s*verontreiniging/i.test(fullText)) {
        data.conclusies.push({ type: 'geen_verontreiniging', raw: 'geen verontreiniging' });
    }

    // ── Detect sections ──
    const sections = ['inleiding', 'locatiegegevens', 'vooronderzoek', 'onderzoeksstrategie',
        'veldwerk', 'resultaten', 'conclusie', 'aanbevelingen'];
    for (const section of sections) {
        const sectionRegex = new RegExp(`(?:^|\\n)\\s*\\d*\\.?\\s*(${section}[\\w\\s]*)\\s*(?:\\n|$)`, 'im');
        const sMatch = fullText.match(sectionRegex);
        if (sMatch) {
            data.rawSections[section] = sMatch.index;
        }
    }

    // ── Extract trace coordinates ──
    const traceCoordinates = extractTraceCoordinates(fullText);
    data.traceCoordinates = traceCoordinates;

    return data;
}

/**
 * Merge parsed PDF data into structured locations
 */
export function mergeToLocations(parsedData) {
    const locations = [];
    const traceGeometry = parsedData.traceCoordinates || [];

    // If we found locatiecodes, create entries for each
    if (parsedData.locatiecodes.length > 0) {
        for (const code of parsedData.locatiecodes) {
            const location = {
                locatiecode: code,
                locatienaam: '',
                straatnaam: '',
                huisnummer: '',
                postcode: '',
                status: parsedData.rapportJaar ? `rapport ${parsedData.rapportJaar}` : '',
                conclusie: '',
                veiligheidsklasse: parsedData.veiligheidsklasse || '',
                melding: '',
                mkb: '',
                brl7000: '',
                opmerking: '',
                rapportJaar: parsedData.rapportJaar,
                afstandTrace: null,
                verdachteActiviteiten: 0,
                stoffen: [],
                traceGeometry: traceGeometry,
            };

            // Attach any found stoffen with values above intervention
            for (const s of parsedData.stoffen) {
                location.stoffen.push(s);
            }

            // Attach conclusions
            const hasVBO = parsedData.conclusies.some(c => c.type === 'VBO_verdacht');
            const hasOnverdacht = parsedData.conclusies.some(c => c.type === 'onverdacht');
            const hasIV = parsedData.conclusies.some(c => c.type === 'interventiewaarde_overschreden');

            if (hasVBO || hasIV) {
                location.conclusie = 'verontreinigd';
                location.complex = true;
            } else if (hasOnverdacht) {
                location.conclusie = 'onverdacht';
                location.complex = false;
            }

            locations.push(location);
        }
    } else {
        // No locatiecodes found — create a single entry from what we have
        locations.push({
            locatiecode: 'ONBEKEND',
            locatienaam: '',
            straatnaam: '',
            conclusie: parsedData.conclusies.length > 0 ? parsedData.conclusies[0].type : 'onbekend',
            veiligheidsklasse: parsedData.veiligheidsklasse || '',
            rapportJaar: parsedData.rapportJaar,
            stoffen: parsedData.stoffen,
            traceGeometry: traceGeometry,
            complex: parsedData.conclusies.some(c => c.type === 'VBO_verdacht' || c.type === 'interventiewaarde_overschreden'),
        });
    }

    return locations;
}
