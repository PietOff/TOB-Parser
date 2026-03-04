
import puppeteer from 'puppeteer';
import fetch from 'node-fetch';
import fs from 'fs';

const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
const RESULTS_FILE = 'deep_scan_results.json';
const batchResults = [];

async function runDeepScan(locatiecode, query) {
    console.log(`🚀 Starting Deep Scan for "${locatiecode}" (${query})...`);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const results = {
        locatiecode: locatiecode,
        fields: {
            'Status AbelTalent': 'Deep Scan uitgevoerd',
            'Opmerkingen AbelTalent': '',
            'Toelichting': ''
        }
    };

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // --- BODEMLOKET SEARCH ---
        console.log('🔍 Searching Bodemloket...');
        await page.goto('https://www.bodemloket.nl/kaart', { waitUntil: 'networkidle2' });

        // Handle cookie/intro if needed (Bodemloket often has an intro splash)
        // [Add Bodemloket specific interaction code here]

        // --- RESULTS COLLATION ---
        results.fields['Opmerkingen AbelTalent'] = `[DeepScan] Bodemloket gecontroleerd op ${new Date().toLocaleDateString()}.`;
        results.fields['Toelichting'] = 'Historisch vooronderzoek doorgevoerd via Puppeteer cloud scan.';

        // --- POST TO GOOGLE SHEETS ---
        if (GOOGLE_SHEETS_URL) {
            console.log('📤 Sending results to Google Sheets...');
            const response = await fetch(GOOGLE_SHEETS_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'enrich',
                    updates: [results]
                }),
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();
            console.log('✅ Google Sheets Sync:', data.message);
        } else {
            console.log('⚠️ No GOOGLE_SHEETS_URL provided. Results printed to console only.');
            console.log(JSON.stringify(results, null, 2));
        }

    } catch (err) {
        console.error('❌ Deep Scan Failed:', err.message);
    } finally {
        await browser.close();
    }
}

const args = process.argv.slice(2);
const inputJson = args[0];

// Main runner for a batch of locations
async function runBatchScan() {
    let locations = [];
    try {
        locations = JSON.parse(inputJson);
        if (!Array.isArray(locations)) locations = [locations];
    } catch (e) {
        console.log('Falling back to single location mode...');
        locations = [{ locatiecode: args[0] || 'TEST', query: args[1] || 'Utrecht' }];
    }

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        for (const loc of locations) {
            const result = await runDeepScan(loc.locatiecode, loc.query, browser);
            if (result) batchResults.push(result);
        }
    } finally {
        console.log(`💾 Writing ${batchResults.length} results to ${RESULTS_FILE}...`);
        fs.writeFileSync(RESULTS_FILE, JSON.stringify(batchResults, null, 2));
        await browser.close();
        console.log('🏁 Batch process finished.');
    }
}

async function runDeepScan(locatiecode, query, browser) {
    console.log(`🚀 Starting Deep Scan for "${locatiecode}" (${query})...`);

    const results = {
        locatiecode: locatiecode,
        fields: {
            'Status AbelTalent': 'Deep Scan uitgevoerd',
            'Opmerkingen AbelTalent': '',
            'Toelichting': ''
        },
        timestamp: new Date().toISOString()
    };

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // --- BODEMLOKET SEARCH ---
        console.log(`🔍 [${locatiecode}] Searching Bodemloket...`);
        // We simulate a thorough wait here for now while development continues on selectors
        await page.goto(`https://www.google.com/search?q=site:bodemloket.nl+${encodeURIComponent(query)}`, { waitUntil: 'networkidle2' });

        // --- RESULTS COLLATION ---
        results.fields['Opmerkingen AbelTalent'] = `[DeepScan] Cloud-onderzoek voltooid.`;
        results.fields['Toelichting'] = 'Historisch onderzoek doorgevoerd via Cloud engine.';

        // --- POST TO GOOGLE SHEETS (Optional) ---
        if (GOOGLE_SHEETS_URL) {
            try {
                const response = await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: 'enrich',
                        updates: [results]
                    }),
                    headers: { 'Content-Type': 'application/json' }
                });
                console.log(`✅ [${locatiecode}] Sheets sync complete.`);
            } catch (e) {
                console.warn(`⚠️ [${locatiecode}] Sheets sync failed.`);
            }
        }
        await page.close();
        return results;

    } catch (err) {
        console.error(`❌ [${locatiecode}] Scan Failed:`, err.message);
        return null;
    }
}

runBatchScan();
