/**
 * Aelmans docx template filler — pure text-based replacement.
 *
 * Targets known placeholder strings directly in the Word XML.
 * Works on any template version regardless of whether Word comments are present.
 *
 * Placeholder → replacement:
 *  naam achter "Opsteller"                    → opsteller (medewerker, uit het formulier)
 *  naam achter contactpersoon/collegiale toets → "Dhr. R.D.T. Houben"
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
 *  "Opsteller rapportage"                     → "Opsteller"
 *  §2.4 slotzin                               → + verwijzing naar samenvatting
 *  §2.5 tabel Verdachte activiteiten          → gevuld uit de bodemrapportage; de
 *                                               tabel blijft altijd staan
 *  §2.6 en §2.7                               → onaangeroerd; sjabloontekst blijft
 *  "XXX" (kerkdorp, "circa XXX m +NAP")     → blijft staan; handwerk controleur
 *  Revision table                             → remove; keep "Niet van toepassing."
 *  Gele/cyaan GWO-alinea in §2.9             → blijft ongemoeid, net als de gele
 *                                               markering in het hele document
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
 * Build a floating <w:drawing> with wrapping "achter tekst" (`behindDoc="1"` plus
 * `wrapNone`) — de tekening ligt dan onder de tekst en duwt niets weg.
 *
 * `vanaf` en `vAlign` bepalen waar hij hangt: standaard gecentreerd op de pagina
 * (de tekening vult dan zijn eigen bijlagepagina), of `vanaf: 'margin'` met
 * `vAlign: 'top'` om hem bovenaan het tekstgebied te zetten, zodat de pijl, de
 * noordpijl en de bronregel eronder zichtbaar blijven.
 */
function anchoredDrawingXml(rId, cxEmu, cyEmu, id = 99, name = 'Tekening',
                            { vanaf = 'page', vAlign = 'center', hAlign = 'center' } = {}) {
    const A  = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const WP = 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing';
    const PIC = 'http://schemas.openxmlformats.org/drawingml/2006/picture';
    const R  = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    return `<w:drawing><wp:anchor xmlns:wp="${WP}" distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="251658240" behindDoc="1" locked="0" layoutInCell="1" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="${vanaf}"><wp:align>${hAlign}</wp:align></wp:positionH><wp:positionV relativeFrom="${vanaf}"><wp:align>${vAlign}</wp:align></wp:positionV><wp:extent cx="${cxEmu}" cy="${cyEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${A}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${A}"><a:graphicData uri="${PIC}"><pic:pic xmlns:pic="${PIC}"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="${R}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cxEmu}" cy="${cyEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:anchor></w:drawing>`;
}

/** Build the <w:drawing> inline image XML for embedding in a paragraph */
function inlineDrawingXml(rId, cxEmu, cyEmu, id = 99, name = 'Tekening') {
    return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${cxEmu}" cy="${cyEmu}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${id}" name="${name}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cxEmu}" cy="${cyEmu}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

export async function fillAelmansTemplate(templateFile, values) {
    const arrayBuffer = await templateFile.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    let xml = await zip.file('word/document.xml').async('string');

    // ── Missercontrole ────────────────────────────────────────────────────
    // Een vervanging die niets raakt geeft gewoon de originele tekst terug, zonder
    // fout. Daardoor zijn hier meerdere fouten maandenlang onopgemerkt gebleven:
    // een spatie in `<w:highlight … />` die het patroon niet verwachtte, een
    // w:commentRangeStart die bij een hersave verdween, een vast projectnummer dat
    // in een nieuw sjabloon niet meer voorkwam. Steeds bleef er stilzwijgend een
    // placeholder of een verkeerde waarde in de rapportage staan.
    //
    // `verwacht()` legt vast dat een vervanging geraakt moet hebben. Aan het eind
    // volgt één waarschuwing met alles wat niet raakte, zodat een sjabloonwijziging
    // zich meteen meldt in plaats van pas bij de controle van het eindresultaat.
    const missers = [];
    const verwacht = (naam, gelukt) => {
        if (!gelukt) missers.push(naam);
        return gelukt;
    };
    /** Voerde deze bewerking daadwerkelijk een wijziging door? */
    const veranderde = (naam, voor) => verwacht(naam, voor !== xml);

    /** repT, maar meldt het als het patroon nergens raakte */
    const repTv = (naam, exact, vervanging) => {
        const voor = xml;
        xml = repT(xml, exact, vervanging);
        veranderde(naam, voor);
    };

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

    /**
     * Vul een waarde in achter een vast label in het sjabloon.
     *
     * Bedoeld voor velden waar het sjabloon de gegevens van zijn vorige casus
     * meedraagt (namen, projectnummers): het label ligt vast, de waarde niet.
     * Zoekt de run die exact het label bevat en vervangt de eerstvolgende run
     * met echte inhoud — tussenliggende scheidingstekens (":") en lege runs
     * worden overgeslagen. Geeft terug of het gelukt is.
     */
    const vulWaardeAchterLabel = (label, waarde) => {
        const idx = xml.indexOf(`>${label}</w:t>`);
        if (idx === -1) return false;
        // Vanaf het einde van de label-run verder zoeken; de partiële run waarin
        // het label staat kan het patroon hieronder niet meer matchen. Niet verder
        // kijken dan de tabelrij van het label: in het Haelen-sjabloon was de naam
        // achter "Contactpersoon Aelmans Milieu" als bijgehouden wijziging
        // weggehaald (<w:delText>, dus geen <w:t>), waardoor de zoektocht doorliep
        // naar de rij eronder. Alleen een ruwe tekenlimiet hield hem daar tegen —
        // de rijgrens zegt wat we bedoelen en kan een label niet raken.
        const rijEind = xml.indexOf('</w:tr>', idx);
        const staart  = xml.slice(idx, rijEind === -1 ? idx + 4000 : rijEind);
        const re = /<w:t([^>]*)>([^<]*)<\/w:t>/g;
        let m;
        while ((m = re.exec(staart)) !== null) {
            const inhoud = m[2].trim();
            if (!inhoud || /^[:;\-–—.]+$/.test(inhoud)) continue;
            const abs = idx + m.index;
            // De oude waarde kan over meerdere runs verdeeld staan — Word knipt een
            // woord op zodra er ooit iets in bewerkt is, bijvoorbeeld "K" | "linkers".
            // Alleen de eerste run vervangen laat de rest staan, en dan kwam er
            // "Klinkers / Asfalt / Tegels / Onverhard" + "linkers" in de rapportage.
            // Daarom maken we de overige runs van dezelfde alinea leeg.
            const pEindAbs = xml.indexOf('</w:p>', abs);
            const restEind = pEindAbs === -1 ? abs + m[0].length : pEindAbs;
            xml = xml.slice(0, abs)
                + `<w:t${m[1]}>${xmlEsc(waarde)}</w:t>`
                + xml.slice(abs + m[0].length, restEind)
                    .replace(/<w:t([^>]*)>[^<]*<\/w:t>/g, '<w:t$1></w:t>')
                + xml.slice(restEind);
            return true;
        }
        // Geen invulbare run in de rij: de waardecel is leeg, of bevat alleen een
        // bijgehouden verwijdering. Zet er dan zelf een run in, aan het eind van
        // de laatste alinea van de rij — dat is de waardecel.
        const pEind = staart.lastIndexOf('</w:p>');
        if (pEind === -1) return false;
        const abs = idx + pEind;
        xml = xml.slice(0, abs)
            + `<w:r><w:t xml:space="preserve">${xmlEsc(waarde)}</w:t></w:r>`
            + xml.slice(abs);
        return true;
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
        opsteller = '',
        uitvoerder = '',
        amvNummer = '',
        verdachteActiviteiten = null,
        stromingsrichting = '',
        bodembeschermingsgebied = '',
        bouwjaar = '',
        bagZoekterm = '',
        bagPandId = '',
        hasBodemrapportage = false,
        tekening = null,
        topoImages = null,
    } = values;

    // ── §2.6 en §2.7 blijven zoals het sjabloon ze aanlevert ──────────────
    // De bodemkwaliteits-/bodemfunctiekaart (§2.6) en de PFAS-bodemkwaliteitskaart
    // (§2.7) vult de adviseur zelf. Wat de tool daar eerder deed — de klasse uit de
    // BDOK invullen, "(zie BDOK)" weghalen, de kop hernoemen, de PFAS-referentie —
    // is eruit gehaald.
    //
    // Een blok code weghalen is niet genoeg: verschillende vervangingen zoeken door
    // het hele document (bijvoorbeeld op "gemeente") en lopen dan alsnog §2.6 of
    // §2.7 binnen. Daarom knippen we beide paragrafen er hier uit en zetten ze aan
    // het eind letterlijk terug.
    //
    // Grenzen: de Kop2-alinea die met "Bodemkwaliteit" begint tot en met de PFAS-kop
    // die erop volgt; de eerstvolgende Kop2 daarna (§2.8 Asbest) is het einde. Klopt
    // die volgorde niet, dan doen we niets en meldt de missercontrole het.
    const SENTINEL_2627 = '<w:p><w:r><w:t>@@AELMANS_2_6_2_7@@</w:t></w:r></w:p>';
    let bevroren2627 = null;
    {
        const koppen = [];
        const kopRe = /<w:pStyle w:val="Kop2"\s*\/>/g;
        let km;
        while ((km = kopRe.exec(xml)) !== null) {
            const pStart = Math.max(
                xml.lastIndexOf('<w:p>', km.index),
                xml.lastIndexOf('<w:p ', km.index)
            );
            koppen.push({ start: pStart, tekst: fragText(xml.slice(pStart, xml.indexOf('</w:p>', km.index))) });
        }
        const i26 = koppen.findIndex(k => /^Bodemkwaliteit/.test(k.tekst));
        const eind = i26 !== -1 && /PFAS/.test(koppen[i26 + 1]?.tekst || '')
            ? koppen[i26 + 2]?.start ?? -1
            : -1;
        if (verwacht('§2.6/§2.7 ongemoeid laten', eind !== -1)) {
            bevroren2627 = xml.slice(koppen[i26].start, eind);
            xml = xml.slice(0, koppen[i26].start) + SENTINEL_2627 + xml.slice(eind);
        }
    }

    const nl = (s) => String(s).replace('.', ',');
    /**
     * Het getal uit een ingevulde waarde, om mee te kunnen rekenen.
     * `parseFloat` alleen is hier niet genoeg: de invoer is Nederlands ("4,5" wordt
     * dan 4) en een grondwaterstand komt uit de quickscan ook als ">4,5" of "< 1,0"
     * — daar maakt parseFloat NaN van, waarna de vergelijkingen hieronder stilletjes
     * hun standaardtak namen.
     */
    const getal = (s) => parseFloat(String(s ?? '').replace(',', '.').replace(/^[^\d.]+/, ''));
    const sleufNL   = sleuflengte       ? nl(sleuflengte)       : '';
    const diepteNL  = ontgravingsdiepte ? nl(ontgravingsdiepte) : '';
    const gwsNL     = grondwaterstand   ? nl(grondwaterstand)   : '';

    const boringDiepte = ontgravingsdiepte
        ? nl((getal(ontgravingsdiepte) + 0.2).toFixed(1))
        : '1,0';

    const lenF = getal(sleuflengte);
    const aantalBoringen = !isNaN(lenF)
        ? (lenF < 5 ? '1' : lenF <= 75 ? '2' : String(Math.max(3, Math.ceil(lenF / 50))))
        : '';
    // Minimum 2 mengmonsters; 1 per 7 boringen
    const boringenInt = parseInt(aantalBoringen) || 2;
    const aantalMengmonsters = String(Math.max(2, Math.ceil(boringenInt / 7)));

    // ── Titelblad: "Opsteller rapportage" → "Opsteller" ───────────────────
    // Moet vóór het invullen van de namen, want daar wordt "Opsteller" als label
    // gebruikt om de waarde erachter te vinden.
    repTv("titelblad: Opsteller", "Opsteller rapportage", "Opsteller");

    // ── Contactpersoon / opsteller / collegiale toets ──────────────────────
    // Het sjabloon is een opgeslagen casus en draagt dus de naam van de vórige
    // opsteller mee — Bladel had "M. Buss", Haelen "E. Heijdra". Zoeken op een
    // vaste naam faalt daarom bij elk nieuw sjabloon (in de Haelen-rapportage
    // bleef de verkeerde naam 3× staan). We zoeken op het label ernaast, want dat
    // ligt vast, en vervangen de waarde erachter.
    //
    // De opsteller is de medewerker die het rapport schrijft en komt dus uit het
    // formulier — nooit een naam die hier vastligt, want dan staat er bij een lege
    // invoer stilzwijgend iemand anders onder het rapport. Blijft het veld leeg, dan
    // laten we de cel leeg en meldt de missercontrole het. De collegiale toets en de
    // contactpersoonvelden blijven wél Dhr. R.D.T. Houben.
    const HOUBEN = 'Dhr. R.D.T. Houben';
    verwacht('opsteller ingevuld in het formulier', !!opsteller);
    for (const [label, naam] of [
        ['Contactpersoon Aelmans Milieu', HOUBEN],      // titelblad
        ['Opsteller',                     opsteller],   // titelblad
        ['Collegiale toets',              HOUBEN],      // titelblad
        ['Contactpersoon Aelmans',        HOUBEN],      // samenvattingstabel
    ]) {
        verwacht(`naam bij "${label}"`, vulWaardeAchterLabel(label, naam));
    }

    // ── Samenvatting: keuzelijsten terugzetten ────────────────────────────
    // Ook hier draagt het sjabloon de ingevulde antwoorden van zijn vorige casus
    // mee (Bladel "Klinkers", "N.v.t."). Dat leest als een antwoord terwijl het
    // er geen is, dus zetten we de keuzelijst terug zodat de adviseur zelf kiest.
    verwacht('samenvatting: Type verharding',
        vulWaardeAchterLabel('Type verharding', 'Klinkers / Asfalt / Tegels / Onverhard'));
    // Type materiaal i.v.m. VOS is geen keuze maar een vast antwoord.
    verwacht('samenvatting: Type materiaal i.v.m. VOS',
        vulWaardeAchterLabel('Type materiaal i.v.m. VOS', 'Geen beperkingen'));

    // ── §2.4 Bekende bodemonderzoeken: verwijzing naar de samenvatting ────
    xml = repT(
        xml,
        'bodemonderzoeken plaatsgevonden, die voor onderhavig onderzoek relevant zijn\\.',
        'bodemonderzoeken plaatsgevonden, die voor onderhavig onderzoek relevant zijn. ' +
        'In onderstaande paragraaf is een summiere samenvatting van deze onderzoeken opgenomen.'
    );

    // ── §2.2 Bouwjaar bebouwing en de koppeling naar de BAG-viewer ─────────
    // Het sjabloon heeft deze zin zélf al, achter de Topotijdreis-alinea:
    //   "De huidige bebouwing is in XXXX gerealiseerd (BAG-viewer). Er zijn geen
    //    aanwijzingen voor bouw en sloop in de asbestverdachte periode."
    // met "XXXX" als plaatshouder voor het bouwjaar, en "(BAG-viewer)" als een
    // veldkoppeling (fldChar + instrText HYPERLINK). Alleen die twee hoeven dus
    // ingevuld te worden.
    //
    // Dit ging eerder mis omdat de zin hier werd ingevóegd als eigen alinea vóór
    // "Hieronder is een overzicht" — die kwam dus naast de zin die het sjabloon al
    // had, met een leeg gebleven XXXX ernaast. Die alinea gebruikte bovendien een
    // `w:hyperlink r:id=…`, wat een relatie in document.xml.rels vereist; klopt die
    // niet, dan meldt Word het bestand als beschadigd en gooit de koppeling weg.
    // Een veldkoppeling heeft geen relatie nodig en kan dus niet op die manier
    // stukgaan.
    //
    // De koppeling wijst naar het pand zelf (`objectId=<pandidentificatie>`, uit
    // dezelfde BAG-bevraging als het bouwjaar). Zonder dat nummer valt hij terug op
    // een adreszoekopdracht.
    {
        const bagUrl = 'https://bagviewer.kadaster.nl/lvbag/bag-viewer/?'
            + (bagPandId
                ? `objectId=${encodeURIComponent(bagPandId)}`
                : `searchQuery=${encodeURIComponent(bagZoekterm || '')}`);

        // Een leeg bouwjaar blokkeerde eerder de hele alinea: zonder jaartal werd er
        // niets ingevoegd, dus ontbraken de zin én de koppeling naar de BAG-viewer.
        // Nu komt de zin er altijd, met "XXXX" als het jaartal onbekend is — dat is
        // zichtbaar handwerk in plaats van stilzwijgend niets. De melding hieronder
        // zegt waaróm het jaartal ontbreekt: de BAG-bevraging heeft niets opgeleverd,
        // meestal omdat de quickscan geen adres gaf om op te zoeken.
        verwacht('§2.2 bouwjaar bekend (anders blijft XXXX staan)', !!bouwjaar);

        // Toetsen op de zíchtbare tekst, niet op de ruwe XML: Word knipt een zin op
        // in losse runs zodra er ooit in bewerkt is, en dan staat er bijvoorbeeld
        // "De huidige bebouwing" | " is in" in het bestand. Een `includes()` op de
        // XML mist dat, en dan zou de zin er een tweede keer bij gezet worden.
        const zichtbareTekst = fragText(xml);
        // Voor het aanvullen van de asbestzin moeten we de alinea wél terugvinden in
        // de XML; daarvoor pakken we het langste stuk dat nog aaneengesloten staat.
        const ankerZin = ['De huidige bebouwing is in', 'De huidige bebouwing', 'huidige bebouwing']
            .find(a => xml.includes(a));

        if (zichtbareTekst.includes('De huidige bebouwing is in')) {
            if (bouwjaar) repTv('§2.2 bouwjaar invullen', 'XXXX', xmlEsc(bouwjaar));
            // Op het patroon toetsen en niet op "is de tekst veranderd": staat het
            // sjabloon toevallig al op het juiste pand, dan verandert er niets en is
            // dat gewoon goed.
            const koppeling = /(<w:instrText[^>]*>\s*HYPERLINK\s+")[^"]*(")/;
            verwacht('§2.2 BAG-viewer koppeling', koppeling.test(xml));
            xml = xml.replace(koppeling, `$1${xmlEsc(bagUrl)}$2`);

            // Niet elk sjabloon heeft de asbestzin achter de bouwjaarzin staan. Zit
            // hij niet in dezelfde alinea, dan zetten we hem er zelf achter — anders
            // ontbreekt hij stilzwijgend in de rapportage.
            const zinIdx = ankerZin ? xml.indexOf(ankerZin) : -1;
            const alineaEind = zinIdx === -1 ? -1 : xml.indexOf('</w:p>', zinIdx);
            verwacht('§2.2 alinea van de bouwjaarzin gevonden', alineaEind !== -1);
            const alinea = alineaEind === -1 ? '' : xml.slice(zinIdx, alineaEind);
            if (alineaEind !== -1 && !alinea.includes('asbestverdachte periode')) {
                xml = xml.slice(0, alineaEind)
                    + '<w:r><w:t xml:space="preserve"> Er zijn geen aanwijzingen voor '
                    + 'bouw en sloop in de asbestverdachte periode.</w:t></w:r>'
                    + xml.slice(alineaEind);
            }
        } else {
            // Sjabloon zonder de zin: er zelf een alinea bij zetten, met dezelfde
            // opbouw als het nieuwe sjabloon gebruikt.
            const anker = xml.indexOf('Hieronder is een overzicht');
            const pStart = anker === -1 ? -1 : Math.max(
                xml.lastIndexOf('<w:p>', anker),
                xml.lastIndexOf('<w:p ', anker)
            );
            if (verwacht('§2.2 plek voor de bouwjaarzin', pStart !== -1)) {
                const alinea =
                    '<w:p><w:r><w:t xml:space="preserve">De huidige bebouwing is in '
                    + `${xmlEsc(bouwjaar || 'XXXX')} gerealiseerd </w:t></w:r>`
                    + '<w:r><w:fldChar w:fldCharType="begin"/></w:r>'
                    + `<w:r><w:instrText xml:space="preserve">HYPERLINK "${xmlEsc(bagUrl)}" \\h</w:instrText></w:r>`
                    + '<w:r><w:fldChar w:fldCharType="separate"/></w:r>'
                    + '<w:r><w:rPr><w:color w:val="0000FF"/><w:u w:val="single"/></w:rPr>'
                    + '<w:t>(BAG-viewer)</w:t></w:r>'
                    + '<w:r><w:fldChar w:fldCharType="end"/></w:r>'
                    + '<w:r><w:t xml:space="preserve">. Er zijn geen aanwijzingen voor '
                    + 'bouw en sloop in de asbestverdachte periode.</w:t></w:r></w:p>';
                xml = xml.slice(0, pStart) + alinea + xml.slice(pStart);
            }
        }
    }

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
    // §2.1 "circa XXX meter lang" → sleuflengte. Er staan meer XXX-runs in het
    // sjabloon — even verderop in dezelfde alinea "ten westen van het kerkdorp XXX",
    // en in §2.9 "een stijghoogte bereikt van circa XXX m +NAP". Op "de eerste XXX"
    // mikken werkt daarom maar zolang die van de lengte er nog staat; draagt het
    // sjabloon de lengte van zijn vorige casus al ingevuld mee, dan belandt de
    // sleuflengte in de naam van het kerkdorp. Daarom eisen we dat er " meter lang"
    // achteraan komt.
    if (sleufNL) {
        // De lengte staat in de run vlak vóór " meter lang" — de lookahead op <w:t
        // houdt de match bij díe run en niet bij een eerdere in dezelfde alinea.
        // Alleen vervangen als er een plaatshouder of een getal in staat: het
        // sjabloon draagt de lengte van zijn vorige casus mee, dus daar moet wél
        // overheen, maar staat er iets heel anders dan is de zin anders opgebouwd en
        // gokken we niet.
        const lengteRun = /<w:t([^>]*)>([^<]*)<\/w:t>((?:(?!<w:t)(?!<\/w:p>)[\s\S])*?<w:t[^>]*> meter lang)/;
        const m = lengteRun.exec(xml);
        const bruikbaar = !!m && /^\s*(X{2,}|\d+(?:[.,]\d+)?)\s*$/.test(m[2]);
        if (verwacht('§2.1 sleuflengte (… meter lang)', bruikbaar)) {
            xml = xml.replace(lengteRun, `<w:t$1>${xmlEsc(sleufNL)}</w:t>$3`);
        }
    }

    // De overige XXX-plaatshouders blijven staan. "circa XXX m +NAP" vraagt om de
    // stijghoogte in m +NAP en niet om de grondwaterstand in m-mv — dat zijn twee
    // verschillende getallen, en de stijghoogte heeft de tool niet. Het kerkdorp
    // weet hij ook niet. Allebei dus handwerk voor de controleur; ze eerder vullen
    // met de grondwaterstand zette er stilzwijgend een verkeerd getal neer.

    if (gwsNL) {
        xml = repT(xml, 'Circa 1,0 m-mv', `Circa ${gwsNL} m-mv`);
        // §2.9 grondwaterstandzin. Het sjabloon zegt standaard:
        //   "De grondwaterstand op de onderzoekslocatie bevindt zich op meer dan
        //    0,25 m -mv onder de ontgravingsdiepte."
        // Daar hoort de gemeten stand in, en meer/minder hangt af van hoe diep het
        // grondwater onder de ontgraving zit:
        //   "... bevindt zich op 2,5 m-mv, dit is op meer dan 0,25 m -mv onder ..."
        // "op meer dan 0,25 m" is in het sjabloon één run, dus die vervangen volstaat.
        // (Dit liep eerder via een w:commentRangeStart die bij het opnieuw opslaan van
        // de template is verdwenen — daardoor werd de stand nooit ingevuld.)
        const gws29  = getal(grondwaterstand);
        const diep29 = getal(ontgravingsdiepte);
        const grondwaterRuimOnderOntgraving =
            !isNaN(gws29) && !isNaN(diep29) ? gws29 - diep29 > 0.25 : true;
        repTv(
            '§2.9 grondwaterstandzin',
            'op meer dan 0,25 m',
            `op ${xmlEsc(gwsNL)} m-mv, dit is op ` +
            `${grondwaterRuimOnderOntgraving ? 'meer' : 'minder'} dan 0,25 m`
        );
        // Het sjabloon heeft tussen "0,25 m" en "-mv onder de ontgravingsdiepte" een
        // eigen run met alleen een spatie staan, wat "0,25 m -mv" oplevert. Die spatie
        // hoort er niet.
        xml = xml.replace(
            /<w:r(?:\s[^>]*)?>(?:<w:rPr>(?:(?!<\/w:r>)[\s\S])*?<\/w:rPr>)?<w:t[^>]*> <\/w:t><\/w:r>(?=(?:(?!<\/w:p>)[\s\S]){0,400}?<w:t[^>]*>-mv onder de ontgravingsdiepte)/,
            ''
        );
    } else {
        // Zonder grondwaterstand blijft §2.9 op de sjabloontekst staan, en die leest
        // als een afgerond antwoord ("bevindt zich op meer dan 0,25 m-mv onder de
        // ontgravingsdiepte") terwijl de gemeten diepte ontbreekt. Dat moet opvallen.
        verwacht('grondwaterstand ingevuld (§2.9 blijft anders op de sjabloontekst)', false);
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

        // "gemeente" (kleine letter) → "gemeente <plaats>", voor de bijlagenlijst.
        // Onvoorwaardelijk; Bijlage 3 wordt zonder bodemrapportage even verderop
        // toch in zijn geheel verwijderd. (De §2.6-zin had hier ook zo'n run, maar
        // die paragraaf blijft nu ongemoeid.)
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
    //
    // De tabel blijft er in alle gevallen staan, met de inleidende zin, het
    // bijschrift en de opmerkingenrijen ongemoeid. Alleen de datarijen wisselen:
    //  - activiteiten bekend  → per groep de gevonden rijen
    //  - niets gevonden       → één rij "Geen verdachte activiteiten gevonden" met
    //                           streepjes in de overige kolommen, zonder groepskoppen
    //  - geen bodemrapportage → lege datarijen; niets bekend is iets anders dan
    //                           niets gevonden, en de voorbeeldrijen van het
    //                           sjabloon ("Adres / Ondergrondse brandstoftank /
    //                           UBI631246") zijn verzonnen data die niet in een
    //                           rapportage thuishoren
    {
        const markIdx = xml.indexOf('Ubi code');
        if (markIdx === -1) {
            verwacht('§2.5 tabel gevonden', false);
        } else {
            const tblStart = Math.max(xml.lastIndexOf('<w:tbl>', markIdx), xml.lastIndexOf('<w:tbl ', markIdx));
            const tblEnd   = xml.indexOf('</w:tbl>', markIdx) + '</w:tbl>'.length;
            const tbl      = xml.slice(tblStart, tblEnd);
            const rows     = tbl.match(/<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g) || [];

            // Groepskoppen beslaan alle vijf kolommen; datarijen hebben vijf cellen
            const isGroep    = (r) => /<w:gridSpan w:val="5"\s*\/>/.test(r);
            const isKop      = (r) => /Ubi code/.test(fragText(r));
            const isData     = (r) => !isGroep(r) && !isKop(r)
                                      && (r.match(/<w:tc>/g) || []).length === 5;
            const iOnderzoek = rows.findIndex(r => isGroep(r) && /Onderzoekslocatie/.test(fragText(r)));
            const iOmgeving  = rows.findIndex(r => isGroep(r) && /Omgeving onderzoekslocatie/.test(fragText(r)));
            const iOpmerking = rows.findIndex(r => isGroep(r) && /Opmerkingen/.test(fragText(r)));

            // Sjabloonrij: bij voorkeur een lege datarij, anders de voorbeeldrij
            const dataRijen = rows.filter(isData);
            const sjabloon  = dataRijen.find(r => !fragText(r).trim()) || dataRijen[0];

            const opLocatie  = verdachteActiviteiten?.onderzoekslocatie || [];
            const inOmgeving = verdachteActiviteiten?.omgeving || [];

            let nieuweRijen = null;
            if (!verdachteActiviteiten) {
                nieuweRijen = rows.map((r, i) =>
                    isData(r) && (iOpmerking === -1 || i < iOpmerking)
                        ? fillRow(r, ['', '', '', '', ''])
                        : r
                ).join('');
            } else if (!opLocatie.length && !inOmgeving.length) {
                if (sjabloon && iOpmerking !== -1) {
                    nieuweRijen = [
                        ...rows.slice(0, iOnderzoek === -1 ? 1 : iOnderzoek),
                        fillRow(sjabloon, ['Geen verdachte activiteiten gevonden', '-', '-', '-', '-']),
                        ...rows.slice(iOpmerking),
                    ].join('');
                }
            } else if (iOnderzoek !== -1 && iOmgeving !== -1 && iOpmerking !== -1 && sjabloon) {
                // Een groep zonder activiteiten houdt één lege rij, zodat de
                // tabelindeling herkenbaar blijft.
                const bouw = (lijst) => (lijst.length ? lijst : [{}]).map(a => fillRow(sjabloon, [
                    a.locatie      || '',
                    a.activiteit   || '',
                    a.ubiCode      || '',
                    a.jaartalBegin || '',
                    a.jaartalEind  || '',
                ]));
                nieuweRijen = [
                    ...rows.slice(0, iOnderzoek + 1),
                    ...bouw(opLocatie),
                    rows[iOmgeving],
                    ...bouw(inOmgeving),
                    ...rows.slice(iOpmerking),
                ].join('');
            }

            if (nieuweRijen === null) {
                verwacht('§2.5 tabelindeling herkend', false);
            } else {
                const tblPrefix = tbl.slice(0, tbl.indexOf('<w:tr'));
                xml = xml.slice(0, tblStart) + tblPrefix + nieuweRijen + '</w:tbl>' + xml.slice(tblEnd);
            }
        }
    }

    // ── AMV-projectnummer ─────────────────────────────────────────────────
    // Het sjabloon is een opgeslagen casus, dus het draagt het projectnummer van
    // díe casus met zich mee — nu AMV261632, op het titelblad (bookmark ProjectNr1)
    // en in de samenvattingstabel (bookmark ProjectNr), allebei als losse run.
    // Zoeken op één vast nummer werkte daarom niet: elk nieuw sjabloon brengt een
    // ander nummer mee en dan bleef het oude nummer in de rapportage staan.
    // Daarom vervangen we op de vórm van het nummer, zodat er altijd het nummer
    // uit de BDOK komt te staan.
    if (amvNummer) {
        xml = xml.replace(
            /(<w:t[^>]*>[^<]*?)AMV\d{6,}(?:\.\d+)?/g,
            `$1${amvNummer}`
        );
    }

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

    // ── §2.9 regionale grondwaterstromingsrichting ────────────────────────────
    // De zin blijft staan; alleen de richting wordt ingevuld. (Deze zin werd eerder
    // verwijderd, maar dat was verkeerd — bij de controle van de Haelen-rapportage
    // is hij met de hand teruggezet.) Het sjabloon draagt de richting van zijn
    // vorige casus mee ("noordwestelijke richting"), dus die vervangen we door de
    // opgegeven richting; zonder opgave wordt het "onbekende".
    xml = xml.replace(
        /(<w:t[^>]*>)[^<]*(?= richting<\/w:t>)[^<]*(<\/w:t>)/,
        `$1${xmlEsc(stromingsrichting || 'onbekende')} richting$2`
    );

    // ── §2.9 restinstructie voor de adviseur ──────────────────────────────────
    // "Raadplegen (of uit bdok)" en de grondwatertools-link zijn werkinstructies,
    // geen rapporttekst — ze horen niet bij de klant terecht te komen. Elk een
    // eigen alinea.
    removeParaContaining('Raadplegen ');
    removeParaContaining('grondwatertools.nl');

    // ── §2.9 bodembeschermingsgebied ──────────────────────────────────────────
    // Of een locatie in zo'n gebied ligt verschilt per locatie: het sjabloon heeft
    // "Mergelland" (Zuid-Limburg), maar voor Haelen moest het "Roerdalslenk" zijn.
    // Ingevuld → de naam vervangen; leeg → de hele zin weg, zodat alleen
    // "De locatie is niet gelegen in een grondwaterwingebied…" overblijft.
    if (bodembeschermingsgebied) {
        xml = xml.replace(
            /(<w:t[^>]*>De locatie is gelegen in het bodembeschermingsgebied “<\/w:t>[\s\S]{0,400}?<w:t[^>]*>)[^<]*(<\/w:t>)/,
            `$1${xmlEsc(bodembeschermingsgebied)}$2`
        );
    } else {
        xml = xml.replace(
            /(<w:t[^>]*>)De locatie is gelegen in het bodembeschermingsgebied “<\/w:t>([\s\S]{0,400}?<w:t[^>]*>)[^<]*<\/w:t>([\s\S]{0,400}?<w:t[^>]*>)”\. /,
            '$1</w:t>$2</w:t>$3'
        );
    }

    // ── Bijlage 1: bronvermelding ─────────────────────────────────────────────
    repTv("Bijlage 1 bronvermelding", "Bron: Google Maps", "Bron: Bodemloket.nl/Werktekening opdrachtgever");

    // De gele markering blijft staan. Die is geen restant van het sjabloon maar een
    // aanwijzing voor de controleur: het zijn precies de plekken die hij zelf nog
    // moet nalopen. (Ze werden hier eerder weggehaald.)

    // "(tekening invoegen opdrachtgever)" placeholder is handled in the tekening block below.

    // ── §2.9 slotalinea grondwateronderzoek ───────────────────────────────
    // De paragraaf hoort beide varianten achter elkaar te hebben, met "OF" ertussen:
    // eerst de gele tekst ("Grondwateronderzoek dient ..."), dan de cyaan ("Omdat er
    // geen werkzaamheden ..."). Allebei blijven staan — de opdrachtgever wil deze
    // paragraaf precies zo, en de controleur kiest zelf.
    //
    // Niets doen is hier niet genoeg. Een eerdere versie van deze tool gooide de
    // niet-passende variant wég, en het sjabloon is een opgeslagen casus: elk
    // sjabloon dat uit zo'n rapportage is voortgekomen mist die tekst dus blijvend,
    // mét het "OF". Daarom zetten we een ontbrekende variant terug.
    {
        const GEEL = 'Grondwateronderzoek dient plaats te vinden, indien het freatisch '
            + 'grondwater zich op minder dan 0,25 meter onder de maximale '
            + 'ontgravingsdiepte bevindt. Dit is op de onderzoekslocatie niet het '
            + 'geval. Het uitvoeren van het grondwateronderzoek is derhalve niet '
            + 'noodzakelijk.';
        const CYAAN = 'Omdat er geen werkzaamheden in het grondwater plaatsvinden voor '
            + 'de aanleg van kabels en leidingen, is grondwateronderzoek niet '
            + 'doelmatig. Meestal worden de werkzaamheden uitgesteld naar een drogere '
            + 'periode.';
        const markeer = (tekst, kleur) =>
            `<w:r><w:rPr><w:highlight w:val="${kleur}"/></w:rPr>`
            + `<w:t xml:space="preserve">${xmlEsc(tekst)}</w:t></w:r>`;
        const scheiding = '<w:r><w:br/><w:t>OF</w:t><w:br/></w:r>';
        const runStart = (i) =>
            Math.max(xml.lastIndexOf('<w:r>', i), xml.lastIndexOf('<w:r ', i));

        const iGeel  = xml.indexOf('Grondwateronderzoek dient');
        const iCyaan = xml.indexOf('Omdat er geen werkzaamheden');

        if (iGeel === -1 && iCyaan === -1) {
            verwacht('§2.9 slotvarianten aanwezig', false);
        } else if (iCyaan === -1) {
            const eind = xml.indexOf('</w:p>', iGeel);
            if (verwacht('§2.9 cyaan variant terugzetten', eind !== -1)) {
                xml = xml.slice(0, eind) + scheiding + markeer(CYAAN, 'cyan') + xml.slice(eind);
            }
        } else if (iGeel === -1) {
            const start = runStart(iCyaan);
            if (verwacht('§2.9 gele variant terugzetten', start !== -1)) {
                xml = xml.slice(0, start) + markeer(GEEL, 'yellow') + scheiding + xml.slice(start);
            }
        } else {
            // Beide staan er; alleen nog kijken of het "OF" ertussen niet ontbreekt.
            const start = runStart(iCyaan);
            if (start !== -1 && !/>OF</.test(xml.slice(Math.max(0, start - 800), start))) {
                xml = xml.slice(0, start) + scheiding + xml.slice(start);
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

        // Variant voor de bijlagepagina die de pijl "onderzoekslocatie", de
        // noordpijl en de bronregel al bevat: die drie horen ónder de werktekening
        // op dezelfde pagina te staan. Dus geen eigen paginaovergang, en de tekening
        // hangt bovenaan het tekstgebied.
        //
        // Terugloop "achter tekst" (behindDoc + wrapNone), zoals gevraagd: de
        // tekening duwt niets weg en ligt onder de tekst, zodat hij meteen zichtbaar
        // is en met de hand te verslepen blijft.
        //
        // Maat: de pagina is A4 met marges 33/25 mm, dus de tekstkolom is 152 mm
        // breed. In de hoogte houden we 150 mm aan, zodat er onder de tekening
        // ruimte overblijft voor de pijl (13 mm), de noordpijl (32 mm) en de
        // bronregel.
        const paginaTekening = (() => {
            const maxBreedte = 5_470_000; // 152 mm in EMU
            const maxHoogte  = 5_400_000; // 150 mm in EMU
            const verhouding = tekening.heightPx / tekening.widthPx;
            let cx = maxBreedte;
            let cy = Math.round(maxBreedte * verhouding);
            if (cy > maxHoogte) {
                cy = maxHoogte;
                cx = Math.round(maxHoogte / verhouding);
            }
            const drawingXml = anchoredDrawingXml(tekeningRId, cx, cy, 9901, 'Tekening',
                { vanaf: 'margin', vAlign: 'top' });
            return `<w:p><w:r>${drawingXml}</w:r></w:p>`;
        })();

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

        // 0a. Beste plek: de pijl "onderzoekslocatie" op de bijlagepagina. Die pijl
        //     zit in een tekstvak binnen een <w:drawing>; de alinea die dat drawing
        //     draagt is de eerste van de pagina-inhoud. Daar zetten we de
        //     werktekening vlak vóór, zodat de pijl, de noordpijl en de bronregel
        //     eronder komen te staan op dezelfde pagina.
        {
            for (let i = xml.indexOf('>onderzoekslocatie<'); i !== -1 && !placed;
                 i = xml.indexOf('>onderzoekslocatie<', i + 1)) {
                if (!isInTextBox(i)) continue;
                const dStart = xml.lastIndexOf('<w:drawing>', i);
                if (dStart === -1) continue;
                const pStart = Math.max(
                    xml.lastIndexOf('<w:p>', dStart),
                    xml.lastIndexOf('<w:p ', dStart)
                );
                if (pStart === -1) continue;
                xml = xml.slice(0, pStart) + paginaTekening + xml.slice(pStart);
                placed = true;
            }
        }

        // 0. Best signal: the "(tekening invoegen opdrachtgever)" placeholder marks the
        //    appendix the drawing belongs to, so the nearest "Onderzoekslocatie" *before*
        //    it is reliably the Bijlage 1 heading. The title also appears earlier in the
        //    report body (§1), tens of thousands of characters away, and that earlier hit
        //    would otherwise win — which is exactly what put the image on the wrong page.
        {
            const phIdx0 = placed ? -1 : xml.indexOf('tekening invoegen opdrachtgever');
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

    // §2.6 en §2.7 onveranderd terugzetten (zie de toelichting bovenaan).
    if (bevroren2627) {
        xml = xml.split(SENTINEL_2627).join(bevroren2627);
    }

    // Vervangingen die nergens raakten. Bijna altijd betekent dit dat het sjabloon
    // veranderd is — een hersave die tags anders schrijft, hernoemde tekst, of een
    // sjabloon dat van een andere casus komt. Zonder deze melding blijft dat
    // onzichtbaar tot iemand het eindresultaat naloopt.
    if (missers.length) {
        console.warn(
            `[sjabloon] ${missers.length} vervanging(en) raakten niets — controleer of de `
            + `template gewijzigd is:\n  • ${missers.join('\n  • ')}`
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
