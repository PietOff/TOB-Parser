/**
 * PDF Parser: extracts structured data from TOB bodemonderzoek PDF reports
 * Uses pdf.js (Mozilla) for client-side PDF text extraction
 */
import * as pdfjsLib from 'pdfjs-dist';
import { extractAllAddresses, extractBestAddress, extractTraceDescription } from './traceExtraction';
import { ocrImageForTrace } from './imageTraceOcr';
import { applyDynamicRules } from './dynamicParser';

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
export function parseTobReport(fullText, zoekregels = []) {
    const data = {
        locatiecodes: [],
        stoffen: [],
        conclusies: [],
        veiligheidsklasse: null,
        dieptes: [],
        rapportJaar: null,
        rawSections: {},
        projectAddress: null,
        projectTrace: null,
        dynamicFields: {},
        fullText, // kept for per-location context lookup in mergeToLocations
    };

    // ── Apply dynamic rules ──
    try {
        if (zoekregels && zoekregels.length > 0) {
            data.dynamicFields = applyDynamicRules(fullText, zoekregels);
        }
    } catch(err) {
        console.warn('⚠️ [PDF] Error applying dynamic rules:', err);
    }

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

    // ── Extract project address (smart selection) ──
    try {
        const allAddresses = extractAllAddresses(fullText);
        const titleContext = '';
        const bestAddress = extractBestAddress(allAddresses, titleContext);

        if (bestAddress) {
            data.projectAddress = {
                straatnaam: bestAddress.straatnaam,
                huisnummer: bestAddress.huisnummer,
                postcode: bestAddress.postcode,
                city: bestAddress.city,
            };
            console.log('✅ [PDF] Found projectAddress:', data.projectAddress);
        } else {
            console.warn('⚠️ [PDF] No address found in document');
        }
    } catch (err) {
        console.warn('⚠️ [PDF] Error extracting address:', err);
    }

    // ── Extract trace description with distance ──
    try {
        data.projectTrace = extractTraceDescription(fullText, '');
        console.log('✅ [PDF] Found projectTrace:', data.projectTrace);
    } catch (err) {
        console.warn('⚠️ [PDF] Error extracting trace:', err);
    }

    return data;
}

/**
 * Merge parsed PDF data into structured locations
 */
export function mergeToLocations(parsedData, zoekregels = []) {
    const locations = [];
    const fullText = parsedData.fullText || '';

    // Pre-index locatiecode positions, preferring the occurrence where address data follows
    const codePositions = {};
    {
        const allOccurrences = {};
        const posRegex = /\b([A-Z]{2}\d{9,12})\b/g;
        let pm;
        while ((pm = posRegex.exec(fullText)) !== null) {
            if (!allOccurrences[pm[1]]) allOccurrences[pm[1]] = [];
            allOccurrences[pm[1]].push(pm.index);
        }
        for (const [codeKey, positions] of Object.entries(allOccurrences)) {
            // Pick the first occurrence whose following segment contains a postcode
            let chosen = positions[0];
            for (const pos of positions) {
                const after = fullText.substring(pos + codeKey.length, pos + codeKey.length + 600);
                const nextCode = after.search(/\b[A-Z]{2}\d{9,12}\b/);
                const seg = nextCode > 0 ? after.substring(0, nextCode) : after.substring(0, 400);
                if (/\b[1-9]\d{3}\s?[A-Z]{2}\b/.test(seg)) { chosen = pos; break; }
            }
            codePositions[codeKey] = chosen;
        }
    }

    // If we found locatiecodes, create entries for each
    if (parsedData.locatiecodes.length > 0) {
        for (const code of parsedData.locatiecodes) {
            // Try to extract per-location address from 500-char context around this code
            let locStraatnaam = '';
            let locHuisnummer = '';
            let locPostcode = '';
            let locCity = '';

            if (fullText && codePositions[code] !== undefined) {
                // Address data is in the segment AFTER this code
                // PDF table row: [code] [locatienaam] [straatnaam] [nr] [postcode] [city]
                const codeEnd = codePositions[code] + code.length;
                const textAfterCode = fullText.substring(codeEnd);
                const nextCodeIdx = textAfterCode.search(/\b[A-Z]{2}\d{9,12}\b/);
                const segment = (nextCodeIdx > 0 && nextCodeIdx < 600
                    ? textAfterCode.substring(0, nextCodeIdx)
                    : textAfterCode.substring(0, 500)).trim();

                // Try explicit address label first
                const adresMatch = segment.match(
                    /(?:Adres|Straatnaam|Locatieadres)\s*[:\n]\s*([^\n,]{3,50}?)(?:\s+(\d{1,4}[a-z]?))?/i
                );
                if (adresMatch) {
                    locStraatnaam = adresMatch[1].trim();
                    locHuisnummer = adresMatch[2]?.trim() || '';
                }

                // Split by 2+ spaces to separate PDF table columns
                const cells = segment.split(/\s{2,}/).map(c => c.trim()).filter(c => c);

                // Find the postcode cell
                const pcIdx = cells.findIndex(c => /^[1-9]\d{3}\s?[A-Z]{2}$/.test(c));
                if (pcIdx >= 0) {
                    locPostcode = cells[pcIdx].replace(/\s/, '').toUpperCase();
                    // City = cell after postcode (if it looks like a city name)
                    const cityCell = cells[pcIdx + 1] || '';
                    if (cityCell && /^[A-Z]/.test(cityCell) && !/\d/.test(cityCell)) {
                        locCity = cityCell.trim();
                    }

                    if (!locStraatnaam) {
                        // Street cells are those before the postcode cell
                        const streetCells = cells.slice(0, pcIdx);
                        for (const cell of streetCells) {
                            // Skip all-uppercase abbreviated names (e.g. "PROF DR MAGNUSLN 18 A")
                            if (/^[A-Z0-9\s\-\.]+$/.test(cell)) continue;
                            // Skip known document-structure words
                            if (/^(Inhoudsopgave|Bijlage|Paragraaf|Hoofdstuk|Tabel|Figuur|Deellocatie)/i.test(cell)) continue;
                            // Try "StreetName HouseNumber" at end of cell
                            const snMatch = cell.match(/^([A-Za-z][A-Za-z\s\-\.]{2,}?)\s+(\d{1,4}\s*[a-zA-Z]?)$/);
                            if (snMatch) {
                                locStraatnaam = snMatch[1].trim();
                                locHuisnummer = snMatch[2].replace(/\s/, '').trim();
                                break;
                            }
                            // Accept as street-only if it starts with proper-case and is reasonable length
                            if (/^[A-Z][a-z]/.test(cell) && cell.length >= 4 && cell.length < 60) {
                                locStraatnaam = cell;
                            }
                        }
                    }
                } else if (!locStraatnaam) {
                    // No postcode — fall back to looking for a postcode anywhere in the segment
                    const pcMatch = segment.match(/\b([1-9]\d{3}\s?[A-Z]{2})\b/);
                    if (pcMatch) {
                        locPostcode = pcMatch[1].replace(/\s/, '').toUpperCase();
                        const beforePc = segment.substring(0, segment.indexOf(pcMatch[0])).trim();
                        // Take the last proper-case word group before the postcode as street
                        const snMatch = beforePc.match(/([A-Z][a-z][A-Za-z\s\-\.]{1,40}?)\s+(\d{1,4}[a-zA-Z]?)\s*$/);
                        if (snMatch) {
                            locStraatnaam = snMatch[1].trim();
                            locHuisnummer = snMatch[2].trim();
                        }
                    }
                }
            }

            // Fall back to project-level address if per-location extraction failed
            const straatnaam = locStraatnaam || parsedData.projectAddress?.straatnaam || '';
            const huisnummer = locHuisnummer || parsedData.projectAddress?.huisnummer || '';
            const postcode = locPostcode || parsedData.projectAddress?.postcode || '';
            const city = locCity || parsedData.projectAddress?.city || '';

            const location = {
                locatiecode: code,
                locatienaam: straatnaam
                    ? `${straatnaam} ${huisnummer || ''}`.trim()
                    : '',
                straatnaam,
                huisnummer,
                postcode,
                woonplaats: city,
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
                complex: false,
                ...parsedData.dynamicFields, // Inject dynamic extraction results
            };

            // Attach any found stoffen with values above intervention
            for (const s of parsedData.stoffen) {
                location.stoffen.push(s);
            }

            // Only apply document-level conclusie when there's 1 location — for multi-location
            // PDFs these flags are document-wide and should NOT mark every location as complex.
            if (parsedData.locatiecodes.length === 1) {
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
            complex: parsedData.conclusies.some(c => c.type === 'VBO_verdacht' || c.type === 'interventiewaarde_overschreden'),
            ...parsedData.dynamicFields, // Inject dynamic extraction results
        });
    }

    return locations;
}
