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
function inlineDrawingXml(rId, cxEmu, cyEmu) {
    return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cxEmu}" cy="${cyEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="99" name="Tekening"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="99" name="Tekening"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cxEmu}" cy="${cyEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

export async function fillAelmansTemplate(templateFile, values) {
    const arrayBuffer = await templateFile.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    let xml = await zip.file('word/document.xml').async('string');

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
        ? (lenF < 5 ? '1' : lenF <= 75 ? '2' : String(Math.ceil(lenF / 50)))
        : '';
    const aantalMengmonsters = !isNaN(lenF)
        ? String(Math.max(2, Math.ceil(lenF / 50) * 2))
        : '2';

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
    if (gwsNL) {
        xml = repT(xml, 'Circa 1,0 m-mv', `Circa ${gwsNL} m-mv`);
        // "circa XXX m +NAP" — replace XXX with gwsNL
        xml = xml.replace(/<w:t([^>]*)>XXX<\/w:t>/g, `<w:t$1>${xmlEsc(gwsNL)}</w:t>`);
        // Space placeholder between "bevindt zich" and "op meer dan 0,25" in GWO sentence
        xml = xml.replace(
            /(bevindt\s+zich[\s\S]{0,300}?<w:t[^>]*>) (<\/w:t>[\s\S]{0,300}?op meer dan 0,25)/s,
            `$1circa ${xmlEsc(gwsNL)} m-mv$2`
        );
    }

    // ── Bemaling ──────────────────────────────────────────────────────────
    if (bemaling) xml = repT(xml, 'Ja / nee / ter plaatse beoordelen', xmlEsc(bemaling));

    // ── Gemeente (bevoegd gezag cell) ─────────────────────────────────────
    if (gemeente) {
        xml = repT(xml, 'Gemeente', xmlEsc(gemeente));

        // "G" + "emeente naam." split across two runs (§1.3 source row)
        // Replace G→gemeente, empty out "emeente naam."
        xml = xml.replace(
            /(<w:t[^>]*>)G(<\/w:t>)([\s\S]{0,600}?)(<w:t[^>]*>)emeente naam\.(<\/w:t>)/s,
            `$1${xmlEsc(gemeente)}$2$3$4$5`
        );
        // Clear the leftover "emeente naam." run
        xml = xml.replace(/<w:t([^>]*)>emeente naam\.<\/w:t>/g, '<w:t$1><\/w:t>');

        // BKK sentence: "(jaartal) van gemeente" → year + actual gemeente
        xml = xml.replace(
            /\(jaartal\) van gemeente/g,
            `(${jaar}) van ${xmlEsc(gemeente)}`
        );

        // Bijlage 3 title: "Bodeminformatie gemeente" → add gemeente name if bodemrapportage
        if (hasBodemrapportage) {
            xml = repT(xml, 'Bodeminformatie', `Bodeminformatie gemeente ${xmlEsc(gemeente)}`);
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
    if (uitvoerder) {
        xml = repT(xml, 'Synfra\\/BDOK\\.', `${xmlEsc(uitvoerder)}.`); // with dot first
        xml = repT(xml, 'Synfra\\/BDOK',    xmlEsc(uitvoerder));
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

    // ── Conditional grondwateronderzoek paragraph ─────────────────────────
    // Yellow paragraph = depth argument (GWS > 0.25m below excavation)
    // Cyan paragraph   = work-type argument (cable work, no groundwater contact)
    // Remove whichever doesn't apply. Use indexOf to find the exact enclosing <w:p>.
    {
        const gws83  = parseFloat(grondwaterstand);
        const diep83 = parseFloat(ontgravingsdiepte);
        if (!isNaN(gws83) && !isNaN(diep83)) {
            const removeParaContaining = (marker) => {
                const idx = xml.indexOf(marker);
                if (idx === -1) return;
                // Find the nearest <w:p> or <w:p ...> opening tag before the marker
                const p1 = xml.lastIndexOf('<w:p>', idx);
                const p2 = xml.lastIndexOf('<w:p ', idx);
                const pStart = Math.max(p1, p2);
                const pEnd   = xml.indexOf('</w:p>', idx);
                if (pStart !== -1 && pEnd !== -1) {
                    xml = xml.slice(0, pStart) + xml.slice(pEnd + '</w:p>'.length);
                }
            };
            if (gws83 - diep83 > 0.25) {
                // GWS deep enough → yellow depth-argument applies → remove cyan paragraph
                removeParaContaining('Omdat er geen werkzaamheden');
            } else {
                // GWS shallow → cyan work-type argument applies → remove yellow paragraph
                removeParaContaining('Grondwateronderzoek dient');
            }
        }
    }

    // ── Tekening (Bijlage 1) ──────────────────────────────────────────────
    if (tekening) {
        const tekeningRId = 'rId41';
        const imgArrayBuffer = await tekening.blob.arrayBuffer();
        const maxCx = 5_760_000; // 160mm in EMU
        const cxEmu = maxCx;
        const cyEmu = Math.round(maxCx * (tekening.heightPx / tekening.widthPx));

        zip.file('word/media/tekening.jpg', imgArrayBuffer);

        let rels = await zip.file('word/_rels/document.xml.rels').async('string');
        const newRel = `<Relationship Id="${tekeningRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/tekening.jpg"/>`;
        rels = rels.replace('</Relationships>', `${newRel}</Relationships>`);
        zip.file('word/_rels/document.xml.rels', rels);

        // Insert after the "Bijlage 1" section heading paragraph
        xml = xml.replace(
            /(<w:t[^>]*>Bijlage 1<\/w:t>[\s\S]{0,300}?<\/w:p>)/s,
            `$1<w:p><w:r>${inlineDrawingXml(tekeningRId, cxEmu, cyEmu)}</w:r></w:p>`
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
