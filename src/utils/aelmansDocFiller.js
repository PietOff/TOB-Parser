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
 *  "Opsteller rapportage"                     → "Opsteller"
 *  §2.4 slotzin                               → + verwijzing naar samenvatting
 *  §2.5 tabel Verdachte activiteiten          → gevuld uit de bodemrapportage,
 *                                               of verwijderd als er geen zijn
 *  "Landbouw/Natuur"                          → generieke klasse uit BDOK §2.2
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
import { YEARS as TOPO_YEARS } from './topoImages';

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

/** Alle zichtbare tekst van een XML-fragment (alle <w:t>-inhoud aaneengeplakt) */
function fragText(frag) {
    return (frag.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || [])
        .map(t => t.replace(/^<w:t[^>]*>/, '').replace(/<\/w:t>$/, ''))
        .join('');
}

/**
 * Zet de tekst van één tabelcel, met behoud van de opmaak van die cel:
 * de bestaande runs gaan eruit en de nieuwe run erft de <w:rPr> uit de <w:pPr>.
 */
function setCellText(tc, text) {
    const leeg = tc.replace(/<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/g, '');
    if (!text) return leeg;
    const m = /<w:pPr>[\s\S]*?(<w:rPr>[\s\S]*?<\/w:rPr>)\s*<\/w:pPr>/.exec(leeg);
    return leeg.replace(
        '</w:p>',
        `<w:r>${m ? m[1] : ''}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`
    );
}

/** Vul een tabelrij-sjabloon met celwaarden (één waarde per kolom) */
function fillRow(rowXml, waarden) {
    const delen = rowXml.split('</w:tc>');
    let out = '';
    for (let i = 0; i < delen.length - 1; i++) {
        out += setCellText(delen[i], waarden[i] || '') + '</w:tc>';
    }
    return out + delen[delen.length - 1];
}

/**
 * Build a floating <w:drawing> anchored to the page, centred both ways and placed
 * behind the text (behindDoc="1"). Used for the Bijlage 1 tekening so it fills the
 * page independently of the surrounding text flow.
 */
function anchoredDrawingXml(rId, cxEmu, cyEmu, id = 99, name = 'Tekening') {
    const A  = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
    const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
    const R  = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return `<w:drawing><wp:anchor xmlns:wp="${WP}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:align>center</wp:align></wp:positionH><wp:positionV relativeFrom="page"><wp:align>center</wp:align></wp:positionV><wp:extent cx="${cxEmu}" cy="${cyEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${A}"><a:graphicData uri="${PIC}"><pic:pic xmlns:pic="${PIC}"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="${R}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cxEmu}" cy="${cyEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing>`;
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

    // Helper: remove the whole table containing a text marker (first match)
    const removeTableContaining = (marker) => {
        const idx = xml.indexOf(marker);
        if (idx === -1) return;
        const tblStart = Math.max(xml.lastIndexOf('<w:tbl>', idx), xml.lastIndexOf('<w:tbl ', idx));
        const tblEnd   = xml.indexOf('</w:tbl>', idx);
        if (tblStart !== -1 && tblEnd !== -1) {
            xml = xml.slice(0, tblStart) + xml.slice(tblEnd + '</w:tbl>'.length);
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
        bodemklasseBoven = '',
        bodemklasseOnder = '',
        verdachteActiviteiten = null,
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

    // ── Titelblad: "Opsteller rapportage" → "Opsteller" ───────────────────
    xml = repT(xml, 'Opsteller rapportage', 'Opsteller');

    // ── §2.4 Bekende bodemonderzoeken: verwijzing naar de samenvatting ────
    xml = repT(
        xml,
        'bodemonderzoeken plaatsgevonden, die voor onderhavig onderzoek relevant zijn\\.',
        'bodemonderzoeken plaatsgevonden, die voor onderhavig onderzoek relevant zijn. ' +
        'In onderstaande paragraaf is een summiere samenvatting van deze onderzoeken opgenomen.'
    );

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

        // §2.6 BKK-zin: "(jaartal)" → huidig jaar.
        // Word zet dit als een eigen run neer ("...klassenkaart " | "(jaartal)" |
        // " van " | "gemeente"), dus zoeken op de doorlopende zin vindt nooit iets —
        // de run zelf moet vervangen worden.
        xml = repT(xml, '\\(jaartal\\)', `(${jaar})`);

        // "gemeente" (kleine letter) → "gemeente <plaats>". Komt twee keer voor:
        // in de §2.6 BKK-zin en in de bijlagenlijst. Onvoorwaardelijk, want
        // §2.6 staat er ook zonder bodemrapportage; Bijlage 3 wordt in dat geval
        // even verderop toch in zijn geheel verwijderd.
        xml = repT(xml, 'gemeente', `gemeente ${xmlEsc(gemeenteCity)}`);

        // Titelblad van Bijlage 3: "Bodeminformatie" → "Bodeminformatie Gemeente <plaats>".
        // De bijlagenlijst heeft hier al "gemeente <plaats>" staan, het titelblad niet.
        // Beide staan als losse runs "Bodem" + "informatie"; alleen op het titelblad
        // is dat een kale <w:t>informatie</w:t> (in de lijst staat er een spatie
        // achter, dus met xml:space), zodat dit patroon precies één keer raakt.
        // De negative lookahead houdt de <w:rPr>-capture binnen déze run: zonder
        // die grens slokt hij de voorafgaande "Bodem"-run mee en wordt die tekst
        // in de nieuwe run herhaald.
        xml = xml.replace(
            /(<w:r(?:\s[^>]*)?>((?:<w:rPr>(?:(?!<\/w:r>)[\s\S])*?<\/w:rPr>)?)<w:t>informatie<\/w:t><\/w:r>)/,
            (_, run, rPr) =>
                `${run}<w:r>${rPr}<w:t xml:space="preserve"> Gemeente ${xmlEsc(gemeenteCity)}</w:t></w:r>`
        );
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

    // ── §2.5 Historisch verdachte activiteiten ────────────────────────────
    // De sjabloontabel heeft vijf kolommen (Locatie | Activiteit | Ubi code |
    // Jaartal begin | Jaartal eind) en twee groepskoppen die de datarijen splitsen
    // in "Onderzoekslocatie" en "Omgeving onderzoekslocatie (< 25 meter)".
    // Zonder bodemrapportage blijft het sjabloon ongemoeid: dan is er niets bekend,
    // en dat is iets anders dan "er zijn geen verdachte activiteiten".
    if (verdachteActiviteiten) {
        const opLocatie  = verdachteActiviteiten.onderzoekslocatie || [];
        const inOmgeving = verdachteActiviteiten.omgeving || [];

        if (!opLocatie.length && !inOmgeving.length) {
            // Niets bekend → inleidende zin vervangen, tabel en bijschrift eruit
            xml = repT(
                xml,
                'In onderstaande tabel zijn de verdachte activiteiten ter plaatse van de '
                + 'onderzoekslocatie en directe omgeving hiervan \\(&lt;25 meter\\) weergegeven\\.',
                'Er zijn geen verdachte activiteiten ter plaatse of nabij het tracé bekend.'
            );
            removeParaContaining(': Verdachte activiteiten');
            removeTableContaining('Ubi code');
        } else {
            const markIdx  = xml.indexOf('Ubi code');
            const tblStart = Math.max(xml.lastIndexOf('<w:tbl>', markIdx), xml.lastIndexOf('<w:tbl ', markIdx));
            const tblEnd   = xml.indexOf('</w:tbl>', markIdx) + '</w:tbl>'.length;
            const tbl      = xml.slice(tblStart, tblEnd);
            const rows     = tbl.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || [];

            // Groepskoppen beslaan alle vijf kolommen; datarijen hebben vijf cellen
            const isGroep    = (r) => /<w:gridSpan w:val="5"\s*\/>/.test(r);
            const iOnderzoek = rows.findIndex(r => isGroep(r) && /Onderzoekslocatie/.test(fragText(r)));
            const iOmgeving  = rows.findIndex(r => isGroep(r) && /Omgeving onderzoekslocatie/.test(fragText(r)));
            const iOpmerking = rows.findIndex(r => isGroep(r) && /Opmerkingen/.test(fragText(r)));

            // Sjabloonrij: bij voorkeur een lege datarij, anders de voorbeeldrij
            const dataRijen = rows.filter(r => !isGroep(r) && (r.match(/<w:tc>/g) || []).length === 5);
            const sjabloon  = dataRijen.find(r => !fragText(r).trim()) || dataRijen[1] || dataRijen[0];

            if (iOnderzoek !== -1 && iOmgeving !== -1 && iOpmerking !== -1 && sjabloon) {
                // Een groep zonder activiteiten houdt één lege rij, zodat de
                // tabelindeling herkenbaar blijft.
                const bouw = (lijst) => (lijst.length ? lijst : [{}]).map(a => fillRow(sjabloon, [
                    a.locatie      || '',
                    a.activiteit   || '',
                    a.ubiCode      || '',
                    a.jaartalBegin || '',
                    a.jaartalEind  || '',
                ]));
                const nieuweRijen = [
                    ...rows.slice(0, iOnderzoek + 1),
                    ...bouw(opLocatie),
                    rows[iOmgeving],
                    ...bouw(inOmgeving),
                    ...rows.slice(iOpmerking),
                ].join('');
                const tblPrefix = tbl.slice(0, tbl.indexOf('<w:tr'));
                xml = xml.slice(0, tblStart) + tblPrefix + nieuweRijen + '</w:tbl>' + xml.slice(tblEnd);
            } else {
                console.warn('[2.5] tabelindeling niet herkend — verdachte activiteiten niet ingevuld');
            }
        }
    }

    // ── §2.6 Bodemkwaliteitsklasse (uit BDOK §2.2, kolom "Generieke klasse") ─
    // Sjabloonzin, opgesplitst over runs:
    //   "...bodemkwaliteit van de |boven- en ondergrond| voldoet aan |de klasse ‘|
    //    Landbouw/Natuur|’ (|z|ie BDOK)|."
    // Zijn boven- en ondergrond dezelfde klasse, dan blijft de zin ongewijzigd.
    // Verschillen ze, dan wordt hij per laag uitgeschreven.
    {
        const boven = bodemklasseBoven || bodemtype;
        const onder = bodemklasseOnder || boven;
        if (boven && onder !== boven) {
            xml = repT(xml, 'boven- en ondergrond', 'bovengrond');
            xml = xml.split('Landbouw/Natuur').join(
                `${xmlEsc(boven)}’ en van de ondergrond aan de klasse ‘${xmlEsc(onder)}`
            );
        } else if (boven) {
            xml = xml.split('Landbouw/Natuur').join(xmlEsc(boven));
        }
    }

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

    // ── §2.9 slotalinea grondwateronderzoek ───────────────────────────────
    // Twee vaste teksten; welke van de twee hangt af van de grondwaterstand ten
    // opzichte van de ontgravingsdiepte.
    //
    // Deze alinea wordt ingevoegd in plaats van "de niet-passende variant uit het
    // sjabloon verwijderen", want in de huidige template staan ze geen van beide
    // meer — dat is precies waarom de slotalinea in gegenereerde rapportages
    // ontbrak. Staan ze er ooit weer in, dan halen we ze eerst weg zodat de tekst
    // hoe dan ook één keer voorkomt.
    {
        const gws29  = parseFloat(grondwaterstand);
        const diep29 = parseFloat(ontgravingsdiepte);
        if (!isNaN(gws29) && !isNaN(diep29)) {
            removeParaContaining('Grondwateronderzoek dient');
            removeParaContaining('Omdat er geen werkzaamheden');

            const grondwaterDieperDanOntgraving = gws29 - diep29 > 0.25;
            const slotalinea = grondwaterDieperDanOntgraving
                ? 'Grondwateronderzoek dient plaats te vinden, indien het freatisch '
                  + 'grondwater zich op minder dan 0,25 meter minus de maximale '
                  + 'ontgravingsdiepte bevindt. Dit is op de onderzoekslocatie niet het '
                  + 'geval. Het uitvoeren van het grondwateronderzoek is derhalve niet '
                  + 'noodzakelijk.'
                : 'Omdat er geen werkzaamheden in het grondwater plaatsvinden voor de '
                  + 'aanleg van kabels en leidingen, is grondwateronderzoek niet '
                  + 'doelmatig. Meestal worden de werkzaamheden uitgesteld naar een '
                  + 'drogere periode.';

            // Achter de laatste alinea van §2.9 plaatsen
            const anker = 'geregistreerde grondwateronttrekkingen plaats.';
            const idx29 = xml.indexOf(anker);
            const eind29 = idx29 === -1 ? -1 : xml.indexOf('</w:p>', idx29);
            if (eind29 !== -1) {
                const na = eind29 + '</w:p>'.length;
                xml = xml.slice(0, na)
                    + `<w:p><w:r><w:t xml:space="preserve">${xmlEsc(slotalinea)}</w:t></w:r></w:p>`
                    + xml.slice(na);
            } else {
                console.warn('[2.9] ankerzin niet gevonden — slotalinea niet ingevoegd');
            }
        }
    }

    // ── §2.2 Topotijdreis: label the caption cells with their year ───────────
    // The template's three caption cells all read plain "Topotijdreis" with no
    // year, so append one to each in turn. Driven by the same YEARS constant the
    // images are fetched with, so captions can't drift out of sync with content.
    // Runs independently of the image insertion below: if the map fetch failed we
    // still want correctly labelled (if empty) columns.
    for (const topoYear of TOPO_YEARS) {
        xml = xml.replace(
            /<w:t([^>]*)>Topotijdreis<\/w:t>/,
            `<w:t$1>Topotijdreis ${topoYear}</w:t>`
        );
    }

    // ── §2.2 Topotijdreis: insert map images into plaatje cells ──────────────
    // Finds the table containing any "Topotijdreis" text, then replaces the first
    // three empty paragraphs with pStyle "plaatje" (regardless of which row they're in).
    if (topoImages && topoImages.length === 3) {
        const topoMatch = /<w:t[^>]*>Topotijdreis[^<]*<\/w:t>/.exec(xml);
        const topoTextIdx = topoMatch ? topoMatch.index : -1;
        if (topoTextIdx !== -1) {
            const tblStart = Math.max(
                xml.lastIndexOf('<w:tbl>', topoTextIdx),
                xml.lastIndexOf('<w:tbl ', topoTextIdx)
            );
            const tblEnd = xml.indexOf('</w:tbl>', tblStart) + '</w:tbl>'.length;
            let tblXml = xml.slice(tblStart, tblEnd);

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
                tblXml = tblXml.replace(
                    /(<w:pStyle w:val="plaatje"\s*\/>[\s\S]{0,300}?<\/w:pPr>)\s*<\/w:p>/s,
                    '$1<w:r>' + drawing + '</w:r></w:p>'
                );
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

        zip.file('word/media/tekening.jpg', imgArrayBuffer);

        // Register a PartName override for this specific file — more reliable than
        // checking Default extensions, because the template may already have image/jpeg
        // registered only for other files via Override entries.
        let ct = await zip.file('[Content_Types].xml').async('string');
        let ctChanged = false;
        // Register the extension the same way the (working) topotijdreis PNGs do — a
        // Default entry is what Word actually relies on for media parts. The Override
        // alone left Word unable to resolve the part, which renders as an empty frame.
        if (!/<Default[^>]*Extension="jpg"/i.test(ct)) {
            ct = ct.replace('</Types>', '<Default Extension="jpg" ContentType="image/jpeg"/></Types>');
            ctChanged = true;
        }
        if (!ct.includes('/word/media/tekening.jpg')) {
            ct = ct.replace('</Types>', '<Override PartName="/word/media/tekening.jpg" ContentType="image/jpeg"/></Types>');
            ctChanged = true;
        }
        if (ctChanged) zip.file('[Content_Types].xml', ct);
        let rels = await zip.file('word/_rels/document.xml.rels').async('string');
        if (!rels.includes(tekeningRId)) {
            rels = rels.replace(
                '</Relationships>',
                `<Relationship Id="${tekeningRId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/tekening.jpg"/></Relationships>`
            );
            zip.file('word/_rels/document.xml.rels', rels);
        }

        // Use a high unique drawing ID to avoid collisions with existing template drawings.
        //
        // The page break gets its own paragraph so the drawing's host paragraph is
        // unambiguously the first one on the new page — the anchor positions relative to
        // whichever page it lives on. The image itself floats (behindDoc), centred on the
        // page, so it doesn't depend on the surrounding text flow.
        const drawing =
            `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` +
            `<w:p><w:r>${anchoredDrawingXml(tekeningRId, cxEmu, cyEmu, 9901, 'Tekening')}</w:r></w:p>`;

        // The image belongs on the page headed "Bijlage 1 / Onderzoekslocatie".
        // "Bijlage 1" is auto-numbered so the raw XML only holds the title text, and the
        // "Bijlage" paragraph style is also used by the Inhoudsopgave heading — so anchor
        // on the title text itself and insert straight after that heading paragraph.
        //
        // The same title also appears in the table of contents; TOC entries are wrapped in
        // hyperlink/PAGEREF field markup, so skip any paragraph carrying those.
        const isTocPara = (para) =>
            para.includes('<w:hyperlink') ||
            para.includes('w:instrText') ||
            para.includes('PAGEREF');

        // True if `idx` sits inside a text box. Appendix divider pages are often built as
        // text boxes; a paragraph inserted in there is clipped to the box and the image
        // silently never shows up on the page.
        const isInTextBox = (idx) =>
            xml.lastIndexOf('<w:txbxContent>', idx) > xml.lastIndexOf('</w:txbxContent>', idx);

        // Returns [start, endExclusive] of the paragraph containing index `idx`.
        const paraBoundsAt = (idx) => {
            const start = Math.max(
                xml.lastIndexOf('<w:p>', idx),
                xml.lastIndexOf('<w:p ', idx)
            );
            const close = xml.indexOf('</w:p>', idx);
            if (start === -1 || close === -1) return null;
            return [start, close + '</w:p>'.length];
        };

        let placed = false;

        // 0. Best signal: the "(tekening invoegen opdrachtgever)" placeholder marks the
        //    appendix the drawing belongs to, so the nearest "Onderzoekslocatie" *before*
        //    it is reliably the Bijlage 1 heading. The title also appears earlier in the
        //    report body (§1), tens of thousands of characters away, and that earlier hit
        //    would otherwise win — which is exactly what put the image on the wrong page.
        {
            const phIdx0 = xml.indexOf('tekening invoegen opdrachtgever');
            if (phIdx0 !== -1) {
                let anchorEnd = -1;
                for (let i = xml.indexOf('Onderzoekslocatie'); i !== -1 && i < phIdx0; i = xml.indexOf('Onderzoekslocatie', i + 1)) {
                    const b = paraBoundsAt(i);
                    if (!b) continue;
                    if (isTocPara(xml.slice(b[0], b[1]))) continue;
                    if (isInTextBox(i)) continue;
                    anchorEnd = b[1]; // keep the last valid one before the placeholder
                }
                if (anchorEnd !== -1) {
                    xml = xml.slice(0, anchorEnd) + drawing + xml.slice(anchorEnd);
                    placed = true;
                }
            }
        }

        // 1. Otherwise: directly after the "Onderzoekslocatie" appendix heading.
        //    Require the "Bijlage" heading style on the first pass so a capitalised
        //    "Onderzoekslocatie" in ordinary body text can't win; fall back to any
        //    non-TOC paragraph with that text if the style isn't present.
        for (const requireHeadingStyle of [true, false]) {
            if (placed) break;
            for (let i = xml.indexOf('Onderzoekslocatie'); i !== -1; i = xml.indexOf('Onderzoekslocatie', i + 1)) {
                const bounds = paraBoundsAt(i);
                if (!bounds) continue;
                const [pStart, pEnd] = bounds;
                const para = xml.slice(pStart, pEnd);
                if (isTocPara(para)) continue;
                if (isInTextBox(i)) continue;
                if (requireHeadingStyle && !/w:pStyle w:val="Bijlage"\s*\/?>/.test(para)) continue;
                xml = xml.slice(0, pEnd) + drawing + xml.slice(pEnd);
                placed = true;
                break;
            }
        }

        // 1b. Heading only exists inside a text box (typical for appendix divider pages).
        //     Inserting into the box would clip the image, so insert after the *body*
        //     paragraph that hosts the box — the first </w:p> past the box's content.
        if (!placed) {
            for (let i = xml.indexOf('Onderzoekslocatie'); i !== -1; i = xml.indexOf('Onderzoekslocatie', i + 1)) {
                if (!isInTextBox(i)) continue;
                const boxEnd = xml.indexOf('</w:txbxContent>', i);
                if (boxEnd === -1) continue;
                const hostClose = xml.indexOf('</w:p>', boxEnd);
                if (hostClose === -1) continue;
                const at = hostClose + '</w:p>'.length;
                xml = xml.slice(0, at) + drawing + xml.slice(at);
                placed = true;
                break;
            }
        }

        // 2. Otherwise replace the "(tekening invoegen opdrachtgever)" placeholder in place.
        if (!placed) {
            const phIdx = xml.indexOf('tekening invoegen opdrachtgever');
            const bounds = phIdx === -1 ? null : paraBoundsAt(phIdx);
            if (bounds) {
                xml = xml.slice(0, bounds[0]) + drawing + xml.slice(bounds[1]);
                placed = true;
            }
        }

        // 3. Last resort: first "Bijlage"-styled heading that isn't the Inhoudsopgave.
        if (!placed) {
            const styleTag = /w:pStyle w:val="Bijlage"\s*\/?>/g;
            let m;
            while ((m = styleTag.exec(xml)) !== null) {
                const pClose = xml.indexOf('</w:p>', m.index);
                if (pClose === -1) continue;
                const paraText = xml.slice(m.index, pClose).replace(/<[^>]+>/g, '');
                if (/inhoud/i.test(paraText)) continue;
                xml = xml.slice(0, pClose + '</w:p>'.length) + drawing + xml.slice(pClose + '</w:p>'.length);
                placed = true;
                break;
            }
        }

        if (!placed) {
            console.warn('[tekening] geen invoegpositie gevonden — tekening niet ingevoegd');
        }

        // Remove the placeholder if it survived (i.e. path 1 or 3 was used)
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
