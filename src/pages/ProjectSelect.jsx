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

                {/* BK ingenieurs — no functionality yet */}
                <button
                    disabled
                    style={{
                        width: 220,
                        height: 160,
                        background: 'var(--bg-card)',
                        border: '2px solid var(--border)',
                        borderRadius: 'var(--radius)',
                        cursor: 'not-allowed',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '1rem',
                        opacity: 0.5,
                    }}
                >
                    <BkLogo />
                </button>
            </div>
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

function BkLogo() {
    return (
        <svg width="100" height="60" viewBox="0 0 140 80" xmlns="http://www.w3.org/2000/svg">
            {/* Speech bubble */}
            <rect x="2" y="2" width="100" height="64" rx="14" ry="14" fill="#0099cc"/>
            <polygon points="20,66 36,66 20,80" fill="#0099cc"/>
            {/* bk text */}
            <text x="14" y="42" fontFamily="'Source Sans 3', sans-serif" fontWeight="700" fontSize="32" fill="white">bk</text>
            {/* ingenieurs */}
            <text x="108" y="50" fontFamily="'Source Sans 3', sans-serif" fontWeight="400" fontSize="13" fill="#0099cc">ingenieurs</text>
        </svg>
    );
}
