/**
 * XLSX Parser: extracts TOB data from Excel files (like Tauw's "informatie TOB" spreadsheets)
 */
import * as XLSX from 'xlsx';

/**
 * Parse an Excel file and return structured location data
 */
export async function parseXlsx(file) {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const allLocations = [];

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        if (rows.length === 0) continue;

        // Try to detect TOB-like columns
        const headers = Object.keys(rows[0]).map(h => h.toLowerCase().trim());
        const hasLocatiecode = headers.some(h => h.includes('locatiecode'));
        const hasConclusie = headers.some(h => h.includes('conclusie'));

        if (!hasLocatiecode) continue; // Skip non-TOB sheets

        for (const row of rows) {
            // Normalize keys to lowercase
            const normalized = {};
            for (const [key, val] of Object.entries(row)) {
                normalized[key.toLowerCase().trim()] = val;
            }

            const conclusie = String(normalized['conclusie'] || normalized['conclusie '] || '').trim();
            const isComplex = conclusie.toLowerCase().includes('vbo verdacht') ||
                conclusie.toLowerCase().includes('interventiewaarde') ||
                conclusie.toLowerCase().includes('verontreinigd');

            const location = {
                locatiecode: String(normalized.locatiecode || '').trim(),
                locatienaam: String(normalized.locatienaam || '').trim(),
                straatnaam: String(normalized.straatnaam || '').trim(),
                huisnummer: String(normalized.huisnummer || normalized.huisnr || '').trim(),
                postcode: String(normalized.postcode || normalized.pc || '').trim(),
                woonplaats: String(normalized.woonplaats || normalized.plaats || '').trim(),
                status: String(normalized.status || '').trim(),
                conclusie: conclusie,
                veiligheidsklasse: String(normalized.veiligheidsklasse || '').trim(),
                melding: String(normalized.melding || '').trim(),
                mkb: String(normalized.mkb || '').trim(),
                brl7000: String(normalized['brl 7000'] || normalized.brl7000 || '').trim(),
                opmerking: String(normalized.opmerking || '').trim(),
                complex: isComplex,
                rapportJaar: null,
                afstandTrace: null,
                verdachteActiviteiten: 0,
                stoffen: [],
                traceGeometry: [],
                _source: `Excel: ${sheetName}`,
            };

            // Try to extract year from opmerking
            const yearMatch = String(location.opmerking).match(/\b(19|20)\d{2}\b/);
            if (yearMatch) {
                location.rapportJaar = parseInt(yearMatch[0]);
            }

            // Try to extract stoffen from conclusie
            const stofMatch = conclusie.match(/(lood|koper|zink|minerale\s*olie|pak|nikkel|chroom)\s*[\s>]*\s*(?:I\s*)?\(?(\d+)/i);
            if (stofMatch) {
                location.stoffen.push({
                    stof: stofMatch[1].toLowerCase(),
                    waarde: parseFloat(stofMatch[2]),
                    raw: stofMatch[0],
                });
            }

            if (location.locatiecode) {
                allLocations.push(location);
            }
        }
    }

    return allLocations;
}
