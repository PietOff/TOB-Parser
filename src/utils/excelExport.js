import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { fetchLocations } from '../services/api';

const TRACE_KEYWORDS = ['tracé', 'trace', 'glasvezel', 'riool', 'riolen', 'leidingen', 'kabels'];

function isTraceLocation(naam) {
    const lower = (naam ?? '').toLowerCase();
    return TRACE_KEYWORDS.some(k => lower.includes(k));
}

function calcPrio(loc) {
    let prio = 0;
    const code      = loc.locatiecode ?? '';
    const advies    = (loc.automatisch_advies ?? '').toLowerCase();
    const ubiGte5   = (loc.ubi_gte5 ?? '').toLowerCase();
    const rapport   = (loc.rapport_type ?? '').toLowerCase();
    const huisnr    = loc.huisnummer ?? '';
    const naam      = loc.locatienaam ?? '';
    const isHbb     = /hbb/i.test(naam);

    if (code.startsWith('ST'))      prio += 2;
    if (ubiGte5 === 'ja')           prio += 1;
    if (rapport === 'ja')           prio += 1;
    if (!huisnr.trim() || huisnr.trim() === '0') prio += 1;
    if (advies === 'wel')           prio += 1;
    if (isHbb && ubiGte5 !== 'ja')  prio -= 1;

    return prio;
}

export const EXPORT_COLUMNS = [
    { header: 'Prioriteit',                         key: 'prioriteit',           width: 12 },
    { header: 'Locatiecode',                         key: 'locatiecode',          width: 15 },
    { header: 'Locatienaam',                         key: 'locatienaam',          width: 25 },
    { header: 'Straatnaam',                          key: 'straatnaam',           width: 25 },
    { header: 'Huisnummer',                          key: 'huisnummer',           width: 12 },
    { header: 'Postcode',                            key: 'postcode',             width: 12 },
    { header: 'Woonplaats',                          key: 'woonplaats',           width: 18 },
    { header: 'RD X',                                key: 'rd_x',                 width: 12 },
    { header: 'RD Y',                                key: 'rd_y',                 width: 12 },
    { header: 'Latitude',                            key: 'lat',                  width: 14 },
    { header: 'Longitude',                           key: 'lon',                  width: 14 },
    { header: 'Automatisch advies',                  key: 'automatischAdvies',    width: 20 },
    { header: 'Status',                              key: 'status',               width: 20 },
    { header: 'Tracé / Netwerk',                     key: 'traceNetwerk',         width: 16 },
    { header: 'HBB',                                 key: 'hbb',                  width: 10 },
    { header: 'Saneringsverslag',                    key: 'rapportType',          width: 25 },
    { header: 'Datum laatste onderzoek',             key: 'latestOnderzoekDatum', width: 20 },
    { header: 'Datum oudste onderzoek',              key: 'oldestOnderzoekDatum', width: 20 },
    { header: 'Aantal onderzoeken',                  key: 'aantalOnderzoeken',    width: 18 },
    { header: 'UBI >= 5',                            key: 'ubiGte5',              width: 10 },
    { header: 'Aantal UBI >= 5',                     key: 'ubiGte5Count',         width: 14 },
    { header: 'Conclusie',                           key: 'conclusie',            width: 20 },
    { header: 'Veiligheidsklasse',                   key: 'veiligheidsklasse',    width: 20 },
    { header: 'Melding',                             key: 'melding',              width: 20 },
    { header: 'MKB',                                 key: 'mkb',                  width: 12 },
    { header: 'BRL 7000',                            key: 'brl7000',              width: 12 },
    { header: 'Opmerking',                           key: 'opmerking',            width: 30 },
    { header: 'Informatie uit Tekeningen (PPTX)',    key: 'tekeningInfo',         width: 35 },
];

export async function exportProjectExcel(project) {
    const locations = await fetchLocations(project.id);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'TOB Parser';
    wb.created = new Date();

    const ws = wb.addWorksheet('Locaties', {
        properties: { tabColor: { argb: 'FF2196F3' } }
    });

    ws.columns = EXPORT_COLUMNS;

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4285F4' } };
    headerRow.alignment = { vertical: 'middle' };

    // Sort: tracé/netwerk locations first, then by prio desc, then by straatnaam asc
    locations.sort((a, b) => {
        const aTrace = isTraceLocation(a.locatienaam) ? 1 : 0;
        const bTrace = isTraceLocation(b.locatienaam) ? 1 : 0;
        if (bTrace !== aTrace) return bTrace - aTrace;
        const pDiff = calcPrio(b) - calcPrio(a);
        if (pDiff !== 0) return pDiff;
        return (a.straatnaam ?? '').localeCompare(b.straatnaam ?? '', 'nl');
    });

    for (const loc of locations) {
        const enriched = loc.enriched_data ?? {};

        // Postcode: DB column first, then try enriched_data blob
        const postcode = loc.postcode || enriched.postcode || enriched._original?.postcode || '';

        // Coordinates: dedicated DB columns (rd_x/rd_y, lat/lon), fallback to enriched_data blob
        const rdX = loc.rd_x ?? enriched.rd?.x ?? null;
        const rdY = loc.rd_y ?? enriched.rd?.y ?? null;
        const lat  = loc.lat  ?? enriched.lat  ?? null;
        const lon  = loc.lon  ?? enriched.lon  ?? null;

        const prio = calcPrio(loc);
        const isTrace = isTraceLocation(loc.locatienaam);
        const row = ws.addRow({
            prioriteit:        prio,
            locatiecode:       loc.locatiecode       ?? '',
            locatienaam:       loc.locatienaam       ?? '',
            straatnaam:        loc.straatnaam        ?? '',
            huisnummer:        loc.huisnummer        ?? '',
            postcode,
            woonplaats:        loc.woonplaats        ?? '',
            rd_x:              rdX ?? '',
            rd_y:              rdY ?? '',
            lat:               lat ?? '',
            lon:               lon ?? '',
            automatischAdvies: loc.automatisch_advies ?? loc.automatischAdvies ?? '',
            status:            loc.status            ?? '',
            conclusie:         loc.conclusie         ?? '',
            veiligheidsklasse: loc.veiligheidsklasse ?? '',
            melding:           loc.melding           ?? '',
            mkb:               loc.mkb               ?? '',
            brl7000:           loc.brl7000           ?? '',
            opmerking:         loc.opmerking         ?? '',
            rapportType:      loc.rapport_type ?? loc.rapportType ?? '',
            latestOnderzoekDatum: loc.latest_onderzoek_datum ?? loc.latestOnderzoekDatum ?? '',
            oldestOnderzoekDatum: loc.oldest_onderzoek_datum ?? loc.oldestOnderzoekDatum ?? '',
            aantalOnderzoeken:    loc.aantal_onderzoeken ?? loc.aantalOnderzoeken ?? '',
            tekeningInfo:      enriched.tekeningInfo ?? enriched.pptxInfo ?? '',
        hbb:               '',
        ubiGte5:           loc.ubi_gte5 ?? '',
        ubiGte5Count:      loc.ubi_gte5_count ?? '',
        });
        if (isTrace) {
            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9EAD3' } };
        }
    }

    // Tracé/Netwerk formule in kolom N (14) — locatienaam is nu kolom C
    const traceCol = 14;
    const totalRows = ws.rowCount;
    for (let r = 2; r <= Math.max(totalRows, 10000); r++) {
        ws.getCell(r, traceCol).value = { formula: `=IF(OR(ISNUMBER(SEARCH("tracé",C${r})),ISNUMBER(SEARCH("glasvezel",C${r})),ISNUMBER(SEARCH("riool",C${r})),ISNUMBER(SEARCH("riolen",C${r})),ISNUMBER(SEARCH("leidingen",C${r})),ISNUMBER(SEARCH("kabels",C${r}))),"Ja"," ")` };
    }

    // HBB formule in kolom O (15)
    const hbbCol = 15;
    for (let r = 2; r <= Math.max(ws.rowCount, 10000); r++) {
        ws.getCell(r, hbbCol).value = { formula: `=IF(ISNUMBER(SEARCH("HBB",C${r})),"Ja"," ")` };
    }

    // Gegevensvalidatie dropdowns: Conclusie(22), Veiligheidsklasse(23), Melding(24), MKB(25), BRL7000(26)
    const dropdowns = [
        { col: 22, options: 'onverdacht,verdacht' },
        { col: 23, options: 'basishygiëne,oranje vluchtig,oranje niet vluchtig,rood vluchtig,rood niet vluchtig,zwart vluchtig,zwart niet vluchtig' },
        { col: 24, options: 'vormvrij,MBA graven,BUS-melding 5 weken,BUS-melding 5 dagen' },
        { col: 25, options: 'ja,nee' },
        { col: 26, options: 'ja,nee' },
    ];
    for (const { col, options } of dropdowns) {
        for (let r = 2; r <= 10000; r++) {
            ws.getCell(r, col).dataValidation = {
                type: 'list',
                allowBlank: true,
                formulae: [`"${options}"`],
                showDropDown: false,
                showErrorMessage: true,
                errorStyle: 'warning',
            };
        }
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const safeName = project.name.replace(/[\/?*[\]:]/g, '').substring(0, 40).trim();
    saveAs(blob, `${safeName}-${new Date().toISOString().split('T')[0]}.xlsx`);
}
