/**
 * Image OCR Utility: Extracts trace information from document images
 * Uses Tesseract.js for client-side OCR
 */
import Tesseract from 'tesseract.js';

/**
 * Run OCR on an image and extract trace-related text
 */
export async function ocrImageForTrace(imageSource, onProgress) {
    try {
        console.log('🖼️ [OCR] Starting OCR on image...');

        const worker = await Tesseract.createWorker('nld', 1, {
            // Use Dutch language for better results in Netherlands
            corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@v5/tesseract-core.wasm.js',
        });

        const result = await worker.recognize(imageSource);
        console.log('🖼️ [OCR] OCR completed. Confidence:', result.data.confidence);

        // Extract trace-related patterns from OCR text
        const text = result.data.text;
        const traceInfo = extractTracePatterns(text);

        await worker.terminate();

        return {
            fullText: text,
            confidence: result.data.confidence,
            traceInfo,
        };
    } catch (err) {
        console.warn('⚠️ [OCR] Error during OCR:', err);
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

    console.log('🖼️ [OCR] Extracted patterns:', patterns);
    return patterns;
}

/**
 * Extract images from PDF file using pdfjs
 */
export async function extractImagesFromPdf(pdf) {
    const images = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        try {
            const page = await pdf.getPage(pageNum);
            const operatorList = await page.getOperatorList();

            // Try to find image references in the page
            // This is a simplified approach - real image extraction is more complex
            if (operatorList.fnArray.includes('paintImageXObject')) {
                console.log(`🖼️ [OCR] Found image reference on page ${pageNum}`);
                // In production, you'd extract the actual image data here
            }
        } catch (err) {
            console.warn(`⚠️ [OCR] Error processing page ${pageNum}:`, err);
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
