import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import UserManagement from './pages/UserManagement';
import ProjectDetail from './pages/ProjectDetail';
import ProjectsManager from './pages/ProjectsManager';
import './index.css';

// Protect private routes from unauthenticated users
const PrivateRoute = ({ children }) => {
    const { user, loading } = useAuth();
    
    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
                <div className="spinner spinner-lg"></div>
            </div>
        );
    }
    
    if (!user) {
        return <Navigate to="/login" replace />;
    }
    
    return children;
};

// Redirect logged-in users away from the login page
const PublicRoute = ({ children }) => {
    const { user, loading } = useAuth();
    
    if (loading) return null;
    
    if (user) {
        return <Navigate to="/" replace />;
    }
    
    return children;
};

export default function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <Routes>
                    <Route 
                        path="/login" 
                        element={
                            <PublicRoute>
                                <Login />
                            </PublicRoute>
                        } 
                    />
                    <Route 
                        path="/register" 
                        element={
                            <PublicRoute>
                                <Register />
                            </PublicRoute>
                        } 
                    />
                    <Route 
                        path="/beheer" 
                        element={
                            <PrivateRoute>
                                <UserManagement />
                            </PrivateRoute>
                        } 
                    />
                    <Route 
                        path="/projecten" 
                        element={
                            <PrivateRoute>
                                <ProjectsManager />
                            </PrivateRoute>
                        } 
                    />
                    <Route 
                        path="/project/:id" 
                        element={
                            <PrivateRoute>
                                <ProjectDetail />
                            </PrivateRoute>
                        } 
                    />
                    <Route 
                        path="/*" 
                        element={
                            <PrivateRoute>
                                <Dashboard />
                            </PrivateRoute>
                        } 
                    />
                </Routes>
            </BrowserRouter>
        </AuthProvider>
    );
}
