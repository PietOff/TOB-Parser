import { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchProject, fetchLocations, dbRowToLocation, updateLocation } from '../services/api';
import '../index.css';

// Lazy load map
const LocationMap = lazy(() => import('../components/LocationMap'));

export default function ProjectDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [locations, setLocations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedLocation, setSelectedLocation] = useState(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const projectData = await fetchProject(id);
                setProject(projectData);

                // We load the locations via fetchLocations to ensure they are properly shaped by dbRowToLocation
                // (Though fetchProject also returns locations, it's easier to use the explicit row converter)
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

    const handleLocationDrag = useCallback((locatiecode, newLat, newLng) => {
        // Implement map drag update logic here
        console.log("Marker dragged", locatiecode, newLat, newLng);
    }, []);

    if (loading) return <div style={{ padding: '2rem' }}>Laden...</div>;
    if (error) return <div style={{ padding: '2rem', color: 'red' }}>Fout: {error}</div>;
    if (!project) return <div style={{ padding: '2rem' }}>Project niet gevonden.</div>;

    return (
        <div className="project-detail-layout" style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
            {/* Header */}
            <header className="app-header" style={{ padding: '10px 20px', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <button onClick={() => navigate('/')} className="btn btn-secondary" style={{ padding: '5px 10px' }}>
                        ← Terug naar Lobby
                    </button>
                    <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{project.name}</h2>
                    {project.client && <span style={{ color: 'var(--text-secondary)' }}>— {project.client}</span>}
                </div>
                <div>{locations.length} locaties</div>
            </header>

            {/* Split View */}
            <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
                
                {/* Sidebar (List & Details) - 25% */}
                <aside style={{ 
                    width: '25%', 
                    minWidth: '300px', 
                    background: 'var(--bg-secondary)', 
                    borderRight: '1px solid var(--border)', 
                    display: 'flex', 
                    flexDirection: 'column',
                    overflowY: 'auto'
                }}>
                    <div style={{ padding: '15px', borderBottom: '1px solid var(--border)' }}>
                        <h3 style={{ margin: '0 0 10px 0', fontSize: '1rem' }}>📍 Locaties</h3>
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                            Selecteer een locatie om de details te bekijken.
                        </p>
                    </div>
                    
                    <div style={{ flexGrow: 1 }}>
                        {locations.map(loc => {
                            const isSelected = selectedLocation?.locatiecode === loc.locatiecode;
                            return (
                                <div 
                                    key={loc.locatiecode}
                                    onClick={() => setSelectedLocation(loc)}
                                    style={{
                                        padding: '12px 15px',
                                        borderBottom: '1px solid var(--border)',
                                        background: isSelected ? 'white' : 'transparent',
                                        borderLeft: isSelected ? '4px solid var(--primary)' : '4px solid transparent',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{loc.locatiecode}</div>
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                                        {loc.straatnaam} {loc.huisnummer}
                                    </div>
                                    <div style={{ marginTop: '5px', display: 'flex', gap: '5px' }}>
                                        <span className="case-badge" style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                                            {loc.statusAbel || 'Nog te doen'}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </aside>

                {/* Main Content (Map) - 75% */}
                <main style={{ flexGrow: 1, position: 'relative' }}>
                    <Suspense fallback={<div style={{ padding: '2rem' }}>Kaart openen...</div>}>
                        <LocationMap 
                            locations={locations}
                            height="100%"
                            highlightedLocationCode={selectedLocation?.locatiecode}
                            onLocationDrag={handleLocationDrag}
                        />
                    </Suspense>

                    {/* Temporary overlay for quick detail edit of selected item (Proof of Concept) */}
                    {selectedLocation && (
                        <div style={{
                            position: 'absolute',
                            bottom: '20px',
                            left: '20px',
                            background: 'white',
                            padding: '15px',
                            borderRadius: '8px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                            zIndex: 1000,
                            width: '350px',
                            maxHeight: '400px',
                            overflowY: 'auto'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <h3 style={{ margin: 0, fontSize: '1rem' }}>{selectedLocation.locatiecode} details</h3>
                                <button onClick={() => setSelectedLocation(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem' }}>×</button>
                            </div>
                            
                            <div className="field-row" style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '10px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Status AbelTalent</label>
                                <select 
                                    className="inline-select"
                                    value={selectedLocation.statusAbel || 'Nog te doen'}
                                    onChange={(e) => {
                                        const newVal = e.target.value;
                                        setLocations(prev => prev.map(l => l.locatiecode === selectedLocation.locatiecode ? {...l, statusAbel: newVal} : l));
                                        setSelectedLocation(prev => ({...prev, statusAbel: newVal}));
                                        // TODO: sync to Supabase directly
                                    }}
                                >
                                    <option>Nog te doen</option>
                                    <option>In uitvoering</option>
                                    <option>Afgerond</option>
                                </select>
                            </div>
                            
                            <div className="field-row" style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 'bold' }}>Notities</label>
                                <textarea 
                                    className="draft-input"
                                    defaultValue={selectedLocation.opmerkingenAbel || ''}
                                    onBlur={(e) => {
                                        const newVal = e.target.value;
                                        setLocations(prev => prev.map(l => l.locatiecode === selectedLocation.locatiecode ? {...l, opmerkingenAbel: newVal} : l));
                                        // TODO: sync to Supabase
                                    }}
                                />
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
