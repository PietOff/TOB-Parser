import { useState, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import DataPreview from './components/DataPreview';
import ExportPanel from './components/ExportPanel';
import { extractPdfText, parseTobReport, mergeToLocations } from './utils/pdfParser';
import { parseXlsx } from './utils/xlsxParser';
import { parseDocx, docxToLocations } from './utils/docxParser';
import { enrichAllLocations } from './utils/apiIntegrations';
import './index.css';

const STEPS = [
    { id: 1, label: 'Upload' },
    { id: 2, label: 'Preview' },
    { id: 3, label: 'Export' },
];

export default function App() {
    const [step, setStep] = useState(1);
    const [locations, setLocations] = useState([]);
    const [parsing, setParsing] = useState(false);
    const [parseStatus, setParseStatus] = useState('');

    const handleFilesReady = useCallback(async (files) => {
        setParsing(true);
        setParseStatus('Bestanden verwerken...');
        const allLocations = [];

        try {
            for (const file of files) {
                const ext = file.name.toLowerCase().split('.').pop();

                if (ext === 'pdf') {
                    setParseStatus(`PDF verwerken: ${file.name}...`);
                    const { fullText } = await extractPdfText(file, (page, total) => {
                        setParseStatus(`PDF ${file.name}: pagina ${page}/${total}`);
                    });
                    const parsed = parseTobReport(fullText);
                    const locs = mergeToLocations(parsed);
                    locs.forEach(l => { l._source = `PDF: ${file.name}`; });
                    allLocations.push(...locs);
                }

                if (['xlsx', 'xls'].includes(ext)) {
                    setParseStatus(`Excel verwerken: ${file.name}...`);
                    const locs = await parseXlsx(file);
                    allLocations.push(...locs);
                }

                if (['docx', 'doc'].includes(ext)) {
                    setParseStatus(`Word document verwerken: ${file.name}...`);
                    const docxData = await parseDocx(file, (status) => {
                        setParseStatus(`DOCX ${file.name}: ${status}`);
                    });
                    const locs = docxToLocations(docxData);
                    allLocations.push(...locs);
                }
            }

            // Deduplicate by locatiecode (merge data from multiple sources)
            const merged = new Map();
            for (const loc of allLocations) {
                const key = loc.locatiecode;
                if (merged.has(key)) {
                    const existing = merged.get(key);
                    // Merge: prefer non-empty values, combine stoffen
                    for (const [k, v] of Object.entries(loc)) {
                        if (k === 'stoffen') {
                            existing.stoffen = [...(existing.stoffen || []), ...(v || [])];
                        } else if (v && !existing[k]) {
                            existing[k] = v;
                        }
                    }
                    // If any source says complex, mark complex
                    if (loc.complex) existing.complex = true;
                } else {
                    merged.set(key, { ...loc });
                }
            }

            // Enrich with external APIs (PDOK, Topotijdreis, etc.)
            const mergedArr = [...merged.values()];
            setParseStatus(`Data verrijken met PDOK/Topotijdreis (${mergedArr.length} locaties)...`);
            const enriched = await enrichAllLocations(mergedArr, (i, total) => {
                setParseStatus(`Locatie verrijken: ${i}/${total}...`);
            });

            // Mark complex based on API results & ABEL Protocol rules
            enriched.forEach(loc => {
                const bkKlasse = loc._enriched?.bodemkwaliteit?.[0]?.klasse?.toLowerCase() || '';
                const buildings = loc._enriched?.buildings || [];

                // 1. PDOK Bodemkwaliteit triggers
                if (
                    bkKlasse.includes('wonen') ||
                    bkKlasse.includes('industrie') ||
                    bkKlasse.includes('klasse a') ||
                    bkKlasse.includes('klasse b') ||
                    bkKlasse.includes('niet toepasbaar') ||
                    bkKlasse.includes('maximale')
                ) {
                    loc.complex = true;
                    const apiOpmerking = `Let op: API Bodemkwaliteit geeft klasse '${loc._enriched.bodemkwaliteit[0].klasse}'.`;
                    if (!loc.opmerkingenAbel) loc.opmerkingenAbel = apiOpmerking;
                    else if (!loc.opmerkingenAbel.includes('API Bodemkwaliteit')) {
                        loc.opmerkingenAbel = `${loc.opmerkingenAbel} | ${apiOpmerking}`;
                    }
                }

                // 2. ABEL Protocol: Asbestverdachte periode (1945-1995)
                // If any building within 25m tracé was built/modified between 1945 and 1995
                const suspectBuildings = buildings.filter(b => b.bouwjaar >= 1945 && b.bouwjaar <= 1995);
                if (suspectBuildings.length > 0) {
                    loc.complex = true;
                    const bStr = suspectBuildings.map(b => b.bouwjaar).join(', ');
                    const asbestOpmerking = `ASBEST VERDACHT: Bouwjaar pand(en) nabij tracé in asbest-periode 1945-1995 (${bStr}).`;
                    if (!loc.opmerkingenAbel) loc.opmerkingenAbel = asbestOpmerking;
                    else if (!loc.opmerkingenAbel.includes('ASBEST VERDACHT')) {
                        loc.opmerkingenAbel = `${loc.opmerkingenAbel} | ${asbestOpmerking}`;
                    }
                }

                // 3. Verdachte activiteiten (trefwoorden uit rapportage)
                const textToCheck = `${loc.locatienaam} ${loc.opmerking || ''} ${loc.conclusie || ''}`.toLowerCase();
                const keywords = ['glastuinbouw', 'garage', 'benzinestation', 'boomgaard', 'ophooglaag', 'demping'];
                const foundKeyword = keywords.find(k => textToCheck.includes(k));
                if (foundKeyword) {
                    loc.complex = true;
                    const actOpmerking = `VERDACHTE ACTIVITEIT gevonden: ${foundKeyword}.`;
                    if (!loc.opmerkingenAbel) loc.opmerkingenAbel = actOpmerking;
                    else if (!loc.opmerkingenAbel.includes('VERDACHTE ACTIVITEIT')) {
                        loc.opmerkingenAbel = `${loc.opmerkingenAbel} | ${actOpmerking}`;
                    }
                }

                // 4. HBB (Historisch Bodem Bestand) data check
                const hbb = loc._enriched?.hbb || [];
                if (hbb.length > 0) {
                    loc.complex = true;
                    const hbbStr = hbb.map(h => `${h.type}: ${h.naam}`).join(', ');
                    const hbbOpmerking = `HBB MELDING: ${hbbStr}.`;
                    if (!loc.opmerkingenAbel) loc.opmerkingenAbel = hbbOpmerking;
                    else if (!loc.opmerkingenAbel.includes('HBB MELDING')) {
                        loc.opmerkingenAbel = `${loc.opmerkingenAbel} | ${hbbOpmerking}`;
                    }
                }
            });

            setLocations(enriched);
            setStep(2);
        } catch (err) {
            console.error('Parse error:', err);
            setParseStatus(`Fout: ${err.message}`);
        } finally {
            setParsing(false);
        }
    }, []);

    return (
        <div className="app">
            <header className="app-header">
                <h1>TOB Parser</h1>
                <p>Upload TOB rapporten → Automatische Geocodering & Protocol Check → Excel Export</p>
            </header>

            {/* Steps */}
            <div className="steps">
                {STEPS.map(s => (
                    <div
                        key={s.id}
                        className={`step ${step === s.id ? 'active' : ''} ${step > s.id ? 'completed' : ''}`}
                        onClick={() => {
                            if (s.id === 1 || (s.id <= step)) setStep(s.id);
                        }}
                        style={{ cursor: s.id <= step ? 'pointer' : 'default' }}
                    >
                        <span className="step-number">
                            {step > s.id ? '✓' : s.id}
                        </span>
                        {s.label}
                    </div>
                ))}
            </div>

            {/* Step 1: Upload */}
            {step === 1 && (
                <div>
                    <FileUpload onFilesReady={handleFilesReady} />
                    {parsing && (
                        <div className="parsing-status">
                            <div className="spinner" />
                            {parseStatus}
                        </div>
                    )}
                </div>
            )}

            {/* Step 2: Preview */}
            {step === 2 && (
                <div>
                    <DataPreview
                        locations={locations}
                        onLocationsUpdate={setLocations}
                    />
                    <div className="btn-group">
                        <button className="btn btn-secondary" onClick={() => setStep(1)}>
                            ← Terug
                        </button>
                        <button className="btn btn-primary" onClick={() => setStep(3)}>
                            Ga naar Export →
                        </button>
                    </div>
                </div>
            )}

            {/* Step 3: Export */}
            {step === 3 && (
                <div>
                    <ExportPanel locations={locations} />
                    <div className="btn-group">
                        <button className="btn btn-secondary" onClick={() => setStep(2)}>
                            ← Terug naar Preview
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
