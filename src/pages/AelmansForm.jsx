import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { parseBdok, parseBodemrapportage } from '../utils/bdokParser';
import { fillAelmansTemplate, downloadBlob } from '../utils/aelmansDocFiller';

const PROVINCIES = ['Noord-Brabant', 'Limburg'];
const UITVOERDERS = ['Synfra', 'BDOK'];

export default function AelmansForm() {
    const navigate = useNavigate();

    const [form, setForm] = useState({
        email: '',
        straatnaam: '',
        huisnummer: '',
        plaatsnaam: '',
        gemeente: '',
        provincie: '',
        uitvoerder: '',
        contactpersoon: '',
        sleuflengte: '',
        ontgravingsdiepte: '',
        grondwaterstand: '',
        bemaling: '',
    });

    const [files, setFiles] = useState({
        quickscan: null,
        template: null,
        tekening: null,
        bodem: null,
    });

    const [parsing, setParsing] = useState({ quickscan: false, bodem: false });
    const [parseStatus, setParseStatus] = useState({ quickscan: '', bodem: '' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const fileRefs = {
        quickscan: useRef(null),
        template: useRef(null),
        tekening: useRef(null),
        bodem: useRef(null),
    };

    const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

    const handleFile = async (key, file) => {
        if (!file) return;
        setFiles(prev => ({ ...prev, [key]: file }));

        if (key === 'quickscan' && file.name.toLowerCase().endsWith('.pdf')) {
            setParsing(prev => ({ ...prev, quickscan: true }));
            setParseStatus(prev => ({ ...prev, quickscan: 'PDF laden...' }));
            try {
                const data = await parseBdok(file, (msg) =>
                    setParseStatus(prev => ({ ...prev, quickscan: msg }))
                );
                setForm(prev => ({
                    ...prev,
                    straatnaam:       data.straatnaam      || prev.straatnaam,
                    huisnummer:       data.huisnummer      || prev.huisnummer,
                    plaatsnaam:       data.plaatsnaam      || prev.plaatsnaam,
                    gemeente:         data.gemeente        || prev.gemeente,
                    sleuflengte:      data.sleuflengte     || prev.sleuflengte,
                    ontgravingsdiepte: data.ontgravingsdiepte || prev.ontgravingsdiepte,
                    grondwaterstand:  data.grondwaterstand || prev.grondwaterstand,
                    bemaling:         data.bemaling        || prev.bemaling,
                    _bdokData:        data,
                }));
                setParseStatus(prev => ({ ...prev, quickscan: '✓ Ingelezen' }));
            } catch (err) {
                setParseStatus(prev => ({ ...prev, quickscan: `⚠ ${err.message}` }));
            } finally {
                setParsing(prev => ({ ...prev, quickscan: false }));
            }
        }

        if (key === 'bodem' && file.name.toLowerCase().endsWith('.pdf')) {
            setParsing(prev => ({ ...prev, bodem: true }));
            setParseStatus(prev => ({ ...prev, bodem: 'PDF laden...' }));
            try {
                const data = await parseBodemrapportage(file, (msg) =>
                    setParseStatus(prev => ({ ...prev, bodem: msg }))
                );
                setForm(prev => ({ ...prev, _bodemData: data }));
                setParseStatus(prev => ({ ...prev, bodem: '✓ Ingelezen' }));
            } catch (err) {
                setParseStatus(prev => ({ ...prev, bodem: `⚠ ${err.message}` }));
            } finally {
                setParsing(prev => ({ ...prev, bodem: false }));
            }
        }
    };

    const canSubmit = files.quickscan && files.template && form.gemeente && !submitting;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        setSubmitting(true);
        setError('');
        try {
            const bdokData = form._bdokData || {};
            const filled = await fillAelmansTemplate(files.template, {
                straatnaam:        form.straatnaam,
                huisnummer:        form.huisnummer,
                plaatsnaam:        form.plaatsnaam,
                gemeente:          form.gemeente,
                sleuflengte:       form.sleuflengte,
                ontgravingsdiepte: form.ontgravingsdiepte,
                isGroterDan25m3:   bdokData.isGroterDan25m3 ?? null,
                grondwaterstand:   form.grondwaterstand,
                bemaling:          form.bemaling,
                contactpersoon:    form.contactpersoon,
                uitvoerder:        form.uitvoerder || 'Synfra/BDOK',
                amvNummer:         bdokData.amvNummer || '',
                bodemrapportageNaam: files.bodem?.name || '',
            });

            const address = [form.straatnaam, form.huisnummer, form.plaatsnaam].filter(Boolean).join(' ');
            downloadBlob(filled, `Casus_${address || 'Aelmans'}.docx`);
        } catch (err) {
            setError(`Genereren mislukt: ${err.message}`);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '2.5rem 1rem 4rem',
        }}>
            {/* Back */}
            <div style={{ width: '100%', maxWidth: 600, marginBottom: '1.5rem' }}>
                <button
                    onClick={() => navigate('/')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.9rem', padding: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                    ← Terug
                </button>
            </div>

            {/* Card */}
            <div style={{
                width: '100%',
                maxWidth: 600,
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '2.5rem 2rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.5rem',
            }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '0.5rem' }}>
                    <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                        Aelmans TOB-Generator
                    </h1>
                    <p style={{ marginTop: '0.4rem', fontSize: '0.9rem', color: 'var(--accent-light)', fontFamily: 'var(--font)' }}>
                        Made by AbelTalent
                    </p>
                </div>

                {/* Section: Bestanden */}
                <SectionHeader>Bestanden uploaden</SectionHeader>

                <UploadField
                    label="Quick scan (PDF)"
                    required
                    accept=".pdf"
                    status={parseStatus.quickscan}
                    loading={parsing.quickscan}
                    file={files.quickscan}
                    inputRef={fileRefs.quickscan}
                    onChange={(f) => handleFile('quickscan', f)}
                    hint="BDOK Quickscan PDF — adres, lengte, diepte en GWS worden automatisch ingelezen"
                />

                <UploadField
                    label="Basistemplate casus (DOCX)"
                    required
                    accept=".docx"
                    file={files.template}
                    inputRef={fileRefs.template}
                    onChange={(f) => handleFile('template', f)}
                    hint="De Word-template met groene invoervelden"
                />

                <UploadField
                    label="Tekening onderzoekslocatie (afbeelding)"
                    accept=".png,.jpg,.jpeg,.tif,.tiff"
                    file={files.tekening}
                    inputRef={fileRefs.tekening}
                    onChange={(f) => handleFile('tekening', f)}
                />

                <UploadField
                    label="Bodeminformatie (PDF)"
                    accept=".pdf"
                    status={parseStatus.bodem}
                    loading={parsing.bodem}
                    file={files.bodem}
                    inputRef={fileRefs.bodem}
                    onChange={(f) => handleFile('bodem', f)}
                    hint="Bodemrapportage — rapportgegevens worden automatisch ingelezen"
                />

                {/* Section: Projectgegevens */}
                <SectionHeader>Projectgegevens</SectionHeader>

                <Field label="E-mailadres" required>
                    <input type="email" value={form.email} onChange={set('email')} placeholder="naam@bedrijf.nl" style={inputStyle} />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '0.75rem' }}>
                    <Field label="Straatnaam" required>
                        <input type="text" value={form.straatnaam} onChange={set('straatnaam')} style={inputStyle} />
                    </Field>
                    <Field label="Nr">
                        <input type="text" value={form.huisnummer} onChange={set('huisnummer')} style={{ ...inputStyle, width: 72 }} />
                    </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <Field label="Plaatsnaam" required>
                        <input type="text" value={form.plaatsnaam} onChange={set('plaatsnaam')} style={inputStyle} />
                    </Field>
                    <Field label="Gemeente" required>
                        <input type="text" value={form.gemeente} onChange={set('gemeente')} style={inputStyle} />
                    </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <Field label="Provincie" required>
                        <select value={form.provincie} onChange={set('provincie')} style={selectStyle}>
                            <option value="">Selecteer...</option>
                            {PROVINCIES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </Field>
                    <Field label="Quick scan uitgevoerd door" required>
                        <select value={form.uitvoerder} onChange={set('uitvoerder')} style={selectStyle}>
                            <option value="">Selecteer...</option>
                            {UITVOERDERS.map(u => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </Field>
                </div>

                <Field label="Contactpersoon">
                    <input type="text" value={form.contactpersoon} onChange={set('contactpersoon')} placeholder="Dhr./Mevr. Naam" style={inputStyle} />
                </Field>

                {/* Section: Technische gegevens */}
                <SectionHeader>Technische gegevens</SectionHeader>
                <p style={{ margin: '-0.75rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)', fontFamily: 'var(--font)' }}>
                    Automatisch ingelezen uit de quick scan — controleer en pas aan indien nodig.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <Field label="Sleuflengte (m)">
                        <input type="text" value={form.sleuflengte} onChange={set('sleuflengte')} placeholder="bijv. 100" style={inputStyle} />
                    </Field>
                    <Field label="Ontgravingsdiepte (m-mv)">
                        <input type="text" value={form.ontgravingsdiepte} onChange={set('ontgravingsdiepte')} placeholder="bijv. 0.80" style={inputStyle} />
                    </Field>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <Field label="Grondwaterstand (m-mv)">
                        <input type="text" value={form.grondwaterstand} onChange={set('grondwaterstand')} placeholder="bijv. 1.0" style={inputStyle} />
                    </Field>
                    <Field label="Bemaling nodig">
                        <select value={form.bemaling} onChange={set('bemaling')} style={selectStyle}>
                            <option value="">Selecteer...</option>
                            <option value="Ja">Ja</option>
                            <option value="Nee">Nee</option>
                            <option value="Ter plaatse beoordelen">Ter plaatse beoordelen</option>
                        </select>
                    </Field>
                </div>

                {/* Error */}
                {error && (
                    <div style={{ padding: '0.75rem 1rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, color: '#ef4444', fontSize: '0.9rem', fontFamily: 'var(--font)' }}>
                        {error}
                    </div>
                )}

                {/* Submit */}
                <div style={{ marginTop: '0.5rem' }}>
                    <button
                        onClick={handleSubmit}
                        disabled={!canSubmit}
                        title={!files.quickscan ? 'Upload eerst de quick scan' : !files.template ? 'Upload eerst de basistemplate' : !form.gemeente ? 'Vul gemeente in' : ''}
                        style={{
                            width: '100%',
                            padding: '0.85rem',
                            background: canSubmit ? 'var(--accent)' : 'var(--border)',
                            color: canSubmit ? '#fff' : 'var(--text-muted)',
                            border: 'none',
                            borderRadius: 'var(--radius)',
                            fontSize: '1rem',
                            fontFamily: 'var(--font)',
                            fontWeight: 600,
                            cursor: canSubmit ? 'pointer' : 'not-allowed',
                            transition: 'background 0.2s',
                        }}
                    >
                        {submitting ? '⏳ Genereren...' : '📄 Casus genereren'}
                    </button>
                    {!canSubmit && !submitting && (
                        <p style={{ textAlign: 'center', margin: '0.5rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font)' }}>
                            {!files.quickscan ? 'Quick scan vereist' : !files.template ? 'Basistemplate vereist' : 'Gemeente vereist'}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

function SectionHeader({ children }) {
    return (
        <div style={{
            fontSize: '0.8rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font)',
            borderBottom: '1px solid var(--border)',
            paddingBottom: '0.5rem',
            marginBottom: '-0.5rem',
        }}>
            {children}
        </div>
    );
}

function Field({ label, required, children }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{ fontFamily: 'var(--font)', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
            </label>
            {children}
        </div>
    );
}

function UploadField({ label, required, accept, file, inputRef, onChange, status, loading, hint }) {
    const isSuccess = status && status.startsWith('✓');
    const isError = status && status.startsWith('⚠');

    return (
        <Field label={label} required={required}>
            <div
                onClick={() => inputRef.current?.click()}
                style={{
                    padding: '0.65rem 1rem',
                    background: 'var(--bg-input)',
                    border: `1px solid ${isSuccess ? 'var(--success, #22c55e)' : isError ? 'var(--danger)' : 'var(--border)'}`,
                    borderRadius: 8,
                    fontSize: '0.85rem',
                    fontFamily: 'var(--font)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    cursor: 'pointer',
                    userSelect: 'none',
                    minHeight: 42,
                }}
            >
                <span style={{
                    padding: '0.2rem 0.7rem',
                    background: 'var(--bg-card-hover)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 6,
                    color: 'var(--text-secondary)',
                    fontSize: '0.82rem',
                    whiteSpace: 'nowrap',
                }}>
                    Bestand kiezen
                </span>
                <span style={{ color: file ? 'var(--text-primary)' : 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {loading ? status : file ? file.name : 'Geen bestand gekozen'}
                </span>
                {!loading && status && (
                    <span style={{ color: isSuccess ? '#22c55e' : isError ? 'var(--danger)' : 'var(--text-muted)', whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {status}
                    </span>
                )}
            </div>
            {hint && !file && (
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'var(--font)' }}>
                    {hint}
                </p>
            )}
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                style={{ display: 'none' }}
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onChange(f);
                    e.target.value = '';
                }}
            />
        </Field>
    );
}

const inputStyle = {
    padding: '0.65rem 0.9rem',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text-primary)',
    fontSize: '0.95rem',
    fontFamily: 'var(--font)',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
};

const selectStyle = { ...inputStyle, cursor: 'pointer' };
