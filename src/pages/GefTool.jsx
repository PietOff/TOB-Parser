import { useState, useRef, useCallback, useMemo } from 'react';
import { saveAs } from 'file-saver';
import Navbar from '../components/Navbar';
import {
    parseGefFiles,
    buildCsv,
    csvBlob,
    formatDatumNl,
    CSV_KOLOMMEN,
} from '../utils/gefParser';
import '../index.css';

const isGef = (name) => /\.gef$/i.test(name);

// Excel-NL leest ; als kolomscheiding en , als decimaalteken; GIS-software en
// pandas verwachten precies het omgekeerde. Daarom een keuze i.p.v. een gok.
const FORMATEN = {
    excel: { label: 'Excel (NL)', separator: ';', decimaal: ',', datum: 'nl' },
    gis: { label: 'Standaard / GIS', separator: ',', decimaal: '.', datum: 'iso' },
};

export default function GefTool() {
    const [files, setFiles] = useState([]);
    const [rijen, setRijen] = useState([]);
    const [dragging, setDragging] = useState(false);
    const [bezig, setBezig] = useState(false);
    const [status, setStatus] = useState('');
    const [formaat, setFormaat] = useState('excel');

    const inputRef = useRef(null);
    const mapRef = useRef(null);

    const addFiles = useCallback((nieuwe) => {
        const gefs = Array.from(nieuwe).filter(f => isGef(f.name));
        const overgeslagen = nieuwe.length - gefs.length;

        setFiles(prev => {
            const samen = [...prev, ...gefs];
            // Bij het kiezen van een map kunnen dezelfde bestanden nogmaals
            // binnenkomen; ontdubbelen op naam + grootte.
            return samen.filter((f, i, arr) =>
                arr.findIndex(x => x.name === f.name && x.size === f.size) === i
            );
        });

        setStatus(overgeslagen > 0
            ? `${overgeslagen} bestand(en) overgeslagen (geen .gef)`
            : '');
        setRijen([]);
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(e.dataTransfer.files);
    }, [addFiles]);

    const verwerk = async () => {
        if (files.length === 0) return;
        setBezig(true);
        setStatus('');
        try {
            setRijen(await parseGefFiles(files, setStatus));
            setStatus('');
        } catch (err) {
            setStatus(`Verwerken mislukt: ${err.message}`);
        } finally {
            setBezig(false);
        }
    };

    const downloadCsv = () => {
        const opties = FORMATEN[formaat];
        const csv = buildCsv(rijen, opties);
        const datum = new Date().toISOString().split('T')[0];
        saveAs(csvBlob(csv), `GEF-export-${datum}.csv`);
    };

    const leegmaken = () => {
        setFiles([]);
        setRijen([]);
        setStatus('');
        if (inputRef.current) inputRef.current.value = '';
        if (mapRef.current) mapRef.current.value = '';
    };

    const metWaarschuwing = useMemo(
        () => rijen.filter(r => r.waarschuwingen.length > 0).length,
        [rijen]
    );
    const zonderCoords = useMemo(
        () => rijen.filter(r => r.x === null || r.y === null).length,
        [rijen]
    );

    return (
        <div className="page-shell">
            <Navbar />

            <div className="page-content-wide">
                <div className="dash-hero">
                    <h2>GEF naar CSV</h2>
                    <p>
                        Lees een hele map GEF-bestanden (sonderingen/boringen) in en exporteer
                        naam, datum en XY-coordinaten als CSV.
                    </p>
                </div>

                {/* Bestanden kiezen */}
                <div
                    className={`upload-zone ${dragging ? 'dragging' : ''}`}
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onClick={() => inputRef.current?.click()}
                >
                    <div className="upload-icon">📐</div>
                    <h3>Sleep GEF-bestanden hierheen</h3>
                    <p>of klik om te kiezen — alleen .gef wordt ingelezen</p>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        accept=".gef,.GEF"
                        style={{ display: 'none' }}
                        onChange={(e) => addFiles(e.target.files)}
                    />
                </div>

                <div className="btn-group" style={{ marginTop: '1rem' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => mapRef.current?.click()}
                    >
                        📁 Hele map kiezen
                    </button>
                    {files.length > 0 && (
                        <button className="btn btn-secondary" onClick={leegmaken}>
                            Lijst leegmaken
                        </button>
                    )}
                    <input
                        ref={mapRef}
                        type="file"
                        multiple
                        webkitdirectory=""
                        directory=""
                        style={{ display: 'none' }}
                        onChange={(e) => addFiles(e.target.files)}
                    />
                </div>

                {status && !bezig && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.75rem' }}>
                        {status}
                    </p>
                )}

                {files.length > 0 && (
                    <div className="btn-group" style={{ marginTop: '1rem' }}>
                        <button className="btn btn-primary" onClick={verwerk} disabled={bezig}>
                            {bezig ? 'Bezig...' : `🔍 ${files.length} GEF-bestand(en) verwerken`}
                        </button>
                    </div>
                )}

                {/* Resultaat */}
                {rijen.length > 0 && (
                    <>
                        <div className="stats-bar" style={{ marginTop: '2rem' }}>
                            <div className="stat-card">
                                <div className="stat-value">{rijen.length}</div>
                                <div className="stat-label">Bestanden gelezen</div>
                            </div>
                            <div className="stat-card">
                                <div
                                    className="stat-value"
                                    style={{ color: zonderCoords ? 'var(--danger)' : 'var(--success)' }}
                                >
                                    {rijen.length - zonderCoords}
                                </div>
                                <div className="stat-label">Met coordinaten</div>
                            </div>
                            <div className="stat-card">
                                <div
                                    className="stat-value"
                                    style={{ color: metWaarschuwing ? 'var(--warning)' : 'var(--success)' }}
                                >
                                    {metWaarschuwing}
                                </div>
                                <div className="stat-label">Met opmerking</div>
                            </div>
                        </div>

                        <div className="section-header">Export</div>
                        <div className="btn-group" style={{ marginTop: '1rem', alignItems: 'center' }}>
                            <select
                                className="inline-select"
                                value={formaat}
                                onChange={(e) => setFormaat(e.target.value)}
                            >
                                {Object.entries(FORMATEN).map(([key, f]) => (
                                    <option key={key} value={key}>
                                        {f.label} — scheiding "{f.separator}", decimaal "{f.decimaal}"
                                    </option>
                                ))}
                            </select>
                            <button className="btn btn-success" onClick={downloadCsv}>
                                ⬇ CSV downloaden
                            </button>
                        </div>

                        <div className="section-header">Voorbeeld</div>
                        <div className="table-wrapper" style={{ maxHeight: '60vh', overflow: 'auto' }}>
                            <table className="location-table">
                                <thead>
                                    <tr>
                                        {CSV_KOLOMMEN.map(k => <th key={k}>{k}</th>)}
                                        <th>Opmerking</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rijen.map((r, i) => (
                                        <tr key={`${r.bestand}-${i}`} className={r.waarschuwingen.length ? 'row-verdacht' : ''}>
                                            <td>{r.bestand}</td>
                                            <td>{r.naam}</td>
                                            <td>{formatDatumNl(r.datum)}</td>
                                            <td>{r.x ?? ''}</td>
                                            <td>{r.y ?? ''}</td>
                                            <td style={{ color: 'var(--text-secondary)', fontSize: '0.75rem' }}>
                                                {r.waarschuwingen.join('; ')}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}

                {bezig && (
                    <div className="parsing-overlay">
                        <div className="parsing-modal">
                            <div className="spinner spinner-lg" />
                            <div className="parsing-title">GEF-bestanden lezen...</div>
                            <div className="parsing-message">{status}</div>
                            <div className="parsing-hint">Alleen de kopregels worden gelezen, dit gaat snel.</div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
