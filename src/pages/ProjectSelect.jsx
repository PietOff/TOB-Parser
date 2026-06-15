import { useNavigate } from 'react-router-dom';

export default function ProjectSelect() {
    const navigate = useNavigate();

    return (
        <div style={{
            minHeight: '100vh',
            background: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '2rem',
            padding: '2rem',
        }}>
            {/* AbelTalent banner */}
            <div style={{
                background: '#FFB81C',
                borderRadius: 16,
                padding: '2rem 3rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '0.5rem',
                minWidth: 280,
                boxShadow: '0 4px 32px rgba(255,184,28,0.18)',
                marginBottom: '0.5rem',
            }}>
                <AbelTalentLogo />
                <span style={{
                    fontFamily: 'var(--font)',
                    fontSize: '0.95rem',
                    fontWeight: 600,
                    color: '#1F261F',
                    letterSpacing: '0.08em',
                    textTransform: 'lowercase',
                }}>
                    ervaringsversnellers
                </span>
            </div>

            <h1 style={{
                fontFamily: 'var(--font-heading)',
                color: 'var(--text-primary)',
                fontSize: '1.5rem',
                fontWeight: 600,
                marginBottom: '1rem',
                letterSpacing: '0.01em',
            }}>
                Selecteer een project
            </h1>

            <div style={{
                display: 'flex',
                gap: '2rem',
                flexWrap: 'wrap',
                justifyContent: 'center',
            }}>
                {/* TAUW */}
                <button
                    onClick={() => navigate('/dashboard')}
                    style={{
                        width: 220,
                        height: 160,
                        background: 'var(--bg-card)',
                        border: '2px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '1rem',
                        transition: 'border-color 0.2s, background 0.2s, transform 0.15s',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.borderColor = '#4a90d9';
                        e.currentTarget.style.background = 'var(--bg-card-hover)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.background = 'var(--bg-card)';
                        e.currentTarget.style.transform = 'translateY(0)';
                    }}
                >
                    <TauwLogo />
                </button>

                {/* Aelmans */}
                <button
                    onClick={() => navigate('/aelmans')}
                    style={{
                        width: 220,
                        height: 160,
                        background: 'var(--bg-card)',
                        border: '2px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '1rem',
                        transition: 'border-color 0.2s, background 0.2s, transform 0.15s',
                    }}
                    onMouseEnter={e => {
                        e.currentTarget.style.borderColor = '#008b9a';
                        e.currentTarget.style.background = 'var(--bg-card-hover)';
                        e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={e => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.background = 'var(--bg-card)';
                        e.currentTarget.style.transform = 'translateY(0)';
                    }}
                >
                    <AelmansLogo />
                </button>
            </div>
        </div>
    );
}

function AbelTalentLogo() {
    return (
        <div style={{ fontFamily: "'Bitter', Georgia, serif", fontWeight: 700, fontSize: '2.4rem', lineHeight: 1 }}>
            <span style={{ color: '#ffffff' }}>Abel</span>
            <span style={{ color: '#1F261F' }}>Talent</span>
        </div>
    );
}

function TauwLogo() {
    return (
        <svg width="120" height="40" viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
            {/* Wave symbol */}
            <g fill="#4a5de0">
                <path d="M10 20 Q17 12 24 20 Q31 28 38 20" stroke="#4a5de0" strokeWidth="4" fill="none" strokeLinecap="round"/>
                <path d="M10 32 Q17 24 24 32 Q31 40 38 32" stroke="#4a5de0" strokeWidth="4" fill="none" strokeLinecap="round"/>
                <path d="M10 44 Q17 36 24 44 Q31 52 38 44" stroke="#4a5de0" strokeWidth="4" fill="none" strokeLinecap="round"/>
            </g>
            {/* TAUW text */}
            <text x="50" y="42" fontFamily="'Source Sans 3', sans-serif" fontWeight="700" fontSize="28" fill="#4a5de0" letterSpacing="2">TAUW</text>
        </svg>
    );
}

function AelmansLogo() {
    return (
        <svg width="160" height="70" viewBox="0 0 320 140" xmlns="http://www.w3.org/2000/svg">
            {/* Teal stripe */}
            <polygon points="20,62 180,30 210,48 50,80" fill="#008b9a"/>
            {/* Green parallelogram */}
            <polygon points="60,18 260,10 240,52 40,60" fill="#8dc63f"/>
            {/* aelmans text */}
            <text x="10" y="130" fontFamily="'Source Sans 3', sans-serif" fontWeight="400" fontSize="52" fill="#008b9a" letterSpacing="-1">aelmans</text>
        </svg>
    );
}
