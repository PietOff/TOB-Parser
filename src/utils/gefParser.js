/**
 * GEF Parser: leest de kopregels van GEF-bestanden (sonderingen/boringen) en
 * haalt daar de naam, de datum en de XY-coordinaten uit, zodat een hele map
 * bestanden in een keer als CSV geexporteerd kan worden.
 *
 * Alleen het headerblok (alles tot #EOH=) wordt gelezen; de meetregels
 * daaronder worden genegeerd.
 */

// Headers staan bovenaan het bestand. Een sondering van 300 kB hoeft dus niet
// helemaal ingelezen te worden - eerst een plak van vooraan proberen.
const HEADER_SLICE_BYTES = 64 * 1024;

// GEF is platte tekst; oudere bestanden zijn DOS/latin-1, nooit UTF-8.
// windows-1252 leest ASCII identiek en verminkt accenten niet.
const decodeGef = (buffer) => new TextDecoder('windows-1252').decode(buffer);

// RD-bereik (Rijksdriehoek, EPSG:28992) ruim genomen, om onzin te herkennen.
const RD_X = [-7000, 300000];
const RD_Y = [289000, 629000];

const inRange = (v, [min, max]) => v !== null && v >= min && v <= max;

/**
 * Splitst het headerblok in regels. Stopt bij #EOH=.
 * Eerst opsplitsen en dan pas afkappen: bij afkappen op tekstpositie blijft er
 * een losse \r achter op de laatste regel, en daar struikelt de keyword-regex
 * over - precies de regel waar #XYID vaak staat.
 */
function headerLines(text) {
    const alle = String(text).split(/\r\n|\r|\n/);
    const eoh = alle.findIndex(l => /^\s*#\s*EOH\s*=/i.test(l));
    return eoh >= 0 ? alle.slice(0, eoh) : alle;
}

/**
 * Verzamelt alle #KEYWORD= regels. Sommige keywords (MEASUREMENTTEXT,
 * REPORTTEXT) komen meerdere keren voor, dus alles gaat in een array.
 * Let op: leveranciers schrijven zowel "#TESTID=" als "#TESTID =".
 */
function collectKeywords(lines) {
    const map = {};
    for (const line of lines) {
        const m = /^\s*#\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
        if (!m) continue;
        const key = m[1].toUpperCase();
        if (!map[key]) map[key] = [];
        map[key].push(m[2].trim());
    }
    return map;
}

const first = (arr) => (arr && arr.length ? arr[0] : '');

/** Splitst een keyword-waarde op de komma's in losse velden. */
const fields = (value) => String(value || '').split(',').map(s => s.trim());

function num(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(String(value).replace(/\s+/g, ''));
    return Number.isFinite(n) ? n : null;
}

/**
 * Zoekt een genummerde tekstregel op, bv. #MEASUREMENTTEXT= 101, 19921119, datum
 * geeft bij code 101 de waarde "19921119" terug.
 */
function codedText(kw, code) {
    for (const key of ['MEASUREMENTTEXT', 'REPORTTEXT']) {
        for (const raw of kw[key] || []) {
            const f = fields(raw);
            if (Number(f[0]) === code && f[1]) return f[1];
        }
    }
    return '';
}

/**
 * Datums komen in twee smaken voor: "2012, 5, 21" (STARTDATE/FILEDATE) en
 * "19921119" (genummerde tekstregel). Geeft een ISO-datum of null terug.
 */
function parseGefDate(raw) {
    if (!raw) return null;
    const parts = String(raw).split(/[,\-/\s]+/).map(s => s.trim()).filter(Boolean);

    let y, m, d;
    if (parts.length >= 3 && /^\d{4}$/.test(parts[0])) {
        [y, m, d] = parts;
    } else if (parts.length === 1 && /^\d{8}$/.test(parts[0])) {
        y = parts[0].slice(0, 4);
        m = parts[0].slice(4, 6);
        d = parts[0].slice(6, 8);
    } else {
        return null;
    }

    const jaar = Number(y), maand = Number(m), dag = Number(d);
    if (!(jaar >= 1900 && jaar <= 2100)) return null;
    if (!(maand >= 1 && maand <= 12)) return null;
    if (!(dag >= 1 && dag <= 31)) return null;

    const pad = (n) => String(n).padStart(2, '0');
    return `${jaar}-${pad(maand)}-${pad(dag)}`;
}

/** Bestandsnaam zonder extensie, als laatste redmiddel voor de naam. */
function baseName(fileName) {
    return String(fileName || '').replace(/\.[^.]+$/, '').trim();
}

/**
 * Leest naam, datum en XY uit een GEF-header.
 * @param {string} text - inhoud van (het begin van) het GEF-bestand
 * @param {string} fileName - bestandsnaam, gebruikt als fallback voor de naam
 */
export function parseGefHeader(text, fileName = '') {
    const kw = collectKeywords(headerLines(text));
    const waarschuwingen = [];

    // -- Naam ------------------------------------------------------------
    // #TESTID is het officiele veld. Sommige leveranciers laten het weg en
    // zetten de naam in tekstregel 203 ("Sondering AAA1").
    let naam = first(kw.TESTID);
    if (!naam) {
        const uitTekst = codedText(kw, 203).replace(/^(sondering|boring)\s+/i, '').trim();
        naam = uitTekst || baseName(fileName);
        waarschuwingen.push(uitTekst ? 'naam uit tekstregel 203' : 'geen #TESTID, naam uit bestandsnaam');
    }

    // -- Datum -----------------------------------------------------------
    // #FILEDATE is de datum waarop het bestand is aangemaakt, niet die van de
    // meting - in de praktijk soms twintig jaar later. Dus pas als laatste.
    const datum =
        parseGefDate(first(kw.STARTDATE)) ||
        parseGefDate(codedText(kw, 101)) ||
        parseGefDate(first(kw.FILEDATE));
    if (!datum) waarschuwingen.push('geen datum gevonden');

    // -- Coordinaten -----------------------------------------------------
    // #XYID= <stelselcode>, X, Y[, dx, dy]
    const xyRaw = first(kw.XYID);
    const xy = fields(xyRaw);
    const stelsel = xyRaw ? xy[0] : '';
    const x = xyRaw ? num(xy[1]) : null;
    const y = xyRaw ? num(xy[2]) : null;

    if (!xyRaw) {
        waarschuwingen.push('geen #XYID in bestand');
    } else if (x === null || y === null) {
        waarschuwingen.push('#XYID zonder bruikbare coordinaten');
    } else if (inRange(y, RD_X) && inRange(x, RD_Y)) {
        // X en Y omgedraaid: niet stilzwijgend corrigeren, wel melden.
        waarschuwingen.push('X en Y lijken omgedraaid');
    } else if (!inRange(x, RD_X) || !inRange(y, RD_Y)) {
        waarschuwingen.push(`coordinaten buiten RD-bereik (stelselcode ${stelsel || '?'})`);
    } else if (stelsel !== '31000' && stelsel !== '0' && stelsel !== '') {
        // Code 0 of leeg = "niet opgegeven" en komt veel voor terwijl het
        // gewoon RD is; daar niet over zeuren zolang de waarden kloppen.
        waarschuwingen.push(`afwijkende stelselcode ${stelsel}`);
    }

    return {
        bestand: fileName,
        naam,
        datum,          // ISO (jjjj-mm-dd) of null
        x,
        y,
        stelsel,
        waarschuwingen,
    };
}

/**
 * Leest een File/Blob in en parseert de header. Eerst wordt alleen het begin
 * van het bestand gelezen; ontbreekt #EOH= daarin, dan alsnog het geheel.
 */
export async function parseGefFile(file) {
    const kop = decodeGef(await file.slice(0, HEADER_SLICE_BYTES).arrayBuffer());
    const heleHeader = /^\s*#\s*EOH\s*=/im.test(kop) || file.size <= HEADER_SLICE_BYTES
        ? kop
        : decodeGef(await file.arrayBuffer());
    return parseGefHeader(heleHeader, file.name);
}

/**
 * Parseert een lijst bestanden achter elkaar. Een bestand dat niet te lezen is
 * laat de rest van de batch doorlopen en komt als foutregel terug.
 */
export async function parseGefFiles(files, onProgress) {
    const rijen = [];
    const lijst = Array.from(files);

    for (let i = 0; i < lijst.length; i++) {
        const file = lijst[i];
        if (onProgress) onProgress(`GEF ${i + 1} van ${lijst.length}: ${file.name}`);
        try {
            rijen.push(await parseGefFile(file));
        } catch (err) {
            rijen.push({
                bestand: file.name,
                naam: baseName(file.name),
                datum: null,
                x: null,
                y: null,
                stelsel: '',
                waarschuwingen: [`niet te lezen: ${err.message}`],
            });
        }
    }

    return rijen;
}

/** ISO-datum naar dd-mm-jjjj. */
export function formatDatumNl(iso) {
    if (!iso) return '';
    const [j, m, d] = iso.split('-');
    return `${d}-${m}-${j}`;
}

export const CSV_KOLOMMEN = ['Bestand', 'Naam', 'Datum', 'X', 'Y'];

function csvVeld(waarde, separator) {
    const s = waarde === null || waarde === undefined ? '' : String(waarde);
    return new RegExp(`["\\n\\r${separator}]`).test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Bouwt de CSV-tekst.
 * @param {Array} rijen - resultaat van parseGefFiles
 * @param {object} opties
 * @param {string} opties.separator - ';' voor Excel-NL, ',' voor GIS/standaard
 * @param {string} opties.decimaal  - ',' voor Excel-NL, '.' voor GIS/standaard
 * @param {string} opties.datum     - 'nl' (dd-mm-jjjj) of 'iso' (jjjj-mm-dd)
 */
export function buildCsv(rijen, { separator = ';', decimaal = ',', datum = 'nl' } = {}) {
    const getal = (n) => (n === null || n === undefined ? '' : String(n).replace('.', decimaal));

    const regels = [CSV_KOLOMMEN.join(separator)];
    for (const r of rijen) {
        regels.push([
            r.bestand,
            r.naam,
            datum === 'iso' ? (r.datum || '') : formatDatumNl(r.datum),
            getal(r.x),
            getal(r.y),
        ].map(v => csvVeld(v, separator)).join(separator));
    }

    return regels.join('\r\n');
}

/** CSV als Blob, met BOM zodat Excel de tekens goed leest. */
export function csvBlob(csv) {
    return new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
}
