import { useState } from 'react';
import { generateSmartContent, assessLocation } from '../utils/smartFill';
import * as XLSX from 'xlsx';

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
            const wb = XLSX.utils.book_new();

            // ==========================================
            // 1. OVERZICHT LOCATIES TAB
            // ==========================================
            const overzichtHeaders = [
                'Locatiecode', 'Locatienaam', 'Straatnaam', 'Huisnummer', 'Postcode',
                'Status rapport', 'Conclusie', 'Veiligheidsklasse', 'Melding', 'MKB',
                'BRL 7000', 'Opmerking', 'Complex', 'Beoordeling', 'Prioriteit',
                'Rapportjaar', 'Afstand trace (m)', 'Status AbelTalent', 'Opmerkingen AbelTalent',
                'Gemeente', 'Provincie', 'RD-X', 'RD-Y', 'Bodemkwaliteitsklasse',
                'Topotijdreis Link', 'Bodemloket Link', 'Toelichting', 'Actie'
            ];

            const overzichtData = [overzichtHeaders];

            for (const loc of locations) {
                const assessment = assessLocation(loc);
                overzichtData.push([
                    loc.locatiecode || '', loc.locatienaam || '', loc.straatnaam || '', loc.huisnummer || '', loc.postcode || '',
                    loc.status || '', loc.conclusie || '', loc.veiligheidsklasse || '', loc.melding || '', loc.mkb || '',
                    loc.brl7000 || '', loc.opmerking || '', loc.complex ? 'Ja' : 'Nee', assessment.beoordeling || '', assessment.prioriteit || '',
                    loc.rapportJaar || '', loc.afstandTrace || '', '', loc.opmerkingenAbel || '',
                    loc._enriched?.gemeente || '', loc._enriched?.provincie || '', loc._enriched?.rdX || '', loc._enriched?.rdY || '',
                    loc._enriched?.bodemkwaliteit?.[0]?.klasse || '', loc._enriched?.topotijdreisHuidig || '', loc._enriched?.bodemloket || '',
                    assessment.toelichting || '', assessment.actie || ''
                ]);
            }

            const wsOverzicht = XLSX.utils.aoa_to_sheet(overzichtData);

            // Set basic column widths
            wsOverzicht['!cols'] = [
                { wch: 20 }, { wch: 30 }, { wch: 25 }, { wch: 10 }, { wch: 10 },
                { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
                { wch: 15 }, { wch: 30 }, { wch: 10 }, { wch: 20 }, { wch: 15 },
            ];

            XLSX.utils.book_append_sheet(wb, wsOverzicht, 'Overzicht Locaties');

            // ==========================================
            // 2. CHECKLIST TAB
            // ==========================================
            const checklistHeaders = ['Locatiecode', 'Stof', 'Document', 'Status', 'Toelichting'];
            const checklistData = [checklistHeaders];
            const docs = ['Nader afperkend onderzoek', 'Saneringsplan', 'BUS-melding', 'V&G-plan', 'MKB-plan', 'Evaluatierapport'];

            const complexeCases = locations.filter(l => l.complex);

            for (const loc of complexeCases) {
                for (const doc of docs) {
                    checklistData.push([loc.locatiecode, loc.stoffen?.[0]?.stof || '', doc, 'Nog te doen', '']);
                }
            }

            const wsChecklist = XLSX.utils.aoa_to_sheet(checklistData);
            wsChecklist['!cols'] = [{ wch: 20 }, { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 40 }];
            XLSX.utils.book_append_sheet(wb, wsChecklist, 'Checklist');

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

                const caseData = [];
                caseData.push([`Complexe Zaak: ${loc.locatiecode}`]);
                caseData.push([]); // empty line

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
                        caseData.push([section.title]);
                        if (section.fields) {
                            for (const [k, v] of Object.entries(section.fields)) {
                                caseData.push([camelToLabel(k), v]);
                            }
                        }
                        caseData.push([]); // explicit empty line separator
                    }
                }

                const wsCase = XLSX.utils.aoa_to_sheet(caseData);
                wsCase['!cols'] = [{ wch: 30 }, { wch: 80 }]; // Field Label, Field Text

                // Construct safe Excel tab name (max 31 chars, no invalid symbols)
                const rawName = `CZ - ${loc.locatiecode || 'Onbekend'} ${loc.stoffen?.[0]?.stof || ''}`;
                let safeTabName = rawName.replace(/[\\/?*[\]:]/g, '').substring(0, 31).trim();

                // Deduplicate sheet names if any clash
                let count = 1;
                while (wb.SheetNames.includes(safeTabName)) {
                    safeTabName = `${safeTabName.substring(0, 27)}(${count})`;
                    count++;
                }

                XLSX.utils.book_append_sheet(wb, wsCase, safeTabName);
            }

            // ==========================================
            // WRITE EXCEL FILE
            // ==========================================
            const filename = `TOB-Rapportage-${new Date().toISOString().split('T')[0]}.xlsx`;
            XLSX.writeFile(wb, filename);

            setResult({
                success: true,
                message: `✅ Succes! Excel Rapportage met ${locations.length} locaties is gedownload.`
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
                De Excel bevat één overzichtslijst, een actie-checklist en automatische verslaglegging per complexe zaak (elke in een eigen tabblad).
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
