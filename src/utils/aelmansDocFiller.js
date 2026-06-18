/**
 * Aelmans docx template filler
 *
 * Uses comment ID ranges for precise replacement — each placeholder is annotated
 * with a Word comment that maps to a specific data source.
 *
 * Comment → placeholder → source:
 *  13/24  "M. Buss"                           → contactpersoon (form)
 *  15     "naam"                              → contactpersoon (form)
 *  25     "100 meter"                         → sleuflengte (BDOK cover)
 *  26     "0,80 m-mv"                         → ontgravingsdiepte (BDOK cover)
 *  27     "&lt;25 m³ / &gt;25 m³"            → isGroterDan25m3 (BDOK cover)
 *  28     "Circa 1,0 m-mv"                    → grondwaterstand (BDOK §2.1)
 *  29     "Ja / nee / ter plaatse beoordelen" → bemaling (calculated)
 *  31     "Gemeente"                          → gemeente (form)
 *  33     "xxx " (trailing space)             → sleuflengte (BDOK cover)
 *  34     "x"                                 → aantalBoringen (calculated)
 *  35     "0,0 - 1,0" (3 runs)               → boring depth range (calculated)
 *  36     "1"                                 → aantalMengmonsters (calculated)
 *  37/90  "Synfra/BDOK"                       → uitvoerder (form)
 *  38     "gemeente"                          → gemeente lowercase (form)
 *  54     "G"+"emeente naam."                 → gemeente (form)
 *  55     "Synfra/BDOK."                      → uitvoerder (form, with dot)
 *  58     "XXX" in tracé paragraph            → sleuflengte (BDOK cover)
 *  70     "bodemfunctieklassenkaart (jaartal) van gemeente" → gemeente + year
 *  74     "(benoemen, datum)"                 → pfasBkk (form, optional)
 *  79     "XXX" in grondwater paragraph       → grondwaterstand (BDOK §2.1)
 *  39     revision table                      → remove, keep "Niet van toepassing."
 */
import JSZip from 'jszip';

/**
 * Replace all <w:t> text content within a comment's annotated range
 * @param {string} xml - full document XML
 * @param {number} commentId
 * @param {string} newText - replacement text (plain, will be XML-escaped if needed)
 * @returns {string} modified XML
 */
function replaceInCommentRange(xml, commentId, newText) {
    const start = `<w:commentRangeStart w:id="${commentId}"/>`;
    const end = `<w:commentRangeEnd w:id="${commentId}"/>`;
    const startIdx = xml.indexOf(start);
    const endIdx = xml.indexOf(end);
    if (startIdx === -1 || endIdx === -1) return xml;

    const before = xml.slice(0, startIdx + start.length);
    const region = xml.slice(startIdx + start.length, endIdx);
    const after = xml.slice(endIdx);

    const runs = [...region.matchAll(/<w:t([^>]*)>([^<]*)<\/w:t>/g)];
    if (runs.length === 0) return xml;

    if (runs.length === 1) {
        const newRegion = region.replace(/<w:t([^>]*)>[^<]*<\/w:t>/, `<w:t$1>${xmlEsc(newText)}</w:t>`);
        return before + newRegion + after;
    }

    // Multiple runs: replace first with newText, clear content-bearing subsequent runs
    // (whitespace-only runs are left unchanged to preserve spacing)
    let first = true;
    const newRegion = region.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (match, attrs, text) => {
        if (first) {
            first = false;
            return `<w:t${attrs}>${xmlEsc(newText)}</w:t>`;
        }
        if (!text.trim()) return match; // preserve whitespace-only spacing runs
        return `<w:t${attrs}><\/w:t>`;
    });
    return before + newRegion + after;
}

function xmlEsc(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Fill the template docx with values from BDOK + form
 * @param {File} templateFile
 * @param {Object} values
 */
/** Build the <w:drawing> inline image XML for a given relationship ID and EMU dimensions */
function inlineDrawingXml(rId, cxEmu, cyEmu) {
    return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cxEmu}" cy="${cyEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="99" name="Tekening"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="99" name="Tekening"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cxEmu}" cy="${cyEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

export async function fillAelmansTemplate(templateFile, values) {
    const arrayBuffer = await templateFile.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    let xml = await zip.file('word/document.xml').async('string');

    const {
        straatnaam = '',
        huisnummer = '',
        plaatsnaam = '',
        gemeente = '',
        sleuflengte = '',       // numeric string, e.g. "100"
        ontgravingsdiepte = '', // numeric string, e.g. "0.80"
        isGroterDan25m3 = null,
        grondwaterstand = '',   // numeric string, e.g. "1.0"
        bemaling = '',
        contactpersoon = '',
        uitvoerder = '',
        amvNummer = '',
        bodemtype = '',         // e.g. "Landbouw/Natuur"
        pfasBkk = '',           // PFAS BKK reference "(naam, datum)"
        jaar = new Date().getFullYear(),
        tekening = null,        // { blob, widthPx, heightPx } or null
    } = values;

    // Dutch-format numbers (dot→comma)
    const nl = (s) => String(s).replace('.', ',');
    const sleufNL = sleuflengte ? nl(sleuflengte) : '';
    const diepteNL = ontgravingsdiepte ? nl(ontgravingsdiepte) : '';
    const gwsNL = grondwaterstand ? nl(grondwaterstand) : '';

    // Calculated boring depth (ontgravingsdiepte + 0.2)
    const boringDiepte = ontgravingsdiepte
        ? nl((parseFloat(ontgravingsdiepte) + 0.2).toFixed(1))
        : '1,0';

    // Number of borings: <5m→1, 5-75m→2, >75m→ceil(len/50)
    const len = parseFloat(sleuflengte);
    const aantalBoringen = !isNaN(len)
        ? (len < 5 ? '1' : len <= 75 ? '2' : String(Math.ceil(len / 50)))
        : '';

    // Number of mengmonsters: min 2 (boven+onder); more for long tracés
    const aantalMengmonsters = !isNaN(len)
        ? String(Math.max(2, Math.ceil(len / 50) * 2))
        : '2';

    // ── Comment-range targeted replacements ──────────────────────────────

    // Comments 13 and 24: "M. Buss" → contactpersoon (opsteller rows)
    if (contactpersoon) {
        xml = replaceInCommentRange(xml, 13, contactpersoon);
        xml = replaceInCommentRange(xml, 24, contactpersoon);
    }

    // Comment 15: "naam" → contactpersoon (signature row)
    if (contactpersoon) xml = replaceInCommentRange(xml, 15, contactpersoon);

    // Comment 25: "100 meter" → sleuflengte
    if (sleufNL) xml = replaceInCommentRange(xml, 25, `${sleufNL} meter`);

    // Comment 26: "0,80 m-mv" → ontgravingsdiepte
    if (diepteNL) xml = replaceInCommentRange(xml, 26, `${diepteNL} m-mv`);

    // Comment 27: "<25 m³ / >25 m³" → pick correct side
    if (isGroterDan25m3 !== null) {
        const correct = isGroterDan25m3 ? '&gt;25 m³' : '&lt;25 m³';
        // This text is XML-escaped in the source, so replace at XML level
        xml = xml.replace(
            /(<w:commentRangeStart w:id="27"\/>.*?)<w:t[^>]*>&lt;25 m³ \/ &gt;25 m³<\/w:t>(.*?<w:commentRangeEnd w:id="27"\/>)/s,
            `$1<w:t>${correct}</w:t>$2`
        );
    }

    // Comment 28: "Circa 1,0 m-mv" → grondwaterstand
    if (gwsNL) xml = replaceInCommentRange(xml, 28, `Circa ${gwsNL} m-mv`);

    // Comment 29: "Ja / nee / ter plaatse beoordelen" → bemaling
    if (bemaling) xml = replaceInCommentRange(xml, 29, bemaling);

    // Comment 31: "Gemeente" → gemeente
    if (gemeente) xml = replaceInCommentRange(xml, 31, gemeente);

    // Comment 33: "xxx " (tracé table cell, trailing space) → sleuflengte
    if (sleufNL) xml = replaceInCommentRange(xml, 33, `${sleufNL} `);

    // Comment 34: "x" → aantal boringen
    if (aantalBoringen) xml = replaceInCommentRange(xml, 34, aantalBoringen);

    // Comment 35: "0,0 - 1,0" across 3 runs → replace only the last run " 1,0"
    if (boringDiepte) {
        xml = xml.replace(
            /(<w:commentRangeStart w:id="35"\/>.*?<w:t[^>]*>0,0 <\/w:t>.*?<w:t[^>]*>-<\/w:t>.*?<w:t[^>]*>) 1,0(<\/w:t>.*?<w:commentRangeEnd w:id="35"\/>)/s,
            `$1 ${boringDiepte}$2`
        );
    }

    // Comment 36: "1" → aantal mengmonsters
    if (aantalMengmonsters) xml = replaceInCommentRange(xml, 36, aantalMengmonsters);

    // Comment 37: "Synfra/BDOK" → uitvoerder (rapportage reference in bijlagen)
    if (uitvoerder) xml = replaceInCommentRange(xml, 37, uitvoerder);

    // Comment 38: "gemeente" → gemeente lowercase
    if (gemeente) xml = replaceInCommentRange(xml, 38, gemeente.toLowerCase());

    // Comment 39: Remove revision table — keep only "Niet van toepassing." paragraph
    {
        const startTag39 = '<w:commentRangeStart w:id="39"/>';
        const endTag39 = '<w:commentRangeEnd w:id="39"/>';
        const si = xml.indexOf(startTag39);
        const ei = xml.indexOf(endTag39);
        if (si !== -1 && ei !== -1) {
            const before = xml.slice(0, si + startTag39.length);
            let region = xml.slice(si + startTag39.length, ei);
            const after = xml.slice(ei);
            // Remove the revision table element entirely
            region = region.replace(/<w:tbl\b[\s\S]*?<\/w:tbl>/g, '');
            // Remove empty self-closing paragraphs left over
            region = region.replace(/<w:p\b[^>]*\/>/g, '');
            // Simplify the text: strip the "OF Onderhavige revisie..." alternative
            region = region.replace(
                /<w:t([^>]*)>Niet van toepassing OF Onderhavige revisie vervangt integraal voorgaande rapportversies\.\s*<\/w:t>/,
                '<w:t$1>Niet van toepassing.<\/w:t>'
            );
            xml = before + region + after;
        }
    }

    // Comment 74: "(benoemen, datum)" → PFAS BKK reference (3 runs: "(" + "benoemen, datum" + ")")
    if (pfasBkk) xml = replaceInCommentRange(xml, 74, pfasBkk);

    // Comment 54: "-Gemeente naam." split across runs → "-gemeente."
    // The text is split as: "-" (yellow run) + tab + "G" (green run) + "emeente naam." (green run)
    // Replace only within the comment range
    if (gemeente) {
        xml = xml.replace(
            /(<w:commentRangeStart w:id="54"\/>.*?)(<w:t[^>]*>)G(<\/w:t><\/w:r><w:r[^>]*><w:rPr>(?:[^<]|<(?!\/w:rPr>))*<w:highlight w:val="green"\/>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)(<w:t[^>]*>)emeente naam\.(.*?<w:commentRangeEnd w:id="54"\/>)/s,
            `$1$2${gemeente}$3$4$5`
        );
    }

    // Comment 55: "Synfra/BDOK." → uitvoerder (with trailing dot)
    if (uitvoerder) xml = replaceInCommentRange(xml, 55, `${uitvoerder}.`);

    // Comment 58: "XXX" in "circa XXX meter lang" tracé paragraph → sleuflengte
    if (sleufNL) xml = replaceInCommentRange(xml, 58, sleufNL);

    // Comment 70: "bodemfunctieklassenkaart (jaartal) van gemeente" → with real year + gemeente
    if (gemeente) {
        xml = xml.replace(
            /(<w:commentRangeStart w:id="70"\/>.*?<w:t[^>]*>bodemfunctieklassenkaart \()jaartal(\) van )gemeente(.*?<w:commentRangeEnd w:id="70"\/>)/s,
            `$1${jaar}$2${gemeente}$3`
        );
    }

    // Comment 79: "XXX" in "circa XXX m +NAP" groundwater paragraph → grondwaterstand
    if (gwsNL) xml = replaceInCommentRange(xml, 79, gwsNL);

    // Comment 90: second "Synfra/BDOK" (cyan conditional block) → uitvoerder
    if (uitvoerder) xml = replaceInCommentRange(xml, 90, uitvoerder);

    // Comment 91: "Bodeminformatie" bijlage title → include gemeente if bodemrapportage provided
    if (gemeente && values.hasBodemrapportage) {
        xml = replaceInCommentRange(xml, 91, `Bodeminformatie gemeente ${gemeente}`);
    }

    // AMV nummer in header/title
    if (amvNummer) {
        xml = xml.split('AMV261626.001').join(amvNummer);
    }

    // Comment 71: BKK bodemtype — replace only the first run "Landbouw/Natuur",
    // leave surrounding text "' (zie BDOK)." runs unchanged
    if (bodemtype) {
        xml = xml.replace(
            /(<w:commentRangeStart w:id="71"\/>.*?<w:t[^>]*>)Landbouw\/Natuur(<\/w:t>)/s,
            `$1${xmlEsc(bodemtype)}$2`
        );
    }

    // ── Tekening embedding (comment 89 — Bijlage 1) ──────────────────────────
    if (tekening) {
        const tekeningRId = 'rId41';
        const imgArrayBuffer = await tekening.blob.arrayBuffer();

        // Scale to max page width 160mm = 5 760 000 EMU, keeping aspect ratio
        const maxCx = 5_760_000;
        const ratio = tekening.heightPx / tekening.widthPx;
        const cxEmu = maxCx;
        const cyEmu = Math.round(maxCx * ratio);

        // Add image to zip
        zip.file('word/media/tekening.jpg', imgArrayBuffer);

        // Add relationship
        let rels = await zip.file('word/_rels/document.xml.rels').async('string');
        const newRel = `<Relationship Id="${tekeningRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/tekening.jpg"/>`;
        rels = rels.replace('</Relationships>', `${newRel}</Relationships>`);
        zip.file('word/_rels/document.xml.rels', rels);

        // Insert drawing run into the comment 89 paragraph (before commentRangeEnd)
        const drawingRun = `<w:r>${inlineDrawingXml(tekeningRId, cxEmu, cyEmu)}</w:r>`;
        xml = xml.replace(
            '<w:commentRangeEnd w:id="89"/>',
            `${drawingRun}<w:commentRangeEnd w:id="89"/>`
        );
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
