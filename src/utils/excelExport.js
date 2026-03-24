import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { fetchLocations } from '../services/api';

export const EXPORT_COLUMNS = [
    { header: 'Locatiecode',                      key: 'locatiecode',        width: 15 },
    { header: 'Locatienaam',                      key: 'locatienaam',        width: 25 },
    { header: 'Straatnaam',                       key: 'straatnaam',         width: 25 },
    { header: 'Huisnummer',                       key: 'huisnummer',         width: 12 },
    { header: 'Postcode',                         key: 'postcode',           width: 12 },
    { header: 'Woonplaats',                       key: 'woonplaats',         width: 18 },
    { header: 'RD X',                             key: 'rd_x',               width: 12 },
    { header: 'RD Y',                             key: 'rd_y',               width: 12 },
    { header: 'Latitude',                         key: 'lat',                width: 14 },
    { header: 'Longitude',                        key: 'lon',                width: 14 },
    { header: 'Status',                           key: 'status',             width: 20 },
    { header: 'Conclusie',                        key: 'conclusie',          width: 20 },
    { header: 'Veiligheidsklasse',                key: 'veiligheidsklasse',  width: 20 },
    { header: 'Melding',                          key: 'melding',            width: 20 },
    { header: 'MKB',                              key: 'mkb',                width: 12 },
    { header: 'BRL 7000',                         key: 'brl7000',            width: 12 },
    { header: 'Opmerking',                        key: 'opmerking',          width: 30 },
    { header: 'Automatisch advies',               key: 'automatischAdvies',  width: 20 },
    { header: 'Rapport type',                     key: 'rapportType',        width: 25 },
    { header: 'Datum laatste onderzoek',          key: 'latestOnderzoekDatum', width: 20 },
    { header: 'Aantal onderzoeken',               key: 'aantalOnderzoeken',   width: 18 },
    { header: 'Informatie uit Tekeningen (PPTX)', key: 'tekeningInfo',       width: 35 },
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

    for (const loc of locations) {
        const enriched = loc.enriched_data ?? {};

        // Postcode: DB column first, then try enriched_data blob
        const postcode = loc.postcode || enriched.postcode || enriched._original?.postcode || '';

        // Coordinates: dedicated DB columns (rd_x/rd_y, lat/lon), fallback to enriched_data blob
        const rdX = loc.rd_x ?? enriched.rd?.x ?? null;
        const rdY = loc.rd_y ?? enriched.rd?.y ?? null;
        const lat  = loc.lat  ?? enriched.lat  ?? null;
        const lon  = loc.lon  ?? enriched.lon  ?? null;

        ws.addRow({
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
            status:            loc.status            ?? '',
            conclusie:         loc.conclusie         ?? '',
            veiligheidsklasse: loc.veiligheidsklasse ?? '',
            melding:           loc.melding           ?? '',
            mkb:               loc.mkb               ?? '',
            brl7000:           loc.brl7000           ?? '',
            opmerking:         loc.opmerking         ?? '',
            automatischAdvies: loc.automatisch_advies ?? loc.automatischAdvies ?? '',
            rapportType:      loc.rapport_type ?? loc.rapportType ?? '',
            latestOnderzoekDatum: loc.latest_onderzoek_datum ?? loc.latestOnderzoekDatum ?? '',
            aantalOnderzoeken:    loc.aantal_onderzoeken ?? loc.aantalOnderzoeken ?? '',
            tekeningInfo:      enriched.tekeningInfo ?? enriched.pptxInfo ?? '',
        });
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const safeName = project.name.replace(/[\/?*[\]:]/g, '').substring(0, 40).trim();
    saveAs(blob, `${safeName}-${new Date().toISOString().split('T')[0]}.xlsx`);
}
