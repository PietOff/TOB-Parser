/**
 * BDOK Quickscan PDF Parser
 * Extracts key fields from BDOK Quickscan reports using pdfjs-dist
 */
import * as pdfjsLib from 'pdfjs-dist';
import { zoekUbiCode, volledigeUbiOmschrijving, ubiOmschrijvingBijCode } from './ubiCodes';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export async function extractPdfText(file, onProgress) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages = [];

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map(item => item.str).join(' ');
        pages.push(text);
        if (onProgress) onProgress(i, pdf.numPages);
    }

    return { pages, fullText: pages.join('\n') };
}

/** Bodemkwaliteitsklassen zoals ze in de BDOK-tabel voorkomen (regex-alternatie) */
const BKK_KLASSEN =
    'Achtergrondwaarde|Landbouw\\s*/\\s*Natuur|Wonen|Industrie|Niet\\s+toepasbaar|Uitgesloten|Onbekend';

/**
 * Zet een BDOK-klasse om naar de schrijfwijze die de Aelmans-rapportage gebruikt.
 * De BDOK noemt de schoonste klasse "Achtergrondwaarde"; in de TOB heet die
 * "Landbouw/Natuur".
 */
function normaliseerKlasse(raw) {
    const s = String(raw).replace(/\s+/g, ' ').trim();
    if (/^achtergrondwaarde$/i.test(s))          return 'Landbouw/Natuur';
    if (/^landbouw\s*\/\s*natuur$/i.test(s))     return 'Landbouw/Natuur';
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Activiteiten uit §1.7 van de quickscan (HBB- en tankbestand).
 *
 * Anders dan de bodemrapportage noemt de quickscan de UBI-code er zélf bij, achter
 * de omschrijving: "hbo- tank (ondergronds) (631242)". Dat is het enige houvast dat
 * niet van de kolomindeling afhangt — de paragraaf is opgebouwd als
 * label/waarde-paren (Soort, Type, Volume, Aanwezig, In gebruik, Datum sanering,
 * Certificaat, Opmerkingen, Voldoende onderzocht) die in de tekststroom door elkaar
 * lopen. Daarom zoeken we op de code en halen we de omschrijving uit de UBI-lijst.
 *
 * Elk record begint met het adres, gevolgd door het eerste veld ("Soort"); dat
 * gebruiken we om de Locatie-kolom te vullen. Start- en eindjaar staan niet in deze
 * paragraaf, dus die blijven leeg — dat is handwerk voor de adviseur.
 */
function leesActiviteitenMetCode(blok) {
    // Adressen: "<straat> <nr>" vlak vóór het eerste veld van een record.
    const adressen = [...blok.matchAll(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-\. ]{2,50}?\s\d{1,5}[a-zA-Z]?)\s+Soort\b/g)]
        .map(m => ({ index: m.index, adres: m[1].replace(/\s+/g, ' ').trim() }));

    const rijen = [];
    for (const m of blok.matchAll(/\((\d{4,6})\)/g)) {
        const code = m[1];
        const omschrijving = ubiOmschrijvingBijCode(blok.slice(Math.max(0, m.index - 120), m.index), code);
        if (!omschrijving) continue;   // niet in de UBI-lijst: dan is het geen activiteit
        const bij = adressen.filter(a => a.index < m.index).pop();
        rijen.push({
            locatie:      bij ? bij.adres : '',
            activiteit:   omschrijving,
            ubiCode:      `UBI${code}`,
            jaartalBegin: '',
            jaartalEind:  '',
        });
    }
    return rijen;
}

/**
 * Parse BDOK Quickscan and extract fields needed for AelmansForm
 * Returns an object with all extractable fields
 */
export async function parseBdok(file, onProgress) {
    if (onProgress) onProgress('PDF laden...');
    const { pages, fullText } = await extractPdfText(file, (i, n) => {
        if (onProgress) onProgress(`Pagina ${i}/${n} lezen...`);
    });

    if (onProgress) onProgress('Velden extraheren...');

    const result = {
        // Address fields
        straatnaam: '',
        huisnummer: '',
        plaatsnaam: '',
        gemeente: '',
        // Project fields
        amvNummer: '',
        betalingskenmerk: '',
        netwerkplannummer: '',    // staat op de titelregel van een Synfra-bodemcheck
        aanvrager: '',
        // RD-middelpunt van het geselecteerde gebied; bron voor plaats en gemeente
        rdX: null,
        rdY: null,
        sleuflengte: '',
        ontgravingsdiepte: '',
        isGroterDan25m3: null,    // true/false/null
        grondwaterstand: '',      // numeric string m-mv
        bodemtype: '',            // = bodemklasseBoven (backwards compat)
        bodemklasseBoven: '',     // BDOK §2.2 generieke klasse bovengrond
        bodemklasseOnder: '',     // BDOK §2.2 generieke klasse ondergrond
        typeVerharding: '',
        // §1.7: true als de quickscan uitdrukkelijk meldt dat er geen activiteiten zijn
        activiteitenBekend: false,
        verdachteActiviteiten: { onderzoekslocatie: [], omgeving: [] },
        // Calculated
        boringDiepte: '',         // ontgravingsdiepte + 0,2
        aantalBoringen: '',
        bemaling: '',             // Ja / Nee / Ter plaatse beoordelen
        // Raw text for debugging
        _fullText: fullText,
    };

    // ── AMV nummer ──
    const amvMatch = fullText.match(/\b(AMV\d{6,}(?:\.\d+)?)\b/i);
    if (amvMatch) result.amvNummer = amvMatch[1];

    // ── Betalingskenmerk / project ID ──
    // pdfjs-dist may insert spaces around colons, so use \s*:\s* throughout
    const betalingMatch = fullText.match(/Betalingskenmerk\s*:\s*(\d+)/i);
    if (betalingMatch) result.betalingskenmerk = betalingMatch[1];

    // ── Aanvrager ──
    const aanvragerMatch = fullText.match(/Aanvrager\s*:\s*(.+?)(?:\n|Datum|Tijd|$)/);
    if (aanvragerMatch) result.aanvrager = aanvragerMatch[1].trim();

    // ── Address from title / header ──
    // BDOK often has: "Locatie: Straat Huisnummer te Plaatsnaam"
    const locatiePatterns = [
        /[Ll]ocatie[:\s]+([A-Za-z][A-Za-zéèêëàáâùúûüïîíìöôóò\s\-\.\']+?)\s+(\d{1,5}[a-zA-Z]?)\s+te\s+([A-Za-z][A-Za-zéèêëàáâùúûüïîíìöôóò\s\-]+?)(?:\s*[\n,]|$)/,
        /[Aa]dres[:\s]+([A-Za-z][A-Za-zéèêëàáâùúûüïîíìöôóò\s\-\.\']+?)\s+(\d{1,5}[a-zA-Z]?)[,\s]+(\d{4}\s?[A-Z]{2}|[A-Za-z][A-Za-z\s\-]+?)(?:\s*[\n,]|$)/,
    ];
    for (const pat of locatiePatterns) {
        const m = fullText.match(pat);
        if (m) {
            result.straatnaam = m[1].trim();
            result.huisnummer = m[2].trim();
            result.plaatsnaam = m[3].trim();
            break;
        }
    }

    // De Synfra-bodemcheck ("Bodemcheck-Huisaansluitingen") heeft geen
    // "Locatie:"-label. De titelregel is: "Huisaansluitingen  <straat> <nr>
    // <netwerkplannummer>", zonder plaatsnaam. Die plaats halen we later uit het
    // RD-middelpunt hieronder.
    if (!result.straatnaam) {
        const m = fullText.match(
            /Huisaansluitingen\s+([A-Za-zÀ-ÿ'’\-\.]+(?:\s+[A-Za-zÀ-ÿ'’\-\.]+)*?)\s+(\d{1,5}[a-zA-Z]?)\s+(\d{8,})/
        );
        if (m) {
            result.straatnaam         = m[1].trim();
            result.huisnummer         = m[2].trim();
            result.netwerkplannummer  = m[3];
        }
    }

    // ── RD-middelpunt ──
    // Beide rapportvormen noemen "Middelpunt: X … Y … meter". Dat is het enige
    // houvast voor de plaats en de gemeente in een Synfra-bodemcheck, en het is een
    // betere bron dan een naam uit lopende tekst: de omgekeerde zoekopdracht van de
    // Locatieserver geeft er het exacte adres bij.
    const rdMatch = fullText.match(/Middelpunt\s*:?\s*X\s*(\d+(?:[,.]\d+)?)\s+Y\s*(\d+(?:[,.]\d+)?)/i);
    if (rdMatch) {
        result.rdX = parseFloat(rdMatch[1].replace(',', '.'));
        result.rdY = parseFloat(rdMatch[2].replace(',', '.'));
    }

    // ── Gemeente ──
    // BDOK PDFs rarely have "Gemeente: X" directly — try several patterns in order of reliability
    const gemeentePatterns = [
        // "gemeente Venloa" / "gemeente Nederweert" — most common in BDOK text
        /\bgemeente\s+([A-Z][A-Za-zéèêëàáâùúûüïîíìöôóò][A-Za-zéèêëàáâùúûüïîíìöôóò\s\-]{1,40}?)(?=[\s,;\.\n])/,
        // "te Plaatsnaam" from address line — fallback (plaatsnaam ≈ gemeente for small towns)
        /\bte\s+([A-Z][A-Za-zéèêëàáâùúûüïîíìöôóò][A-Za-zéèêëàáâùúûüïîíìöôóò\-]+(?:\s?-\s?[A-Za-z]+)?)\b/,
    ];
    for (const pat of gemeentePatterns) {
        const m = fullText.match(pat);
        if (m) {
            const name = m[1].trim();
            // Skip generic words that aren't actual municipality names
            // "Generieke" appears in BDOK as "Generieke achtergrondwaarden" — common false match
            const skip = /^(Bron|Naam|Locatie|Bevoegd|Gezag|Info|Data|Generieke|Achtergrondwaarden|Bijzondere|Normen|Waarden|Klasse|Functieklasse)$/i.test(name);
            if (!skip && name.length > 2 && name.length < 50) {
                result.gemeente = name;
                break;
            }
        }
    }

    // ── Ontgravingsdiepte ──
    // BDOK cover: "Ontgravingsdiepte: 100 cm" — pdfjs-dist may add spaces around colons/units
    // Try cm first (most common in BDOK), then direct metre value
    const ontgravingCm = fullText.match(/Ontgravingsdiepte\s*:\s*(\d+(?:[,\.]\d+)?)\s*cm/i);
    const ontgravingM  = fullText.match(/Ontgravingsdiepte\s*:\s*(\d+(?:[,\.]\d+)?)\s*m(?![\w])/i);
    if (ontgravingCm) {
        result.ontgravingsdiepte = (parseFloat(ontgravingCm[1]) / 100).toFixed(2);
    } else if (ontgravingM) {
        result.ontgravingsdiepte = parseFloat(ontgravingM[1].replace(',', '.')).toFixed(2);
    } else {
        const mMatch = fullText.match(/(?:graafdiepte|maximale\s+ontgravingsdiepte)\s*[^\d]*(\d+(?:[,\.]\d+)?)\s*m(?:-mv)?/i);
        if (mMatch) result.ontgravingsdiepte = parseFloat(mMatch[1].replace(',', '.')).toFixed(2);
    }

    // ── Sleuflengte ──
    // BDOK cover line: "lengte: 2 m" — 0 means point location (not a tracé), skip those
    const sleufCoverMatch = fullText.match(/\blengte\s*:\s*(\d+(?:[,\.]\d+)?)\s*m\b/i);
    if (sleufCoverMatch) {
        const len = parseFloat(sleufCoverMatch[1].replace(',', '.'));
        if (len > 0) result.sleuflengte = String(len);
    }
    if (!result.sleuflengte) {
        const sleufAlt = fullText.match(/(?:sleuflengte|trac[eé]lengte)\s*[^\d]*(\d+(?:[,\.]\d+)?)\s*m(?:eter)?\b/i);
        if (sleufAlt) result.sleuflengte = String(parseFloat(sleufAlt[1].replace(',', '.')));
    }

    // ── >25 m³ ──
    // BDOK cover: ">25 m³: Nee" — pdfjs-dist may split as "> 25 m 3 : Nee"
    // Allow optional spaces between every component
    const m3CoverMatch = fullText.match(/>\s*25\s*m\s*[³3]?\s*:\s*(Ja|Nee)/i);
    // De Synfra-bodemcheck schrijft er een dubbele punt achter het vraagteken:
    // "Graafactiviteit meer dan 25 m3?: Nee". Zonder die `:?` raakte dit niets en
    // bleef het antwoord leeg.
    const m3TableMatch = fullText.match(/Graafactiviteit meer dan\s+25\s*m\s*[³3]?\s*\?\s*:?\s*(Ja|Nee)/i);
    if (m3CoverMatch) {
        result.isGroterDan25m3 = m3CoverMatch[1].toLowerCase() === 'ja';
    } else if (m3TableMatch) {
        result.isGroterDan25m3 = m3TableMatch[1].toLowerCase() === 'ja';
    }

    // ── Bemaling — derived from "Contact met grondwater" question ──
    // pdfjs-dist row-order: question and answer on same line → "...werkzaamheden? Nee"
    const gwContactInline = fullText.match(/Contact met grondwater verwacht[^?]*\?\s*(Ja|Nee)/i);
    if (gwContactInline) {
        const isJa = gwContactInline[1].toLowerCase() === 'ja';
        result.bemaling = isJa ? 'Ter plaatse beoordelen' : 'Nee';
    } else {
        // Fallback: column-separated table — first value after "Ja/Nee" header
        const jaNeeSectionMatch = fullText.match(/Ja\s*\/\s*Nee\s+((?:(?:Ja|Nee)\s*)+)/i);
        if (jaNeeSectionMatch) {
            const firstVal = jaNeeSectionMatch[1].trim().split(/\s+/)[0];
            if (firstVal) result.bemaling = firstVal.toLowerCase() === 'ja' ? 'Ter plaatse beoordelen' : 'Nee';
        }
    }

    // ── Grondwaterstand (GWS) from paragraph 2.1 / grondwaterstandenkaart ──
    // De grondwaterstandenkaart geeft de waarde achter een label (DN/GHG/GLG), in
    // twee vormen: als bereik ("DN 2,5 - 4,5 m-mv") of als ondergrens
    // ("DN > 4.5 m- mv"). Bij een bereik nemen we de kleinste (ondiepste) waarde,
    // want dat is de voorzichtige aanname voor bemaling.
    //
    // Twee dingen waar dit eerder op stukliep, allebei in dezelfde quickscan:
    //  - het teken. "DN > 4.5" matchte nergens op, waarna de stand leeg bleef en
    //    §2.9 van de rapportage stilzwijgend de sjabloonzin hield ("bevindt zich op
    //    meer dan 0,25 m-mv onder de ontgravingsdiepte", zónder de diepte erin).
    //    Het teken blijft nu staan: de rapportage schrijft ">4,5 m-mv".
    //  - de spatie in "m- mv". pdfjs plakt tekstfragmenten met een spatie aan
    //    elkaar, dus hoe "m-mv" eruitkomt hangt af van de opmaak in de PDF.
    //    Alle patronen laten daarom witruimte toe rond het streepje.
    const mmv = String.raw`m\s*-?\s*mv`;
    const teken = String.raw`([<>]?)\s*`;
    const getalRe = String.raw`(\d+(?:[,\.]\d+)?)`;
    const gwsPatterns = [
        // Achter het label: "DN > 4.5 m- mv" of "DN 2,5 - 4,5 m-mv"
        new RegExp(String.raw`\b(?:DN|GHG|GLG)\s*[:\s]*${teken}${getalRe}(?:\s*[-–]\s*\d+(?:[,\.]\d+)?)?\s*${mmv}`, 'i'),
        // Losse waarde in de buurt van een grondwater-trefwoord
        new RegExp(String.raw`(?:grondwater(?:stand)?|GHG|gws)[^.]*?(?:circa\s+)?${teken}${getalRe}\s*${mmv}`, 'i'),
        // Terugval: context van paragraaf 2.1
        new RegExp(String.raw`(?:2\.1[^.]{0,300})(?:circa\s+)?${teken}${getalRe}\s*(?:m[-\s]?\+NAP|${mmv})`, 'is'),
    ];
    for (const pat of gwsPatterns) {
        const m = fullText.match(pat);
        if (m) {
            const val = parseFloat(m[2].replace(',', '.'));
            // Sanity check: GWS should be between 0.1 and 15 m-mv
            if (!isNaN(val) && val >= 0.1 && val <= 15) {
                result.grondwaterstand = m[1] + val.toFixed(1);
                break;
            }
        }
    }

    // ── §1.7 Bodembedreigende activiteiten (HBB en tanks) ──
    // De quickscan heeft hier twee eigen paragrafen voor:
    //   1.7.1 Activiteiten uit Historisch bodembestand
    //   1.7.2 Activiteiten uit het Tankbestand
    // Dat is dezelfde soort informatie als de bodemrapportage voor §2.5 levert, dus
    // zonder bodemrapportage kan de tabel hiermee gevuld worden.
    //
    // Zijn beide paragrafen leeg, dan zégt de quickscan dat ("Binnen de selectie
    // zijn geen digitale gegevens beschikbaar of (nog) niet ingevoerd") — en dat is
    // iets anders dan "er is niet gekeken". Alleen in dat eerste geval mag §2.5
    // "Geen verdachte activiteiten gevonden" schrijven, dus dat onderscheid houden
    // we vast in `activiteitenBekend`.
    {
        const LEEG = /Binnen\s+de\s+selectie\s+zijn\s+geen\s+digitale\s+gegevens/i;

        // Elke kop staat twee keer in de tekst: één keer in de inhoudsopgave en één
        // keer boven de paragraaf zelf. De eerste treffer is dus de inhoudsopgave —
        // en die bevat de "geen gegevens"-zin niet, waardoor het leek alsof er wél
        // activiteiten stonden. Inhoudsopgaveregels lopen door in een stippellijn
        // naar een paginanummer; daarop slaan we ze over.
        const kopIndex = (patroon) => {
            const re = new RegExp(patroon.source, 'gi');
            let m;
            while ((m = re.exec(fullText)) !== null) {
                const na = fullText.slice(m.index + m[0].length, m.index + m[0].length + 12);
                if (/\.{4,}/.test(na)) continue;
                return m.index;
            }
            return -1;
        };
        const blok = (vanaf, tot) => {
            const i = kopIndex(vanaf);
            if (i === -1) return null;
            const j = kopIndex(tot);
            return j > i ? fullText.slice(i, j) : fullText.slice(i);
        };
        const hbb  = blok(/Activiteiten\s+uit\s+Historisch\s+bodembestand/,
                          /Activiteiten\s+uit\s+het\s+Tankbestand/);
        const tank = blok(/Activiteiten\s+uit\s+het\s+Tankbestand/,
                          /Asbestverdachte\s+onderzochte\s+activiteit/);

        if (hbb || tank) {
            const blokken = [hbb, tank].filter(Boolean);
            const onbegrepen = [];
            let bekend = true;
            for (const b of blokken) {
                if (LEEG.test(b)) continue;          // paragraaf meldt zelf: niets aanwezig
                const rijen = leesActiviteitenMetCode(b);
                if (rijen.length) result.verdachteActiviteiten.onderzoekslocatie.push(...rijen);
                else { bekend = false; onbegrepen.push(b); }
            }
            result.activiteitenBekend = bekend;
            if (onbegrepen.length) {
                // Er staat iets, maar er zit geen "(code)" in — dan kennen we deze
                // opmaak nog niet. Liever hardop melden dan er een halve tabel van
                // maken; met de ruwe tekst erbij is het uit te breiden.
                console.warn(
                    '[quickscan] §1.7 bevat gegevens in een opmaak die nog niet gelezen wordt. '
                    + 'Ruwe tekst:\n' + onbegrepen.map(b => b.slice(0, 1500)).join('\n---\n')
                );
            }
        }
    }

    // ── Bodemkwaliteitsklasse — BDOK §2.2, kolom "Generieke klasse" ──
    // De tabel bevat per laag een specifieke en een generieke klasse:
    //   Bovengrond specifieke klasse gemeente | Generieke klasse | Achtergrondwaarde
    //   Ondergrond specifieke klasse gemeente | Generieke klasse | Achtergrondwaarde
    // Eerste treffer = bovengrond, tweede = ondergrond.
    // Nooit de hele tekst afzoeken op klassenamen: de kaartlegenda op diezelfde
    // pagina noemt álle klassen ("Wonen", "Industrie", ...) en wint dan altijd.
    const generiek = [...fullText.matchAll(
        new RegExp(`Generieke\\s+klasse\\s+(${BKK_KLASSEN})`, 'gi')
    )].map(m => normaliseerKlasse(m[1]));
    result.bodemklasseBoven = generiek[0] || '';
    result.bodemklasseOnder = generiek[1] || generiek[0] || '';
    result.bodemtype        = result.bodemklasseBoven;

    // ── Type verharding ──
    const verhardingMatch = fullText.match(/(?:type\s+verharding|verhardingstype)[:\s]+([^\n,]{3,50})/i);
    if (verhardingMatch) result.typeVerharding = verhardingMatch[1].trim();

    // ── Derived / calculated fields ──
    if (result.ontgravingsdiepte) {
        const depth = parseFloat(result.ontgravingsdiepte);
        if (!isNaN(depth)) {
            result.boringDiepte = (depth + 0.2).toFixed(1);
        }
    }

    if (result.sleuflengte) {
        const len = parseFloat(result.sleuflengte);
        if (!isNaN(len)) {
            if (len < 5) result.aantalBoringen = '1';
            else if (len <= 75) result.aantalBoringen = '2';
            else result.aantalBoringen = String(Math.max(3, Math.ceil(len / 50)));
        }
    }

    if (result.grondwaterstand && result.ontgravingsdiepte) {
        const gws = parseFloat(result.grondwaterstand);
        const diepte = parseFloat(result.ontgravingsdiepte);
        if (!isNaN(gws) && !isNaN(diepte)) {
            const diff = gws - diepte;
            if (diff <= 0) result.bemaling = 'Ja';
            else if (diff <= 0.25) result.bemaling = 'Ter plaatse beoordelen';
            else result.bemaling = 'Nee';
        }
    }

    return result;
}

// ── Verdachte (verontreinigende) activiteiten uit de bodemrapportage ─────────
// De rapportage toont per bodemlocatie een tabel met de kopregel:
//   Activiteit | Start | Einde | Vervallen | Benoemd | Verontreinigd | Spoed |
//   Voldoende onderzocht
// waarna elke rij bestaat uit een omschrijving, twee jaartallen en vijf
// ja/nee-kolommen, bijv:  "brandweerkazerne 1991 onbekend Nee Nee Nee onbekend Nee"
//
// De rapportage kent géén UBI-codekolom, alleen de UBI-omschrijving — maar die
// komt letterlijk uit de UBI-lijst, dus de code zoeken we op in ubiCodes.js.
//
// Een omschrijving die over meerdere regels loopt wordt correct samengevoegd (de
// PDF tekent de hele cel achter elkaar). Breekt hij over een páginagrens, dan
// belandt de staart elders in de tekststroom; volledigeUbiOmschrijving() plakt
// hem weer aan de hand van de UBI-lijst.
const ACT_KOPREGEL =
    /Activiteit\s+Start\s+Einde\s+Vervallen\s+Benoemd\s+Verontreinigd\s+Spoed\s+Voldoende\s+onderzocht/gi;
// Waar een activiteitentabel ophoudt — de eerstvolgende kop in de rapportage
const ACT_EINDE =
    /Matrix|Geconstateerde\s+verontreinigingen|Besluiten|Sanering|Overige\s+beschikbare|Gegevens\s+binnen|Disclaimer|Locatienaam/i;
const ACT_JAAR   = '(?:\\d{4}|onbekend)';
const ACT_JANEE  = '(?:Ja|Nee|onbekend|n\\.v\\.t\\.)';
const ACT_RIJ = new RegExp(
    `([A-Za-zÀ-ÿ0-9][^\\n]*?)\\s+(${ACT_JAAR})\\s+(${ACT_JAAR})` +
    `\\s+${ACT_JANEE}\\s+${ACT_JANEE}\\s+${ACT_JANEE}\\s+${ACT_JANEE}\\s+${ACT_JANEE}`,
    'gi'
);

/**
 * Haal alle activiteitenrijen uit één gebiedsdeel van de rapportage.
 * Elke rij wordt gekoppeld aan het adres van de bodemlocatie waar hij onder valt
 * (het "Adres <x> Woonplaats"-veld dat vlak boven de tabel staat).
 */
function parseActiviteiten(segment) {
    const rijen = [];
    ACT_KOPREGEL.lastIndex = 0;
    let kop;
    while ((kop = ACT_KOPREGEL.exec(segment)) !== null) {
        // Adres van de dichtstbijzijnde locatie vóór deze tabel
        let locatie = '';
        const adressen = [...segment.slice(0, kop.index).matchAll(/Adres\s+(.+?)\s+Woonplaats/gi)];
        if (adressen.length) locatie = adressen[adressen.length - 1][1].trim();

        // Alleen tot aan de eerstvolgende kop lezen
        const rest = segment.slice(kop.index + kop[0].length);
        const stop = rest.search(ACT_EINDE);
        const blok = stop === -1 ? rest : rest.slice(0, stop);

        ACT_RIJ.lastIndex = 0;
        let rij;
        while ((rij = ACT_RIJ.exec(blok)) !== null) {
            const ruw = rij[1].replace(/\s+/g, ' ').trim();
            if (!ruw) continue;
            // Namen die door een paginawissel zijn afgekapt weer heel maken,
            // daarna de UBI-code erbij zoeken (die staat niet in de rapportage).
            const activiteit = volledigeUbiOmschrijving(ruw, segment);
            // Start en Einde worden overgenomen zoals ze in de rapportage staan,
            // dus ook een letterlijk "onbekend" — dat is informatie, geen lege cel.
            rijen.push({
                locatie,
                activiteit,
                ubiCode: zoekUbiCode(activiteit),
                jaartalBegin: rij[2],
                jaartalEind:  rij[3],
            });
        }
    }
    return rijen;
}

/**
 * Parse bodemrapportage PDF and extract soil investigation info
 */
export async function parseBodemrapportage(file, onProgress) {
    if (onProgress) onProgress('Bodemrapportage laden...');
    const { fullText } = await extractPdfText(file, (i, n) => {
        if (onProgress) onProgress(`Pagina ${i}/${n} lezen...`);
    });

    const result = {
        rapportNummer: '',
        rapportDatum: '',
        onderzoeksbureau: '',
        locatieNaam: '',
        gemeente: '',
        soortOnderzoek: '',
        conclusie: '',
        // { onderzoekslocatie: [...], omgeving: [...] } — §2.5 van de rapportage
        verdachteActiviteiten: { onderzoekslocatie: [], omgeving: [] },
        _fullText: fullText,
    };

    // ── Verdachte activiteiten, gesplitst naar gebied ──
    // "Gegevens binnen het geselecteerde gebied"            → onderzoekslocatie
    // "Gegevens binnen de 25.00-meter contour rond ..."     → omgeving (<25 m)
    {
        const iSel  = fullText.search(/Gegevens\s+binnen\s+het\s+geselecteerde\s+gebied/i);
        const iBuf  = fullText.search(/Gegevens\s+binnen\s+de\s+[\d.,]+\s*-?\s*meter\s+contour/i);
        const iEnd  = fullText.search(/\bDisclaimer\b/i);
        const einde = (a) => {
            const kandidaten = [iBuf, iEnd].filter(i => i > a);
            return kandidaten.length ? Math.min(...kandidaten) : fullText.length;
        };
        if (iSel !== -1) {
            result.verdachteActiviteiten.onderzoekslocatie =
                parseActiviteiten(fullText.slice(iSel, einde(iSel)));
        }
        if (iBuf !== -1) {
            result.verdachteActiviteiten.omgeving =
                parseActiviteiten(fullText.slice(iBuf, iEnd > iBuf ? iEnd : fullText.length));
        }

        // De rapportage noemt geen UBI-code, alleen de omschrijving; die wordt
        // opgezocht in ubiCodes.js. Staat een omschrijving daar niet in, dan blijft
        // de cel in §2.5 leeg zonder dat iemand het merkt. Noem ze daarom bij naam,
        // want dan is meteen duidelijk wélke regel in de UBI-lijst ontbreekt of
        // anders geschreven is.
        const alle = [
            ...result.verdachteActiviteiten.onderzoekslocatie,
            ...result.verdachteActiviteiten.omgeving,
        ];
        result.zonderUbiCode = alle.filter(a => !a.ubiCode).map(a => a.activiteit);
        if (result.zonderUbiCode.length) {
            console.warn(
                `[bodemrapportage] ${result.zonderUbiCode.length} activiteit(en) zonder UBI-code `
                + `— de omschrijving staat niet in de UBI-lijst:\n  • `
                + result.zonderUbiCode.join('\n  • ')
            );
        }
    }

    // Rapportnummer
    const rapportMatch = fullText.match(/(?:rapport(?:nummer)?|kenmerk)[:\s]+([A-Z0-9\-\.]{4,30})/i);
    if (rapportMatch) result.rapportNummer = rapportMatch[1].trim();

    // Datum
    const datumMatch = fullText.match(/(?:rapport)?datum[:\s]+(\d{1,2}[-\s]\w+[-\s]\d{4}|\d{2}-\d{2}-\d{4}|\d{1,2}\s+\w+\s+\d{4})/i);
    if (datumMatch) result.rapportDatum = datumMatch[1].trim();

    // Onderzoeksbureau
    const bureauMatch = fullText.match(/(?:uitgevoerd\s+door|opgesteld\s+door|onderzoeksbureau)[:\s]+([A-Za-z][A-Za-z\s&\-\.]{2,50})/i);
    if (bureauMatch) result.onderzoeksbureau = bureauMatch[1].trim();

    // Soort onderzoek
    if (/verkennend\s+bodemonderzoek/i.test(fullText)) result.soortOnderzoek = 'Verkennend bodemonderzoek';
    else if (/historisch\s+onderzoek/i.test(fullText)) result.soortOnderzoek = 'Historisch onderzoek';
    else if (/nader\s+onderzoek/i.test(fullText)) result.soortOnderzoek = 'Nader bodemonderzoek';

    // Conclusie
    if (/geen\s+(?:ernstige\s+)?verontreiniging/i.test(fullText)) result.conclusie = 'Geen (ernstige) verontreiniging';
    else if (/licht\s+verontreinigd/i.test(fullText)) result.conclusie = 'Licht verontreinigd';
    else if (/sterk\s+verontreinigd/i.test(fullText)) result.conclusie = 'Sterk verontreinigd';

    return result;
}

/**
 * Render the first page of a PDF file to a JPEG blob.
 * Used to convert a tekening PDF into an embeddable image.
 * Returns { blob, widthPx, heightPx }
 */
export async function renderPdfPageToJpeg(file, scaleFactor = 2) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: scaleFactor });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    await page.render({ canvasContext: ctx, viewport }).promise;

    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => {
                if (blob) resolve({ blob, widthPx: canvas.width, heightPx: canvas.height });
                else reject(new Error('Canvas toBlob failed'));
            },
            'image/jpeg',
            0.92,
        );
    });
}
