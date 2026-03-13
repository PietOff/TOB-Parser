import { useState, useEffect } from 'react';
import { supabaseAdmin } from '../utils/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import '../index.css';

export default function UserManagement() {
    const { isAdmin, user } = useAuth();
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
        <div className="page-shell">
            <Navbar />

            <div className="page-content">
                {/* Page title */}
                <div className="dash-hero">
                    <h2>Gebruikersbeheer</h2>
                    <p>Beheer rollen en toegang van alle TOB Backoffice gebruikers.</p>
                </div>

                {/* Info banner */}
                <div style={{
                    background: 'var(--info-bg)',
                    border: '1px solid var(--info)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.875rem 1rem',
                    marginBottom: '1.5rem',
                    fontSize: '0.875rem',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.6',
                }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Nieuwe externe gebruiker aanmaken?</strong>
                    {' '}De externe partij gaat zelf naar{' '}
                    <code style={{ background: 'var(--bg-input)', padding: '1px 5px', borderRadius: '3px', fontSize: '0.8rem', color: 'var(--abel-yellow)' }}>
                        {window.location.origin}/register
                    </code>
                    {' '}en schrijft zich in. Ze verschijnen dan automatisch hieronder als <em>external</em>.
                </div>

                {/* Status feedback */}
                {statusText && (
                    <div style={{
                        padding: '0.65rem 1rem',
                        background: 'var(--success-bg)',
                        border: '1px solid var(--success)',
                        color: 'var(--success)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.875rem',
                        marginBottom: '1rem',
                    }}>
                        {statusText}
                    </div>
                )}

                {/* Users table */}
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                        <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
                        Gebruikers laden...
                    </div>
                ) : (
                    <div style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        overflow: 'hidden',
                    }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>E-mail</th>
                                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lid Sinds</th>
                                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Rol</th>
                                    <th style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Beheer</th>
                                </tr>
                            </thead>
                            <tbody>
                                {profiles.map(p => (
                                    <tr key={p.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background var(--transition)' }}
                                        onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-card-hover)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = ''}
                                    >
                                        <td style={{ padding: '0.875rem 1rem', color: 'var(--text-primary)', fontSize: '0.9rem' }}>{p.email}</td>
                                        <td style={{ padding: '0.875rem 1rem', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                                            {new Date(p.created_at).toLocaleDateString('nl-NL')}
                                        </td>
                                        <td style={{ padding: '0.875rem 1rem' }}>
                                            <span style={{
                                                display: 'inline-block',
                                                padding: '3px 10px',
                                                borderRadius: '20px',
                                                fontSize: '0.75rem',
                                                fontWeight: '600',
                                                letterSpacing: '0.04em',
                                                background: p.role === 'admin' ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                                                color: p.role === 'admin' ? 'var(--abel-yellow)' : 'var(--text-secondary)',
                                                border: `1px solid ${p.role === 'admin' ? 'var(--accent)' : 'var(--border)'}`,
                                            }}>
                                                {p.role.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.875rem 1rem' }}>
                                            {p.id !== user.id ? (
                                                <button
                                                    onClick={() => toggleRole(p.id, p.role)}
                                                    style={{
                                                        padding: '5px 12px',
                                                        borderRadius: 'var(--radius-sm)',
                                                        border: '1px solid var(--border-light)',
                                                        background: 'var(--bg-secondary)',
                                                        color: 'var(--text-secondary)',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem',
                                                        transition: 'background var(--transition), color var(--transition)',
                                                    }}
                                                    onMouseOver={(e) => { e.currentTarget.style.background = 'var(--bg-card-hover)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                                                    onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-secondary)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                                                >
                                                    → {p.role === 'admin' ? 'External' : 'Admin'}
                                                </button>
                                            ) : (
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(Jijzelf)</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {profiles.length === 0 && (
                            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                Geen gebruikers gevonden.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
