import { useState, useEffect } from 'react';
import { supabaseAdmin } from '../utils/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function UserManagement() {
    const { isAdmin, user, signOut } = useAuth();
    const navigate = useNavigate();
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusText, setStatusText] = useState('');

    useEffect(() => {
        if (!isAdmin) {
            navigate('/');
            return;
        }
        fetchProfiles();
    }, [isAdmin]);

    const fetchProfiles = async () => {
        setLoading(true);
        const { data, error } = await supabaseAdmin
            .from('profiles')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching users:', error);
            setStatusText(`FOUT: Kan gebruikers niet ophalen. ${error.message}`);
        } else {
            setProfiles(data || []);
        }
        setLoading(false);
    };

    const toggleRole = async (profileId, currentRole) => {
        const newRole = currentRole === 'admin' ? 'external' : 'admin';
        setStatusText('Status wijzigen...');
        
        const { error } = await supabaseAdmin
            .from('profiles')
            .update({ role: newRole })
            .eq('id', profileId);

        if (error) {
            console.error('Error updating role:', error);
            setStatusText(`FOUT: ${error.message}`);
        } else {
            setStatusText('✅ Rol succesvol gewijzigd!');
            fetchProfiles(); // reload
            setTimeout(() => setStatusText(''), 3000);
        }
    };

    if (!isAdmin) return null;

    return (
        <div style={{ maxWidth: '1000px', margin: '40px auto', padding: '0 20px', fontFamily: 'system-ui, sans-serif' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1 style={{ color: '#1a365d' }}>Beheer Gebruikers</h1>
                <div>
                    <button 
                        onClick={() => navigate('/')} 
                        style={{ marginRight: '10px', padding: '8px 16px', borderRadius: '6px', background: '#e2e8f0', border: 'none', cursor: 'pointer' }}
                    >
                        ← Terug naar Dashboard
                    </button>
                    <button 
                        onClick={signOut} 
                        style={{ padding: '8px 16px', borderRadius: '6px', background: '#fee2e2', color: '#b91c1c', border: 'none', cursor: 'pointer' }}
                    >
                        Uitloggen
                    </button>
                </div>
            </div>

            <p style={{ color: '#64748b' }}>
                Dit is het overzicht van alle gebruikers (zowel jullie team als externen). 
                Jij als admin kunt hun rechten hier direct aanpassen in plaats van via Supabase.
            </p>

            <div style={{ background: '#e0f2fe', color: '#0369a1', padding: '12px', borderRadius: '6px', marginBottom: '30px' }}>
                <strong>Hoe maak je een nieuwe gebruiker aan voor een externe klant?</strong><br/>
                Omdat wachtwoorden strikt beveiligd zijn, kan jij dit niet zomaar voor ze invullen. 
                De externe partij moet simpelweg zelf naar <b>{window.location.origin}/register</b> gaan en zich inschrijven. 
                Zij verschijnen dan automatisch hieronder met de rol <i>external</i>, waarna jij ze aan hun specifieke project kunt koppelen!
            </div>

            {statusText && (
                <div style={{ padding: '10px', background: '#dcfce7', color: '#166534', marginBottom: '20px', borderRadius: '6px' }}>
                    {statusText}
                </div>
            )}

            {loading ? (
                <div>Gebruikers laden...</div>
            ) : (
                <div style={{ background: 'white', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                            <tr>
                                <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>E-mail</th>
                                <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Lid Sinds</th>
                                <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Rol</th>
                                <th style={{ padding: '12px 16px', fontWeight: '600', color: '#475569' }}>Beheer</th>
                            </tr>
                        </thead>
                        <tbody>
                            {profiles.map(p => (
                                <tr key={p.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <td style={{ padding: '14px 16px' }}>{p.email}</td>
                                    <td style={{ padding: '14px 16px', color: '#64748b' }}>{new Date(p.created_at).toLocaleDateString()}</td>
                                    <td style={{ padding: '14px 16px' }}>
                                        <span style={{ 
                                            display: 'inline-block', padding: '4px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
                                            background: p.role === 'admin' ? '#dbeafe' : '#f1f5f9',
                                            color: p.role === 'admin' ? '#1d4ed8' : '#475569'
                                        }}>
                                            {p.role.toUpperCase()}
                                        </span>
                                    </td>
                                    <td style={{ padding: '14px 16px' }}>
                                        {p.id !== user.id && (
                                            <button 
                                                onClick={() => toggleRole(p.id, p.role)}
                                                style={{
                                                    padding: '6px 12px', borderRadius: '4px', border: '1px solid #cbd5e1',
                                                    background: 'white', cursor: 'pointer', fontSize: '13px'
                                                }}
                                            >
                                                Maak {p.role === 'admin' ? 'External' : 'Admin'}
                                            </button>
                                        )}
                                        {p.id === user.id && <span style={{ color: '#94a3b8', fontSize: '13px' }}>(Jijzelf)</span>}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {profiles.length === 0 && (
                        <div style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Geen gebruikers gevonden.</div>
                    )}
                </div>
            )}
        </div>
    );
}
