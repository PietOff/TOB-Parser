import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { Link } from 'react-router-dom';

export default function Register() {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [msg, setMsg] = useState(null);
    const [error, setError] = useState(null);

    const handleRegister = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setMsg(null);

        const { error } = await supabase.auth.signUp({
            email,
            password,
        });

        if (error) {
            setError(error.message);
        } else {
            setMsg('Account aangemaakt! Check (indien nodig) je e-mail om te bevestigen, of log direct in.');
        }
        setLoading(false);
    };

    return (
        <div className="login-container" style={{ 
            display: 'flex', justifyContent: 'center', alignItems: 'center', 
            height: '100vh', backgroundColor: '#f0f4f8' 
        }}>
            <div className="login-card" style={{
                background: 'white', padding: '40px', borderRadius: '12px',
                boxShadow: '0 10px 25px rgba(0,0,0,0.05)', width: '100%', maxWidth: '400px'
            }}>
                <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                    <h1 style={{ margin: '0', color: '#1a365d', fontSize: '24px' }}>Registreren</h1>
                    <p style={{ margin: '8px 0 0 0', color: '#64748b' }}>Maak een nieuw account aan voor de backoffice</p>
                </div>

                {error && (
                    <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}>
                        {error}
                    </div>
                )}
                {msg && (
                    <div style={{ background: '#dcfce7', color: '#166534', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '14px' }}>
                        {msg}
                    </div>
                )}

                <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#475569' }}>E-mailadres</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '15px' }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: '#475569' }}>Wachtwoord (min. 6 tekens)</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            minLength={6}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '15px' }}
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        style={{
                            background: '#059669', color: 'white', padding: '12px',
                            border: 'none', borderRadius: '6px', fontSize: '15px', fontWeight: '600',
                            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, marginTop: '8px'
                        }}
                    >
                        {loading ? 'Bezig...' : 'Account Maken'}
                    </button>
                </form>

                <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '14px' }}>
                    <Link to="/login" style={{ color: '#2563eb', textDecoration: 'none' }}>Terug naar Inloggen</Link>
                </div>
            </div>
        </div>
    );
}
