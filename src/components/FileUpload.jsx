import { useState, useRef, useCallback } from 'react';

export default function FileUpload({ onFilesReady }) {
    const [files, setFiles] = useState([]);
    const [dragging, setDragging] = useState(false);
    const inputRef = useRef(null);

    const handleFiles = useCallback((newFiles) => {
        const validFiles = Array.from(newFiles).filter(f => {
            const ext = f.name.toLowerCase().split('.').pop();
            return ['pdf', 'xlsx', 'xls', 'pptx', 'docx', 'doc'].includes(ext);
        });
        setFiles(prev => {
            const combined = [...prev, ...validFiles];
            // Deduplicate by name
            const unique = combined.filter((f, i, arr) => arr.findIndex(x => x.name === f.name) === i);
            return unique;
        });
    }, []);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
    }, [handleFiles]);

    const handleDragOver = useCallback((e) => {
        e.preventDefault();
        setDragging(true);
    }, []);

    const removeFile = (name) => {
        setFiles(prev => prev.filter(f => f.name !== name));
    };

    const getFileIcon = (name) => {
        const ext = name.toLowerCase().split('.').pop();
        if (ext === 'pdf') return '📄';
        if (['xlsx', 'xls'].includes(ext)) return '📊';
        if (ext === 'pptx') return '📑';
        return '📎';
    };

    const handleProcess = () => {
        if (files.length > 0 && onFilesReady) {
            onFilesReady(files);
        }
    };

    return (
        <div>
            <div
                className={`upload-zone ${dragging ? 'dragging' : ''}`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={() => setDragging(false)}
                onClick={() => inputRef.current?.click()}
            >
                <div className="upload-icon">📂</div>
                <h3>Sleep TOB bestanden hierheen</h3>
                <p>PDF rapporten, Excel (.xlsx), Word (.docx), PowerPoint (.pptx)</p>
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    accept=".pdf,.xlsx,.xls,.pptx,.docx,.doc"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFiles(e.target.files)}
                />
            </div>

            {files.length > 0 && (
                <>
                    <div className="file-list">
                        {files.map(f => (
                            <div key={f.name} className="file-item">
                                <span className="file-icon">{getFileIcon(f.name)}</span>
                                <span className="file-name">{f.name}</span>
                                <span className="file-status">
                                    {(f.size / 1024).toFixed(0)} KB
                                </span>
                                <button className="file-remove" onClick={() => removeFile(f.name)}>×</button>
                            </div>
                        ))}
                    </div>

                    <div className="btn-group">
                        <button className="btn btn-primary" onClick={handleProcess}>
                            🔍 Bestanden verwerken ({files.length})
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
