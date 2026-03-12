import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Navbar() {
    const navigate = useNavigate();
    const location = useLocation();
    const { isAdmin, user, signOut } = useAuth();

    const isActive = (path) =>
        location.pathname === path || location.pathname.startsWith(path + '/');

    return (
        <nav className="navbar">
            <div className="navbar-inner">
                {/* Brand */}
                <button className="navbar-brand" onClick={() => navigate('/')}>
                    <span className="brand-abel">Abel</span>
                    <span className="brand-talent">Talent</span>
                    <span className="brand-sep" />
                    <span className="brand-sub">TOB Backoffice</span>
                </button>

                {/* Nav links */}
                <div className="navbar-links">
                    <button
                        className={`nav-link${isActive('/') && !isActive('/beheer') && !isActive('/project') ? ' nav-link-active' : ''}`}
                        onClick={() => navigate('/')}
                    >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                        Projecten
                    </button>
                    {isAdmin && (
                        <button
                            className={`nav-link${isActive('/beheer') ? ' nav-link-active' : ''}`}
                            onClick={() => navigate('/beheer')}
                        >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                                <circle cx="9" cy="7" r="4"/>
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                            Gebruikers
                        </button>
                    )}
                </div>

                {/* User area */}
                <div className="navbar-user">
                    {user && <span className="navbar-email">{user.email}</span>}
                    <button className="nav-signout" onClick={signOut}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                            <polyline points="16 17 21 12 16 7"/>
                            <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        Uitloggen
                    </button>
                </div>
            </div>
        </nav>
    );
}
