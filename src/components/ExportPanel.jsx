import { useState } from 'react';
import { generateSmartContent, assessLocation, getTobColumns } from '../utils/smartFill';

export default function ExportPanel({ locations }) {
    const [sheetUrl, setSheetUrl] = useState('');
    const [appsScriptUrl, setAppsScriptUrl] = useState('');
    const [exporting, setExporting] = useState(false);
    const [result, setResult] = useState(null);

    const handleExport = async () => {
        if (!appsScriptUrl) {
            setResult({ success: false, message: 'Voer de Apps Script URL in' });
            return;
        }

        setExporting(true);
        setResult(null);

        try {
            // Prepare data for export
            const exportData = {
                sheetUrl,
                overzicht: locations.map(loc => {
                    const assessment = assessLocation(loc);
                    return {
                        locatiecode: loc.locatiecode,
                        locatienaam: loc.locatienaam,
                        straatnaam: loc.straatnaam,
                        huisnummer: loc.huisnummer,
                        postcode: loc.postcode,
                        status: loc.status,
                        conclusie: loc.conclusie,
                        veiligheidsklasse: loc.veiligheidsklasse,
                        melding: loc.melding,
                        mkb: loc.mkb,
                        brl7000: loc.brl7000,
                        opmerking: loc.opmerking,
                        complex: loc.complex ? 'Ja' : 'Nee',
                        beoordeling: assessment.beoordeling,
                        prioriteit: assessment.prioriteit,
                        rapportJaar: loc.rapportJaar || '',
                        afstandTrace: loc.afstandTrace || '',
                        statusAbel: '',
                        opmerkingenAbel: loc.opmerkingenAbel || '',
                    };
                }),
                complexeCases: locations.filter(l => l.complex).map(loc => {
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

                    return {
                        code: loc.locatiecode,
                        naam: loc.locatienaam,
                        stof: loc.stoffen?.[0]?.stof || '',
                        waarde: loc.stoffen?.[0]?.waarde || '',
                        smart,
                    };
                }),
            };

            const response = await fetch(appsScriptUrl, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(exportData),
            });

            setResult({
                success: true,
                message: `✅ Data verzonden! ${locations.length} locaties, waarvan ${locations.filter(l => l.complex).length} complex. Controleer de Google Sheet.`
            });
        } catch (err) {
            setResult({
                success: false,
                message: `❌ Fout bij export: ${err.message}`
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
            <h2>📊 Export naar Google Sheets</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>
                Voer de URL van je Google Apps Script Web App in om de data te exporteren.
                Je kunt ook de data als JSON downloaden.
            </p>

            <div className="export-input-group">
                <input
                    type="url"
                    placeholder="Google Apps Script Web App URL..."
                    value={appsScriptUrl}
                    onChange={(e) => setAppsScriptUrl(e.target.value)}
                />
            </div>

            <div className="export-input-group">
                <input
                    type="url"
                    placeholder="Google Sheet URL (optioneel, voor referentie)..."
                    value={sheetUrl}
                    onChange={(e) => setSheetUrl(e.target.value)}
                />
            </div>

            <div className="btn-group" style={{ justifyContent: 'flex-start' }}>
                <button
                    className="btn btn-success"
                    onClick={handleExport}
                    disabled={exporting || !appsScriptUrl}
                >
                    {exporting ? (
                        <><div className="spinner" /> Exporteren...</>
                    ) : (
                        <>📤 Exporteer naar Google Sheets</>
                    )}
                </button>

                <button className="btn btn-secondary" onClick={handleDownloadJson}>
                    💾 Download als JSON
                </button>
            </div>

            {result && (
                <div style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    borderRadius: 'var(--radius-sm)',
                    background: result.success ? 'var(--success-bg)' : 'var(--danger-bg)',
                    color: result.success ? 'var(--success)' : 'var(--danger)',
                    fontSize: '0.875rem',
                }}>
                    {result.message}
                </div>
            )}
        </div>
    );
}
