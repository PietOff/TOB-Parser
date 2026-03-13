import { useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import '../index.css';

export default function Login() {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState(null);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            setError(error.message);
            setLoading(false);
        }
    };

    return (
        <div className="login-page">
            <div className="login-box">
                <div className="login-logo">
                    <div>
                        <span className="brand-abel">Abel</span>
                        <span className="brand-talent">Talent</span>
                    </div>
                    <p className="login-tagline">TOB Backoffice</p>
                </div>

                {error && <div className="login-error">{error}</div>}

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                    <div className="login-field">
                        <label>E-mailadres</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            autoComplete="email"
                        />
                    </div>
                    <div className="login-field">
                        <label>Wachtwoord</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            autoComplete="current-password"
                        />
                    </div>
                    <button type="submit" disabled={loading} className="btn-login">
                        {loading ? 'Bezig met inloggen...' : 'Inloggen'}
                    </button>
                </form>
            </div>
        </div>
    );
}
