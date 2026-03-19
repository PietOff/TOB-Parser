/**
 * Image OCR Utility: Extracts trace information from document images
 * Uses Tesseract.js for client-side OCR (loaded dynamically)
 */
import * as pdfjsLib from 'pdfjs-dist';

const OCR_TIMEOUT = 30000; // 30 second timeout

/**
 * Get or initialize Tesseract worker
 * Tries to use pre-initialized worker from app window, falls back to new init
 */
async function getWorker(onProgress) {
    // Check if worker was pre-initialized in App.jsx
    if (window.__tesseractWorker) {
        console.log('✅ [OCR] Using pre-initialized Tesseract worker');
        return window.__tesseractWorker;
    }

    try {
        console.log('🖼️ [OCR] Initializing Tesseract worker (downloading WASM ~20MB)...');
        if (onProgress) onProgress('Tesseract-engine aan het laden...');

        // Dynamically import to avoid loading if not needed
        const Tesseract = (await import('tesseract.js')).default;

        const initPromise = Tesseract.createWorker('nld', 1, {
            corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5/tesseract-core.wasm.js',
        });

        // Add timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Tesseract initialization timeout')), OCR_TIMEOUT)
        );

        const worker = await Promise.race([initPromise, timeoutPromise]);
        console.log('✅ [OCR] Tesseract worker ready');

        // Cache for reuse
        window.__tesseractWorker = worker;
        return worker;
    } catch (err) {
        console.warn('⚠️ [OCR] Failed to initialize Tesseract:', err.message);
        throw err;
    }
}

/**
 * Run OCR on an image and extract trace-related text
 */
export async function ocrImageForTrace(imageSource, onProgress) {
    try {
        console.log('🖼️ [OCR] Starting OCR on image...');
        if (onProgress) onProgress('OCR aan het verwerken...');

        const worker = await getWorker(onProgress);

        const recognizePromise = worker.recognize(imageSource);
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('OCR recognition timeout')), OCR_TIMEOUT)
        );

        const result = await Promise.race([recognizePromise, timeoutPromise]);
        console.log('🖼️ [OCR] OCR completed. Confidence:', result.data.confidence);

        // Extract trace-related patterns from OCR text
        const text = result.data.text;
        const traceInfo = extractTracePatterns(text);

        return {
            fullText: text,
            confidence: result.data.confidence,
            traceInfo,
        };
    } catch (err) {
        console.warn('⚠️ [OCR] Error during OCR:', err.message);
        throw err;
    }
}

/**
 * Extract trace patterns from OCR'd text
 * Looks for: distances, route descriptions, location markers
 */
function extractTracePatterns(text) {
    const patterns = {
        distances: [],
        routes: [],
        locations: [],
        rdCoordinates: [],
    };

    // Pattern 1: Distance patterns (e.g., "500m", "3,5 km", "2500 meter")
    const distanceRegex = /(\d+[.,]?\d*)\s*(?:km|m(?:eter)?|kilometer)\b/gi;
    let match;
    while ((match = distanceRegex.exec(text)) !== null) {
        const value = parseFloat(match[1].replace(',', '.'));
        const unit = match[0].toLowerCase().includes('km') ? 'km' : 'm';
        patterns.distances.push({
            value,
            unit,
            raw: match[0],
            context: text.substring(Math.max(0, match.index - 50), Math.min(text.length, match.index + match[0].length + 50)),
        });
    }

    // Pattern 2: Route descriptions (e.g., "van X naar Y", "from A to B", "route X-Y")
    const routeRegex = /(?:van|from|route|tracé|leiding|lijn)\s+([a-z\s\-]+?)\s+(?:naar|to|tot|hacia)\s+([a-z\s\-]+?)(?:[.,;:\n]|$)/gi;
    while ((match = routeRegex.exec(text)) !== null) {
        patterns.routes.push({
            from: match[1].trim(),
            to: match[2].trim(),
            raw: match[0],
        });
    }

    // Pattern 3: Location markers (street names, coordinates, etc.)
    const locationRegex = /(?:lokatie|location|plaats|address|adres|straat)[:\s]+([^\n]+)/gi;
    while ((match = locationRegex.exec(text)) !== null) {
        patterns.locations.push({
            text: match[1].trim(),
            raw: match[0],
        });
    }

    // Pattern 4: Dutch RD grid coordinate labels printed on map images
    // "157.250 / 392.750" (km notation on map grid) or "157250 392750" (metres)
    const rdLabelRegex = /(\d{3}[.,]\d{3})\s*[/]\s*(\d{3}[.,]\d{3})|(\d{5,6})\s+(\d{6,7})/g;
    while ((match = rdLabelRegex.exec(text)) !== null) {
        let x, y;
        if (match[1] && match[2]) {
            // km notation: "157.250 / 392.750" → multiply by 1000
            x = parseFloat(match[1].replace(',', '.')) * 1000;
            y = parseFloat(match[2].replace(',', '.')) * 1000;
        } else {
            x = parseFloat(match[3]);
            y = parseFloat(match[4]);
        }
        // Validate RD bounds: X ∈ [10000, 300000], Y ∈ [300000, 700000]
        if (x > 10000 && x < 300000 && y > 300000 && y < 700000) {
            patterns.rdCoordinates.push({ x, y });
        }
    }

    console.log('🖼️ [OCR] Extracted patterns:', patterns);
    return patterns;
}

/**
 * Extract images from PDF file by rendering each page to canvas
 * Checks for image operators first to skip text-only pages
 */
export async function extractImagesFromPdf(pdf, maxPages = 4) {
    const images = [];
    const limit = Math.min(pdf.numPages, maxPages);

    for (let pageNum = 1; pageNum <= limit; pageNum++) {
        try {
            const page = await pdf.getPage(pageNum);
            const opList = await page.getOperatorList();

            // Check if this page contains image paint operators
            const hasPaintOp = opList.fnArray.some(fn =>
                fn === pdfjsLib.OPS.paintImageXObject ||
                fn === pdfjsLib.OPS.paintInlineImageXObject ||
                fn === pdfjsLib.OPS.paintImageMaskXObject
            );
            if (!hasPaintOp) continue;

            const viewport = page.getViewport({ scale: 2.0 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');

            await page.render({ canvasContext: ctx, viewport }).promise;
            const dataUrl = canvas.toDataURL('image/png');

            console.log(`🖼️ [OCR] Rendered page ${pageNum} from PDF (${Math.round(viewport.width)}×${Math.round(viewport.height)})`);
            images.push({ url: dataUrl, pageNum });
        } catch (err) {
            console.warn(`⚠️ [OCR] Error rendering page ${pageNum}:`, err);
        }
    }

    return images;
}

/**
 * Extract images from DOCX file by processing as ZIP
 */
export async function extractImagesFromDocx(arrayBuffer) {
    try {
        const images = [];

        // Import JSZip dynamically
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(arrayBuffer);

        // DOCX images are in word/media/ directory
        const mediaFiles = Object.keys(zip.files).filter(f => f.startsWith('word/media/'));

        for (const mediaPath of mediaFiles) {
            try {
                const file = zip.files[mediaPath];
                const data = await file.async('blob');
                const url = URL.createObjectURL(data);

                console.log(`🖼️ [OCR] Extracted image from DOCX: ${mediaPath}`);
                images.push({
                    url,
                    path: mediaPath,
                    blob: data,
                });
            } catch (err) {
                console.warn(`⚠️ [OCR] Error extracting ${mediaPath}:`, err);
            }
        }

        return images;
    } catch (err) {
        console.warn('⚠️ [OCR] Error extracting images from DOCX:', err);
        return [];
    }
}

/**
 * Best effort: Try to OCR any canvas/image element on the page
 * Useful when trace maps are embedded as images
 */
export async function ocrCanvasElement(canvasElement) {
    try {
        const imageData = canvasElement.toDataURL('image/png');
        return await ocrImageForTrace(imageData);
    } catch (err) {
        console.warn('⚠️ [OCR] Error OCRing canvas:', err);
        return null;
    }
}
