/**
 * Dynamic RegExp Parser for TOB Reports
 * Applies search rules defined in Google Sheets to the extracted raw text.
 */

// Helper to escape regex special characters
function escapeRegExp(string) {
    if (!string) return '';
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Apply a set of dynamic rules to the full text of a document.
 * 
 * @param {string} fullText - The raw text extracted from PDF or DOCX
 * @param {Array} rules - Array of rules { sleutel, vooraf, achteraf }
 * @returns {Object} - Key-value pairs of the extracted data
 */
export function applyDynamicRules(fullText, rules) {
    const extractedData = {};

    if (!fullText || !rules || !Array.isArray(rules) || rules.length === 0) {
        return extractedData;
    }

    for (const rule of rules) {
        if (!rule.sleutel) continue;

        const key = rule.sleutel;
        const prefix = rule.vooraf || '';
        const suffix = rule.achteraf || '';

        try {
            let match = null;

            if (prefix && suffix) {
                // Look for text between prefix and suffix
                const escapedPrefix = escapeRegExp(prefix);
                const escapedSuffix = escapeRegExp(suffix);
                // Use [\\s\\S]{1,500}? to lazily match up to 500 characters across newlines
                const regex = new RegExp(escapedPrefix + '([\\s\\S]{1,500}?)' + escapedSuffix, 'i');
                match = regex.exec(fullText);
            } else if (prefix && !suffix) {
                // Look for text immediately following the prefix until the end of the line
                const escapedPrefix = escapeRegExp(prefix);
                const regex = new RegExp(escapedPrefix + '[\\s\\t]*([^\\n\\r]+)', 'i');
                match = regex.exec(fullText);
            } else if (!prefix && suffix) {
                // Look for text immediately preceding the suffix on the same line
                const escapedSuffix = escapeRegExp(suffix);
                const regex = new RegExp('([^\\n\\r]+?)[\\s\\t]*' + escapedSuffix, 'i');
                match = regex.exec(fullText);
            }

            if (match && match[1]) {
                let value = match[1].trim();
                
                // Clean up any lingering internal excessive whitespace and newlines
                value = value.replace(/\\s{2,}/g, ' ').replace(/\\r?\\n/g, ' ');
                
                extractedData[key] = value;
                console.log(`✨ [Dynamic Parser] Found expected value for "${key}":`, value.substring(0, 50));
            }
        } catch (err) {
            console.warn(`⚠️ [Dynamic Parser] Failed to execute rule for key "${key}":`, err.message);
        }
    }

    return extractedData;
}
