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
import { analyzeTraceImage } from './tracePixelAnalyzer';

/**
 * Find the trace contour map image inside a DOCX.
 *
 * Strategy:
 *  1. Parse document.xml + _rels to find the image whose preceding paragraph
 *     contains "verontreinigingscontour" (the standard Tauw caption).
 *  2. Fall back to the first large (>60 KB) PNG that has detectable yellow pixels.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Promise<Blob|null>}
 */
async function findTraceMapImage(arrayBuffer) {
    try {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(arrayBuffer);

        // Build relationship ID → filename map (handles rId1, PictureId1, etc.)
        const relsXml = await zip.files['word/_rels/document.xml.rels']?.async('string') ?? '';
        const relMap = {};
        for (const [, id, fname] of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="media\/([^"]+)"/g)) {
            relMap[id] = fname;
        }

        // Split document.xml into paragraphs, track last caption text
        const docXml = await zip.files['word/document.xml']?.async('string') ?? '';
        const paras = docXml.split(/<w:p[ >]/);

        let lastCaption = '';
        let targetFname = null;

        for (const para of paras) {
            const text = para.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            if (text) lastCaption = text;

            // Match standard r:id="rId1" / r:embed="rId1" attributes, or legacy PictureId format
            const ridMatch = para.match(/r:(?:id|embed)="([^"]+)"/i) ?? para.match(/(PictureId\d+)/);
            if (ridMatch) {
                const rid = ridMatch[1];
                const fname = relMap[rid];
                if (fname && /verontreinigingscontour/i.test(lastCaption)) {
                    targetFname = fname;
                    break;
                }
            }
        }

        // Fallback: scan all PNGs referenced in rels for yellow pixels
        // Uses blob.size (not private _data API) for the size pre-filter
        if (!targetFname) {
            const pngFnames = Object.values(relMap).filter(fname => /\.png$/i.test(fname));
            for (const fname of pngFnames) {
                const entry = zip.files[`word/media/${fname}`];
                if (!entry) continue;
                const blob = await entry.async('blob');
                if (blob.size < 20_000) continue;
                const url = URL.createObjectURL(blob);
                const hasYellow = await _quickYellowCheck(url);
                URL.revokeObjectURL(url);
                if (hasYellow) {
                    targetFname = fname;
                    console.log('[DocxParser] Found trace image via yellow check:', fname);
                    break;
                }
            }
        }

        if (!targetFname) return null;

        const fileEntry = zip.files[`word/media/${targetFname}`];
        if (!fileEntry) return null;
        return await fileEntry.async('blob');
    } catch (err) {
        console.warn('[DocxParser] findTraceMapImage error:', err.message);
        return null;
    }
}

/** Quick check: does an image URL contain any yellow pixels? (samples 200 points) */
async function _quickYellowCheck(url) {
    try {
        const img = await new Promise((res, rej) => {
            const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
        });
        const c = document.createElement('canvas');
        const step = Math.max(1, Math.floor(img.naturalWidth / 20));
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        for (let y = 0; y < c.height; y += step) {
            for (let x = 0; x < c.width; x += step) {
                const i = (y * c.width + x) * 4;
                if (d[i] > 150 && d[i+1] > 120 && d[i+2] < 100 && d[i] - d[i+2] > 80) return true;
            }
        }
        return false;
    } catch {
        return false;
    }
}

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

            // Try to extract postcode from locatienaam
            const pMatch = loc.locatienaam.match(/\b([1-9][0-9]{3}\s?[A-Za-z]{2})\b/);
            if (pMatch) loc.postcode = pMatch[1].replace(/\s/g, '').toUpperCase();

            // Try to extract huisnummer from locatienaam
            const hMatch = loc.locatienaam.match(/\b(\d{1,4}[a-zA-Z]?)\b/);
            if (hMatch) loc.huisnummer = hMatch[1];
        }

        // Try to extract year from context around the code
        const contextRegex = new RegExp(`.{0,200}${code}.{0,200}`, 's');
        const context = fullText.match(contextRegex);
        if (context) {
            const yearMatch = context[0].match(/\b(20[12]\d)\b/);
            if (yearMatch) loc.rapportJaar = parseInt(yearMatch[1]);

            // Try to extract postcode from context if we don't have it yet
            if (!loc.postcode) {
                // Look strictly AFTER the locatiecode to avoid grabbing a previous address
                const afterCode = context[0].substring(context[0].indexOf(code));
                const pMatch = afterCode.match(/\b([1-9][0-9]{3}\s?[A-Za-z]{2})\b/);
                if (pMatch) loc.postcode = pMatch[1].replace(/\s/g, '').toUpperCase();
            }

            // Look for optional woonplaats near postcode
            if (loc.postcode) {
                // Find word after postcode
                const escapedPostcode = loc.postcode.replace(/(.{4})(.{2})/, "$1\\s?$2");
                const cityMatch = context[0].match(new RegExp(`${escapedPostcode}\\s+([A-Z][A-Za-z\\-]+)\\b`));
                if (cityMatch) {
                    // Filter out non-cities that might casually follow a postcode
                    const possibleCity = cityMatch[1].trim();
                    if (!['en', 'de', 'het', 'een', 'van', 'tot'].includes(possibleCity.toLowerCase())) {
                        loc.woonplaats = possibleCity;
                    }
                }
            }

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

    // ── Trace shape: pixel analysis of the contour map image ──────────────
    try {
        if (onProgress) onProgress('📐 Tracé-afmetingen meten uit kaartafbeelding...');
        const traceBlob = await findTraceMapImage(arrayBuffer);
        if (traceBlob) {
            const shape = await analyzeTraceImage(traceBlob);
            if (shape && shape.widthM > 1 && shape.heightM > 1) {
                data.traceShape = shape;
                console.log(`✅ [DOCX] Trace shape: ${shape.widthM.toFixed(1)}×${shape.heightM.toFixed(1)} m`);
            }
        } else {
            console.log('ℹ️ [DOCX] No trace map image found');
        }
    } catch (err) {
        console.warn('⚠️ [DOCX] Trace shape analysis failed:', err.message);
    }

    return data;
}

/**
 * Convert parsed DOCX data to location array (same format as other parsers)
 */
export function docxToLocations(docxData) {
    if (docxData.locatiecodes.length > 0) {
        // Attach the trace shape (if found) to every location from this document
        if (docxData.traceShape) {
            for (const loc of docxData.locatiecodes) {
                loc._traceShape = docxData.traceShape;
            }
        }
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
        _traceShape: docxData.traceShape || null,
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
