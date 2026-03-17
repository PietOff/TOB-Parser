import ExcelJS from 'exceljs';
    ws.columns = EXPORT_COLUMNS;


    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4285F4' } };
    headerRow.alignment = { vertical: 'middle' };


    for (const loc of locations) {
        const enriched = loc.enriched_data ?? {};


        // Postcode: DB column first, then try enriched_data blob
        const postcode =
            loc.postcode ||
            enriched.postcode ||
            enriched._original?.postcode ||
            '';


        // Coordinates: dedicated DB columns (rd_x/rd_y, lat/lon), fallback to enriched_data blob
        const rdX = loc.rd_x ?? enriched.rd?.x ?? null;
        const rdY = loc.rd_y ?? enriched.rd?.y ?? null;
        const lat  = loc.lat  ?? enriched.lat  ?? null;
        const lon  = loc.lon  ?? enriched.lon  ?? null;


        ws.addRow({
            locatiecode:       loc.locatiecode        ?? '',
            locatienaam:       loc.locatienaam        ?? '',
            straatnaam:        loc.straatnaam         ?? '',
            huisnummer:        loc.huisnummer         ?? '',
            postcode,
            woonplaats:        loc.woonplaats         ?? '',
            rd_x:              rdX ?? '',
            rd_y:              rdY ?? '',
            lat:               lat ?? '',
            lon:               lon ?? '',
            status:            loc.status             ?? '',
            conclusie:         loc.conclusie          ?? '',
            veiligheidsklasse: loc.veiligheidsklasse  ?? '',
            melding:           loc.melding            ?? '',
            mkb:               loc.mkb                ?? '',
            brl7000:           loc.brl7000            ?? '',
            opmerking:         loc.opmerking          ?? '',
                automatischAdvies: loc.automatischAdvies ?? loc.automatisch_advies ?? '',
            tekeningInfo:      enriched.tekeningInfo  ?? enriched.pptxInfo ?? '',
        });
    }


    ws.views = [{ state: 'frozen', ySplit: 1 }];


    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeName = project.name.replace(/[\\/?*[\]:]/g, '').substring(0, 40).trim();
    saveAs(blob, `${safeName}-${new Date().toISOString().split('T')[0]}.xlsx`);
}

