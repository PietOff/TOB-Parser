import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchProject, fetchLocations, dbRowToLocation, updateLocation, fetchResearches, updateResearch, saveResearches } from '../services/api';
import '../index.css';

// Lazy load map
const LocationMap = lazy(() => import('../components/LocationMap'));

// ── Status config ──────────────────────────────────────────
const RESEARCH_STATUSES = [
    { value: 'Nog op te vragen', color: '#94a3b8', icon: '⏳' },
    { value: 'Opgevraagd',       color: '#f59e0b', icon: '📤' },
    { value: 'Wacht',            color: '#3b82f6', icon: '⏱️' },
    { value: 'Ontvangen',        color: '#8b5cf6', icon: '📥' },
    { value: 'Beoordeeld',       color: '#10b981', icon: '✅' },
    { value: 'Niet relevant',    color: '#6b7280', icon: '➖' },
    { value: 'Afgerond',         color: '#059669', icon: '🏁' },
];

const RESEARCH_TYPES = [
    'Nazca (Bodemonderzoek)',
    'BAG Check',
    'Bodemloket (PDOK)',
    'Historisch Bodembestand',
    'Nader Onderzoek',
    'Saneringsonderzoek',
    'BRL SIKB 2000',
    'Overig',
];

function getStatusColor(status) {
    return RESEARCH_STATUSES.find(s => s.value === status)?.color || '#94a3b8';
}

function getStatusIcon(status) {
    return RESEARCH_STATUSES.find(s => s.value === status)?.icon || '⏳';
}

// ── Component ──────────────────────────────────────────────
export default function ProjectDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedLocation, setSelectedLocation] = useState(null);
    const [researches, setResearches] = useState({}); // { locationDbId: [research1, research2, ...] }
    const [researchLoading, setResearchLoading] = useState(false);
    const [addingResearch, setAddingResearch] = useState(false);
    const [filterStatus, setFilterStatus] = useState('Alle');

    // ── Load project + locations ──────────────────────────
    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const projectData = await fetchProject(id);
                setProject(projectData);

                const rows = await fetchLocations(id);
                const locs = rows.map(dbRowToLocation);
                setLocations(locs);
            } catch (err) {
                console.error("Fout bij laden project details:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (id) loadData();
    }, [id]);

    // ── Load researches when a location is selected ──────
    const loadResearches = useCallback(async (loc) => {
        if (!loc?._db_id) return;
        setResearchLoading(true);
        try {
            const data = await fetchResearches(loc._db_id);
            setResearches(prev => ({ ...prev, [loc._db_id]: data }));
        } catch (err) {
            console.error('Fout bij laden onderzoeken:', err);
        } finally {
            setResearchLoading(false);
        }
    }, []);

    const handleSelectLocation = useCallback((loc) => {
        setSelectedLocation(loc);
        // Load researches if not cached
        if (loc._db_id && !researches[loc._db_id]) {
            loadResearches(loc);
        }
    }, [researches, loadResearches]);

    // ── Update research status ──────────────────────────
    const handleResearchStatusChange = useCallback(async (researchId, newStatus, locationDbId) => {
        // Optimistic update
        setResearches(prev => ({
            ...prev,
            [locationDbId]: prev[locationDbId].map(r =>
                r.id === researchId ? { ...r, status: newStatus } : r
            )
        }));
        try {
            await updateResearch(researchId, { status: newStatus });
        } catch (err) {
            console.error('Status update mislukt:', err);
        }
    }, []);

    // ── Update research notes ───────────────────────────
    const handleResearchNotesChange = useCallback(async (researchId, newNotes, locationDbId) => {
        setResearches(prev => ({
            ...prev,
            [locationDbId]: prev[locationDbId].map(r =>
                r.id === researchId ? { ...r, notes: newNotes } : r
            )
        }));
        try {
            await updateResearch(researchId, { notes: newNotes });
        } catch (err) {
            console.error('Notitie update mislukt:', err);
        }
    }, []);

    // ── Add a new research row ──────────────────────────
    const handleAddResearch = useCallback(async (locationDbId, type) => {
        setAddingResearch(true);
        try {
            const newRows = await saveResearches(locationDbId, [
                { type, status: 'Nog op te vragen', notes: '' }
            ]);
            setResearches(prev => ({
                ...prev,
                [locationDbId]: [...(prev[locationDbId] || []), ...newRows]
            }));
        } catch (err) {
            console.error('Onderzoek toevoegen mislukt:', err);
        } finally {
            setAddingResearch(false);
        }
    }, []);

    // ── Sync location-level fields to Supabase ──────────
    const handleLocationFieldUpdate = useCallback(async (locatiecode, field, value) => {
        setLocations(prev => prev.map(l =>
            l.locatiecode === locatiecode ? { ...l, [field]: value } : l
        ));
        setSelectedLocation(prev => prev ? { ...prev, [field]: value } : prev);

        const loc = locations.find(l => l.locatiecode === locatiecode);
        if (loc?._db_id) {
            try {
                await updateLocation(loc._db_id, { [field]: value });
            } catch (err) {
                console.error(`Update ${field} mislukt:`, err);
            }
        }
    }, [locations]);

    const handleLocationDrag = useCallback((locatiecode, newLat, newLng) => {
        console.log("Marker dragged", locatiecode, newLat, newLng);
    }, []);

    // ── Compute stats ──────────────────────────────────
    const allResearchesFlat = Object.values(researches).flat();

    // ── Render ──────────────────────────────────────────
    if (loading) return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <div className="spinner spinner-lg" />
        </div>
    );
    if (error) return <div style={{ padding: '2rem', color: 'red' }}>Fout: {error}</div>;
    if (!project) return <div style={{ padding: '2rem' }}>Project niet gevonden.</div>;

    const currentResearches = selectedLocation?._db_id ? (researches[selectedLocation._db_id] || []) : [];

    return (
        <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
            {/* ── Header ── */}
            <header style={{
                padding: '8px 20px',
                flexShrink: 0,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'linear-gradient(135deg, #1a365d 0%, #2d3748 100%)',
                color: 'white',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button onClick={() => navigate('/')} style={{
                        padding: '4px 10px',
                        background: 'rgba(255,255,255,0.15)',
                        color: 'white',
                        border: '1px solid rgba(255,255,255,0.3)',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.85rem'
                    }}>
                        ← Lobby
                    </button>
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>{project.name}</h2>
                    {project.client && <span style={{ opacity: 0.7, fontSize: '0.9rem' }}>— {project.client}</span>}
                </div>
                <div style={{ display: 'flex', gap: '15px', fontSize: '0.85rem', opacity: 0.9 }}>
                    <span>📍 {locations.length} locaties</span>
                </div>
            </header>

            {/* ── Split View ── */}
            <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>

                {/* ── Sidebar ── */}
                <aside style={{
                    width: '320px',
                    minWidth: '300px',
                    background: '#f8fafc',
                    borderRight: '1px solid #e2e8f0',
                    display: 'flex',
                    flexDirection: 'column',
                    overflowY: 'auto',
                }}>
                    {/* Sidebar header */}
                    <div style={{ padding: '12px 15px', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '0.95rem' }}>📍 Locaties</h3>
                            <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                style={{ fontSize: '0.75rem', padding: '2px 5px', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                            >
                                <option>Alle</option>
                                <option>Complex</option>
                                <option>Simpel</option>
                            </select>
                        </div>
                    </div>

                    {/* Location list */}
                    <div style={{ flexGrow: 1, overflowY: 'auto' }}>
                        {locations
                            .filter(loc => {
                                if (filterStatus === 'Complex') return loc.isComplex;
                                if (filterStatus === 'Simpel') return !loc.isComplex;
                                return true;
                            })
                            .map(loc => {
                                const isSelected = selectedLocation?.locatiecode === loc.locatiecode;
                                const locResearches = loc._db_id ? (researches[loc._db_id] || []) : [];
                                const hasOpenItems = locResearches.some(r => !['Afgerond', 'Niet relevant', 'Beoordeeld'].includes(r.status));

                                return (
                                    <div
                                        key={loc.locatiecode}
                                        onClick={() => handleSelectLocation(loc)}
                                        style={{
                                            padding: '10px 15px',
                                            borderBottom: '1px solid #e2e8f0',
                                            background: isSelected ? 'white' : 'transparent',
                                            borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease',
                                        }}
                                    >
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{loc.locatiecode}</span>
                                            {loc.isComplex && <span style={{ fontSize: '0.65rem', background: '#fef3c7', color: '#92400e', padding: '1px 5px', borderRadius: '3px' }}>Complex</span>}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                                            {loc.straatnaam} {loc.huisnummer}
                                        </div>
                                        {locResearches.length > 0 && (
                                            <div style={{ marginTop: '4px', display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                                                {locResearches.map(r => (
                                                    <span key={r.id} style={{
                                                        fontSize: '0.6rem',
                                                        padding: '1px 4px',
                                                        borderRadius: '3px',
                                                        background: getStatusColor(r.status) + '20',
                                                        color: getStatusColor(r.status),
                                                        border: `1px solid ${getStatusColor(r.status)}40`,
                                                    }}>
                                                        {getStatusIcon(r.status)} {r.type.split('(')[0].trim()}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                    </div>

                    {/* ── Selected location detail panel ── */}
                    {selectedLocation && (
                        <div style={{
                            borderTop: '2px solid #3b82f6',
                            padding: '15px',
                            background: 'white',
                            maxHeight: '50%',
                            overflowY: 'auto',
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                <h4 style={{ margin: 0, fontSize: '0.95rem' }}>
                                    {selectedLocation.locatiecode}
                                </h4>
                                <button
                                    onClick={() => setSelectedLocation(null)}
                                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', color: '#94a3b8' }}
                                >×</button>
                            </div>

                            {/* Location address */}
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '12px' }}>
                                {selectedLocation.straatnaam} {selectedLocation.huisnummer}
                                {selectedLocation.woonplaats && `, ${selectedLocation.woonplaats}`}
                            </div>

                            {/* Location status */}
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>Status Abel</label>
                                <select
                                    value={selectedLocation.statusAbel || ''}
                                    onChange={(e) => handleLocationFieldUpdate(selectedLocation.locatiecode, 'status_abel', e.target.value)}
                                    style={{ width: '100%', padding: '5px 8px', fontSize: '0.8rem', border: '1px solid #e2e8f0', borderRadius: '4px' }}
                                >
                                    <option value="">Selecteer...</option>
                                    <option>Nog te doen</option>
                                    <option>In uitvoering</option>
                                    <option>Afgerond</option>
                                </select>
                            </div>

                            {/* ── Researches (Nazca / Onderzoeken) ── */}
                            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                    <h5 style={{ margin: 0, fontSize: '0.85rem' }}>🔬 Onderzoeken</h5>
                                    {researchLoading && <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Laden...</span>}
                                </div>

                                {currentResearches.length === 0 && !researchLoading && (
                                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 8px 0' }}>
                                        Nog geen onderzoeken gekoppeld.
                                    </p>
                                )}

                                {currentResearches.map(r => (
                                    <div key={r.id} style={{
                                        background: '#f8fafc',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: '6px',
                                        padding: '8px 10px',
                                        marginBottom: '6px',
                                        borderLeft: `3px solid ${getStatusColor(r.status)}`,
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>{r.type}</span>
                                        </div>
                                        <select
                                            value={r.status}
                                            onChange={(e) => handleResearchStatusChange(r.id, e.target.value, selectedLocation._db_id)}
                                            style={{
                                                width: '100%',
                                                padding: '3px 6px',
                                                fontSize: '0.75rem',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '4px',
                                                marginBottom: '4px',
                                                color: getStatusColor(r.status),
                                                fontWeight: 600,
                                            }}
                                        >
                                            {RESEARCH_STATUSES.map(s => (
                                                <option key={s.value} value={s.value}>{s.icon} {s.value}</option>
                                            ))}
                                        </select>
                                        <textarea
                                            placeholder="Notities..."
                                            defaultValue={r.notes || ''}
                                            onBlur={(e) => handleResearchNotesChange(r.id, e.target.value, selectedLocation._db_id)}
                                            style={{
                                                width: '100%',
                                                padding: '4px 6px',
                                                fontSize: '0.72rem',
                                                border: '1px solid #e2e8f0',
                                                borderRadius: '4px',
                                                resize: 'vertical',
                                                minHeight: '30px',
                                                fontFamily: 'inherit',
                                            }}
                                        />
                                    </div>
                                ))}

                                {/* Add new research */}
                                <select
                                    disabled={addingResearch || !selectedLocation._db_id}
                                    defaultValue=""
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            handleAddResearch(selectedLocation._db_id, e.target.value);
                                            e.target.value = '';
                                        }
                                    }}
                                    style={{
                                        width: '100%',
                                        padding: '5px 8px',
                                        fontSize: '0.75rem',
                                        border: '1px dashed #94a3b8',
                                        borderRadius: '4px',
                                        color: '#64748b',
                                        background: '#f8fafc',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <option value="" disabled>+ Onderzoek toevoegen...</option>
                                    {RESEARCH_TYPES.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                </aside>

                {/* ── Map ── */}
                <main style={{ flexGrow: 1, position: 'relative' }}>
                    <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}><div className="spinner spinner-lg" /></div>}>
                        <LocationMap
                            locations={locations}
                            height="100%"
                            highlightedLocationCode={selectedLocation?.locatiecode}
                            onLocationDrag={handleLocationDrag}
                        />
                    </Suspense>
                </main>
            </div>
        </div>
    );
}
