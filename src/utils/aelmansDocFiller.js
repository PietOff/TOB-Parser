/**
 * Aelmans docx template filler
 * Uses JSZip to open the template docx, replace green-highlighted placeholder text,
 * and return a filled docx as a Blob.
 *
 * Verified placeholder values in template XML (confirmed via document.xml inspection):
 *   "naam"                              → contactpersoon (green, single run)
 *   "100 meter"                         → sleuflengte + " meter" (green, single run)
 *   "0,80 m-mv"                         → ontgravingsdiepte + " m-mv" (green, single run)
 *   "&lt;25 m³ / &gt;25 m³"            → keep correct one (green, single run, XML-escaped)
 *   "Circa 1,0 m-mv"                    → "Circa " + gws + " m-mv" (green, single run)
 *   "Ja / nee / ter plaatse beoordelen" → bemaling (green, single run)
 *   "Gemeente"                          → gemeente capital (green, single run)
 *   "gemeente"                          → gemeente lower (green, single run)
 *   G + emeente naam.                   → gemeente + "." (green, split across 2 runs)
 *   "xxx "                              → sleuflengte + " " (green, trailing space, single run)
 *   "Synfra/BDOK"                       → uitvoerder (green, single run, appears twice)
 *   "circa XXX m +NAP"                  → "circa " + gws + " m +NAP" (non-green, full sentence)
 *   "kerkdorp XXX"                      → "kerkdorp " + plaatsnaam (non-green, in paragraph)
 */
import JSZip from 'jszip';

/**
 * Fill the template docx with values extracted from BDOK + form
 */
export async function fillAelmansTemplate(templateFile, values) {
    const arrayBuffer = await templateFile.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);

    let xml = await zip.file('word/document.xml').async('string');

    const {
        straatnaam = '',
        huisnummer = '',
        plaatsnaam = '',
        gemeente = '',
        sleuflengte = '',
        ontgravingsdiepte = '',
        isGroterDan25m3 = null,
        grondwaterstand = '',
        bemaling = '',
        contactpersoon = '',
        uitvoerder = 'Synfra/BDOK',
        amvNummer = '',
    } = values;

    // Simple text replacement within <w:t> text nodes
    // The XML stores < and > as &lt; &gt; so we need to escape our search/replace strings
    const xmlEsc = (s) => s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const replaceText = (search, replace) => {
        // Replace both in raw XML (for normal text) and XML-escaped form (for < > chars)
        xml = xml.split(search).join(replace);
        const escaped = xmlEsc(search);
        if (escaped !== search) xml = xml.split(escaped).join(xmlEsc(replace));
    };

    // ── Contact person ──
    // Replaces the isolated word "naam" in green runs. Template also has "Locatienaam" etc.
    // We target ">naam<" to avoid replacing substrings.
    if (contactpersoon) {
        xml = xml.split('>naam<').join(`>${contactpersoon}<`);
    }

    // ── Sleuflengte ──
    if (sleuflengte) {
        const s = sleuflengte.replace('.', ',');
        replaceText('100 meter', `${s} meter`);
        // "xxx " with trailing space (followed by "meter" in surrounding non-green runs)
        replaceText('xxx ', `${s} `);
    }

    // ── Ontgravingsdiepte ──
    if (ontgravingsdiepte) {
        const d = ontgravingsdiepte.replace('.', ',');
        replaceText('0,80 m-mv', `${d} m-mv`);
    }

    // ── Volume (>25 m³ / <25 m³) ──
    // In the XML this appears as: &lt;25 m³ / &gt;25 m³
    if (isGroterDan25m3 === true) {
        xml = xml.split('&lt;25 m³ / &gt;25 m³').join('&gt;25 m³');
    } else if (isGroterDan25m3 === false) {
        xml = xml.split('&lt;25 m³ / &gt;25 m³').join('&lt;25 m³');
    }

    // ── Grondwaterstand ──
    if (grondwaterstand) {
        const g = grondwaterstand.replace('.', ',');
        replaceText('Circa 1,0 m-mv', `Circa ${g} m-mv`);
        // Non-green paragraph: "circa XXX m +NAP"
        replaceText('circa XXX m +NAP', `circa ${g} m +NAP`);
    }

    // ── Bemaling ──
    if (bemaling) {
        replaceText('Ja / nee / ter plaatse beoordelen', bemaling);
    }

    // ── Gemeente ──
    if (gemeente) {
        // Split "G" + "emeente naam." across two adjacent green runs → replace both with gemeente.
        // Pattern: >G</w:t> ... (next green run) >emeente naam.</w:t>
        // We use a regex to handle the variable XML between the two runs.
        xml = xml.replace(
            /(<w:t[^>]*>)G(<\/w:t><\/w:r><w:r[^>]*><w:rPr><w:highlight w:val="green"\/>(?:[^<]|<(?!\/w:rPr>))*<\/w:rPr>)(<w:t[^>]*>)emeente naam\./,
            `$1${gemeente}$2$3`
        );

        // Standalone "Gemeente" (capital) - single run
        replaceText('>Gemeente<', `>${gemeente}<`);

        // Standalone "gemeente" (lowercase) - single run
        replaceText('>gemeente<', `>${gemeente.toLowerCase()}<`);

        // Non-green: "kerkdorp XXX"
        replaceText('kerkdorp XXX', `kerkdorp ${plaatsnaam || gemeente}`);
    }

    // ── Uitvoerder ──
    if (uitvoerder && uitvoerder !== 'Synfra/BDOK') {
        replaceText('Synfra/BDOK', uitvoerder);
    }

    // ── AMV nummer ──
    if (amvNummer) {
        replaceText('AMV261626.001', amvNummer);
    }

    // Write modified XML back and generate blob
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
