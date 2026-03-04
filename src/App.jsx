import { useState, useCallback } from 'react';
import FileUpload from './components/FileUpload';
import DataPreview from './components/DataPreview';
import ExportPanel from './components/ExportPanel';
import { extractPdfText, parseTobReport, mergeToLocations } from './utils/pdfParser';
import { parseXlsx } from './utils/xlsxParser';
import { parseDocx, docxToLocations } from './utils/docxParser';
import { enrichAllLocations, triggerDeepScanBatch } from './utils/apiIntegrations';
import { assessLocation } from './utils/smartFill';

// GitHub token: reads from Vercel env var first, then localStorage
function getGithubToken() {
    return import.meta.env.VITE_GITHUB_TOKEN || localStorage.getItem('github_token') || null;
}
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
                } else if (['xlsx', 'xls'].includes(ext)) {
                    setParseStatus(`Excel verwerken: ${file.name}...`);
                    const locs = await parseXlsx(file);
                    allLocations.push(...locs);
                } else if (['docx', 'doc'].includes(ext)) {
                    setParseStatus(`Word document verwerken: ${file.name}...`);
                    const docxData = await parseDocx(file, (status) => {
                        setParseStatus(`DOCX ${file.name}: ${status}`);
                    });
                    const locs = docxToLocations(docxData);
                    allLocations.push(...locs);
                }
            }

            // Deduplicate and Merge
            const merged = new Map();
            for (const loc of allLocations) {
                const key = loc.locatiecode;
                if (merged.has(key)) {
                    const existing = merged.get(key);
                    for (const [k, v] of Object.entries(loc)) {
                        if (k === 'stoffen') {
                            existing.stoffen = [...(existing.stoffen || []), ...(v || [])];
                        } else if (v && !existing[k]) {
                            existing[k] = v;
                        }
                    }
                    if (loc.complex || (loc.conclusie && ['verdacht', 'verontreinigd'].includes(loc.conclusie.toLowerCase()))) {
                        existing.complex = true;
                    }
                } else {
                    merged.set(key, { ...loc });
                }
            }

            const mergedArr = [...merged.values()];
            console.log(`📦 [App] Merged into ${mergedArr.length} unique locations.`);

            setParseStatus(`Diepgaand onderzoek start voor ${mergedArr.length} locaties...`);
            const enriched = await enrichAllLocations(mergedArr, (i, total) => {
                setParseStatus(`Locatie ${i}/${total} onderzoeken (BAG, HBB, PDOK)...`);
            });

            const finalLocations = enriched.map(loc => assessLocation(loc));
            setLocations(finalLocations);
            setStep(2);

            // --- Automatic Deep Scan Trigger ---
            const token = getGithubToken();
            if (token) {
                setParseStatus('☁️ Cloud-onderzoek (Bodemloket/Topotijdreis) wordt gestart...');
                try {
                    await triggerDeepScanBatch(finalLocations, token, 'pieteroffereins', 'TOB-Parser');
                    console.log('✅ Batch Deep Scan gestart voor', finalLocations.length, 'locaties');
                } catch (dispatchErr) {
                    console.warn('⚠️ Batch Deep Scan kon niet automatisch starten:', dispatchErr.message);
                }
            } else {
                console.log('ℹ️ Geen GitHub token gevonden — Deep Scan overgeslagen. Stel VITE_GITHUB_TOKEN in op Vercel.');
            }

        } catch (err) {
            console.error('❌ [App] Parse error:', err);
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

            {/* Step 2 & 3: Preview & Map (Map must stay in DOM for export) */}
            {(step === 2 || step === 3) && (
                <div style={{ display: step === 3 ? 'none' : 'block' }}>
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

            {/* Step 3: Export Wrapper */}
            {step === 3 && (
                <div>
                    {/* Render Map invisibly if needed, but here we just keep the ID reachable */}
                    <div style={{ height: 0, overflow: 'hidden', opacity: 0, position: 'absolute', pointerEvents: 'none' }}>
                        <DataPreview locations={locations} />
                    </div>

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
