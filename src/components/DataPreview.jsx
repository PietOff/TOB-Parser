import { useState } from 'react';
import { assessLocation, generateSmartContent } from '../utils/smartFill';

export default function DataPreview({ locations, onLocationsUpdate }) {
    const [expandedCase, setExpandedCase] = useState(null);

    const complexLocations = locations.filter(l => l.complex);
    const simpleLocations = locations.filter(l => !l.complex);

    const toggleCase = (code) => {
        setExpandedCase(expandedCase === code ? null : code);
    };

    const updateField = (locCode, field, value) => {
        const updated = locations.map(l => {
            if (l.locatiecode === locCode) {
                return { ...l, [field]: value };
            }
            return l;
        });
        onLocationsUpdate(updated);
    };

    const getPriorityClass = (p) => {
        if (p === 'hoog') return 'priority-high';
        if (p === 'midden') return 'priority-medium';
        if (p === 'laag') return 'priority-low';
        return 'priority-none';
    };

    const getBeoordelingClass = (b) => {
        if (b === 'onverdacht') return 'assessment-onverdacht';
        if (b === 'verontreinigd_zeker') return 'assessment-verdacht';
        if (b === 'verontreinigd_onzeker') return 'assessment-onzeker';
        if (b === 'verdacht') return 'assessment-verdacht';
        return 'assessment-onderzoek';
    };

    return (
        <div>
            {/* Stats */}
            <div className="stats-bar">
                <div className="stat-card">
                    <div className="stat-value">{locations.length}</div>
                    <div className="stat-label">Totaal locaties</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value" style={{ color: 'var(--danger)' }}>{complexLocations.length}</div>
                    <div className="stat-label">Complexe zaken</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value" style={{ color: 'var(--success)' }}>{simpleLocations.length}</div>
                    <div className="stat-label">Onverdacht</div>
                </div>
                <div className="stat-card">
                    <div className="stat-value">{locations.filter(l => l.rapportJaar && l.rapportJaar >= 2021).length}</div>
                    <div className="stat-label">Recent (≥2021)</div>
                </div>
            </div>

            {/* Legend */}
            <div className="legend">
                <div className="legend-item"><div className="legend-dot source" /> Brondata</div>
                <div className="legend-item"><div className="legend-dot draft" /> Auto-gegenereerd</div>
                <div className="legend-item"><div className="legend-dot empty" /> In te vullen</div>
            </div>

            {/* Complex cases */}
            {complexLocations.length > 0 && (
                <div className="preview-section">
                    <h2>⚠️ Complexe Zaken ({complexLocations.length})</h2>
                    {complexLocations.map(loc => {
                        const assessment = assessLocation(loc);
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
                        const isOpen = expandedCase === loc.locatiecode;

                        return (
                            <div key={loc.locatiecode} className="case-card">
                                <div className="case-header" onClick={() => toggleCase(loc.locatiecode)}>
                                    <h3>
                                        <span className={`priority-dot ${getPriorityClass(assessment.prioriteit)}`} />
                                        {loc.locatiecode} — {loc.locatienaam || loc.straatnaam || 'Onbekend'}
                                        <span className={`case-badge ${assessment.beoordeling.includes('verontreinigd') ? 'danger' : 'warning'}`}>
                                            {assessment.beoordeling.replace('_', ' ')}
                                        </span>
                                    </h3>
                                    <span className={`case-toggle ${isOpen ? 'open' : ''}`}>▼</span>
                                </div>

                                {isOpen && (
                                    <div className="case-content">
                                        {/* Assessment */}
                                        <div className="section-header">Beoordeling</div>
                                        <div className="field-row">
                                            <div className="field-label">Beoordeling</div>
                                            <div className={`assessment ${getBeoordelingClass(assessment.beoordeling)}`}>
                                                {assessment.beoordeling.replace(/_/g, ' ')}
                                            </div>
                                        </div>
                                        <div className="field-row">
                                            <div className="field-label">Toelichting</div>
                                            <div className="field-value draft">{assessment.toelichting}</div>
                                        </div>
                                        <div className="field-row">
                                            <div className="field-label">Actie</div>
                                            <div className="field-value draft">{assessment.actie}</div>
                                        </div>

                                        {/* Locatiegegevens */}
                                        <div className="section-header">1. Locatiegegevens</div>
                                        <Field label="Locatiecode" value={loc.locatiecode} type="source" />
                                        <Field label="Locatienaam" value={loc.locatienaam} type="source" />
                                        <Field label="Adres" value={`${loc.straatnaam} ${loc.huisnummer}`.trim()} type="source" />
                                        <Field label="Postcode" value={loc.postcode} type="source" />
                                        <Field label="Huidige functie" value={smart?.locatie.functie} type="draft"
                                            onChange={(v) => updateField(loc.locatiecode, '_functie', v)} />

                                        {/* Enriched external data */}
                                        {loc._enriched && Object.keys(loc._enriched).length > 0 && (
                                            <>
                                                <div className="section-header">📡 Externe Databronnen</div>
                                                {loc._enriched.gemeente && (
                                                    <Field label="Gemeente" value={loc._enriched.gemeente} type="source" />
                                                )}
                                                {loc._enriched.provincie && (
                                                    <Field label="Provincie" value={loc._enriched.provincie} type="source" />
                                                )}
                                                {loc._enriched.bodemkwaliteit?.[0] && (
                                                    <Field label="Bodemkwaliteitsklasse" value={loc._enriched.bodemkwaliteit[0].klasse} type="source" />
                                                )}
                                                {loc._enriched.topotijdreisHuidig && (
                                                    <div className="field-row">
                                                        <div className="field-label">Topotijdreis</div>
                                                        <div className="field-value">
                                                            <a href={loc._enriched.topotijdreisHuidig} target="_blank" rel="noopener noreferrer"
                                                                style={{ color: 'var(--accent-light)' }}>
                                                                🗺️ Open historische kaarten →
                                                            </a>
                                                        </div>
                                                    </div>
                                                )}
                                                {loc._enriched.bodemloket && (
                                                    <div className="field-row">
                                                        <div className="field-label">Bodemloket</div>
                                                        <div className="field-value">
                                                            <a href={loc._enriched.bodemloket} target="_blank" rel="noopener noreferrer"
                                                                style={{ color: 'var(--accent-light)' }}>
                                                                🔍 Open Bodemloket →
                                                            </a>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        {/* Verontreiniging */}
                                        {smart && (
                                            <>
                                                <div className="section-header">2. Verontreiniging</div>
                                                <Field label="Stof" value={smart.verontreiniging.stof_beschrijving} type="source" />
                                                <Field label="Waarde" value={loc.stoffen?.[0] ? `${loc.stoffen[0].waarde} mg/kg ds` : ''} type="source" />
                                                <Field label="Toetsing" value={smart.verontreiniging.toetsing} type="draft" />
                                                <Field label="Mogelijke bron" value={smart.verontreiniging.bron} type="draft" />
                                                <Field label="Volume schatting" value={smart.verontreiniging.volume} type="draft" />
                                                <Field label="Grondwater" value={smart.verontreiniging.grondwater} type="draft" />

                                                <div className="section-header">3. Risicobeoordeling</div>
                                                <Field label="Humaan risico" value={smart.risico.humaan} type="draft" />
                                                <Field label="Ecologisch risico" value={smart.risico.eco} type="draft" />
                                                <Field label="Verspreiding" value={smart.risico.verspreiding} type="draft" />
                                                <Field label="Ernst" value={smart.risico.ernst} type="draft" />
                                                <Field label="Spoedeisendheid" value={smart.risico.spoedeisendheid} type="draft" />

                                                <div className="section-header">4. Conclusie & Advies</div>
                                                <Field label="Samenvatting" value={smart.conclusie.samenvatting} type="draft" />
                                                <Field label="Conclusie" value={smart.conclusie.conclusie} type="draft" />
                                                <Field label="Advies" value={smart.conclusie.advies} type="draft" />

                                                <div className="section-header">5. Plan van Aanpak</div>
                                                <Field label="Saneringsvariant" value={smart.planVanAanpak.variant} type="draft" />
                                                <Field label="Kosten (indicatief)" value={smart.planVanAanpak.kosten} type="draft" />
                                                <Field label="Planning" value={smart.planVanAanpak.planning} type="draft" />

                                                <div className="section-header">6. MKB & Melding</div>
                                                <Field label="Melding BG" value={smart.melding.teMelden} type="draft" />
                                                <Field label="MKB Protocol" value={smart.mkb.protocol} type="draft" />
                                                <Field label="Veiligheidsmaatregelen" value={smart.mkb.veiligheid} type="draft" />
                                            </>
                                        )}

                                        {/* Tracking */}
                                        <div className="section-header">Tracking AbelTalent</div>
                                        <div className="field-row">
                                            <div className="field-label">Afstand tracé (m)</div>
                                            <div className="field-value">
                                                <textarea
                                                    placeholder="Afstand tot tracé in meters..."
                                                    defaultValue={loc.afstandTrace || ''}
                                                    onChange={(e) => updateField(loc.locatiecode, 'afstandTrace', parseFloat(e.target.value) || null)}
                                                    style={{ minHeight: '36px' }}
                                                />
                                            </div>
                                        </div>
                                        <div className="field-row">
                                            <div className="field-label">Opmerkingen</div>
                                            <div className="field-value">
                                                <textarea
                                                    placeholder="Eigen opmerkingen..."
                                                    defaultValue={loc.opmerkingenAbel || ''}
                                                    onChange={(e) => updateField(loc.locatiecode, 'opmerkingenAbel', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Simple locations table */}
            <div className="preview-section">
                <h2>✅ Overige Locaties ({simpleLocations.length})</h2>
                <div className="table-wrapper">
                    <table className="location-table">
                        <thead>
                            <tr>
                                <th>Locatiecode</th>
                                <th>Naam</th>
                                <th>Straat</th>
                                <th>Status</th>
                                <th>Conclusie</th>
                                <th>Veiligheidsklasse</th>
                            </tr>
                        </thead>
                        <tbody>
                            {simpleLocations.map(loc => (
                                <tr key={loc.locatiecode}>
                                    <td>{loc.locatiecode}</td>
                                    <td>{loc.locatienaam}</td>
                                    <td>{`${loc.straatnaam} ${loc.huisnummer || ''}`.trim()}</td>
                                    <td>{loc.status}</td>
                                    <td>
                                        <span className="assessment assessment-onverdacht">
                                            {loc.conclusie || 'onverdacht'}
                                        </span>
                                    </td>
                                    <td>{loc.veiligheidsklasse}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

function Field({ label, value, type, onChange }) {
    if (!value && type !== 'empty') return null;

    if (type === 'source') {
        return (
            <div className="field-row">
                <div className="field-label">{label}</div>
                <div className="field-value source">{value || '—'}</div>
            </div>
        );
    }

    if (type === 'draft') {
        return (
            <div className="field-row">
                <div className="field-label">{label}</div>
                <div className="field-value draft">{value}</div>
            </div>
        );
    }

    return (
        <div className="field-row">
            <div className="field-label">{label}</div>
            <div className="field-value">
                <textarea
                    className="draft-input"
                    defaultValue={value || ''}
                    placeholder={`${label}...`}
                    onChange={(e) => onChange?.(e.target.value)}
                />
            </div>
        </div>
    );
}
