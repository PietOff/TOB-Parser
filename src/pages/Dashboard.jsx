import { useState, useEffect, useCallback } from 'react';
import FileUpload from '../components/FileUpload';
import { extractPdfText, parseTobReport, mergeToLocations } from '../utils/pdfParser';
import { parseXlsx, xlsxToLocations } from '../utils/xlsxParser';
import { parseDocx, docxToLocations } from '../utils/docxParser';
import { detectCityFromText, fetchZoekregels, geocodeLocations } from '../utils/apiIntegrations';
import { assessLocation } from '../utils/smartFill';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
    saveProject,
    saveLocations,
    saveResearches,
} from '../services/api';
import '../index.css';



export default function Dashboard() {
    const [parsing, setParsing] = useState(false);
    const [parseStatus, setParseStatus] = useState('');
    const [zoekregels, setZoekregels] = useState([]);
    const [isSaving, setIsSaving] = useState(false);

    const { isAdmin, user, signOut } = useAuth();
    const navigate = useNavigate();

    // Pre-initialize Tesseract on app load for OCR support
    useEffect(() => {
        const initTesseract = async () => {
            try {
                console.log('🚀 [App] Pre-initializing Tesseract for OCR...');
                setParseStatus('📥 Tesseract OCR-engine aan het laden (eenmalig, ~20MB)...');

                const Tesseract = (await import('tesseract.js')).default;

                const worker = await Promise.race([
                    Tesseract.createWorker('nld', 1, {
                        corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5/tesseract-core.wasm.js',
                    }),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('Tesseract init timeout')), 120000)
                    )
                ]);

                console.log('✅ [App] Tesseract ready for use');
                setParseStatus('');
                window.__tesseractWorker = worker;
            } catch (err) {
                console.warn('⚠️ [App] Tesseract pre-init failed (will try on demand):', err.message);
                setParseStatus('');
            }
        };

        const loadRules = async () => {
            const rules = await fetchZoekregels();
            setZoekregels(rules);
        };

        initTesseract();
        loadRules();
    }, []);

    const handleFilesReady = useCallback(async (files) => {
        setParsing(true);
        setParseStatus('Bestanden verwerken...');
        const allLocations = [];
        let capturedAddress = null;
        let capturedTrace = null;

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
                        const parsed = parseTobReport(fullText, zoekregels);
                        setParseStatus(`✅ PDF geparst: ${parsed.locatiecodes.length} locaties gevonden`);
                        const locs = mergeToLocations(parsed, zoekregels);
                        locs.forEach(l => { l._source = `PDF: ${file.name}`; });
                        allLocations.push(...locs);
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
                            90000,
                            'DOCX parsing'
                        );
                        setParseStatus(`✅ DOCX geparst: ${docxData.locatiecodes.length} locaties gevonden`);
                        const locs = docxToLocations(docxData, zoekregels);
                        allLocations.push(...locs);
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

            // Stad detecteren
            let detectedCity = null;
            for (const file of files) {
                detectedCity = detectCityFromText(file.name);
                if (detectedCity) {
                    console.log(`🏙️ [Context] Detected city from filename: ${detectedCity}`);
                    break;
                }
            }

            // Dedupliceren en mergen
            const merged = new Map();
            for (const loc of allLocations) {
                const key = loc.locatiecode;
                if (merged.has(key)) {
                    const existing = merged.get(key);
                    for (const [k, v] of Object.entries(loc)) {
                        if (k === 'stoffen') {
                            const mergedStof = [...(existing.stoffen || []), ...(v || [])];
                            const stofMap = new Map();
                            for (const s of mergedStof) {
                                const sKey = s.stof?.toLowerCase();
                                if (!stofMap.has(sKey) || (s.waarde > stofMap.get(sKey).waarde)) {
                                    stofMap.set(sKey, s);
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

            if (!detectedCity) {
                for (const loc of mergedArr) {
                    detectedCity = detectCityFromText(loc.locatienaam);
                    if (detectedCity) break;
                }
            }

            if (mergedArr.length === 0) {
                setParseStatus('⚠️ Geen locaties gevonden. Controleer de geüploade bestanden.');
                throw new Error('No locations extracted from files');
            }

            // Apply smartFill assessment
            setParseStatus(`🔎 Locaties analyseren (${mergedArr.length})...`);
            const assessed = mergedArr.map(loc => assessLocation(loc));

            // ── Phase 2b: PDOK geocoding — street names → canonical Dutch addresses + coordinates ──
            setParseStatus('📍 Straatnamen opzoeken in PDOK adressenregister...');
            const finalLocations = await geocodeLocations(assessed, (msg) => setParseStatus(msg));

            // ── Phase 3: Sla op naar Supabase ──────────────────────────────
            setIsSaving(true);
            setParseStatus('💾 Opslaan in database...');
            try {
                // Projectnaam: gebruik eerste bestandsnaam zonder extensie
                const projectName = files[0]?.name.replace(/\.[^/.]+$/, '') ?? 'Nieuw Project';
                // Opdrachtgever: afgeleid van capturedAddress of leeglaten
                const clientName = null; // Client name not available from TOB report parsing

                const newProjectId = await saveProject(projectName, clientName);
                console.log(`✅ [DB] Project aangemaakt: ${newProjectId}`);

                setParseStatus(`💾 ${finalLocations.length} locaties opslaan...`);
                const savedRows = await saveLocations(newProjectId, finalLocations);
                console.log(`✅ [DB] ${savedRows.length} locaties opgeslagen`);

                // Standaard research-record aanmaken per locatie
                for (const row of savedRows) {
                    try {
                        await saveResearches(row.id, [
                            { type: 'Nazca (Bodemonderzoek)', status: 'Nog op te vragen', notes: '' }
                        ]);
                    } catch (resErr) {
                        console.warn(`⚠️ [DB] Research insert mislukt voor ${row.locatiecode}:`, resErr.message);
                    }
                }

                setParseStatus('✅ Opgeslagen in database!');
                console.log(`✅ [DB] Alles opgeslagen voor project ${newProjectId}`);

                // Redirect to project detail page
                setParsing(false);
                setIsSaving(false);
                navigate(`/project/${newProjectId}`);
                
            } catch (dbErr) {
                console.error('❌ [DB] Opslaan mislukt:', dbErr);
                setParseStatus(`⚠️ Parsing klaar maar DB-opslag mislukt: ${dbErr.message}`);
            } finally {
                setIsSaving(false);
            }

        } catch (err) {
            console.error('❌ [App] Parse error:', err);
            const errorMsg = err?.message || String(err);
            const shortMsg = errorMsg.length > 200 ? errorMsg.substring(0, 200) + '...' : errorMsg;
            if (errorMsg.includes('Timeout')) {
                setParseStatus('⏱️ TIMEOUT - Bestand is te groot of het duurt te lang. Probeer een kleiner bestand.');
            } else {
                setParseStatus(`❌ FOUT:\n${shortMsg}`);
            }
        } finally {
            setParsing(false);
        }
    }, [zoekregels]);



    return (
        <div className="app">
            <header className="app-header" style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: '15px', right: '20px', display: 'flex', gap: '10px' }}>
                    {isAdmin && (
                        <button
                            onClick={() => navigate('/beheer')}
                            style={{ padding: '6px 12px', background: 'white', color: '#1a365d', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                            ⚙️ Beheer Gebruikers
                        </button>
                    )}
                    <button
                        onClick={() => navigate('/projecten')}
                        style={{ padding: '6px 12px', background: 'white', color: '#1a365d', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
                    >
                        📁 Projectenbeheer
                    </button>
                    <button
                        onClick={signOut}
                        style={{ padding: '6px 12px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Uitloggen
                    </button>
                </div>
                <h1>AbelTalent TOB Backoffice</h1>
                <p>Kies een bestaand project of upload een nieuw TOB rapport.</p>
            </header>

            {/* Dashboard Upload & Lobby */}
            <div style={{ maxWidth: '900px', margin: '2rem auto', display: 'flex', flexDirection: 'column', gap: '2rem', padding: '0 1rem' }}>
                
                {/* Projectenbeheer link */}
                <button
                    onClick={() => navigate('/projecten')}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '1rem 1.25rem',
                        background: 'white',
                        border: '1px solid var(--border, #e2e8f0)',
                        borderRadius: '8px',
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'box-shadow 0.15s',
                    }}
                    onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'}
                    onMouseOut={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <span style={{ fontSize: '1.8rem' }}>📁</span>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Bestaande projecten openen</div>
                            <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '2px' }}>Bekijk, filter en beheer al je TOB-projecten</div>
                        </div>
                    </div>
                    <span style={{ fontSize: '1.2rem', color: '#94a3b8' }}>→</span>
                </button>

                {/* Upload sectie */}
                <div>
                    <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>➕ Nieuw Project Parse & Upload</h3>
                    <FileUpload onFilesReady={handleFilesReady} />
                    {(parsing || isSaving) && (
                        <div className="parsing-overlay">
                            <div className="parsing-modal">
                                <div className="spinner spinner-lg" />
                                <div className="parsing-title">
                                    {isSaving ? 'Opslaan in database...' : 'Bestand verwerken...'}
                                </div>
                                <div className="parsing-message">{parseStatus}</div>
                                <div className="parsing-hint">Dit kan even duren. Je wordt hierna automatisch doorgestuurd naar de kaart.</div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
