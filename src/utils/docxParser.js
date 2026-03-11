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
import { applyDynamicRules } from './dynamicParser';

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

    // ── Extract locatiecodes (ALL matching AA/UT/.. codes) ──
    const locCodeRegex = /\b([A-Z]{2}\d{9,12})\b/g;
    const locCodes = new Set();
    let match;
    while ((match = locCodeRegex.exec(fullText)) !== null) {
        locCodes.add(match[1]);
    }

    // ── STEP 1: Parse "Overzicht bodemlocaties" table ──────────────────
    // This table has columns: Locatiecode | Locatienaam | Straatnaam | Huisnummer | Postcode | Plaatsnaam
    // It appears as a flat text pattern after "Overzicht bodemlocaties"
    const overviewMap = {}; // code → { locatienaam, straatnaam, huisnummer, postcode, plaatsnaam }
    const overviewMarker = 'Overzicht bodemlocaties';
    let overviewIdx = fullText.indexOf(overviewMarker);
    while (overviewIdx > -1) {
        // Grab text between here and the next major section
        const nextSectionIdx = fullText.indexOf('Gegevens Bodemlocaties', overviewIdx + overviewMarker.length);
        const overviewBlock = fullText.substring(
            overviewIdx + overviewMarker.length,
            nextSectionIdx > -1 ? nextSectionIdx : overviewIdx + 3000
        );

        // Find each locatiecode in this block and extract the table row data after it
        for (const code of locCodes) {
            const codeIdx = overviewBlock.indexOf(code);
            if (codeIdx === -1) continue;

            // Get the lines after this code (the table cells follow as separate lines)
            const afterCode = overviewBlock.substring(codeIdx + code.length);
            const lines = afterCode.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            // Table row pattern: locatienaam, straatnaam, huisnummer (or empty), postcode (or empty), plaatsnaam
            if (lines.length >= 1) {
                const entry = { locatienaam: '', straatnaam: '', huisnummer: '', postcode: '', plaatsnaam: '' };
                entry.locatienaam = lines[0] || '';
                if (lines[1] && !/^[A-Z]{2}\d{9,12}$/.test(lines[1])) entry.straatnaam = lines[1];

                // Scan remaining lines for postcode, plaatsnaam, huisnummer
                for (let i = 2; i < Math.min(lines.length, 6); i++) {
                    const line = lines[i];
                    if (/^[A-Z]{2}\d{9,12}$/.test(line)) break; // next locatiecode
                    if (/^[1-9]\d{3}\s?[A-Za-z]{2}$/.test(line)) {
                        entry.postcode = line.replace(/\s/g, '').toUpperCase();
                    } else if (/^\d{1,5}[a-zA-Z]?$/.test(line)) {
                        entry.huisnummer = line;
                    } else if (/^[A-Z][a-z]/.test(line) && line.length < 50 && !entry.plaatsnaam) {
                        entry.plaatsnaam = line;
                    }
                }

                overviewMap[code] = entry;
            }
        }

        // Check for another "Overzicht bodemlocaties" (12.5m buffer section)
        overviewIdx = fullText.indexOf(overviewMarker, overviewIdx + overviewMarker.length + 100);
    }

    console.log(`📋 [DOCX] Overzicht tabel: ${Object.keys(overviewMap).length} locaties gevonden`);

    // ── STEP 2: Parse detailed "Gegevens Bodemlocaties" sections ────────
    // Each section starts with: "{locatienaam} {locatiecode}" and contains:
    //   Locatiecode → code
    //   Locatienaam → naam
    //   Adres → straatnaam plaatsnaam
    //   Beoordeling verontreiniging → assessment
    //   Vervolgactie i.h.k.v WBB uit status locatie van Nazca → nazca follow-up
    //   Rapportinformatie (uitgevoerde bodemonderzoeken) → list of research reports
    //   CROW 400 grond/grondwater classifications
    const detailMap = {}; // code → { beoordeling, vervolgactie, adres, rapporten[], activiteiten[], crow400 }

    for (const code of locCodes) {
        // Find the detail section for this code (after "Gegevens Bodemlocaties" or as "{name} {code}")
        const detailRegex = new RegExp(`Locatiecode\\s*\\n\\s*${code}\\s*\\n`, 's');
        const detailMatch = detailRegex.exec(fullText);
        if (!detailMatch) continue;

        const sectionStart = detailMatch.index;
        // Find end of section: next locatiecode detail block or "Bodeminformatie in het Nuts" or "BKK omgerekend"
        let sectionEnd = fullText.length;
        for (const otherCode of locCodes) {
            if (otherCode === code) continue;
            const nextBlock = new RegExp(`Locatiecode\\s*\\n\\s*${otherCode}\\s*\\n`, 's');
            const nextMatch = nextBlock.exec(fullText.substring(sectionStart + 50));
            if (nextMatch) {
                const candidate = sectionStart + 50 + nextMatch.index;
                if (candidate < sectionEnd) sectionEnd = candidate;
            }
        }

        // Also check for section boundaries
        const sectionBoundaries = [
            'Bodeminformatie in het Nuts Bodeminformatiesysteem in een straal',
            'BKK omgerekend',
            'Bijlage 1',
            'Kadastrale Gegevens',
        ];
        for (const boundary of sectionBoundaries) {
            const boundaryIdx = fullText.indexOf(boundary, sectionStart + 50);
            if (boundaryIdx > -1 && boundaryIdx < sectionEnd) sectionEnd = boundaryIdx;
        }

        const sectionText = fullText.substring(sectionStart, sectionEnd);

        const detail = {
            beoordeling: '',
            vervolgactie: '',
            adres: '',
            rapporten: [],
            activiteiten: [],
            crow400Grond: '',
            crow400Grondwater: '',
        };

        // Extract beoordeling verontreiniging
        const beoordelingMatch = sectionText.match(/Beoordeling verontreiniging\s*\n\s*(.+?)(?:\n|$)/i);
        if (beoordelingMatch) detail.beoordeling = beoordelingMatch[1].trim();

        // Extract vervolgactie (Nazca follow-up)
        const vervolgMatch = sectionText.match(/Vervolgactie i\.h\.k\.v.*?Nazca\s*\n\s*(.+?)(?:\n|$)/i);
        if (vervolgMatch) detail.vervolgactie = vervolgMatch[1].trim();

        // Extract adres
        const adresMatch = sectionText.match(/Adres\s*\n\s*(.+?)(?:\n|$)/i);
        if (adresMatch) detail.adres = adresMatch[1].trim();

        // Extract locatienaam from detail
        const namaMatch = sectionText.match(/Locatienaam\s*\n\s*(.+?)(?:\n|$)/i);

        // Extract research reports (Rapportinformatie)
        const rapportIdx = sectionText.indexOf('Rapportinformatie');
        if (rapportIdx > -1) {
            // After the header row (Rapportdatum, Bodemonderzoek, Onderzoeksbureau, Rapportnummer, etc.)
            const rapportBlock = sectionText.substring(rapportIdx);
            // Find date patterns: dd-mm-yyyy
            const dateRegex = /(\d{2}-\d{2}-\d{4})\s*\n\s*(.+?)\s*\n\s*(.+?)\s*\n\s*(.+?)(?:\s*\n)/g;
            let rapMatch;
            while ((rapMatch = dateRegex.exec(rapportBlock)) !== null) {
                const datumStr = rapMatch[1];
                const type = rapMatch[2].trim();
                const bureau = rapMatch[3].trim();
                const rapportnummer = rapMatch[4].trim();

                // Skip header rows
                if (type === 'Bodemonderzoek' || type === 'Rapportdatum') continue;

                detail.rapporten.push({
                    datum: datumStr,
                    type,
                    bureau,
                    rapportnummer,
                });
            }
        }

        // Extract CROW 400 values from table cells
        const crow400GrondMatch = sectionText.match(/CROW 400 grond\s*\n\s*CROW 400 grondwater\s*\n.*?\n\s*(.+?)\s*\n\s*(.+?)\s*\n/s);
        if (crow400GrondMatch) {
            detail.crow400Grond = crow400GrondMatch[1].trim();
            detail.crow400Grondwater = crow400GrondMatch[2].trim();
        }

        // Extract bodembedreigende activiteiten
        const actIdx = sectionText.indexOf('Mogelijk onderzochte bodembedreigende activiteiten');
        if (actIdx > -1) {
            const actBlock = sectionText.substring(actIdx);
            // Pattern: Gebruik\nVan\nTot\nubi-klasse\nVoldoende onderzocht\n{values repeat}
            const actRegex = /(?:^|\n)\s*([a-z][\w\s\-()\/.]+?)\s*\n\s*((?:\d{4}|Onbekend))\s*\n\s*((?:\d{4}|Onbekend))\s*\n\s*(\d+)\s*\n\s*(Ja|Nee|Onbekend)/gim;
            let actMatch;
            while ((actMatch = actRegex.exec(actBlock)) !== null) {
                detail.activiteiten.push({
                    gebruik: actMatch[1].trim(),
                    van: actMatch[2],
                    tot: actMatch[3],
                    ubiKlasse: parseInt(actMatch[4]),
                    onderzocht: actMatch[5],
                });
            }
        }

        detailMap[code] = detail;
    }

    console.log(`🔬 [DOCX] Detail secties: ${Object.keys(detailMap).length} locaties met Nazca/rapport data`);

    // ── STEP 3: Build final location objects by merging overview + detail ─
    for (const code of locCodes) {
        const overview = overviewMap[code] || {};
        const detail = detailMap[code] || {};

        const loc = {
            locatiecode: code,
            locatienaam: overview.locatienaam || '',
            straatnaam: overview.straatnaam || '',
            huisnummer: overview.huisnummer || '',
            postcode: overview.postcode || '',
            woonplaats: overview.plaatsnaam || '',
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

        // Enrich from detail section
        if (detail.beoordeling) {
            loc.opmerking = `Beoordeling: ${detail.beoordeling}`;
            if (/ernstig|sterk verontreinigd/i.test(detail.beoordeling)) {
                loc.conclusie = 'verdacht';
                loc.complex = true;
            } else if (/niet ernstig/i.test(detail.beoordeling)) {
                loc.conclusie = 'licht verontreinigd';
            }
        }

        if (detail.vervolgactie) {
            loc.status = detail.vervolgactie;
            if (/uitvoeren/i.test(detail.vervolgactie)) loc.complex = true;
        }

        // Parse adres for straatnaam/woonplaats if not from overview
        if (detail.adres && !loc.straatnaam) {
            const adresParts = detail.adres.split(/\s+/);
            if (adresParts.length >= 2) {
                loc.woonplaats = adresParts[adresParts.length - 1];
                loc.straatnaam = adresParts.slice(0, -1).join(' ');
            }
        } else if (detail.adres && !loc.woonplaats) {
            // Extract plaatsnaam from adres if missing
            const adresParts = detail.adres.split(/\s+/);
            if (adresParts.length >= 2) {
                loc.woonplaats = adresParts[adresParts.length - 1];
            }
        }

        // CROW 400 veiligheidsklasse from detail
        if (detail.crow400Grond && detail.crow400Grond !== 'Onb.') {
            loc.veiligheidsklasse = detail.crow400Grond;
        }

        // Set rapport year from most recent report
        if (detail.rapporten.length > 0) {
            const mostRecent = detail.rapporten.sort((a, b) => {
                const [da, ma, ya] = a.datum.split('-').map(Number);
                const [db, mb, yb] = b.datum.split('-').map(Number);
                return (yb * 10000 + mb * 100 + db) - (ya * 10000 + ma * 100 + da);
            })[0];
            const [, , year] = mostRecent.datum.split('-').map(Number);
            loc.rapportJaar = year;
        }

        // Count verdachte activiteiten
        loc.verdachteActiviteiten = detail.activiteiten?.length || 0;
        if (loc.verdachteActiviteiten >= 3) loc.complex = true;

        // Store full Nazca detail as enrichment data
        loc._nazcaDetail = {
            beoordeling: detail.beoordeling,
            vervolgactie: detail.vervolgactie,
            rapporten: detail.rapporten,
            activiteiten: detail.activiteiten,
            crow400Grond: detail.crow400Grond,
            crow400Grondwater: detail.crow400Grondwater,
        };

        // Fallback: if we still have no straatnaam, try context-based extraction
        if (!loc.straatnaam && !loc.locatienaam) {
            const nameRegex = new RegExp(`${code}\\s+(.+?)(?:\\n|$)`, 'i');
            const nameMatch = fullText.match(nameRegex);
            if (nameMatch) {
                loc.locatienaam = nameMatch[1].trim().substring(0, 100);
            }
        }

        // Fallback: context-based postcode extraction
        if (!loc.postcode) {
            const contextRegex = new RegExp(`.{0,200}${code}.{0,200}`, 's');
            const context = fullText.match(contextRegex);
            if (context) {
                const afterCode = context[0].substring(context[0].indexOf(code));
                const pMatch = afterCode.match(/\b([1-9][0-9]{3}\s?[A-Za-z]{2})\b/);
                if (pMatch) loc.postcode = pMatch[1].replace(/\s/g, '').toUpperCase();
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
export function docxToLocations(docxData, zoekregels = []) {
    const dynamicFields = applyDynamicRules(docxData.fullText, zoekregels);

    if (docxData.locatiecodes.length > 0) {
        return docxData.locatiecodes.map(loc => ({
            ...loc,
            ...dynamicFields
        }));
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
        ...dynamicFields, // Inject dynamic fields
    }];
}
