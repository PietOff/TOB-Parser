import { useState } from 'react';
import { generateSmartContent, assessLocation } from '../utils/smartFill';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import html2canvas from 'html2canvas';

// Helper to format keys like 'planVanAanpak' into 'Plan Van Aanpak'
function camelToLabel(str) {
    return str
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .replace(/_/g, ' ');
}

export default function ExportPanel({ locations }) {
    const [exporting, setExporting] = useState(false);
    const [result, setResult] = useState(null);

    const handleExportExcel = async () => {
        setExporting(true);
        setResult(null);

        try {
            const wb = new ExcelJS.Workbook();
            wb.creator = 'TOB Parser';
            wb.lastModifiedBy = 'TOB Parser';
            wb.created = new Date();
            wb.modified = new Date();

            // ==========================================
            // 0. OVERZICHTSKAART TAB
            // ==========================================
            const wsMap = wb.addWorksheet('Kaart', { properties: { tabColor: { argb: 'FF4CAF50' } } });
            try {
                const mapElement = document.getElementById('master-location-map');
                if (mapElement) {
                    // Temporarily hide map controls during screenshot for a cleaner look if desired
                    // but standard html2canvas handles it okay.
                    const canvas = await html2canvas(mapElement, {
                        useCORS: true,
                        allowTaint: false,
                        backgroundColor: null // Transparent or white
                    });

                    const base64Image = canvas.toDataURL('image/png');
                    const imageId = wb.addImage({
                        base64: base64Image,
                        extension: 'png',
                    });

                    // Add image to worksheet from B2 downwards
                    wsMap.addImage(imageId, {
                        tl: { col: 1, row: 1 },
                        ext: { width: canvas.width * 0.75, height: canvas.height * 0.75 }
                    });
                } else {
                    wsMap.getCell('A1').value = 'Kaart kon niet gevonden worden op het scherm.';
                }
            } catch (err) {
                console.warn('Map screenshot failed:', err);
                wsMap.getCell('A1').value = 'Screenshot maken van de kaart is mislukt: ' + err.message;
            }

            // ==========================================
            // 1. OVERZICHT LOCATIES TAB
            // ==========================================
            const wsOverzicht = wb.addWorksheet('Overzicht Locaties', { properties: { tabColor: { argb: 'FF2196F3' } } });

            const overzichtHeaders = [
                'Locatiecode', 'Locatienaam', 'Straatnaam', 'Huisnummer', 'Postcode',
                'Status rapport', 'Conclusie', 'Veiligheidsklasse', 'CROW 400 Grond', 'CROW 400 Grondwater',
                'Melding', 'MKB', 'BRL 7000', 'Opmerking', 'Complex', 'Beoordeling', 'Prioriteit',
                'Rapportjaar', 'Afstand trace (m)', 'Status AbelTalent', 'Opmerkingen AbelTalent',
                'Gemeente', 'Provincie', 'RD-X', 'RD-Y', 'Bodemkwaliteitsklasse',
                'Topotijdreis Link', 'Bodemloket Link', 'Toelichting', 'Actie (Protocol Code)'
            ];

            const headerRow = wsOverzicht.addRow(overzichtHeaders);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4285F4' } };

            for (const loc of locations) {
                const assessment = assessLocation(loc);
                const rowData = [
                    loc.locatiecode || '', loc.locatienaam || '', loc.straatnaam || '', loc.huisnummer || '', loc.postcode || '',
                    loc.status || '', loc.conclusie || '', loc.veiligheidsklasse || '', loc.crow_grond || '', loc.crow_water || '',
                    loc.melding || '', loc.mkb || '', loc.brl7000 || '', loc.opmerking || '', loc.complex ? 'Ja' : 'Nee', assessment.beoordeling || '', assessment.prioriteit || '',
                    loc.rapportJaar || '', loc.afstandTrace || '', '', loc.opmerkingenAbel || '',
                    loc._enriched?.gemeente || '', loc._enriched?.provincie || '', loc._enriched?.rd?.x || '', loc._enriched?.rd?.y || '',
                    loc._enriched?.bodemkwaliteit?.[0]?.klasse || '',
                    loc._enriched?.topotijdreisHuidig ? { text: 'Klik hier', hyperlink: loc._enriched.topotijdreisHuidig } : '',
                    loc._enriched?.bodemloket ? { text: 'Klik hier', hyperlink: loc._enriched.bodemloket } : '',
                    assessment.toelichting || '', assessment.actie || ''
                ];

                const row = wsOverzicht.addRow(rowData);
                // Highlight complex rows
                if (loc.complex) {
                    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4EC' } };
                }
            }

            wsOverzicht.columns = overzichtHeaders.map(h => ({ width: 18 }));
            wsOverzicht.getColumn(2).width = 30; // Locatienaam
            wsOverzicht.getColumn(3).width = 25; // Straatnaam
            wsOverzicht.getColumn(27).width = 40; // Toelichting
            wsOverzicht.getColumn(28).width = 25; // Actie

            wsOverzicht.views = [{ state: 'frozen', ySplit: 1 }];

            // ==========================================
            // 2. CHECKLIST TAB
            // ==========================================
            const wsChecklist = wb.addWorksheet('Checklist', { properties: { tabColor: { argb: 'FFF44336' } } });

            const checklistHeaders = ['Locatiecode', 'Stof', 'Document', 'Status', 'Toelichting'];
            const chRow = wsChecklist.addRow(checklistHeaders);
            chRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            chRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA4335' } };

            const docs = ['Nader afperkend onderzoek', 'Saneringsplan', 'BUS-melding', 'V&G-plan', 'MKB-plan', 'Evaluatierapport'];
            const complexeCases = locations.filter(l => l.complex);

            for (const loc of complexeCases) {
                for (const doc of docs) {
                    wsChecklist.addRow([loc.locatiecode, loc.stoffen?.[0]?.stof || '', doc, 'Nog te doen', '']);
                }
            }

            wsChecklist.columns = [
                { width: 20 }, { width: 20 }, { width: 30 }, { width: 15 }, { width: 40 }
            ];
            wsChecklist.views = [{ state: 'frozen', ySplit: 1 }];

            // ==========================================
            // 3. COMPLEXE ZAKEN TABBLADEN
            // ==========================================
            for (const loc of complexeCases) {
                const smart = loc.stoffen?.length > 0
                    ? generateSmartContent({
                        stof: loc.stoffen[0].stof,
                        waarde: loc.stoffen[0].waarde,
                        diepte: loc.dieptes?.[0] || '',
                        boorpunt: '',
                        naam: loc.locatienaam,
                        straat: loc.straatnaam,
                        code: loc.locatiecode,
                    })
                    : null;

                const rawName = `CZ - ${loc.locatiecode || 'Onbekend'} ${loc.stoffen?.[0]?.stof || ''}`;
                let safeTabName = rawName.replace(/[\\/?*[\]:]/g, '').substring(0, 31).trim();
                let count = 1;
                while (wb.worksheets.map(s => s.name).includes(safeTabName)) {
                    safeTabName = `${safeTabName.substring(0, 27)}(${count})`;
                    count++;
                }

                const wsCase = wb.addWorksheet(safeTabName, { properties: { tabColor: { argb: 'FFFF9800' } } });

                const titleRow = wsCase.addRow([`Complexe Zaak: ${loc.locatiecode}`]);
                titleRow.font = { bold: true, size: 14 };
                wsCase.addRow([]);

                if (smart) {
                    const sections = [
                        { title: 'LOCATIEGEGEVENS', fields: smart.locatie },
                        { title: 'VERONTREINIGING', fields: smart.verontreiniging },
                        { title: 'HISTORISCH VOORONDERZOEK', fields: smart.historisch },
                        { title: 'RISICOBEOORDELING', fields: smart.risico },
                        { title: 'CONCLUSIE & ADVIES', fields: smart.conclusie },
                        { title: 'PLAN VAN AANPAK', fields: smart.planVanAanpak },
                        { title: 'MELDING BEVOEGD GEZAG', fields: smart.melding },
                        { title: 'MKB & VEILIGHEID', fields: smart.mkb },
                    ];

                    for (const section of sections) {
                        const secRow = wsCase.addRow([section.title]);
                        secRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                        secRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A73E8' } };
                        wsCase.mergeCells(`A${secRow.number}:B${secRow.number}`);

                        if (section.fields) {
                            for (const [k, v] of Object.entries(section.fields)) {
                                const dataRow = wsCase.addRow([camelToLabel(k), v]);
                                dataRow.getCell(1).font = { bold: true };
                                dataRow.getCell(2).alignment = { wrapText: true };
                            }
                        }
                        wsCase.addRow([]);
                    }
                }

                wsCase.columns = [{ width: 25 }, { width: 90 }];
            }

            // ==========================================
            // WRITE EXCEL FILE
            // ==========================================
            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            saveAs(blob, `TOB-Rapportage-${new Date().toISOString().split('T')[0]}.xlsx`);

            setResult({
                success: true,
                message: `✅ Succes! Excel Rapportage met ${locations.length} locaties (inclusief kaart) is gedownload.`
            });
        } catch (err) {
            console.error(err);
            setResult({
                success: false,
                message: `❌ Fout bij Excel generatie: ${err.message}`
            });
        } finally {
            setExporting(false);
        }
    };

    const handleDownloadJson = () => {
        const data = {
            timestamp: new Date().toISOString(),
            totaal: locations.length,
            complex: locations.filter(l => l.complex).length,
            locations: locations.map(loc => ({
                ...loc,
                assessment: assessLocation(loc),
            })),
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tob-export-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="export-panel">
            <h2>📥 Download Rapportage</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                Genereer een complete Excel-rapportage van je onderzoek.
                De Excel bevat een screenshot van de kaart, een overzichtslijst, een actie-checklist en automatische verslaglegging per complexe zaak.
            </p>

            <div className="btn-group" style={{ justifyContent: 'flex-start' }}>
                <button
                    className="btn btn-primary"
                    onClick={handleExportExcel}
                    disabled={exporting || locations.length === 0}
                    style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                >
                    {exporting ? (
                        <><div className="spinner" style={{ width: '16px', height: '16px' }} /> Genereren...</>
                    ) : (
                        <>📊 Download Excel Rapportage (.xlsx)</>
                    )}
                </button>

                <button className="btn btn-secondary" onClick={handleDownloadJson}>
                    💾 Download Ruwe Data (.json)
                </button>
            </div>

            {result && (
                <div style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    background: result.success ? 'var(--success-bg)' : 'var(--danger-bg)',
                    color: result.success ? 'var(--success)' : 'var(--danger)',
                    fontSize: '0.875rem',
                    fontWeight: 500
                }}>
                    {result.message}
                </div>
            )}
        </div>
    );
}
