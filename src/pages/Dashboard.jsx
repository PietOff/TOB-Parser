import { useState, useCallback, useEffect } from 'react';
import FileUpload from '../components/FileUpload';
import DataPreview from '../components/DataPreview';
import ExportPanel from '../components/ExportPanel';
import { extractPdfText, parseTobReport, mergeToLocations } from '../utils/pdfParser';
import { parseXlsx, xlsxToLocations } from '../utils/xlsxParser';
import { parseDocx, docxToLocations } from '../utils/docxParser';
import { enrichAllLocations, triggerDeepScanBatch, detectCityFromText, wgs84ToRd, getGithubToken, fetchZoekregels } from '../utils/apiIntegrations';
import { assessLocation } from '../utils/smartFill';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
    saveProject,
    saveLocations,
    saveResearches,
    fetchProjects,
    fetchLocations,
    dbRowToLocation,
} from '../services/api';
import '../index.css';

const STEPS = [
    { id: 1, label: 'Upload' },
    { id: 2, label: 'Preview' },
    { id: 3, label: 'Export' },
];

export default function Dashboard() {
    const [step, setStep] = useState(1);
    const [locations, setLocations] = useState([]);
    const [projectAddress, setProjectAddress] = useState(null);
    const [projectTrace, setProjectTrace] = useState(null);
    const [parsing, setParsing] = useState(false);
    const [parseStatus, setParseStatus] = useState('');
    const [tesseractReady, setTesseractReady] = useState(false);
    const [zoekregels, setZoekregels] = useState([]);

    // ── Phase 3: project-state ──────────────────────────────────────────
    const [currentProjectId, setCurrentProjectId] = useState(null);
    const [projects, setProjects] = useState([]);
    const [projectsLoading, setProjectsLoading] = useState(true);
    const [saveError, setSaveError] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    // ───────────────────────────────────────────────────────────────────

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
                setTesseractReady(true);
                setParseStatus('');
                window.__tesseractWorker = worker;
            } catch (err) {
                console.warn('⚠️ [App] Tesseract pre-init failed (will try on demand):', err.message);
                setTesseractReady(false);
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

    // ── Phase 3: laad projecten-lijst bij startup ───────────────────────
    useEffect(() => {
        const loadProjects = async () => {
            try {
                setProjectsLoading(true);
                const data = await fetchProjects();
                setProjects(data);
            } catch (err) {
                console.error('❌ [DB] Fout bij laden projecten:', err);
            } finally {
                setProjectsLoading(false);
            }
        };
        loadProjects();
    }, []);

    // ── Phase 3: laad locaties van geselecteerd project ────────────────
    const loadProjectLocations = useCallback(async (projectId) => {
        if (!projectId) return;
        try {
            setParseStatus('📂 Project laden uit database...');
            const rows = await fetchLocations(projectId);
            const locs = rows.map(dbRowToLocation);
            setLocations(locs);
            setCurrentProjectId(projectId);
            setStep(2);
            setParseStatus('');
        } catch (err) {
            console.error('❌ [DB] Fout bij laden locaties:', err);
            setParseStatus(`❌ Laden mislukt: ${err.message}`);
        }
    }, []);

    const handleFilesReady = useCallback(async (files) => {
        setParsing(true);
        setSaveError(null);
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

            setParseStatus(`🔍 Diepgaand onderzoek start voor ${mergedArr.length} locatie(s)...`);
            const enriched = await withTimeout(
                enrichAllLocations(mergedArr, (i, total) => {
                    setParseStatus(`🔍 Locatie ${i}/${total} onderzoeken (BAG, HBB, PDOK)...`);
                }, detectedCity),
                300000,
                'Location enrichment'
            );

            const finalLocations = enriched.map(loc => assessLocation(loc));

            // ── Phase 3: Sla op naar Supabase ──────────────────────────────
            setIsSaving(true);
            setParseStatus('💾 Opslaan in database...');
            try {
                // Projectnaam: gebruik eerste bestandsnaam zonder extensie
                const projectName = files[0]?.name.replace(/\.[^/.]+$/, '') ?? 'Nieuw Project';
                // Opdrachtgever: afgeleid van capturedAddress of leeglaten
                const clientName = capturedAddress?.woonplaats ?? null;

                const newProjectId = await saveProject(projectName, clientName);
                console.log(`✅ [DB] Project aangemaakt: ${newProjectId}`);

                setParseStatus(`💾 ${finalLocations.length} locaties opslaan...`);
                const savedRows = await saveLocations(newProjectId, finalLocations);
                console.log(`✅ [DB] ${savedRows.length} locaties opgeslagen`);

                // Standaard research-records aanmaken per locatie
                for (const row of savedRows) {
                    try {
                        await saveResearches(row.id, {
                            bag_check:  !!finalLocations.find(l => l.locatiecode === row.locatiecode)?._enriched?.bag,
                            pdok_check: !!finalLocations.find(l => l.locatiecode === row.locatiecode)?._enriched?.bodemkwaliteit,
                            hbb_check:  !!finalLocations.find(l => l.locatiecode === row.locatiecode)?._enriched?.hbb,
                        });
                    } catch (resErr) {
                        // Niet kritiek — log en ga door
                        console.warn(`⚠️ [DB] Research insert mislukt voor ${row.locatiecode}:`, resErr.message);
                    }
                }

                // Zet DB-IDs in de React state zodat latere updates weten welke rij ze moeten patchen
                const locationsWithDbIds = finalLocations.map((loc) => {
                    const savedRow = savedRows.find(r => r.locatiecode === loc.locatiecode);
                    return savedRow ? { ...loc, _db_id: savedRow.id, project_id: newProjectId } : loc;
                });

                setCurrentProjectId(newProjectId);
                setLocations(locationsWithDbIds);
                setProjectAddress(capturedAddress);
                setProjectTrace(capturedTrace);

                // Vernieuw de projectenlijst in de sidebar
                setProjects(prev => [
                    { id: newProjectId, name: projectName, client: clientName, created_at: new Date().toISOString() },
                    ...prev,
                ]);

                setParseStatus('✅ Opgeslagen in database!');
                console.log(`✅ [DB] Alles opgeslagen voor project ${newProjectId}`);
            } catch (dbErr) {
                console.error('❌ [DB] Opslaan mislukt:', dbErr);
                setSaveError(dbErr.message);
                // Toon toch de data in de UI, ook al mislukte de DB-opslag
                setLocations(finalLocations);
                setProjectAddress(capturedAddress);
                setProjectTrace(capturedTrace);
                setParseStatus(`⚠️ Parsing klaar maar DB-opslag mislukt: ${dbErr.message}`);
            } finally {
                setIsSaving(false);
            }
            // ───────────────────────────────────────────────────────────────

            setStep(2);

            // Deep Scan triggeren
            const token = getGithubToken();
            if (token) {
                setParseStatus('☁️ Cloud-onderzoek (Bodemloket/Topotijdreis) wordt gestart...');
                try {
                    await triggerDeepScanBatch(finalLocations, token, 'PietOff', 'TOB-Parser');
                    setParseStatus('✅ Deep Scan succesvol gestart op GitHub!');
                    await new Promise(r => setTimeout(r, 2000));
                } catch (dispatchErr) {
                    console.warn('⚠️ Batch Deep Scan mislukt:', dispatchErr.message);
                    setParseStatus(`⚠️ Cloud-scan start mislukt: ${dispatchErr.message}.`);
                    await new Promise(r => setTimeout(r, 3000));
                }
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

    // Handle manual marker drag from the map
    const handleLocationDrag = useCallback((locatiecode, newLat, newLng) => {
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
    }, []);

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
                        onClick={signOut}
                        style={{ padding: '6px 12px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                    >
                        Uitloggen
                    </button>
                </div>
                <h1>TOB Backoffice</h1>
                <p>Upload TOB rapporten → Automatische Geocodering &amp; Protocol Check → Excel Export</p>
            </header>

            {/* ── Phase 3: Bestaande projecten laden ── */}
            {step === 1 && (
                <div style={{ maxWidth: '900px', margin: '1rem auto', padding: '0 1rem' }}>
                    <div style={{
                        background: 'var(--bg-secondary, #f8fafc)',
                        border: '1px solid var(--border, #e2e8f0)',
                        borderRadius: '8px',
                        padding: '1rem 1.25rem',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>📁 Eerdere Projecten</h3>
                            {projectsLoading && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Laden...</span>}
                        </div>

                        {!projectsLoading && projects.length === 0 && (
                            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                                Nog geen projecten. Upload hieronder een bestand om te beginnen.
                            </p>
                        )}

                        {projects.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: '200px', overflowY: 'auto' }}>
                                {projects.map(project => (
                                    <button
                                        key={project.id}
                                        onClick={() => loadProjectLocations(project.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '0.5rem 0.75rem',
                                            background: 'white',
                                            border: '1px solid var(--border, #e2e8f0)',
                                            borderRadius: '6px',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            fontSize: '0.875rem',
                                        }}
                                    >
                                        <span>
                                            <strong>{project.name}</strong>
                                            {project.client && <span style={{ color: 'var(--text-secondary)', marginLeft: '0.5rem' }}>— {project.client}</span>}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                            {new Date(project.created_at).toLocaleDateString('nl-NL')}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* DB save-fout melding */}
            {saveError && (
                <div style={{
                    maxWidth: '900px', margin: '0.5rem auto', padding: '0.75rem 1rem',
                    background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '6px',
                    fontSize: '0.875rem', color: '#856404'
                }}>
                    ⚠️ <strong>Database-opslag mislukt:</strong> {saveError} — Data is wel zichtbaar maar nog niet opgeslagen.
                </div>
            )}

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
                    {(parsing || isSaving) && (
                        <div className="parsing-overlay">
                            <div className="parsing-modal">
                                <div className="spinner spinner-lg" />
                                <div className="parsing-title">
                                    {isSaving ? 'Opslaan in database...' : 'Bestand verwerken...'}
                                </div>
                                <div className="parsing-message">{parseStatus}</div>
                                <div className="parsing-hint">Dit kan even duren</div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Step 2 & 3 */}
            {(step === 2 || step === 3) && (
                <div style={step === 3 ? { position: 'absolute', left: '-9999px', top: 0, width: '1200px', opacity: 1, pointerEvents: 'none' } : undefined}>
                    <DataPreview
                        locations={locations}
                        onLocationsUpdate={setLocations}
                        onLocationDrag={handleLocationDrag}
                        projectAddress={projectAddress}
                        projectTrace={projectTrace}
                        projectId={currentProjectId}
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
                    <ExportPanel locations={locations} zoekregels={zoekregels} />
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
