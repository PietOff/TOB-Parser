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
    automatischAdvies: null, // 'wel' | 'geen' | null — uit sectie 3.5

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

    // Extract project-level postcode + city from header line, e.g. "Stationsplein 80, 3511 ED, Utrecht"
    const headerPcMatch = fullText.match(/PD\d{6}.+?([1-9]\d{3}\s?[A-Za-z]{2})[,\s]+([A-Z][a-z]+(?:[\s-][A-Z][a-z]+)*)/);
    if (headerPcMatch) {
        data.projectPostcode = headerPcMatch[1].replace(/\s/g, '').toUpperCase();
        data.projectCity    = headerPcMatch[2].trim();
        console.log(`🏙️ [DOCX] Project postcode: ${data.projectPostcode}, city: ${data.projectCity}`);
    }

    // ── Extract metadata from tables ──
    // Parse key-value pairs from text
    const kvPatterns = [
        { key: 'aanvrager', regex: /Aanvrager\/opsteller\s+(.+?)(?:\s{2,}|$)/m },
        { key: 'opdrachtgever', regex: /Opdrachtgever\s+(.+?)(?:\s{2,}|$)/m },
        { key: 'bodemadviseur', regex: /Bodemadviseur(?:\s+TAUW)?\s+(.+?)(?:\s{2,}|$)/m },
        { key: 'rapportDatum', regex: /Rapport aangemaakt\s*\n\s*([^\n]+)/m },
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

    // ── Extract RD coordinates from header ──
    const rdMatch = fullText.match(/X:\s*(\d{4,6}(?:[.,]\d+)?)\s*Y:\s*(\d{4,6}(?:[.,]\d+)?)/i);
    if (rdMatch) {
        data.rdX = parseFloat(rdMatch[1].replace(',', '.'));
        data.rdY = parseFloat(rdMatch[2].replace(',', '.'));
        console.log(`📍 [DOCX] RD coördinaten uit header: X=${data.rdX}, Y=${data.rdY}`);
    }

    // ── Extract veiligheidsklasse ──
    const WORD_PLACEHOLDER = /^kies een item|^click to|^selecteer|^<.*>$/i;
    const vkMatch = fullText.match(/(?:voorlopige\s+)?veiligheidsklasse\s*(?:CROW\s*400)?\s*(?:is(?:\s+vastgesteld\s+op)?:?\s*)?([^\n.]+)/i);
    if (vkMatch) {
        const raw = vkMatch[1].trim();
        data.veiligheidsklasse = WORD_PLACEHOLDER.test(raw) ? '' : raw;
    }

    // Also check table format
    const vkTableMatch = fullText.match(/Voorlopige veiligheidsklasse\s*\n?\s*CROW\s*400\s*:?\s*([^\n]+)/i);
    if (vkTableMatch && !data.veiligheidsklasse) {
        const raw = vkTableMatch[1].trim();
        data.veiligheidsklasse = WORD_PLACEHOLDER.test(raw) ? '' : raw;
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

    // ── Extract automatisch advies (sectie 3.5) ──
  // Globale fallback: eerste advies in het document
  // Per-locatie advies wordt later in STEP 3 per code berekend
  const adviesMarker = 'Advies op basis van automatische beoordeling van dit dossier';
  const adviesIdx = fullText.indexOf(adviesMarker);
  if (adviesIdx > -1) {
    const adviesSnippet = fullText
      .slice(adviesIdx + adviesMarker.length, adviesIdx + adviesMarker.length + 500)
      .toLowerCase();
    if (/\bis er wel\b/.test(adviesSnippet) || /\bwordt wel\b/.test(adviesSnippet) || /wordt.*?wel noodzakelijk/.test(adviesSnippet)) {
      data.automatischAdvies = 'wel';
    } else if (/\bis er geen\b/.test(adviesSnippet) || /\bwordt geen\b/.test(adviesSnippet) || /wordt.*?geen.*?noodzakelijk/.test(adviesSnippet)) {
      data.automatischAdvies = 'geen';
    }
    console.log('[DOCX] global automatischAdvies:', data.automatischAdvies);
  }

  // ── Build per-locatie advies map ──
  // Split the fullText on the adviesMarker. Each segment between two markers
  // contains exactly one locatiecode + one advies verdict ("wel" or "geen").
  // This works because mammoth flattens DOCX tables into a single text stream
  // where each dossier block contains: ...{locatiecode}...{adviesMarker}{verdict}...
  const adviesMap = {};
  {
    const segments = fullText.split(adviesMarker);
    // segments[0] = text before first marker (may have codes but no advies yet)
    // segments[1..n] = each starts right after a marker, contains verdict + next code(s)
    for (let i = 1; i < segments.length; i++) {
      const seg = segments[i];
      const segLower = seg.slice(0, 400).toLowerCase();
      // Determine advies verdict for this segment
      let aVal = null;
      if (/\bis er wel\b/.test(segLower) || /\bwordt wel\b/.test(segLower)) aVal = 'wel';
      else if (/\bis er geen\b/.test(segLower) || /\bwordt geen\b/.test(segLower)) aVal = 'geen';
      // Find the locatiecode in the PREVIOUS segment (the one before this marker)
      const prevSeg = segments[i - 1];
      const codesInPrev = [...prevSeg.matchAll(/\b([A-Z]{2}\d{9,12})\b/g)];
      if (codesInPrev.length > 0) {
        // Use the LAST code found before this advies marker
        const code2 = codesInPrev[codesInPrev.length - 1][1];
        if (adviesMap[code2] === undefined) {
          adviesMap[code2] = aVal;
        }
      }
    }
    console.log('[DOCX] per-locatie adviesMap:', JSON.stringify(adviesMap));
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
            nextSectionIdx > -1 ? nextSectionIdx : overviewIdx + 8000
        );

        // Find each locatiecode in this block and extract the table row data after it
        for (const code of locCodes) {
            const codeIdx = overviewBlock.indexOf(code);
            if (codeIdx === -1) continue;

            // Get the lines after this code (the table cells follow as separate lines)
            const afterCode = overviewBlock.substring(codeIdx + code.length);
            const lines = afterCode.split('\n').map(l => l.trim()).filter(l => l.length > 0);

            // Table columns (each on its own line in mammoth output):
            // locatienaam, straatnaam, huisnummer (may be absent), postcode (may be absent), plaatsnaam
            // Large TOBs may have a "Deellocatie X" column before the real locatienaam — skip it.
            if (lines.length >= 1) {
                const entry = { locatienaam: '', straatnaam: '', huisnummer: '', postcode: '', plaatsnaam: '' };
                // Skip if this code was already found in an earlier overview block
                if (overviewMap[code]) { continue; }

                // Skip "Deellocatie X" section-header lines that appear as a column in large TOBs
                let lineStart = 0;
                while (lineStart < Math.min(lines.length, 3) && /^Deellocatie\s*\d*$/i.test(lines[lineStart])) {
                    lineStart++;
                }
                entry.locatienaam = lines[lineStart] || '';

                // Lines after locatienaam = straatnaam, optional huisnummer, optional postcode, plaatsnaam
                // Stop at next locatiecode
                for (let i = lineStart + 1; i < Math.min(lines.length, lineStart + 8); i++) {
                    const line = lines[i].trim();
                    if (!line) continue;
                    if (/^[A-Z]{2}\d{9,12}$/.test(line)) break; // next locatiecode
                    if (/^[1-9]\d{3}\s?[A-Za-z]{2}$/.test(line)) {
                        entry.postcode = line.replace(/\s/g, '').toUpperCase();
                    } else if (/^\d{1,5}[a-zA-Z]?$/.test(line)) {
                        entry.huisnummer = line;
                    } else if (!entry.straatnaam) {
                        // First non-code non-number non-postcode line = straatnaam
                        entry.straatnaam = line
                            .split(/\s+/)
                            .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                            .join(' ');
                    } else if (!entry.plaatsnaam && /^[A-Z]/.test(line) && !/\d/.test(line) && line.length < 40) {
                        // Capitalized word(s) with no digits = city
                        entry.plaatsnaam = line.charAt(0).toUpperCase() + line.slice(1).toLowerCase();
                    }
                }

                // Post-process: if no plaatsnaam was found but straatnaam looks like a city
                // name (no digits, short, capitalized), it was likely misclassified because
                // mammoth deduplicates identical adjacent cells (locatienaam == straatnaam).
                if (
                    !entry.plaatsnaam &&
                    !entry.postcode &&
                    !entry.huisnummer &&
                    entry.straatnaam &&
                    /^[A-Za-z][a-z\s-]*$/.test(entry.straatnaam) &&
                    entry.straatnaam.length < 40
                ) {
                    entry.plaatsnaam = entry.straatnaam;
                    entry.straatnaam = entry.locatienaam; // location name doubles as street ref
                }

                overviewMap[code] = entry;
            }
        }

        // Check for another "Overzicht bodemlocaties" (12.5m buffer section)
        overviewIdx = fullText.indexOf(overviewMarker, overviewIdx + overviewMarker.length + 100);
    }

    console.log(`📋 [DOCX] Overzicht tabel: ${Object.keys(overviewMap).length} locaties gevonden`);
    // Debug: show first 3 overview entries so we can verify column extraction
    Object.entries(overviewMap).slice(0, 3).forEach(([code, e]) => {
        console.log(`  📋 ${code} → naam="${e.locatienaam}" straat="${e.straatnaam}" nr="${e.huisnummer}" pc="${e.postcode}" stad="${e.plaatsnaam}"`);
    });

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
        const NUTS_BOUNDARY = 'Bodeminformatie in het Nuts Bodeminformatiesysteem in een straal';
        const sectionBoundaries = [
            NUTS_BOUNDARY,
            'BKK omgerekend',
            'Bijlage 1',
            'Kadastrale Gegevens',
        ];
        for (const boundary of sectionBoundaries) {
            const boundaryIdx = fullText.indexOf(boundary, sectionStart + 50);
            if (boundaryIdx > -1 && boundaryIdx < sectionEnd) sectionEnd = boundaryIdx;
        }

        // Extract straal radius from "Bodeminformatie...straal van X m" right at section boundary
        // The text looks like: "...in een straal van 25 m" or "...in een straal van 12,5 m"
        let straalRadius = null;
        const nutsIdx = fullText.indexOf(NUTS_BOUNDARY, sectionStart + 50);
        if (nutsIdx > -1 && nutsIdx <= sectionEnd + NUTS_BOUNDARY.length + 5) {
            const afterNuts = fullText.substring(nutsIdx + NUTS_BOUNDARY.length, nutsIdx + NUTS_BOUNDARY.length + 60);
            const straalMatch = afterNuts.match(/van\s+(\d+(?:[.,]\d+)?)\s*m\b/i);
            if (straalMatch) {
                straalRadius = parseFloat(straalMatch[1].replace(',', '.'));
            }
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
            straalRadius,
        };

        // Extract beoordeling verontreiniging
        // The label is on one line, the VALUE on the NEXT line.
        // Guard: reject captured value if it looks like the label of the next field
        // (happens when the beoordeling cell is blank in the document).
        const FIELD_LABEL = /^(Vervolgactie|Rapportinformatie|Locatiecode|Locatienaam|Adres|CROW|Mogelijk onderzochte|Bodembedreigende|Kadastrale|Bijlage)/i;
        const beoordelingMatch = sectionText.match(/Beoordeling verontreiniging\s*\n([^\n]+)/i);
        if (beoordelingMatch && !FIELD_LABEL.test(beoordelingMatch[1].trim())) {
            detail.beoordeling = beoordelingMatch[1].trim();
        }

        // Extract vervolgactie (Nazca follow-up) — value is on the NEXT line after the label
        const vervolgMatch = sectionText.match(/Vervolgactie i\.h\.k\.v[^\n]*\n[\s\n]*([^\n]+)/i);
        if (vervolgMatch) detail.vervolgactie = vervolgMatch[1].trim();

        // Extract adres — try multiple label formats
        const adresMatch =
            sectionText.match(/(?:^|\n)Adres\s*\n([^\n]+)/i) ||
            sectionText.match(/(?:^|\n)Adres\s*:\s*([^\n]+)/i) ||
            sectionText.match(/(?:^|\n)Locatieadres\s*\n([^\n]+)/i) ||
            sectionText.match(/(?:^|\n)Straatnaam\s*\n([^\n]+)/i);
        if (adresMatch) detail.adres = adresMatch[1].trim();

        // Extract locatienaam from detail
        const namaMatch = sectionText.match(/Locatienaam\s*\n([^\n]+)/i);

        // Extract research reports (Rapportinformatie)
        // Structure per row (each field on its own newline):
        // {datum}\n{type}\n{bureau}\n{rapportnummer}\n{grond}\n{grondwater}\n{crow_grond}\n{crow_grondwater}\n...
        const rapportIdx = sectionText.indexOf('Rapportinformatie');
        if (rapportIdx > -1) {
            const rapportBlock = sectionText.substring(rapportIdx);
            // Skip past the header labels
            const headerEnd = rapportBlock.indexOf('Opmerking');
            const dataBlock = headerEnd > -1 ? rapportBlock.substring(headerEnd + 9) : rapportBlock;
            
            // Each report starts with a date dd-mm-yyyy
            const dateRegex = /(\d{2}-\d{2}-\d{4})\n([^\n]+)\n([^\n]+)\n([^\n]+)/g;
            let rapMatch;
            while ((rapMatch = dateRegex.exec(dataBlock)) !== null) {
                const datumStr = rapMatch[1];
                const type = rapMatch[2].trim();
                const bureau = rapMatch[3].trim();
                const rapportnummer = rapMatch[4].trim();
                // Skip if these look like header labels
                if (/^(Bodemonderzoek|Rapportdatum|Onderzoeksbureau)$/i.test(type)) continue;
                // Skip if rapportnummer looks like a WBB classification (Onb., >I, >S, etc.)
                if (/^(Onb\.|>|Rood|Oranje|Groen|Blauw)/.test(rapportnummer)) continue;
                detail.rapporten.push({ datum: datumStr, type, bureau, rapportnummer });
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
    // Debug: show first 3 detail entries
    Object.entries(detailMap).slice(0, 3).forEach(([code, d]) => {
        console.log(`  🔬 ${code} → adres="${d.adres}" beoordeling="${d.beoordeling}" vervolgactie="${d.vervolgactie?.substring(0,50)}"`);
    });

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
            straalRadius: null,
            verdachteActiviteiten: 0,
            stoffen: [],
            _source: `DOCX: ${file.name}`,
            _projectCode: data.projectCode,
            automatischAdvies: adviesMap[code] ?? data.automatischAdvies ?? null,
        };

        // Enrich from detail section
        if (detail.beoordeling) {
            loc.opmerking = `Beoordeling: ${detail.beoordeling}`;
            // Map beoordeling text to conclusie:
            // "ernstig, geen spoed" | "Potentieel Ernstig" | "sterk verontreinigd" → verdacht
            // "niet ernstig, plaatselijk sterk verontreinigd" → verdacht (sterk is the dominant signal)
            // "niet ernstig, licht tot matig verontreinigd" → licht verontreinigd
            if (/potentieel\s+ernstig/i.test(detail.beoordeling)) {
                // "Potentieel Ernstig" — suspected serious, mark verdacht
                loc.conclusie = 'verdacht';
                loc.complex = true;
            } else if (/^ernstig/i.test(detail.beoordeling)) {
                // "ernstig, geen spoed" — serious contamination, verdacht
                loc.conclusie = 'verdacht';
                loc.complex = true;
            } else if (/niet\s+ernstig/i.test(detail.beoordeling)) {
                // "niet ernstig, ..." — not serious regardless of local severity
                loc.conclusie = 'licht verontreinigd';
            }
        }

        if (detail.vervolgactie) {
            loc.status = detail.vervolgactie;
            // Only mark complex for serious follow-up actions (sanering, afperkend, spoedeisend).
            // "Verkennend/nader bodemonderzoek uitvoeren" is routine — not automatically complex.
            if (/sanering|afperkend|spoedeisend/i.test(detail.vervolgactie)) loc.complex = true;
        }

        // Parse adres for straatnaam/woonplaats if not from overview
        if (detail.adres) {
            // Format: "STRAATNAAM [HUISNUMMER] PLAATSNAAM"
            // Last token that starts with uppercase letter and has no digits = city
            const adresParts = detail.adres.trim().split(/\s+/);
            if (adresParts.length >= 2) {
                const lastPart = adresParts[adresParts.length - 1];
                const isCityLike = /^[A-Z]/.test(lastPart) && !/\d/.test(lastPart);
                const city = isCityLike ? lastPart : null;
                const streetParts = city ? adresParts.slice(0, -1) : adresParts;

                // Also override if straatnaam is a "Deellocatie X" placeholder from overview
                if (!loc.straatnaam || /^Deellocatie\s*\d*$/i.test(loc.straatnaam)) {
                    loc.straatnaam = streetParts
                        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .join(' ');
                }
                if (!loc.woonplaats && city) {
                    loc.woonplaats = city.charAt(0).toUpperCase() + city.slice(1).toLowerCase();
                }
            }
        }

        // Fallback: use project-level postcode + city from header
        if (!loc.postcode && data.projectPostcode) {
            loc.postcode = data.projectPostcode;
        }
        if (!loc.woonplaats && data.projectCity) {
            loc.woonplaats = data.projectCity;
        }

        // Straal radius from Nuts section header
        if (detail.straalRadius) {
            loc.straalRadius = detail.straalRadius;
        }

        // CROW 400 veiligheidsklasse from detail
        if (detail.crow400Grond && detail.crow400Grond !== 'Onb.') {
            loc.veiligheidsklasse = detail.crow400Grond;
        }

        // Set rapport year from most recent report
        if ((detail.rapporten ?? []).length > 0) {
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

        // Fallback: context-based postcode extraction (only look within detail section, not rapport numbers)
        if (!loc.postcode) {
            const detailSection = detailMap[code] ? fullText.substring(
                fullText.search(new RegExp(`Locatiecode\\s*\\n\\s*${code}\\s*\\n`, 's')),
                fullText.search(new RegExp(`Locatiecode\\s*\\n\\s*${code}\\s*\\n`, 's')) + 800
            ) : '';
            // Match a postcode that appears near an address keyword, not embedded in a report number
            const pMatch = detailSection.match(/(?:Adres|adres|postcode)[^\n]*\n[^\n]*?([1-9]\d{3}\s?[A-Za-z]{2})\b/i);
            if (pMatch) loc.postcode = pMatch[1].replace(/\s/g, '').toUpperCase();
        }

        // Fallback: project-level RD coordinates as centroid (only if location has none)
        if (!loc.rdX && data.rdX) loc.rdX = data.rdX;
        if (!loc.rdY && data.rdY) loc.rdY = data.rdY;

        data.locatiecodes.push(loc);
    }

    // Debug summary: how many locations have usable addresses
    const withStraat = data.locatiecodes.filter(l => l.straatnaam).length;
    const withCoords = data.locatiecodes.filter(l => l.rdX || l.lat).length;
    console.log(`✅ [DOCX] Merge klaar: ${data.locatiecodes.length} locaties, ${withStraat} met straatnaam, ${withCoords} met coördinaten`);
    if (withStraat < data.locatiecodes.length) {
        const missing = data.locatiecodes.filter(l => !l.straatnaam).slice(0, 3);
        console.warn(`⚠️ [DOCX] Locaties zonder straatnaam (eerste 3):`, missing.map(l => `${l.locatiecode} naam="${l.locatienaam}"`));
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
    // Priority: 1) sleuf dimensions, 2) text patterns, 3) Tracétekening section, 4) OCR on images
    try {
        // Source 1: Sleuf dimensions (most reliable from structured fields)
        const sleufLengte = data.sleuflengte ? parseFloat(data.sleuflengte.replace(',', '.')) : null;
        const sleufBreedte = data.sleufbreedte ? parseFloat(data.sleufbreedte.replace(',', '.')) : null;
        const sleufDiepte = data.sleufdiepte ? parseFloat(data.sleufdiepte.replace(',', '.')) : null;

        // Source 2: Ontgravingsvolume
        const volumeMatch = fullText.match(/Ontgravingsvolume.*?(\d+[.,]?\d*)\s*m[³3]?/i);
        const volume = volumeMatch ? parseFloat(volumeMatch[1].replace(',', '.')) : null;

        // Source 3: Broader text search for distance patterns
        const distPatterns = [
            /(?:lengte|afstand|trace|tracé)\s*(?:van|:)?\s*(?:ca\.?\s*)?(\d+[.,]?\d*)\s*(?:km|m(?:eter)?)\b/i,
            /(\d+[.,]?\d*)\s*(?:km|m(?:eter)?)\s*(?:sleuf|tracé|leiding|kabel)/i,
            /(?:ca\.?\s*)?(\d{2,})\s*(?:meter|m)\b/i, // "500 meter" or "250m"
        ];

        let textDistance = null;
        let textUnit = 'm';
        for (const pat of distPatterns) {
            const m = fullText.match(pat);
            if (m) {
                textDistance = parseFloat(m[1].replace(',', '.'));
                textUnit = m[0].toLowerCase().includes('km') ? 'km' : 'm';
                break;
            }
        }

        // Build the trace object with best available data
        const traceDistance = sleufLengte || textDistance || (volume && sleufBreedte && sleufDiepte
            ? volume / (sleufBreedte * sleufDiepte) // Calculate length from volume
            : null);

        const traceDescription = data.omschrijving
            || `Tracé project ${data.projectCode || ''}`.trim();

        // Calculate buffer radius for map (trace length + 12.5m buffer on each side)
        const bufferRadius = traceDistance
            ? Math.max(traceDistance * 1.5, 50) // At least 50m buffer
            : 500; // Default

        data.projectTrace = {
            distance: traceDistance,
            unit: textUnit,
            description: traceDescription,
            buffer: bufferRadius,
            sleuf: sleufLengte ? {
                lengte: sleufLengte,
                breedte: sleufBreedte,
                diepte: sleufDiepte,
                volume,
            } : null,
        };

        // Source 4: Try Tracétekening section for route description
        const traceSection = fullText.match(/Tracé(?:tekening)?(.{0,2000}?)(?:Aanleiding|Locatiegegevens|Inleiding)/is);
        if (traceSection) {
            const routeMatch = traceSection[1].match(/(?:van|from|route|tracé|leiding)\s+(.+?)\s+(?:naar|to|tot)\s+(.+?)(?:\.|,|$)/i);
            if (routeMatch) {
                data.projectTrace.description = `Van ${routeMatch[1].trim()} naar ${routeMatch[2].trim()}`;
            }
        }

        console.log('✅ [DOCX] Found projectTrace:', data.projectTrace);
    } catch (err) {
        console.warn('⚠️ [DOCX] Error extracting trace:', err);
    }

    // ── Attempt OCR on embedded images for additional trace info ──
    // All TOB documents have trace images, so try OCR unless we have complete trace info
    const skipOcr = (data.projectTrace && data.projectTrace.distance && data.projectTrace.description
                     && !data.projectTrace.description.includes('Tracé project'));

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
    } else {
        console.log('ℹ️ [DOCX] Skipping OCR (trace already found)');
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
            ...dynamicFields,
            automatischAdvies: loc.automatischAdvies ?? docxData.automatischAdvies ?? null,
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
        automatischAdvies: docxData.automatischAdvies ?? null,
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
