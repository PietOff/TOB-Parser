import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PROVINCIES = [
    'Noord-Brabant',
    'Limburg',
];

const UITVOERDERS = [
    'Synfra',
    'BDOK',
];

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
    });

    const set = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

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
            <div style={{ width: '100%', maxWidth: 560, marginBottom: '1.5rem' }}>
                <button
                    onClick={() => navigate('/')}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        fontSize: '0.9rem',
                        padding: 0,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                    }}
                >
                    ← Terug
                </button>
            </div>

            {/* Card */}
            <div style={{
                width: '100%',
                maxWidth: 560,
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
                    <h1 style={{
                        fontFamily: 'var(--font-heading)',
                        fontSize: '1.6rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        margin: 0,
                    }}>
                        Aelmans TOB-Generator
                    </h1>
                    <p style={{
                        marginTop: '0.4rem',
                        fontSize: '0.9rem',
                        color: 'var(--accent-light)',
                        fontFamily: 'var(--font)',
                    }}>
                        Made by AbelTalent
                    </p>
                </div>

                {/* Fields */}
                <Field label="Emailadres" required>
                    <input
                        type="email"
                        value={form.email}
                        onChange={set('email')}
                        placeholder="naam@bedrijf.nl"
                        style={inputStyle}
                    />
                </Field>

                <Field label="Straatnaam" required>
                    <input
                        type="text"
                        value={form.straatnaam}
                        onChange={set('straatnaam')}
                        style={inputStyle}
                    />
                </Field>

                <Field label="Huisnummer">
                    <input
                        type="text"
                        value={form.huisnummer}
                        onChange={set('huisnummer')}
                        style={inputStyle}
                    />
                </Field>

                <Field label="Plaatsnaam" required>
                    <input
                        type="text"
                        value={form.plaatsnaam}
                        onChange={set('plaatsnaam')}
                        style={inputStyle}
                    />
                </Field>

                <Field label="Gemeente" required>
                    <input
                        type="text"
                        value={form.gemeente}
                        onChange={set('gemeente')}
                        style={inputStyle}
                    />
                </Field>

                <Field label="Provincie" required>
                    <select
                        value={form.provincie}
                        onChange={set('provincie')}
                        style={selectStyle}
                    >
                        <option value="">Selecteer een optie...</option>
                        {PROVINCIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </Field>

                <Field label="Quick scan uitgevoerd door" required>
                    <select
                        value={form.uitvoerder}
                        onChange={set('uitvoerder')}
                        style={selectStyle}
                    >
                        <option value="">Selecteer een optie...</option>
                        {UITVOERDERS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                </Field>

                <FileField label="Upload quick scan" required />
                <FileField label="Upload basistemplate casus" required />
                <FileField label="Upload tekening onderzoekslocatie" />
                <FileField label="Upload bodeminformatie" />

                {/* Submit — disabled, coming soon */}
                <div style={{ marginTop: '0.5rem' }}>
                    <button
                        disabled
                        title="Functionaliteit komt binnenkort"
                        style={{
                            width: '100%',
                            padding: '0.85rem',
                            background: 'var(--border)',
                            color: 'var(--text-muted)',
                            border: 'none',
                            borderRadius: 'var(--radius)',
                            fontSize: '1rem',
                            fontFamily: 'var(--font)',
                            fontWeight: 600,
                            cursor: 'not-allowed',
                        }}
                    >
                        Versturen — binnenkort beschikbaar
                    </button>
                </div>
            </div>
        </div>
    );
}

function Field({ label, required, children }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <label style={{
                fontFamily: 'var(--font)',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: 'var(--text-secondary)',
            }}>
                {label}{required && <span style={{ color: 'var(--danger)', marginLeft: 2 }}>*</span>}
            </label>
            {children}
        </div>
    );
}

function FileField({ label, required }) {
    return (
        <Field label={label} required={required}>
            <div style={{
                padding: '0.65rem 1rem',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                color: 'var(--text-muted)',
                fontSize: '0.85rem',
                fontFamily: 'var(--font)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                opacity: 0.6,
                cursor: 'not-allowed',
                userSelect: 'none',
            }}>
                <span style={{
                    padding: '0.2rem 0.7rem',
                    background: 'var(--bg-card-hover)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 6,
                    color: 'var(--text-secondary)',
                    fontSize: '0.82rem',
                }}>
                    Bestand kiezen
                </span>
                Geen bestand gekozen
            </div>
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

const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
};
