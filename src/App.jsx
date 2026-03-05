import { useState, useCallback, useEffect } from 'react';
import FileUpload from './components/FileUpload';
import DataPreview from './components/DataPreview';
import ExportPanel from './components/ExportPanel';
import { extractPdfText, parseTobReport, mergeToLocations } from './utils/pdfParser';
import { parseXlsx, xlsxToLocations } from './utils/xlsxParser';
import { parseDocx, docxToLocations } from './utils/docxParser';
import { enrichAllLocations, triggerDeepScanBatch, detectCityFromText, wgs84ToRd, getGithubToken } from './utils/apiIntegrations';
import { extractAllPostcodes } from './utils/traceExtraction';
import { assessLocation } from './utils/smartFill';
import './index.css';

const STEPS = [
    { id: 1, label: 'Upload' },
    { id: 2, label: 'Preview' },
    { id: 3, label: 'Export' },
];

export default function App() {
    const [step, setStep] = useState(1);
    const [locations, setLocations] = useState([]);
    const [projectAddress, setProjectAddress] = useState(null);
    const [projectTrace, setProjectTrace] = useState(null);
    const [parsing, setParsing] = useState(false);
    const [parseStatus, setParseStatus] = useState('');
    const [tesseractReady, setTesseractReady] = useState(false);

    // Pre-initialize Tesseract on app load for OCR support
    useEffect(() => {
        const initTesseract = async () => {
            try {
                console.log('🚀 [App] Pre-initializing Tesseract for OCR...');
                setParseStatus('📥 Tesseract OCR-engine aan het laden (eenmalig, ~20MB)...');

                // Import dynamically to avoid loading if not used
                const Tesseract = (await import('tesseract.js')).default;

                // Create worker - this downloads the WASM file
                const worker = await Promise.race([
                    Tesseract.createWorker('nld', 1, {
                        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5/tesseract-core.wasm.js',
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Tesseract init timeout')), 120000)
                    )
                ]);

                console.log('✅ [App] Tesseract ready for use');
                setTesseractReady(true);
                setParseStatus('');

                // Store worker globally for reuse
                window.__tesseractWorker = worker;
            } catch (err) {
                console.warn('⚠️ [App] Tesseract pre-init failed (will try on demand):', err.message);
                setTesseractReady(false);
                // Don't block app - OCR will be attempted on demand
                setParseStatus('');
            }
        };

        initTesseract();
    }, []);

    const handleFilesReady = useCallback(async (files) => {
        setParsing(true);
        setParseStatus('Bestanden verwerken...');
        const allLocations = [];
        let capturedAddress = null;
        let capturedTrace = null;
        const allDocumentPostcodes = new Set(); // postcodes from all raw document texts

        // Helper to add timeout to async operations
        const withTimeout = async (promise, timeoutMs, label) => {
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error(`Timeout: ${label} (>${timeoutMs}ms)`)), timeoutMs)
            );
            return Promise.race([promise, timeoutPromise]);
        };

        try {
            console.log(`📂 [App] Starting to process ${files.length} file(s)...`);
            for (const file of files) {
                const ext = file.name.toLowerCase().split('.').pop();
                if (ext === 'pdf') {
                    setParseStatus(`📄 PDF verwerken: ${file.name}...`);
                    try {
                        const { fullText } = await withTimeout(
                            extractPdfText(file, (page, total) => {
                                setParseStatus(`📄 PDF ${file.name}: pagina ${page}/${total}`);
                            }),
                            60000,
                            'PDF extraction'
                        );
                        // Collect postcodes from full text for geo-context
                        extractAllPostcodes(fullText).forEach(pc => allDocumentPostcodes.add(pc));
                        const parsed = parseTobReport(fullText);
                        setParseStatus(`✅ PDF geparst: ${parsed.locatiecodes.length} locaties gevonden`);
                        const locs = mergeToLocations(parsed);
                        locs.forEach(l => { l._source = `PDF: ${file.name}`; });
                        allLocations.push(...locs);
                        // Capture project address & trace if found
                        if (parsed.projectAddress && !capturedAddress) {
                            capturedAddress = parsed.projectAddress;
                            setParseStatus(`📍 Projectadres gevonden: ${parsed.projectAddress.straatnaam}`);
                        }
                        if (parsed.projectTrace && !capturedTrace) {
                            capturedTrace = parsed.projectTrace;
                            setParseStatus(`📏 Tracé gevonden: ${parsed.projectTrace.description}`);
                        }
                    } catch (pdfErr) {
                        console.error('❌ [PDF] Processing error:', pdfErr);
                        setParseStatus(`❌ PDF fout: ${pdfErr.message}`);
                        // Continue with other files even if one fails
                    }
                } else if (['xlsx', 'xls'].includes(ext)) {
                    setParseStatus(`📊 Excel verwerken: ${file.name}...`);
                    try {
                        const xlsxData = await withTimeout(
                            parseXlsx(file, (status) => {
                                setParseStatus(`📊 Excel ${file.name}: ${status}`);
                            }),
                            30000,
                            'Excel parsing'
                        );
                        setParseStatus(`✅ Excel geparst: ${xlsxData.locatiecodes.length} locaties gevonden`);
                        const locs = xlsxToLocations(xlsxData);
                        allLocations.push(...locs);
                        // Capture project address if found
                        if (xlsxData.projectAddress && !capturedAddress) {
                            capturedAddress = xlsxData.projectAddress;
                            setParseStatus(`📍 Projectadres gevonden: ${xlsxData.projectAddress.straatnaam}`);
                        }
                    } catch (xlsxErr) {
                        console.error('❌ [XLSX] Processing error:', xlsxErr);
                        setParseStatus(`❌ Excel fout: ${xlsxErr.message}`);
                    }
                } else if (['docx', 'doc'].includes(ext)) {
                    setParseStatus(`📝 Word document verwerken: ${file.name}...`);
                    try {
                        const docxData = await withTimeout(
                            parseDocx(file, (status) => {
                                setParseStatus(`📝 DOCX ${file.name}: ${status}`);
                            }),
                            90000, // Longer timeout for DOCX with OCR
                            'DOCX parsing'
                        );
                        setParseStatus(`✅ DOCX geparst: ${docxData.locatiecodes.length} locaties gevonden`);
                        // Collect postcodes from full text for geo-context
                        if (docxData.fullText) {
                            extractAllPostcodes(docxData.fullText).forEach(pc => allDocumentPostcodes.add(pc));
                        }
                        const locs = docxToLocations(docxData);
                        allLocations.push(...locs);
                        // Capture project address & trace if found
                        if (docxData.projectAddress && !capturedAddress) {
                            capturedAddress = docxData.projectAddress;
                            setParseStatus(`📍 Projectadres gevonden: ${docxData.projectAddress.straatnaam}`);
                        }
                        if (docxData.projectTrace && !capturedTrace) {
                            capturedTrace = docxData.projectTrace;
                            setParseStatus(`📏 Tracé gevonden: ${docxData.projectTrace.description}`);
                        }
                    } catch (docxErr) {
                        console.error('❌ [DOCX] Processing error:', docxErr);
                        setParseStatus(`❌ DOCX fout: ${docxErr.message}`);
                    }
                }
            }

            // --- Phase 26: City Context Extraction ---
            let detectedCity = null;
            for (const file of files) {
                detectedCity = detectCityFromText(file.name);
                if (detectedCity) {
                    console.log(`🏙️ [Context] Detected city from filename: ${detectedCity}`);
                    break;
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
                            const merged = [...(existing.stoffen || []), ...(v || [])];
                            // Deduplicate stoffen by stof name, keeping highest waarde
                            const stofMap = new Map();
                            for (const s of merged) {
                                const key = s.stof?.toLowerCase();
                                if (!stofMap.has(key) || (s.waarde > stofMap.get(key).waarde)) {
                                    stofMap.set(key, s);
                                }
                            }
                            existing.stoffen = [...stofMap.values()];
                        } else if (v && !existing[k]) {
                            existing[k] = v;
                        }
                    }
                } else {
                    merged.set(key, { ...loc });
                }
            }

            const mergedArr = [...merged.values()];
            console.log(`📦 [App] Merged into ${mergedArr.length} unique locations.`);

            // Search for city in project titles if not found in filename
            if (!detectedCity) {
                for (const loc of mergedArr) {
                    detectedCity = detectCityFromText(loc.locatienaam);
                    if (detectedCity) {
                        console.log(`🏙️ [Context] Detected city from project title: ${detectedCity}`);
                        break;
                    }
                }
            }

            if (mergedArr.length === 0) {
                setParseStatus('⚠️ Geen locaties gevonden. Controleer de geüploade bestanden.');
                throw new Error('No locations extracted from files');
            }

            setParseStatus(`🔍 Diepgaand onderzoek start voor ${mergedArr.length} locatie(s)...`);
            const enriched = await withTimeout(
                enrichAllLocations(mergedArr, (i, total) => {
                    setParseStatus(`🔍 Locatie ${i}/${total} onderzoeken (BAG, HBB, PDOK)...`);
                }, detectedCity, [...allDocumentPostcodes]),
                300000, // 5 minute timeout for enrichment
                'Location enrichment'
            );

            const finalLocations = enriched.map(loc => assessLocation(loc));
            setLocations(finalLocations);
            setProjectAddress(capturedAddress);
            setProjectTrace(capturedTrace);
            setStep(2);

            // --- Automatic Deep Scan Trigger ---
            const token = getGithubToken();
            if (token) {
                setParseStatus('☁️ Cloud-onderzoek (Bodemloket/Topotijdreis) wordt gestart...');
                try {
                    await triggerDeepScanBatch(finalLocations, token, 'PietOff', 'TOB-Parser');
                    setParseStatus('✅ Deep Scan succesvol gestart op GitHub! Onderzoek loopt op de achtergrond.');
                    // Small delay so user can read the success message
                    await new Promise(r => setTimeout(r, 2000));
                    console.log('✅ Batch Deep Scan gestart voor', finalLocations.length, 'locaties');
                } catch (dispatchErr) {
                    console.warn('⚠️ Batch Deep Scan kon niet automatisch starten:', dispatchErr.message);
                    setParseStatus(`⚠️ Cloud-scan start mislukt: ${dispatchErr.message}. Werk handmatig verder.`);
                    await new Promise(r => setTimeout(r, 3000));
                }
            } else {
                console.log('ℹ️ Geen GitHub token gevonden — Deep Scan overgeslagen.');
            }

        } catch (err) {
            console.error('❌ [App] Parse error:', err);
            const errorMsg = err?.message || String(err);
            const shortMsg = errorMsg.length > 200 ? errorMsg.substring(0, 200) + '...' : errorMsg;
            setParseStatus(`❌ FOUT:\n${shortMsg}`);
            // Also try to show more helpful message
            if (errorMsg.includes('Timeout')) {
                setParseStatus(`⏱️ TIMEOUT - Bestand is te groot of het duurt te lang. Probeer een kleiner bestand.`);
            }
        } finally {
            setParsing(false);
        }
    }, []);

    // Handle manual marker drag from the map
    const handleLocationDrag = (locatiecode, newLat, newLng) => {
        setLocations(prevLocations =>
            prevLocations.map(loc => {
                if (loc.locatiecode === locatiecode || loc.id === locatiecode) {
                    const newRd = wgs84ToRd(newLat, newLng);

                    console.log(`🗺️ [Map] Manual correction for ${locatiecode}: Lat ${newLat.toFixed(5)}, Lng ${newLng.toFixed(5)} -> RD X: ${newRd.x}, Y: ${newRd.y}`);

                    return {
                        ...loc,
                        _enriched: {
                            ...loc._enriched,
                            lat: newLat,
                            lon: newLng,
                            rd: newRd
                        },
                        rdX: newRd.x,
                        rdY: newRd.y
                    };
                }
                return loc;
            })
        );
    };

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
                        <div className="parsing-overlay">
                            <div className="parsing-modal">
                                <div className="spinner spinner-lg" />
                                <div className="parsing-title">Bestand verwerken...</div>
                                <div className="parsing-message">{parseStatus}</div>
                                <div className="parsing-hint">Dit kan even duren</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Step 2 & 3: Preview & Map (Map must stay in DOM for export screenshot) */}
            {(step === 2 || step === 3) && (
                <div style={step === 3 ? { position: 'absolute', left: '-9999px', top: 0, width: '1200px', opacity: 1, pointerEvents: 'none' } : undefined}>
                    <DataPreview
                        locations={locations}
                        onLocationsUpdate={setLocations}
                        onLocationDrag={handleLocationDrag}
                        projectAddress={projectAddress}
                        projectTrace={projectTrace}
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
