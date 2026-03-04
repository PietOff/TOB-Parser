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
                <p>Upload TOB bodemrapporten → automatische analyse → export naar Google Sheets</p>
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
