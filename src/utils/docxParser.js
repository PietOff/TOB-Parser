/**
 * DOCX Parser: extracts structured data from TOB Word documents
 * Uses mammoth.js for client-side DOCX → HTML conversion, then parses the HTML
 * 
 * TOB DOCX structure (based on Stedin/Tauw format):
 * - Title: "Tracé Onderzoek Bodemkwaliteit"
 * - Table 1: Legend (kleuren/symbolen)
 * - Table 2: Rapport metadata (aanvrager, opdrachtgever, datum, rapport ID, veiligheidsklasse)
 * - Table 3: Werkzaamheden (aanvraagnummer, omschrijving, sleuflengte, -breedte, -diepte)
 * - Heading 1: "Inleiding & Leeswijzer"
 *   - Heading 2: Locatiegegevens
 *   - Heading 2: Tracétekening
 *   - Heading 2: Aanleiding en doel
 * - Heading 1: "Conclusie"
 *   - Onverdacht/verdacht assessment
 *   - Veiligheidsklasse CROW 400
 *   - Meldingen
 * - Heading 1: "Beschikbare bodeminformatie"
 *   - Asbestverdenking
 *   - Per locatiecode: tabellen met onderzoeksresultaten
 */
import mammoth from 'mammoth';
import { extractAllAddresses, extractBestAddress, extractTraceDescription } from './traceExtraction';
import { extractImagesFromDocx, ocrImageForTrace } from './imageTraceOcr';

/**
 * Parse a DOCX file and extract TOB-structured data
 */
export async function parseDocx(file, onProgress) {
    const arrayBuffer = await file.arrayBuffer();

    if (onProgress) onProgress('📝 Tekst extraheren uit Word-document...');

    // Extract raw text for pattern matching
    const textResult = await mammoth.extractRawText({ arrayBuffer });
    const fullText = textResult.value;

    // Also get HTML for structure parsing
    const htmlResult = await mammoth.convertToHtml({ arrayBuffer });
    const html = htmlResult.value;

    if (onProgress) onProgress('🔍 Locatiecodes en adressen parseren...');

    const data = {
        // Metadata
        titel: '',
        projectCode: '',
        adres: '',
        aanvrager: '',
        opdrachtgever: '',
        bodemadviseur: '',
        rapportDatum: '',
        rapportId: '',

        // Werkzaamheden
        aanvraagnummer: '',
        omschrijving: '',
        sleuflengte: '',
        sleufbreedte: '',
        sleufdiepte: '',

        // Conclusie
        veiligheidsklasse: '',
        isVerdacht: false,
        conclusieTekst: '',
        meldingTekst: '',
        asbestverdenking: false,

        // Project location & trace (new)
        projectAddress: null,
        projectTrace: null,

        // Locatiecodes en rapporten
        locatiecodes: [],

        // Raw
        fullText,
        html,
    };

    // ── Extract title & project code ──
    const titleMatch = fullText.match(/Tracé\s+Onderzoek\s+Bodemkwaliteit/i);
    if (titleMatch) data.titel = 'Tracé Onderzoek Bodemkwaliteit';

    const projMatch = fullText.match(/\b(PD\d{6})\b/);
    if (projMatch) data.projectCode = projMatch[1];

    const adresMatch = fullText.match(/PD\d{6}\s+(.+?)(?:\n|$)/);
    if (adresMatch) data.adres = adresMatch[1].trim();

    // ── Extract metadata from tables ──
    // Parse key-value pairs from text
    const kvPatterns = [
        { key: 'aanvrager', regex: /Aanvrager\/opsteller\s+(.+?)(?:\s{2,}|$)/m },
        { key: 'opdrachtgever', regex: /Opdrachtgever\s+(.+?)(?:\s{2,}|$)/m },
        { key: 'bodemadviseur', regex: /Bodemadviseur(?:\s+TAUW)?\s+(.+?)(?:\s{2,}|$)/m },
        { key: 'rapportDatum', regex: /Rapport aangemaakt\s+(.+?)(?:\s{2,}|$)/m },
        { key: 'rapportId', regex: /Rapport ID\s+(\d+)/m },
        { key: 'aanvraagnummer', regex: /Aanvraagnummer:\s*(.+?)(?:\n|$)/m },
        { key: 'omschrijving', regex: /Omschrijving werkzaamheden:\s*(.+?)(?:\n|$)/m },
    ];

    for (const { key, regex } of kvPatterns) {
        const m = fullText.match(regex);
        if (m) data[key] = m[1].trim();
    }

    // ── Extract sleuf dimensions ──
    const sleufLengte = fullText.match(/Lengte van het te ontgraven.*?(\d+[\.,]?\d*)/i);
    if (sleufLengte) data.sleuflengte = sleufLengte[1];

    const sleufBreedte = fullText.match(/(?:Maximale\s+)?sleufbreedte.*?(\d+[\.,]?\d*)/i);
    if (sleufBreedte) data.sleufbreedte = sleufBreedte[1];

    const sleufDiepte = fullText.match(/(?:Maximale\s+)?sleufdiepte.*?(\d+[\.,]?\d*)/i);
    if (sleufDiepte) data.sleufdiepte = sleufDiepte[1];

    // ── Extract veiligheidsklasse ──
    const vkMatch = fullText.match(/(?:voorlopige\s+)?veiligheidsklasse\s*(?:CROW\s*400)?\s*(?:is(?:\s+vastgesteld\s+op)?:?\s*)?([^\n.]+)/i);
    if (vkMatch) data.veiligheidsklasse = vkMatch[1].trim();

    // Also check table format
    const vkTableMatch = fullText.match(/Voorlopige veiligheidsklasse\s*\n?\s*CROW\s*400\s*:?\s*([^\n]+)/i);
    if (vkTableMatch && !data.veiligheidsklasse) {
        data.veiligheidsklasse = vkTableMatch[1].trim();
    }

    // ── Conclusie analysis ──
    const verdachtMatch = fullText.match(/(?:de\s+locatie\s+(?:als\s+)?)(verdacht|onverdacht)/i);
    if (verdachtMatch) {
        data.isVerdacht = verdachtMatch[1].toLowerCase() === 'verdacht';
    }

    // Check for "onverdacht" explicitly
    if (/locatie\s+onverdacht/i.test(fullText) || /hypothese.*onverdacht/i.test(fullText)) {
        data.isVerdacht = false;
    }
    if (/locatie\s+(?:als\s+)?verdacht\s+beschouwd/i.test(fullText)) {
        data.isVerdacht = true;
    }

    // Check for interventiewaarde mentions
    if (/boven\s+interventiewaarde/i.test(fullText) || /interventiewaarde.*overschr/i.test(fullText)) {
        data.isVerdacht = true;
    }

    // ── Asbest ──
    if (/asbestverdenking/i.test(fullText)) {
        data.asbestverdenking = /geen\s+(?:sprake|aanwijzingen)/i.test(fullText) ? false : true;
    }

    // ── Extract locatiecodes ──
    const locCodeRegex = /\b([A-Z]{2}\d{9,12})\b/g;
    const locCodes = new Set();
    let match;
    while ((match = locCodeRegex.exec(fullText)) !== null) {
        locCodes.add(match[1]);
    }

    // For each locatiecode, try to extract surrounding context
    for (const code of locCodes) {
        const loc = {
            locatiecode: code,
            locatienaam: '',
            straatnaam: '',
            huisnummer: '',
            postcode: '',
            status: '',
            conclusie: data.isVerdacht ? 'verdacht' : 'onverdacht',
            veiligheidsklasse: data.veiligheidsklasse,
            melding: '',
            mkb: '',
            brl7000: '',
            opmerking: '',
            complex: false,
            rapportJaar: null,
            afstandTrace: null,
            verdachteActiviteiten: 0,
            stoffen: [],
            _source: `DOCX: ${file.name}`,
            _projectCode: data.projectCode,
        };

        // Try to find the locatienaam near the code
        const nameRegex = new RegExp(`${code}\\s+(.+?)(?:\\n|$)`, 'i');
        const nameMatch = fullText.match(nameRegex);
        if (nameMatch) {
            loc.locatienaam = nameMatch[1].trim().substring(0, 100);
        }

        // Try to extract year from context around the code
        const contextRegex = new RegExp(`.{0,200}${code}.{0,200}`, 's');
        const context = fullText.match(contextRegex);
        if (context) {
            const yearMatch = context[0].match(/\b(20[12]\d)\b/);
            if (yearMatch) loc.rapportJaar = parseInt(yearMatch[1]);

            // Check for verontreiniging keywords near this code
            if (/verdacht|verontreinig|interventiewaarde|sanering/i.test(context[0])) {
                loc.conclusie = 'verdacht';
                loc.complex = true;
            }

            // Check for "wel" marking
            if (/\bwel\b/i.test(context[0])) {
                loc.verdachteActiviteiten += 1;
            }

            // Extract stoffen if mentioned
            const stofMatch = context[0].match(/(lood|koper|zink|minerale\s*olie|pak|nikkel)\s*[\s>]*\s*(?:I\s*)?\(?(\d+)/i);
            if (stofMatch) {
                loc.stoffen.push({
                    stof: stofMatch[1].toLowerCase(),
                    waarde: parseFloat(stofMatch[2]),
                    raw: stofMatch[0],
                });
                loc.complex = true;
            }

            // Check distance to tracé
            const afstandMatch = context[0].match(/(\d+[\.,]?\d*)\s*(?:m(?:eter)?)\s*(?:van|tot|afstand)/i);
            if (afstandMatch) {
                loc.afstandTrace = parseFloat(afstandMatch[1].replace(',', '.'));
            }
        }

        data.locatiecodes.push(loc);
    }

    // ── Extract conclusion text ──
    const conclusieStart = fullText.indexOf('Conclusie');
    const beschikbareStart = fullText.indexOf('Beschikbare bodeminformatie');
    if (conclusieStart > -1 && beschikbareStart > -1) {
        data.conclusieTekst = fullText.substring(conclusieStart, beschikbareStart).trim();
    }

    // ── Extract project address (smart selection) ──
    try {
        const allAddresses = extractAllAddresses(fullText);
        const titleContext = `${data.titel} ${data.projectCode} ${data.adres}`;
        const bestAddress = extractBestAddress(allAddresses, titleContext);

        if (bestAddress) {
            data.projectAddress = {
                straatnaam: bestAddress.straatnaam,
                huisnummer: bestAddress.huisnummer,
                postcode: bestAddress.postcode,
                city: bestAddress.city,
            };
            console.log('✅ [DOCX] Found projectAddress:', data.projectAddress);
        } else {
            console.warn('⚠️ [DOCX] No address found in document');
        }
    } catch (err) {
        console.warn('⚠️ [DOCX] Error extracting address:', err);
    }

    // ── Extract trace description with distance ──
    try {
        const traceSection = fullText.match(/Tracé(?:tekening)?(.{0,2000}?)(?:Aanleiding|Locatiegegevens|Inleiding)/is);
        const traceText = traceSection ? traceSection[1] : data.omschrijving;
        data.projectTrace = extractTraceDescription(traceText, data.projectCode);
        console.log('✅ [DOCX] Found projectTrace:', data.projectTrace);
    } catch (err) {
        console.warn('⚠️ [DOCX] Error extracting trace:', err);
    }

    // ── Attempt OCR on embedded images for additional trace info ──
    // All TOB documents have trace images, so try OCR unless we have complete trace info
    const skipOcr = (data.projectTrace && data.projectTrace.distance && data.projectTrace.description);

    if (!skipOcr) {
        try {
            if (onProgress) onProgress('📷 Zoeken naar afbeeldingen met tracé...');
            const images = await extractImagesFromDocx(arrayBuffer);

            if (images.length > 0) {
                console.log(`🖼️ [DOCX] Found ${images.length} images, attempting OCR...`);
                if (onProgress) onProgress(`🖼️ ${images.length} afbeelding(en) gevonden - OCR wordt gestart...`);

                for (const img of images.slice(0, 2)) { // Limit to first 2 images
                    try {
                        const ocrResult = await ocrImageForTrace(img.blob, onProgress);

                        // Look for distance information in OCR results
                        if (ocrResult.traceInfo.distances.length > 0) {
                            const mainDistance = ocrResult.traceInfo.distances[0];
                            if (!data.projectTrace || !data.projectTrace.distance) {
                                data.projectTrace = data.projectTrace || {};
                                data.projectTrace.distance = mainDistance.value;
                                data.projectTrace.unit = mainDistance.unit;
                                data.projectTrace.ocrConfidence = ocrResult.confidence;
                                console.log(`🖼️ [DOCX] OCR found distance: ${mainDistance.value} ${mainDistance.unit}`);
                            }
                        }

                        // Enhance route description from OCR
                        if (ocrResult.traceInfo.routes.length > 0) {
                            const route = ocrResult.traceInfo.routes[0];
                            if (!data.projectTrace || !data.projectTrace.description || data.projectTrace.description.includes('Project')) {
                                data.projectTrace = data.projectTrace || {};
                                data.projectTrace.description = `Van ${route.from} naar ${route.to}`;
                                console.log(`🖼️ [DOCX] OCR found route: ${data.projectTrace.description}`);
                            }
                        }
                    } catch (imgErr) {
                        console.warn('⚠️ [DOCX] OCR error on image:', imgErr.message);
                        // Continue with other images even if one fails
                    }
                }
            }
        } catch (err) {
            console.warn('⚠️ [DOCX] Skipping image OCR:', err.message);
            // Non-critical - don't break parsing
        }
    } else if (skipOcr) {
        console.log('ℹ️ [DOCX] Skipping OCR (file too small or trace already found)');
    }

    return data;
}

/**
 * Convert parsed DOCX data to location array (same format as other parsers)
 */
export function docxToLocations(docxData) {
    if (docxData.locatiecodes.length > 0) {
        return docxData.locatiecodes;
    }

    // If no locatiecodes found, create a single entry from metadata
    return [{
        locatiecode: docxData.rapportId || docxData.projectCode || 'ONBEKEND',
        locatienaam: docxData.adres || '',
        straatnaam: docxData.adres || '',
        huisnummer: '',
        postcode: '',
        status: docxData.rapportDatum ? `rapport ${docxData.rapportDatum}` : '',
        conclusie: docxData.isVerdacht ? 'verdacht' : 'onverdacht',
        veiligheidsklasse: docxData.veiligheidsklasse,
        melding: '',
        mkb: '',
        brl7000: '',
        opmerking: docxData.omschrijving || '',
        complex: docxData.isVerdacht,
        rapportJaar: null,
        stoffen: [],
        _source: 'DOCX',
        _projectCode: docxData.projectCode,
        _metadata: {
            aanvrager: docxData.aanvrager,
            opdrachtgever: docxData.opdrachtgever,
            bodemadviseur: docxData.bodemadviseur,
            sleuflengte: docxData.sleuflengte,
            sleufbreedte: docxData.sleufbreedte,
            sleufdiepte: docxData.sleufdiepte,
        },
    }];
}
