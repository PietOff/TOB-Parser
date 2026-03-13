import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import {
    fetchProjects, deleteProject, updateProject, moveProjectToFolder,
    fetchFolders, createFolder, updateFolder, deleteFolder,
    fetchProjectMembers, addProjectMember, removeProjectMember,
    fetchAllProfiles, updateUserRole, inviteUserByEmail,
    fetchLocations,
} from '../services/api';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import '../index.css';

// ── Colour palette for folders ────────────────────────
const FOLDER_COLORS = [
    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
    '#ef4444', '#06b6d4', '#f97316', '#6366f1',
];

// ── Small reusable Badge ──────────────────────────────
function RoleBadge({ role }) {
    const style = {
        fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px',
        borderRadius: '999px', display: 'inline-block',
        background: role === 'admin' ? 'var(--accent-glow)' : 'var(--bg-secondary)',
        color: role === 'admin' ? 'var(--abel-yellow)' : 'var(--text-secondary)',
    };
    return <span style={style}>{role}</span>;
}

// ── Modal wrapper ─────────────────────────────────────
function Modal({ title, onClose, children, width = 480 }) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={onClose}>
            <div style={{
                background: 'var(--bg-card)', borderRadius: '10px', padding: '24px',
                width, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                border: '1px solid var(--border)',
            }} onClick={e => e.stopPropagation()}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                    <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text-primary)' }}>{title}</h3>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.3rem', color: 'var(--text-muted)' }}>×</button>
                </div>
                {children}
            </div>
        </div>
    );
}

// ── Input helpers ─────────────────────────────────────
const inputStyle = {
    width: '100%', padding: '8px 10px', fontSize: '0.875rem',
    border: '1px solid var(--border)', borderRadius: '6px',
    boxSizing: 'border-box', outline: 'none',
    background: 'var(--bg-input)', color: 'var(--text-primary)',
};
const btnPrimary = {
    padding: '8px 16px', background: 'var(--abel-yellow)', color: 'var(--bg-primary)',
    border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem',
};
const btnDanger = {
    padding: '6px 12px', background: 'rgba(220,38,38,0.12)', color: '#f87171',
    border: '1px solid rgba(220,38,38,0.3)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem',
};
const btnGhost = {
    padding: '6px 12px', background: 'transparent', color: 'var(--text-secondary)',
    border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem',
};

// ════════════════════════════════════════════════════
// MAIN COMPONENT
// ════════════════════════════════════════════════════
export default function ProjectsManager() {
    const navigate = useNavigate();
    const { isAdmin } = useAuth();

    // ── Data state ────────────────────────────────────
    const [projects, setProjects]     = useState([]);
    const [folders, setFolders]       = useState([]);
    const [profiles, setProfiles]     = useState([]);
    const [loading, setLoading]       = useState(true);

    // ── UI state ──────────────────────────────────────
    const [activeTab, setActiveTab]   = useState('projects'); // 'projects' | 'users'
    const [searchQuery, setSearchQuery] = useState('');
    const [folderFilter, setFolderFilter] = useState(null);   // null = all
    const [modal, setModal]           = useState(null);        // { type, payload }
    const [toast, setToast]           = useState(null);

    // ── Toast helper ──────────────────────────────────
    const showToast = useCallback((msg, kind = 'ok') => {
        setToast({ msg, kind });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // ── Load data ─────────────────────────────────────
    useEffect(() => {
        Promise.all([fetchProjects(), fetchFolders(), fetchAllProfiles()])
            .then(([p, f, u]) => { setProjects(p); setFolders(f); setProfiles(u); })
            .catch(err => showToast('Laden mislukt: ' + err.message, 'err'))
            .finally(() => setLoading(false));
    }, [showToast]);

    // ── Filtered projects ─────────────────────────────
    const filteredProjects = projects.filter(p => {
        const matchSearch = !searchQuery ||
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (p.client || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchFolder = folderFilter === null
            ? true
            : folderFilter === 'none'
                ? !p.folder_id
                : p.folder_id === folderFilter;
        return matchSearch && matchFolder;
    });

    // ── Project actions ───────────────────────────────
    const handleDeleteProject = async (project) => {
        if (!window.confirm(`Project "${project.name}" definitief verwijderen?`)) return;
        try {
            await deleteProject(project.id);
            setProjects(prev => prev.filter(p => p.id !== project.id));
            showToast('Project verwijderd');
        } catch (err) { showToast(err.message, 'err'); }
    };

    const handleMoveProject = async (projectId, folderId) => {
        try {
            await moveProjectToFolder(projectId, folderId);
            setProjects(prev => prev.map(p => p.id === projectId ? { ...p, folder_id: folderId } : p));
        } catch (err) { showToast(err.message, 'err'); }
    };

    // ── Folder actions ────────────────────────────────
    const handleCreateFolder = async (name, color) => {
        try {
            const folder = await createFolder(name, color);
            setFolders(prev => [...prev, folder]);
            showToast(`Map "${name}" aangemaakt`);
        } catch (err) { showToast(err.message, 'err'); }
    };

    const handleDeleteFolder = async (folder) => {
        if (!window.confirm(`Map "${folder.name}" verwijderen? Projecten worden niet verwijderd.`)) return;
        try {
            await deleteFolder(folder.id);
            setFolders(prev => prev.filter(f => f.id !== folder.id));
            setProjects(prev => prev.map(p => p.folder_id === folder.id ? { ...p, folder_id: null } : p));
            showToast('Map verwijderd');
        } catch (err) { showToast(err.message, 'err'); }
    };

    // ── User actions ──────────────────────────────────
    const handleRoleChange = async (userId, role) => {
        try {
            await updateUserRole(userId, role);
            setProfiles(prev => prev.map(u => u.id === userId ? { ...u, role } : u));
            showToast('Rol bijgewerkt');
        } catch (err) { showToast(err.message, 'err'); }
    };

    const handleInvite = async (email) => {
        try {
            await inviteUserByEmail(email);
            showToast(`Uitnodiging verstuurd naar ${email}`);
        } catch (err) { showToast(err.message, 'err'); }
    };

    // ── Render ────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>
            <Navbar />
            {/* Tab sub-header */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '0 1.5rem',
                background: 'var(--bg-card)',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
            }}>
                <button
                    onClick={() => setActiveTab('projects')}
                    style={{
                        padding: '10px 14px',
                        background: 'none',
                        border: 'none',
                        borderBottom: activeTab === 'projects' ? '2px solid var(--abel-yellow)' : '2px solid transparent',
                        color: activeTab === 'projects' ? 'var(--text-primary)' : 'var(--text-muted)',
                        cursor: 'pointer',
                        fontWeight: activeTab === 'projects' ? 600 : 400,
                        fontSize: '0.875rem',
                        transition: 'color var(--transition)',
                        marginBottom: '-1px',
                    }}
                >📁 Projecten</button>
                {isAdmin && (
                    <button
                        onClick={() => setActiveTab('users')}
                        style={{
                            padding: '10px 14px',
                            background: 'none',
                            border: 'none',
                            borderBottom: activeTab === 'users' ? '2px solid var(--abel-yellow)' : '2px solid transparent',
                            color: activeTab === 'users' ? 'var(--text-primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                            fontWeight: activeTab === 'users' ? 600 : 400,
                            fontSize: '0.875rem',
                            transition: 'color var(--transition)',
                            marginBottom: '-1px',
                        }}
                    >👥 Gebruikers</button>
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', top: '70px', right: '24px', zIndex: 9999,
                    background: toast.kind === 'err' ? 'var(--danger-bg)' : 'var(--success-bg)',
                    border: `1px solid ${toast.kind === 'err' ? 'var(--danger)' : 'var(--success)'}`,
                    color: toast.kind === 'err' ? 'var(--danger)' : 'var(--success)',
                    padding: '10px 18px', borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)', fontSize: '0.875rem',
                }}>{toast.msg}</div>
            )}

            {loading ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                    <div className="spinner spinner-lg" />
                </div>
            ) : activeTab === 'projects' ? (
                <ProjectsTab
                    projects={filteredProjects}
                    allProjects={projects}
                    folders={folders}
                    profiles={profiles}
                    searchQuery={searchQuery}
                    setSearchQuery={setSearchQuery}
                    folderFilter={folderFilter}
                    setFolderFilter={setFolderFilter}
                    modal={modal}
                    setModal={setModal}
                    onDelete={handleDeleteProject}
                    onMove={handleMoveProject}
                    onCreateFolder={handleCreateFolder}
                    onDeleteFolder={handleDeleteFolder}
                    navigate={navigate}
                    showToast={showToast}
                />
            ) : (
                <UsersTab
                    profiles={profiles}
                    onRoleChange={handleRoleChange}
                    onInvite={handleInvite}
                />
            )}

            {/* Modals */}
            {modal?.type === 'members' && (
                <MembersModal
                    project={modal.payload}
                    profiles={profiles}
                    onClose={() => setModal(null)}
                    showToast={showToast}
                />
            )}
            {modal?.type === 'newFolder' && (
                <NewFolderModal
                    onClose={() => setModal(null)}
                    onCreate={handleCreateFolder}
                />
            )}
        </div>
    );
}

// ════════════════════════════════════════════════════
// PROJECTS TAB
// ════════════════════════════════════════════════════
function ProjectsTab({ projects, allProjects, folders, profiles, searchQuery, setSearchQuery,
    folderFilter, setFolderFilter, modal, setModal, onDelete, onMove,
    onCreateFolder, onDeleteFolder, navigate, showToast }) {

    return (
        <div style={{ display: 'flex', flexGrow: 1, overflow: 'hidden' }}>
            {/* Folder sidebar */}
            <aside style={{
                width: '220px', flexShrink: 0,
                background: 'var(--bg-card)', borderRight: '1px solid var(--border)',
                display: 'flex', flexDirection: 'column', padding: '16px 12px', gap: '4px',
            }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '8px', paddingLeft: '6px' }}>MAPPEN</div>

                <FolderItem label="Alle projecten" icon="📋" count={allProjects.length}
                    active={folderFilter === null} onClick={() => setFolderFilter(null)} />
                <FolderItem label="Zonder map" icon="📄" count={allProjects.filter(p => !p.folder_id).length}
                    active={folderFilter === 'none'} onClick={() => setFolderFilter('none')} />

                {folders.map(folder => (
                    <div key={folder.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ flexGrow: 1 }}>
                            <FolderItem
                                label={folder.name}
                                icon="📁"
                                color={folder.color}
                                count={allProjects.filter(p => p.folder_id === folder.id).length}
                                active={folderFilter === folder.id}
                                onClick={() => setFolderFilter(folder.id)}
                            />
                        </div>
                        <button
                            onClick={() => onDeleteFolder(folder)}
                            title="Map verwijderen"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem', padding: '2px 4px' }}
                        >×</button>
                    </div>
                ))}

                <button onClick={() => setModal({ type: 'newFolder' })} style={{
                    marginTop: '12px', padding: '7px 10px', background: '#f1f5f9',
                    border: '1px dashed #cbd5e1', borderRadius: '6px', cursor: 'pointer',
                    fontSize: '0.78rem', color: 'var(--text-secondary)', textAlign: 'left',
                }}>+ Nieuwe map</button>
            </aside>

            {/* Main project list */}
            <main style={{ flexGrow: 1, overflowY: 'auto', padding: '20px 24px', background: 'var(--bg-primary)' }}>
                {/* Search bar */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                    <input
                        type="text"
                        placeholder="🔍  Zoek projecten..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        style={{ ...inputStyle, maxWidth: '360px' }}
                    />
                </div>

                {projects.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '60px 0', fontSize: '0.95rem' }}>
                        Geen projecten gevonden.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {projects.map(project => (
                            <ProjectCard
                                key={project.id}
                                project={project}
                                folders={folders}
                                onOpen={() => navigate(`/project/${project.id}`)}
                                onDelete={() => onDelete(project)}
                                onMove={folderId => onMove(project.id, folderId)}
                                onManageMembers={() => setModal({ type: 'members', payload: project })}
                            />
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}

function FolderItem({ label, icon, color, count, active, onClick }) {
    return (
        <button onClick={onClick} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '6px 8px', borderRadius: '6px', cursor: 'pointer', width: '100%',
            background: active ? 'var(--accent-glow)' : 'transparent',
            border: active ? '1px solid var(--accent)' : '1px solid transparent',
            color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
            fontWeight: active ? 600 : 400,
            fontSize: '0.83rem', textAlign: 'left',
        }}>
            <span>
                {color ? <span style={{ color, marginRight: '6px' }}>●</span> : `${icon} `}
                {label}
            </span>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{count}</span>
        </button>
    );
}

const EXPORT_COLUMNS = [
    { header: 'Locatiecode',                    key: 'locatiecode',       width: 15 },
    { header: 'Locatienaam',                    key: 'locatienaam',       width: 25 },
    { header: 'Straatnaam',                     key: 'straatnaam',        width: 25 },
    { header: 'Huisnummer',                     key: 'huisnummer',        width: 12 },
    { header: 'Postcode',                       key: 'postcode',          width: 12 },
    { header: 'Woonplaats',                     key: 'woonplaats',        width: 18 },
    { header: 'Status',                         key: 'status',            width: 20 },
    { header: 'Conclusie',                      key: 'conclusie',         width: 20 },
    { header: 'Veiligheidsklasse',              key: 'veiligheidsklasse', width: 20 },
    { header: 'Melding',                        key: 'melding',           width: 20 },
    { header: 'MKB',                            key: 'mkb',               width: 12 },
    { header: 'BRL 7000',                       key: 'brl7000',           width: 12 },
    { header: 'Opmerking',                      key: 'opmerking',         width: 30 },
    { header: 'Informatie uit Tekeningen (PPTX)', key: 'tekeningInfo',   width: 35 },
];

async function exportProjectExcel(project) {
    const locations = await fetchLocations(project.id);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'TOB Parser';
    wb.created = new Date();

    const ws = wb.addWorksheet('Locaties', { properties: { tabColor: { argb: 'FF2196F3' } } });
    ws.columns = EXPORT_COLUMNS;

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4285F4' } };
    headerRow.alignment = { vertical: 'middle' };

    for (const loc of locations) {
        const enriched = loc.enriched_data ?? {};
        ws.addRow({
            locatiecode:      loc.locatiecode       ?? '',
            locatienaam:      loc.locatienaam       ?? '',
            straatnaam:       loc.straatnaam        ?? '',
            huisnummer:       loc.huisnummer        ?? '',
            postcode:         loc.postcode          ?? '',
            woonplaats:       loc.woonplaats        ?? '',
            status:           loc.status            ?? '',
            conclusie:        loc.conclusie         ?? '',
            veiligheidsklasse: loc.veiligheidsklasse ?? '',
            melding:          loc.melding           ?? '',
            mkb:              loc.mkb               ?? '',
            brl7000:          loc.brl7000           ?? '',
            opmerking:        loc.opmerking         ?? '',
            tekeningInfo:     enriched.tekeningInfo ?? enriched.pptxInfo ?? '',
        });
    }

    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const safeName = project.name.replace(/[\\/?*[\]:]/g, '').substring(0, 40).trim();
    saveAs(blob, `${safeName}-${new Date().toISOString().split('T')[0]}.xlsx`);
}

function ProjectCard({ project, folders, onOpen, onDelete, onMove, onManageMembers }) {
    const [showMove, setShowMove] = useState(false);
    const [exporting, setExporting] = useState(false);
    const folder = folders.find(f => f.id === project.folder_id);

    const handleExport = async () => {
        setExporting(true);
        try {
            await exportProjectExcel(project);
        } catch (err) {
            console.error(err);
            alert('Export mislukt: ' + err.message);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
            padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px',
        }}>
            {/* Folder color stripe */}
            <div style={{
                width: '4px', height: '48px', borderRadius: '2px', flexShrink: 0,
                background: folder?.color ?? 'var(--border)',
            }} />

            {/* Info */}
            <div style={{ flexGrow: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>
                    {project.name}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', display: 'flex', gap: '12px', marginTop: '3px' }}>
                    {project.client && <span>👤 {project.client}</span>}
                    {folder && <span style={{ color: folder.color }}>📁 {folder.name}</span>}
                    <span>🗓 {new Date(project.created_at).toLocaleDateString('nl-NL')}</span>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button onClick={onOpen} style={btnPrimary}>Openen</button>
                <button onClick={onManageMembers} style={btnGhost} title="Leden beheren">👥</button>

                {/* Move to folder */}
                <div style={{ position: 'relative' }}>
                    <button onClick={() => setShowMove(v => !v)} style={btnGhost} title="Verplaatsen naar map">📁</button>
                    {showMove && (
                        <div style={{
                            position: 'absolute', right: 0, top: '110%', zIndex: 100,
                            background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '8px',
                            padding: '6px', minWidth: '180px',
                            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                        }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', padding: '4px 8px' }}>Verplaats naar</div>
                            <FolderOption label="Geen map" onClick={() => { onMove(null); setShowMove(false); }} />
                            {folders.map(f => (
                                <FolderOption key={f.id} label={f.name} color={f.color}
                                    onClick={() => { onMove(f.id); setShowMove(false); }} />
                            ))}
                        </div>
                    )}
                </div>

                <button
                    onClick={handleExport}
                    disabled={exporting}
                    style={{ ...btnGhost, minWidth: '36px' }}
                    title="Exporteer naar Excel"
                >
                    {exporting ? <span style={{ fontSize: '0.7rem' }}>...</span> : '📥'}
                </button>

                <button onClick={onDelete} style={btnDanger} title="Verwijderen">🗑</button>
            </div>
        </div>
    );
}

function FolderOption({ label, color, onClick }) {
    return (
        <button onClick={onClick} style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '6px 10px', fontSize: '0.82rem',
            background: 'none', border: 'none', cursor: 'pointer', borderRadius: '4px',
            color: 'var(--text-primary)',
        }}
            onMouseOver={e => e.currentTarget.style.background = 'var(--bg-card-hover)'}
            onMouseOut={e => e.currentTarget.style.background = 'none'}
        >
            {color && <span style={{ color, marginRight: '6px' }}>●</span>}
            {label}
        </button>
    );
}

// ════════════════════════════════════════════════════
// MEMBERS MODAL
// ════════════════════════════════════════════════════
function MembersModal({ project, profiles, onClose, showToast }) {
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchProjectMembers(project.id)
            .then(setMembers)
            .catch(err => showToast(err.message, 'err'))
            .finally(() => setLoading(false));
    }, [project.id, showToast]);

    const memberIds = new Set(members.map(m => m.user_id));
    const nonMembers = profiles.filter(p => !memberIds.has(p.id));

    const handleAdd = async (userId) => {
        try {
            await addProjectMember(project.id, userId);
            const added = profiles.find(p => p.id === userId);
            setMembers(prev => [...prev, { user_id: userId, profiles: added }]);
            showToast('Lid toegevoegd');
        } catch (err) { showToast(err.message, 'err'); }
    };

    const handleRemove = async (userId) => {
        try {
            await removeProjectMember(project.id, userId);
            setMembers(prev => prev.filter(m => m.user_id !== userId));
            showToast('Lid verwijderd');
        } catch (err) { showToast(err.message, 'err'); }
    };

    return (
        <Modal title={`Leden — ${project.name}`} onClose={onClose}>
            {loading ? <div className="spinner" /> : (
                <>
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>HUIDIGE LEDEN</div>
                        {members.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Nog geen leden.</div>}
                        {members.map(m => {
                            const p = m.profiles;
                            return (
                                <div key={m.user_id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '8px 0', borderBottom: '1px solid var(--border)',
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: '0.85rem' }}>{p?.email || '—'}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}><RoleBadge role={p?.role} /></div>
                                    </div>
                                    <button onClick={() => handleRemove(m.user_id)} style={btnDanger}>Verwijderen</button>
                                </div>
                            );
                        })}
                    </div>

                    {nonMembers.length > 0 && (
                        <div>
                            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '8px' }}>TOEVOEGEN</div>
                            {nonMembers.map(p => (
                                <div key={p.id} style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '6px 0', borderBottom: '1px solid var(--border)',
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 500, fontSize: '0.85rem', color: 'var(--text-primary)' }}>{p.email}</div>
                                        <RoleBadge role={p.role} />
                                    </div>
                                    <button onClick={() => handleAdd(p.id)} style={btnPrimary}>Toevoegen</button>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </Modal>
    );
}

// ════════════════════════════════════════════════════
// NEW FOLDER MODAL
// ════════════════════════════════════════════════════
function NewFolderModal({ onClose, onCreate }) {
    const [name, setName] = useState('');
    const [color, setColor] = useState(FOLDER_COLORS[0]);

    const handleSubmit = async () => {
        if (!name.trim()) return;
        await onCreate(name.trim(), color);
        onClose();
    };

    return (
        <Modal title="Nieuwe map aanmaken" onClose={onClose} width={360}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '6px', color: 'var(--text-secondary)' }}>Naam</label>
                    <input style={inputStyle} placeholder="bijv. Utrecht 2025" value={name} onChange={e => setName(e.target.value)} autoFocus />
                </div>
                <div>
                    <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '8px', color: 'var(--text-secondary)' }}>Kleur</label>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {FOLDER_COLORS.map(c => (
                            <button key={c} onClick={() => setColor(c)} style={{
                                width: '28px', height: '28px', borderRadius: '50%', background: c,
                                border: color === c ? '3px solid var(--text-primary)' : '3px solid transparent',
                                cursor: 'pointer',
                            }} />
                        ))}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button onClick={onClose} style={btnGhost}>Annuleren</button>
                    <button onClick={handleSubmit} style={btnPrimary} disabled={!name.trim()}>Aanmaken</button>
                </div>
            </div>
        </Modal>
    );
}

// ════════════════════════════════════════════════════
// USERS TAB
// ════════════════════════════════════════════════════
function UsersTab({ profiles, onRoleChange, onInvite }) {
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviting, setInviting] = useState(false);

    const handleInvite = async () => {
        if (!inviteEmail.trim()) return;
        setInviting(true);
        await onInvite(inviteEmail.trim());
        setInviteEmail('');
        setInviting(false);
    };

    return (
        <div style={{ maxWidth: '760px', margin: '32px auto', padding: '0 24px' }}>
            {/* Invite section */}
            <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px',
                padding: '20px 24px', marginBottom: '24px',
            }}>
                <h3 style={{ margin: '0 0 14px 0', fontSize: '0.95rem', color: 'var(--text-primary)' }}>✉️ Nieuwe gebruiker uitnodigen</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        style={{ ...inputStyle, maxWidth: '340px' }}
                        type="email"
                        placeholder="email@abeltalent.nl"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleInvite()}
                    />
                    <button onClick={handleInvite} style={btnPrimary} disabled={inviting || !inviteEmail.trim()}>
                        {inviting ? 'Versturen...' : 'Uitnodiging sturen'}
                    </button>
                </div>
                <p style={{ margin: '10px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    De gebruiker ontvangt een e-mail van Supabase om een wachtwoord in te stellen.
                </p>
            </div>

            {/* Users list */}
            <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: '0.9rem' }}>
                    👥 Alle gebruikers ({profiles.length})
                </div>
                {profiles.map((profile, i) => (
                    <div key={profile.id} style={{
                        display: 'flex', alignItems: 'center', padding: '12px 24px',
                        borderBottom: i < profiles.length - 1 ? '1px solid var(--border)' : 'none',
                        gap: '14px',
                    }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '50%',
                            background: 'var(--info-bg)', color: 'var(--accent-light)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontWeight: 700, fontSize: '0.9rem', flexShrink: 0,
                        }}>
                            {(profile.email || '?').charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flexGrow: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>{profile.email}</div>
                            <RoleBadge role={profile.role} />
                        </div>
                        <select
                            value={profile.role || 'external'}
                            onChange={e => onRoleChange(profile.id, e.target.value)}
                            style={{
                                padding: '5px 8px', fontSize: '0.8rem',
                                border: '1px solid var(--border)', borderRadius: '6px',
                                background: profile.role === 'admin' ? '#eff6ff' : '#f9fafb',
                                color: profile.role === 'admin' ? '#1d4ed8' : '#374151',
                                fontWeight: 600, cursor: 'pointer',
                            }}
                        >
                            <option value="external">External</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                ))}
            </div>
        </div>
    );
}
