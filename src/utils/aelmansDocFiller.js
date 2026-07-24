/**
 * Aelmans docx template filler — pure text-based replacement.
 *
 * Targets known placeholder strings directly in the Word XML.
 * Works on any template version regardless of whether Word comments are present.
 *
 * Placeholder → replacement:
 *  "M. Buss"                                  → "Dhr. R.D.T. Houben" (all occurrences)
 *  "naam"                                     → "Dhr. R.D.T. Houben" (collegiale toets)
 *  "100 meter"                                → sleuflengte
 *  " xxx meter" / "xxx "                      → sleuflengte (paragraph / table cell)
 *  "0,80 m-mv"                                → ontgravingsdiepte
 *  "&lt;25 m³ / &gt;25 m³"                   → correct side
 *  "Circa 1,0 m-mv"                           → grondwaterstand
 *  "Ja / nee / ter plaatse beoordelen"        → bemaling
 *  "Gemeente" (standalone)                    → gemeente (bevoegd gezag cell)
 *  "x" (standalone)                           → aantalBoringen
 *  "0,0 - 1,0" (3-run split)                 → boring depth range
 *  "1" (mengmonsters cell)                    → aantalMengmonsters
 *  "Synfra/BDOK" / "Synfra/BDOK."            → uitvoerder
 *  "G" + "emeente naam."                      → gemeente (split run, §1.3)
 *  "(jaartal)"                                → current year (BKK text)
 *  "van gemeente" in BKK sentence             → gemeente name
 *  "Landbouw/Natuur"                          → bodemtype
 *  "(benoemen, datum)"                        → pfasBkk
 *  "XXX" (in "circa XXX m +NAP")             → grondwaterstand
 *  Revision table                             → remove; keep "Niet van toepassing."
 *  Yellow/cyan GWO paragraph                 → remove inapplicable version
 *  AMV261626.001                              → amvNummer
 *  "(tekening invoegen opdrachtgever)"        → always removed (Bijlage 1)
 *  "gemeente" (lowercase, Bijlage 3 title)   → gemeente name if bodemrapportage
 *  Bijlage 3 section                         → removed when no bodemrapportage
 *  "Gemeente naam." in §1.3                  → gemeente if bodemrapportage, else remove
 */
import JSZip from 'jszip';

function xmlEsc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/** Replace every <w:t>EXACT TEXT</w:t> occurrence (handles any w:t attributes) */
function repT(xml, exact, replacement) {
    return xml.replace(
        new RegExp(`(<w:t[^>]*>)${exact}(<\\/w:t>)`, 'g'),
        `$1${replacement}$2`
    );
}

/** Build the <w:drawing> inline image XML for embedding in a paragraph */
function inlineDrawingXml(rId, cxEmu, cyEmu, id = 99, name = 'Tekening') {
    return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cxEmu}" cy="${cyEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cxEmu}" cy="${cyEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

export async function fillAelmansTemplate(templateFile, values) {
    const arrayBuffer = await templateFile.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    let xml = await zip.file('word/document.xml').async('string');

    // Helper: remove the paragraph containing a text marker (first match)
    const removeParaContaining = (marker) => {
        const idx = xml.indexOf(marker);
        if (idx === -1) return;
        const p1 = xml.lastIndexOf('<w:p>', idx);
        const p2 = xml.lastIndexOf('<w:p ', idx);
        const pStart = Math.max(p1, p2);
        const pEnd   = xml.indexOf('</w:p>', idx);
        if (pStart !== -1 && pEnd !== -1) {
            xml = xml.slice(0, pStart) + xml.slice(pEnd + '</w:p>'.length);
        }
    };

    const {
        sleuflengte = '',
        ontgravingsdiepte = '',
        isGroterDan25m3 = null,
        grondwaterstand = '',
        bemaling = '',
        gemeente = '',
        uitvoerder = '',
        amvNummer = '',
        bodemtype = '',
        pfasBkk = '',
        hasBodemrapportage = false,
        jaar = new Date().getFullYear(),
        tekening = null,
        topoImages = null,
    } = values;

    const nl = (s) => String(s).replace('.', ',');
    const sleufNL   = sleuflengte       ? nl(sleuflengte)       : '';
    const diepteNL  = ontgravingsdiepte ? nl(ontgravingsdiepte) : '';
    const gwsNL     = grondwaterstand   ? nl(grondwaterstand)   : '';

    const boringDiepte = ontgravingsdiepte
        ? nl((parseFloat(ontgravingsdiepte) + 0.2).toFixed(1))
        : '1,0';

    const lenF = parseFloat(sleuflengte);
    const aantalBoringen = !isNaN(lenF)
        ? (lenF < 5 ? '1' : lenF <= 75 ? '2' : String(Math.max(3, Math.ceil(lenF / 50))))
        : '';
    // Minimum 2 mengmonsters; 1 per 7 boringen
    const boringenInt = parseInt(aantalBoringen) || 2;
    const aantalMengmonsters = String(Math.max(2, Math.ceil(boringenInt / 7)));

    // ── Contactpersoon (always Dhr. R.D.T. Houben) ────────────────────────
    xml = repT(xml, 'M\\. Buss', 'Dhr. R.D.T. Houben');
    xml = repT(xml, 'naam',      'Dhr. R.D.T. Houben');

    // ── Sleuflengte ────────────────────────────────────────────────────────
    if (sleufNL) {
        xml = repT(xml, '100 meter',   `${sleufNL} meter`);
        xml = repT(xml, ' xxx meter',  ` ${sleufNL} meter`); // body paragraph (leading space)
        xml = repT(xml, 'xxx ',        `${sleufNL} `);        // table cell (trailing space)
    }

    // ── Ontgravingsdiepte ─────────────────────────────────────────────────
    if (diepteNL) xml = repT(xml, '0,80 m-mv', `${diepteNL} m-mv`);

    // ── >25 m³ ────────────────────────────────────────────────────────────
    if (isGroterDan25m3 !== null) {
        const target = isGroterDan25m3 ? '&gt;25 m³' : '&lt;25 m³';
        xml = xml.replace(/<w:t([^>]*)>&lt;25 m³ \/ &gt;25 m³<\/w:t>/g, `<w:t$1>${target}</w:t>`);
    }

    // ── Grondwaterstand ───────────────────────────────────────────────────
    // §2.1 "circa XXX meter lang" — first standalone XXX run → sleuflengte
    if (sleufNL) {
        xml = xml.replace(/<w:t([^>]*)>XXX<\/w:t>/, `<w:t$1>${xmlEsc(sleufNL)}</w:t>`);
    }

    if (gwsNL) {
        xml = repT(xml, 'Circa 1,0 m-mv', `Circa ${gwsNL} m-mv`);
        // §2.9 "circa XXX m +NAP" — remaining XXX runs → grondwaterstand
        xml = xml.replace(/<w:t([^>]*)>XXX<\/w:t>/g, `<w:t$1>${xmlEsc(gwsNL)}</w:t>`);
        // §2.9 GWS sentence: placeholder space (wrapped in commentRange 80) → GWS value
        // Template: "bevindt zich [comment80 space] op meer dan 0,25 m-mv"
        // Result:   "bevindt zich op [GWS] m-mv, dit is op meer/minder dan 0,25 m-mv"
        xml = xml.replace(
            /(<w:commentRangeStart w:id="80"\/>[\s\S]{0,150}?<w:t[^>]*>) (<\/w:t>)/s,
            `$1op ${xmlEsc(gwsNL)} m-mv, dit is $2`
        );
        // If GWS is within 0.25m of excavation → change "meer" to "minder"
        const gws29  = parseFloat(grondwaterstand);
        const diep29 = parseFloat(ontgravingsdiepte);
        if (!isNaN(gws29) && !isNaN(diep29) && gws29 - diep29 <= 0.25) {
            xml = xml.replace(
                /(bevindt\s+zich[\s\S]{0,400}?>)op meer (<\/w:t>)/s,
                '$1op minder $2'
            );
        }
    }

    // ── Bemaling ──────────────────────────────────────────────────────────
    if (bemaling) xml = repT(xml, 'Ja / nee / ter plaatse beoordelen', xmlEsc(bemaling));

    // ── Gemeente ──────────────────────────────────────────────────────────
    if (gemeente) {
        // Normalize: strip leading "Gemeente " if already present in the value
        // (AelmansForm auto-prefixes it, manual entry may or may not include it)
        const gemeenteCity  = gemeente.replace(/^Gemeente\s+/i, '').trim();
        const gemeenteLabel = `Gemeente ${xmlEsc(gemeenteCity)}`;

        // Step 1: normalize 3-run split "emeente " | "naam[.]" → "emeente naam[.]"
        // (Word sometimes splits "Gemeente naam." as G | emeente  | naam.)
        // After this step, the 2-run patterns below handle the rest.
        xml = xml.replace(
            /(<w:t[^>]*>)emeente (<\/w:t>)([\s\S]{0,300}?)(<w:t[^>]*>)naam(\.|)(<\/w:t>)/gs,
            (_, t1, c1, mid, t2, dot, c2) => `${t1}emeente naam${dot}${c1}${mid}${t2}${c2}`
        );

        // Single run: "Gemeente naam[.]"
        xml = xml.replace(
            /<w:t([^>]*)>Gemeente naam(\.|)<\/w:t>/g,
            (_, attrs, dot) => `<w:t${attrs}>${gemeenteLabel}${dot}</w:t>`
        );
        // 2-run split: "G" | "emeente naam[.]"
        xml = xml.replace(
            /(<w:t[^>]*>)G(<\/w:t>)([\s\S]{0,400}?)(<w:t[^>]*>)emeente naam(\.|)(<\/w:t>)/gs,
            (_, t1, c1, mid, t2, dot, c2) => `${t1}${gemeenteLabel}${dot}${c1}${mid}${t2}${c2}`
        );
        // 2-run split: "Gemeente " | "naam[.]"
        xml = xml.replace(
            /(<w:t[^>]*>)Gemeente (<\/w:t>)([\s\S]{0,400}?)(<w:t[^>]*>)naam(\.|)(<\/w:t>)/gs,
            (_, t1, c1, mid, t2, dot, c2) => `${t1}${gemeenteLabel}${dot}${c1}${mid}${t2}${c2}`
        );
        // Cleanup leftover "emeente naam" or "emeente " runs
        xml = xml.replace(/<w:t([^>]*)>emeente(?: naam)?\.?<\/w:t>/g, '<w:t$1></w:t>');

        // Bevoegd gezag cell: standalone "Gemeente" → full label
        xml = repT(xml, 'Gemeente', gemeenteLabel);

        // BKK sentence: "(jaartal) van gemeente" → year + city name
        xml = xml.replace(
            /\(jaartal\) van gemeente/g,
            `(${jaar}) van ${xmlEsc(gemeenteCity)}`
        );

        // Bijlage 3 title: "gemeente" (lowercase) → "gemeente <city>"
        if (hasBodemrapportage) {
            xml = repT(xml, 'gemeente', `gemeente ${xmlEsc(gemeenteCity)}`);
        }
    }

    // ── Bijlage 3: remove entirely when no bodemrapportage ─────────────────
    if (!hasBodemrapportage) {
        // Remove TOC entry paragraph (first occurrence of "Bijlage 3")
        removeParaContaining('Bijlage 3');
        // Remove actual Bijlage 3 section (heading + Bodeminformatie content)
        const b3Idx = xml.indexOf('Bijlage 3');
        const b4Idx = xml.indexOf('Bijlage 4');
        if (b3Idx !== -1 && b4Idx !== -1) {
            const bp1 = xml.lastIndexOf('<w:p>', b3Idx);
            const bp2 = xml.lastIndexOf('<w:p ', b3Idx);
            const bPStart = Math.max(bp1, bp2);
            const bPEnd   = xml.lastIndexOf('</w:p>', b4Idx);
            if (bPStart !== -1 && bPEnd !== -1) {
                xml = xml.slice(0, bPStart) + xml.slice(bPEnd + '</w:p>'.length);
            }
        }
    }

    // ── Aantal boringen ───────────────────────────────────────────────────
    if (aantalBoringen) xml = repT(xml, 'x', aantalBoringen);

    // ── Boring depth range "0,0 - 1,0" (3-run split) ─────────────────────
    // The template has three runs: "0,0 " | "-" | " 1,0"  — replace only the last
    xml = xml.replace(
        /(<w:t[^>]*>0,0 <\/w:t>[\s\S]*?<w:t[^>]*>-<\/w:t>[\s\S]*?<w:t[^>]*>) 1,0(<\/w:t>)/s,
        `$1 ${boringDiepte}$2`
    );

    // ── Mengmonsters ─────────────────────────────────────────────────────
    // Template cell contains exactly "1" — replace only in the specific cell context
    // Use a targeted regex to avoid clobbering unrelated "1" values
    if (aantalMengmonsters) {
        xml = xml.replace(
            /(<w:t[^>]*>)1(<\/w:t>[\s\S]{0,200}?mengmonster)/s,
            `$1${aantalMengmonsters}$2`
        );
    }

    // ── Uitvoerder ────────────────────────────────────────────────────────
    // Replace "Synfra/BDOK" with just the selected name everywhere it appears
    // (§1.3 list, Bijlage 2 heading, inhoudsopgave, etc.).
    // Word sometimes splits "Synfra/BDOK" across consecutive w:r runs, e.g.:
    //   <w:t>Rapportage Synfra/</w:t> | <w:t>B</w:t> | <w:t>DOK</w:t>
    // Handle single-run, 2-run, and 3-run split cases.
    if (uitvoerder && uitvoerder !== 'Synfra/BDOK') {
        // Case 1: complete in one w:t
        xml = xml.replace(
            /(<w:t[^>]*>[^<]*)Synfra\/BDOK([^<]*<\/w:t>)/g,
            `$1${xmlEsc(uitvoerder)}$2`
        );
        // Case 2: "...Synfra/" ends run 1, "BDOK..." starts run 2
        xml = xml.replace(
            /(<w:t[^>]*>)([^<]*)Synfra\/(<\/w:t>)([\s\S]{0,600}?)(<w:t[^>]*>)BDOK([^<]*)(<\/w:t>)/gs,
            (_, t1, pre, c1, mid, t2, suf, c2) =>
                `${t1}${pre}${xmlEsc(uitvoerder)}${suf}${c1}${mid}${t2}${c2}`
        );
        // Case 3: 3-run split — "...Synfra/" | partial-BDOK (B/BD/BDO) | rest-of-BDOK (DOK/OK/K)...
        xml = xml.replace(
            /(<w:t[^>]*>)([^<]*)Synfra\/(<\/w:t>)([\s\S]{0,600}?)(<w:t[^>]*>)(B(?:D(?:O)?)?)(<\/w:t>)([\s\S]{0,600}?)(<w:t[^>]*>)(DOK|OK|K)([^<]*)(<\/w:t>)/gs,
            (full, t1, pre, c1, mid1, t2, p1, c2, mid2, t3, p2, suf, c3) =>
                p1 + p2 === 'BDOK'
                    ? `${t1}${pre}${xmlEsc(uitvoerder)}${suf}${c1}${mid1}${t2}${c2}${mid2}${t3}${c3}`
                    : full
        );
    }

    // ── Bodemtype / BKK class ─────────────────────────────────────────────
    if (bodemtype) xml = xml.split('Landbouw/Natuur').join(xmlEsc(bodemtype));

    // ── PFAS BKK reference ────────────────────────────────────────────────
    if (pfasBkk) xml = xml.split('(benoemen, datum)').join(`(${xmlEsc(pfasBkk)})`);

    // ── AMV project number ────────────────────────────────────────────────
    if (amvNummer) xml = xml.split('AMV261626.001').join(amvNummer);

    // ── Revision table: remove; keep only "Niet van toepassing." ──────────
    // Simplify the instruction text first
    xml = xml.split(
        'Niet van toepassing OF Onderhavige revisie vervangt integraal voorgaande rapportversies. '
    ).join('Niet van toepassing.');
    // Remove the revision table, identified by its unique "Revisie/versie" header cell
    {
        const rtIdx = xml.indexOf('Revisie/versie');
        if (rtIdx !== -1) {
            // Use Math.max so we match <w:tbl> (no attrs) or <w:tbl ...> (with attrs)
            // but NOT <w:tblPr>, <w:tblGrid> etc. which also start with '<w:tbl'
            const t1 = xml.lastIndexOf('<w:tbl>', rtIdx);
            const t2 = xml.lastIndexOf('<w:tbl ', rtIdx);
            const tblStart = Math.max(t1, t2);
            const tblEnd   = xml.indexOf('</w:tbl>', rtIdx);
            if (tblStart !== -1 && tblEnd !== -1) {
                xml = xml.slice(0, tblStart) + xml.slice(tblEnd + '</w:tbl>'.length);
            }
        }
    }

    // ── §2.9 sentence removal ─────────────────────────────────────────────────
    // Remove "De regionale grondwaterstromingsrichting..." (its own paragraph)
    removeParaContaining('regionale grondwaterstromings');
    // Remove "De locatie is gelegen in het bodembeschermingsgebied 'Mergelland'." from
    // within the next paragraph (which also contains sentences we want to keep).
    // The sentence spans 3 runs; capture the 3rd run's opening tags to preserve the rest.
    xml = xml.replace(
        /<w:r[^>]*><w:t[^>]*>De locatie is gelegen in het bodembeschermingsgebied "<\/w:t><\/w:r><w:r[^>]*>(?:<w:rPr>[\s\S]*?<\/w:rPr>)?<w:t[^>]*>Mergelland<\/w:t><\/w:r>(<w:r[^>]*><w:t[^>]*>)"\. /s,
        '$1'
    );

    // ── Remove yellow highlighting (template placeholder highlighting) ─────────
    xml = xml.replace(/<w:highlight w:val="yellow"\/>/g, '');

    // "(tekening invoegen opdrachtgever)" placeholder is handled in the tekening block below.

    // ── Conditional grondwateronderzoek paragraph ─────────────────────────
    // Yellow paragraph = depth argument (GWS > 0.25m below excavation)
    // Cyan paragraph   = work-type argument (cable work, no groundwater contact)
    // Remove whichever doesn't apply.
    {
        const gws83  = parseFloat(grondwaterstand);
        const diep83 = parseFloat(ontgravingsdiepte);
        if (!isNaN(gws83) && !isNaN(diep83)) {
            if (gws83 - diep83 > 0.25) {
                // GWS deep enough → yellow depth-argument applies → remove cyan paragraph
                removeParaContaining('Omdat er geen werkzaamheden');
            } else {
                // GWS shallow → cyan work-type argument applies → remove yellow paragraph
                removeParaContaining('Grondwateronderzoek dient');
            }
        }
    }

    // ── §2.2 Topotijdreis: insert map images into plaatje cells ──────────────
    // Finds the table containing any "Topotijdreis" text, then replaces the first
    // three empty paragraphs with pStyle "plaatje" (regardless of which row they're in).
    console.log('[topo] topoImages:', topoImages ? topoImages.map(b => b?.size) : null);
    if (topoImages && topoImages.length === 3) {
        const topoMatch = /<w:t[^>]*>Topotijdreis[^<]*<\/w:t>/.exec(xml);
        const topoTextIdx = topoMatch ? topoMatch.index : -1;
        console.log('[topo] "Topotijdreis" text found at index:', topoTextIdx);
        if (topoTextIdx !== -1) {
            const tblStart = Math.max(
                xml.lastIndexOf('<w:tbl>', topoTextIdx),
                xml.lastIndexOf('<w:tbl ', topoTextIdx)
            );
            const tblEnd = xml.indexOf('</w:tbl>', tblStart) + '</w:tbl>'.length;
            let tblXml = xml.slice(tblStart, tblEnd);
            const plaatjeCount = (tblXml.match(/<w:pStyle w:val="plaatje"\/>/g) || []).length;
            console.log('[topo] table span:', tblStart, '-', tblEnd, '| "plaatje" paragraphs found:', plaatjeCount);
            const stylesInTable = [...tblXml.matchAll(/<w:pStyle w:val="([^"]+)"\/>/g)].map(m => m[1]);
            console.log('[topo] all paragraph styles in table:', JSON.stringify(stylesInTable));
            console.log('[topo] raw table xml:', tblXml);

            // Ensure PNG content type is registered
            let ct = await zip.file('[Content_Types].xml').async('string');
            if (!ct.includes('image/png')) {
                ct = ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
                zip.file('[Content_Types].xml', ct);
            }

            let rels = await zip.file('word/_rels/document.xml.rels').async('string');
            const cxEmu = 1_700_000; // ≈ 6 cm, fits three columns
            const cyEmu = 1_700_000;

            for (let i = 0; i < 3; i++) {
                const rId     = `rIdTP${i + 1}`;
                const drId    = 101 + i;
                const imgName = `Topo${i + 1}`;
                const imgFile = `word/media/topo_${i + 1}.png`;

                zip.file(imgFile, await topoImages[i].arrayBuffer());
                rels = rels.replace(
                    '</Relationships>',
                    `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/topo_${i + 1}.png"/></Relationships>`
                );

                // Replace the first empty plaatje paragraph in the table.
                // After each replacement the paragraph gains a drawing element (≫ 300 chars),
                // so the next iteration naturally picks the next empty one.
                const drawing = inlineDrawingXml(rId, cxEmu, cyEmu, drId, imgName);
                const before = tblXml;
                tblXml = tblXml.replace(
                    /(<w:pStyle w:val="plaatje"\/>[\s\S]{0,300}?<\/w:pPr>)\s*<\/w:p>/s,
                    '$1<w:r>' + drawing + '</w:r></w:p>'
                );
                console.log(`[topo] image ${i + 1} inserted:`, tblXml !== before);
            }

            zip.file('word/_rels/document.xml.rels', rels);
            xml = xml.slice(0, tblStart) + tblXml + xml.slice(tblEnd);
        }
    }

    // ── Tekening (Bijlage 1) ──────────────────────────────────────────────
    // Insert the JPEG image as a new paragraph directly after the "Bijlage 1" heading.
    if (tekening) {
        const tekeningRId = 'rIdTekening';
        const imgArrayBuffer = await tekening.blob.arrayBuffer();
        const maxCx = 5_760_000; // 160mm in EMU
        const cxEmu = maxCx;
        const cyEmu = Math.round(maxCx * (tekening.heightPx / tekening.widthPx));

        console.log('[tekening] blob size:', imgArrayBuffer.byteLength, 'dims:', tekening.widthPx, 'x', tekening.heightPx, 'cxEmu:', cxEmu, 'cyEmu:', cyEmu);

        zip.file('word/media/tekening.jpg', imgArrayBuffer);

        // Register a PartName override for this specific file — more reliable than
        // checking Default extensions, because the template may already have image/jpeg
        // registered only for other files via Override entries.
        let ct = await zip.file('[Content_Types].xml').async('string');
        if (!ct.includes('/word/media/tekening.jpg')) {
            ct = ct.replace('</Types>', '<Override PartName="/word/media/tekening.jpg" ContentType="image/jpeg"/></Types>');
            zip.file('[Content_Types].xml', ct);
        }
        console.log('[tekening] [Content_Types] has tekening.jpg:', ct.includes('/word/media/tekening.jpg'));

        let rels = await zip.file('word/_rels/document.xml.rels').async('string');
        if (!rels.includes(tekeningRId)) {
            rels = rels.replace(
                '</Relationships>',
                `<Relationship Id="${tekeningRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/tekening.jpg"/></Relationships>`
            );
            zip.file('word/_rels/document.xml.rels', rels);
        }
        console.log('[tekening] rels has rIdTekening:', rels.includes(tekeningRId));

        // Use a high unique drawing ID to avoid collisions with existing template drawings
        const drawing = `<w:p><w:r>${inlineDrawingXml(tekeningRId, cxEmu, cyEmu, 9901, 'Tekening')}</w:r></w:p>`;

        // Find the actual "Bijlage 1" heading in the document body (not the TOC entry).
        // The heading uses auto-numbering so the raw XML contains only "Bijlage" without " 1".
        // All appendix headings (Bijlage 1, 2, 3, 4...) share the same paragraph style
        // named "Bijlage", so lastIndexOf('Bijlage') would grab the LAST appendix heading
        // instead of the first. The TOC entries use a different style, so the first
        // occurrence of this style declaration is reliably the Bijlage 1 heading.
        const b1Idx = xml.indexOf('w:pStyle w:val="Bijlage"');
        console.log('[tekening] indexOf(pStyle="Bijlage"):', b1Idx);
        if (b1Idx !== -1) console.log('[tekening] context:', xml.slice(Math.max(0, b1Idx - 150), b1Idx + 150));

        if (b1Idx !== -1) {
            const pEnd = xml.indexOf('</w:p>', b1Idx) + '</w:p>'.length;
            console.log('[tekening] pEnd:', pEnd, '(threshold:', '</w:p>'.length, ')');
            if (pEnd > '</w:p>'.length) {
                xml = xml.slice(0, pEnd) + drawing + xml.slice(pEnd);
                console.log('[tekening] drawing inserted after Bijlage 1 heading');
            }
        } else {
            console.warn('[tekening] "Bijlage 1" not found in document XML');
        }

        // Also remove placeholder paragraph if present (keep document clean)
        removeParaContaining('tekening invoegen opdrachtgever');
    } else {
        removeParaContaining('tekening invoegen opdrachtgever');
    }

    zip.file('word/document.xml', xml);
    return zip.generateAsync({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
