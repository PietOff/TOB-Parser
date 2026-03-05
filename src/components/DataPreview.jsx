import { useState, lazy, Suspense } from 'react';
import { assessLocation, generateSmartContent } from '../utils/smartFill';
import { triggerDeepScan, getGithubToken } from '../utils/apiIntegrations';

// Lazy load map to prevent SSR issues and reduce initial bundle size
const LocationMap = lazy(() => import('./LocationMap'));

export default function DataPreview({ locations, onLocationsUpdate, onLocationDrag, projectAddress, projectTrace }) {
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

            {/* Master Map Overview */}
            {locations.length > 0 && (
                <div className="preview-section" style={{ marginBottom: '2rem' }}>
                    <h2>🗺️ Overzichtskaart ({locations.length} locaties)</h2>
                    <div style={{
                        fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem',
                        backgroundColor: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)'
                    }}>
                        <b>Tip:</b> Blauwe cirkel = projectgebied. Gebruik de lagen-knop rechtsboven voor Bodemkwaliteit en Kadastrale Percelen.
                    </div>
                    <Suspense fallback={<div className="spinner-container"><div className="spinner"></div> Kaart laden...</div>}>
                        <LocationMap
                            locations={locations}
                            height="400px"
                            onLocationDrag={onLocationDrag}
                            highlightedLocationCode={expandedCase}
                            projectAddress={projectAddress}
                            projectTrace={projectTrace}
                        />
                    </Suspense>
                </div>
            )}

            {/* Complex cases */}
            {complexLocations.length > 0 && (
                <div className="preview-section">
                    <h2>⚠️ Complexe Zaken ({complexLocations.length})</h2>
                    {complexLocations.map(loc => {
                        const assessment = assessLocation(loc);
                        const smart = loc.stoffen?.length > 0
                            ? generateSmartContent({
                                stoffen: loc.stoffen,
                                naam: loc.locatienaam,
                                straat: loc.straatnaam,
                                locatiecode: loc.locatiecode,
                                asbestVerdacht: loc._enriched?.buildings?.some(b => b.bouwjaar >= 1945 && b.bouwjaar <= 1995) || false,
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

                                                {/* Visual Map Investigation */}
                                                {(loc._enriched?.rd?.x || loc._enriched?.lat) && (
                                                    <div style={{ marginTop: '1.5rem', marginBottom: '1rem' }}>
                                                        <div className="section-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            🗺️ Visueel Onderzoek (PDOK & Kadaster)
                                                        </div>
                                                        <div style={{
                                                            fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem',
                                                            backgroundColor: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: 'var(--radius-sm)'
                                                        }}>
                                                            <b>Tip:</b> Gebruik het lagen-icoon rechtsboven in de kaart om de <i>Bodemkwaliteitskaart</i> of <i>Kadastrale grenzen</i> aan/uit te zetten.
                                                        </div>
                                                        <Suspense fallback={<div className="spinner-container"><div className="spinner"></div> Kaart laden...</div>}>
                                                            <LocationMap
                                                                locations={[loc]}
                                                                height="350px"
                                                                onLocationDrag={onLocationDrag}
                                                            />
                                                        </Suspense>
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
                                            <div className="field-label">Status Abel</div>
                                            <div className="field-value">
                                                <select
                                                    value={loc.statusAbel || 'Nog te doen'}
                                                    onChange={(e) => updateField(loc.locatiecode, 'statusAbel', e.target.value)}
                                                    className="status-select"
                                                >
                                                    <option>Nog te doen</option>
                                                    <option>In uitvoering</option>
                                                    <option>Afgerond</option>
                                                    <option>N.v.t.</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="field-row">
                                            <div className="field-label">Opmerkingen Abel</div>
                                            <div className="field-value">
                                                <textarea
                                                    placeholder="Eigen opmerkingen..."
                                                    defaultValue={loc.opmerkingenAbel || ''}
                                                    onChange={(e) => updateField(loc.locatiecode, 'opmerkingenAbel', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="field-row">
                                            <div className="field-label">Deep Scan</div>
                                            <div className="field-value">
                                                <button
                                                    className="btn btn-sm btn-secondary"
                                                    title="Start Deep Scan via GitHub (Bodemloket/Topotijdreis)"
                                                    onClick={async (e) => {
                                                        const btn = e.currentTarget;
                                                        const originalText = btn.innerHTML;
                                                        try {
                                                            btn.disabled = true;
                                                            btn.innerHTML = '<div class="spinner-xs"></div> Scan...';

                                                            let token = getGithubToken();
                                                            if (!token) {
                                                                token = prompt('GitHub Token (eenmalig):');
                                                                if (token) localStorage.setItem('github_token', token);
                                                            }

                                                            if (!token) throw new Error('Geen token opgegeven');

                                                            const res = await triggerDeepScan(
                                                                loc.locatiecode,
                                                                `${loc.straatnaam} ${loc.huisnummer} ${loc.postcode}`,
                                                                token,
                                                                'PietOff', // Default owner
                                                                'TOB-Parser'      // Default repo
                                                            );
                                                            alert(res.message);
                                                            btn.innerHTML = '✅ Klaar';
                                                            updateField(loc.locatiecode, 'statusAbel', 'In uitvoering');
                                                        } catch (err) {
                                                            console.error(err);
                                                            alert(`Deep Scan mislukt: ${err.message}`);
                                                            btn.innerHTML = originalText;
                                                            btn.disabled = false;
                                                        }
                                                    }}
                                                >
                                                    🔎 Deep Scan
                                                </button>
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
                <h2>✅ Alle Locaties ({locations.length})</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Onderstaande tabel bevat alle kolommen uit het bronbestand (vorig jaar) en de nieuwe ABEL-velden.
                </div>
                <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                    <table className="location-table">
                        <thead>
                            <tr>
                                <th>Locatiecode</th>
                                <th>Locatienaam</th>
                                <th>Straatnaam</th>
                                <th>Huisnr</th>
                                <th>Postcode</th>
                                <th>Pos</th>
                                <th>Status</th>
                                <th>Conclusie</th>
                                <th>Veiligheidsklasse</th>
                                <th>Melding</th>
                                <th>Mkb</th>
                                <th>BRL 7000</th>
                                <th>Opmerking</th>
                                <th>Status Abel</th>
                                <th>Opmerkingen Abel</th>
                                <th>Acties</th>
                            </tr>
                        </thead>
                        <tbody>
                            {locations.map(loc => {
                                const isSelected = expandedCase === loc.locatiecode;
                                const conclusie = (loc.conclusie || '').toLowerCase();
                                const isVerdacht = conclusie.includes('verdacht') || conclusie.includes('verontreinigd');
                                return (
                                    <tr
                                        key={loc.locatiecode}
                                        className={`${isVerdacht ? 'row-verdacht' : ''} ${isSelected ? 'row-selected' : ''}`}
                                        onClick={() => setExpandedCase(loc.locatiecode)}
                                        style={{ cursor: 'pointer', backgroundColor: isSelected ? 'var(--bg-secondary)' : undefined }}
                                    >
                                        <td>{loc.locatiecode}</td>
                                        <td>{loc.locatienaam}</td>
                                        <td>{loc.straatnaam}</td>
                                        <td>{loc.huisnummer}</td>
                                        <td>{loc.postcode}</td>
                                        <td title={loc._enriched?.rd ? `X: ${loc._enriched.rd.x}, Y: ${loc._enriched.rd.y}` : 'Geen coördinaten'}>
                                            {loc._enriched?.rd ? '📍' : '❌'}
                                        </td>
                                        <td>{loc.status}</td>
                                        <td>
                                            <select
                                                value={loc.conclusie || 'onverdacht'}
                                                onChange={(e) => updateField(loc.locatiecode, 'conclusie', e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-select"
                                            >
                                                <option value="onverdacht">onverdacht</option>
                                                <option value="verdacht">verdacht</option>
                                                <option value="verontreinigd_onzeker">verontreinigd onzeker</option>
                                                <option value="verontreinigd_zeker">verontreinigd zeker</option>
                                                <option value="nader_onderzoek">nader onderzoek</option>
                                            </select>
                                        </td>
                                        <td>
                                            <select
                                                value={loc.veiligheidsklasse || ''}
                                                onChange={(e) => updateField(loc.locatiecode, 'veiligheidsklasse', e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-select"
                                            >
                                                <option value="">(Geen)</option>
                                                <option value="Basisklasse">Basisklasse</option>
                                                <option value="Oranje">Oranje</option>
                                                <option value="Rood">Rood</option>
                                                <option value="Zwart">Zwart</option>
                                            </select>
                                        </td>
                                        <td>{loc.melding}</td>
                                        <td>{loc.mkb}</td>
                                        <td>{loc.brl7000}</td>
                                        <td title={loc.opmerking}>{loc.opmerking?.substring(0, 30)}{loc.opmerking?.length > 30 ? '...' : ''}</td>
                                        <td>
                                            <select
                                                value={loc.statusAbel || 'Nog te doen'}
                                                onChange={(e) => updateField(loc.locatiecode, 'statusAbel', e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-select"
                                            >
                                                <option value="Nog te doen">Nog te doen</option>
                                                <option value="In uitvoering">In uitvoering</option>
                                                <option value="Klaar">Klaar</option>
                                            </select>
                                        </td>
                                        <td>
                                            <input
                                                type="text"
                                                defaultValue={loc.opmerkingenAbel || ''}
                                                onBlur={(e) => updateField(loc.locatiecode, 'opmerkingenAbel', e.target.value)}
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-input"
                                                placeholder="Opmerking..."
                                            />
                                        </td>
                                        <td onClick={(e) => e.stopPropagation()}>
                                            <button
                                                className="btn btn-sm btn-secondary"
                                                title="Deep Scan"
                                                onClick={async (e) => {
                                                    const btn = e.currentTarget;
                                                    const originalText = btn.innerHTML;
                                                    try {
                                                        btn.disabled = true;
                                                        btn.innerHTML = '...';
                                                        let token = getGithubToken();
                                                        if (!token) token = prompt('GitHub Token:');
                                                        if (!token) throw new Error('No token');
                                                        localStorage.setItem('github_token', token);
                                                        await triggerDeepScan(loc.locatiecode, `${loc.straatnaam} ${loc.huisnummer}`, token, 'PietOff', 'TOB-Parser');
                                                        btn.innerHTML = '✅';
                                                        updateField(loc.locatiecode, 'statusAbel', 'In uitvoering');
                                                    } catch (err) {
                                                        btn.innerHTML = '❌';
                                                        setTimeout(() => { btn.innerHTML = originalText; btn.disabled = false; }, 2000);
                                                    }
                                                }}
                                            >
                                                🔎
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
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
