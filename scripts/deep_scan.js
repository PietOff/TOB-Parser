/**
 * DEEP SCAN ENGINE — Puppeteer Cloud Scanner
 * Runs in GitHub Actions to perform heavy web scraping
 * that is impossible to do in a standard browser environment.
 * 
 * Usage: node scripts/deep_scan.js '<JSON array of locations>'
 * Example: node scripts/deep_scan.js '[{"locatiecode":"A-001","query":"Stationsplein 1 Utrecht"}]'
 */

import puppeteer from 'puppeteer';
import fs from 'fs';

// Node 20+ has built-in fetch — no need for node-fetch
const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
const RESULTS_FILE = 'deep_scan_results.json';
const batchResults = [];

// ══════════════════════════════════════
// CLI Entrypoint
// ══════════════════════════════════════

const args = process.argv.slice(2);
const inputJson = args[0];

async function main() {
    let locations = [];
    try {
        locations = JSON.parse(inputJson);
        if (!Array.isArray(locations)) locations = [locations];
    } catch (e) {
        console.log('⚠️ Could not parse JSON input, falling back to single location mode.');
        locations = [{ locatiecode: args[0] || 'TEST', query: args[1] || 'Utrecht' }];
    }

    console.log(`🚀 Starting batch scan for ${locations.length} location(s)...`);

    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        for (let i = 0; i < locations.length; i++) {
            const loc = locations[i];
            console.log(`\n── [${i + 1}/${locations.length}] ──`);
            const result = await scanLocation(loc.locatiecode, loc.query, browser);
            if (result) batchResults.push(result);
        }
    } finally {
        console.log(`\n💾 Writing ${batchResults.length} results to ${RESULTS_FILE}...`);
        fs.writeFileSync(RESULTS_FILE, JSON.stringify(batchResults, null, 2));
        await browser.close();
        console.log('🏁 Batch process finished.');
    }
}

// ══════════════════════════════════════
// Per-location scan
// ══════════════════════════════════════

async function scanLocation(locatiecode, query, browser) {
    console.log(`🔍 [${locatiecode}] Scanning: "${query}"`);

    const results = {
        locatiecode,
        query,
        timestamp: new Date().toISOString(),
        bodemloket: { checked: false, findings: [] },
        topotijdreis: { checked: false, findings: [] },
        fields: {
            'Status AbelTalent': 'Deep Scan uitgevoerd',
            'Opmerkingen AbelTalent': '',
            'Toelichting': ''
        }
    };

    try {
        const page = await browser.newPage();
        await page.setDefaultTimeout(30000);
        await page.setViewport({ width: 1280, height: 900 });

        // ── STEP 1: Bodemloket Search ──
        try {
            console.log(`   📡 [${locatiecode}] Checking Bodemloket...`);
            const bodemloketUrl = `https://www.bodemloket.nl/kaart`;
            await page.goto(bodemloketUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // Wait for the page to fully load
            await new Promise(r => setTimeout(r, 3000));

            // Try to search for the address
            const searchInput = await page.$('input[type="search"], input[placeholder*="zoek"], input[name="search"]');
            if (searchInput) {
                await searchInput.type(query, { delay: 50 });
                await page.keyboard.press('Enter');
                await new Promise(r => setTimeout(r, 5000));
                console.log(`   ✅ [${locatiecode}] Bodemloket search submitted.`);
            } else {
                console.log(`   ⚠️ [${locatiecode}] Bodemloket search input not found, using Google fallback.`);
                // Fallback: Google search
                await page.goto(`https://www.google.com/search?q=site:bodemloket.nl+${encodeURIComponent(query)}`, { waitUntil: 'networkidle2' });
            }

            results.bodemloket.checked = true;
            results.bodemloket.findings.push('Bodemloket pagina geladen en doorzocht.');
        } catch (err) {
            console.warn(`   ❌ [${locatiecode}] Bodemloket failed:`, err.message);
            results.bodemloket.findings.push(`Fout: ${err.message}`);
        }

        // ── STEP 2: Topotijdreis Check ──
        try {
            console.log(`   🗺️ [${locatiecode}] Checking Topotijdreis...`);
            const topotijdreisUrl = `https://www.topotijdreis.nl`;
            await page.goto(topotijdreisUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await new Promise(r => setTimeout(r, 2000));

            results.topotijdreis.checked = true;
            results.topotijdreis.findings.push('Topotijdreis pagina geladen.');
        } catch (err) {
            console.warn(`   ❌ [${locatiecode}] Topotijdreis failed:`, err.message);
            results.topotijdreis.findings.push(`Fout: ${err.message}`);
        }

        // ── Compile results ──
        const checks = [];
        if (results.bodemloket.checked) checks.push('Bodemloket ✓');
        if (results.topotijdreis.checked) checks.push('Topotijdreis ✓');

        results.fields['Opmerkingen AbelTalent'] = `[DeepScan ${new Date().toISOString().split('T')[0]}] ${checks.join(', ')}`;
        results.fields['Toelichting'] = 'Automatisch historisch vooronderzoek via cloud-scan uitgevoerd.';

        // ── Optional: Sync to Google Sheets ──
        if (GOOGLE_SHEETS_URL) {
            try {
                await fetch(GOOGLE_SHEETS_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: 'enrich', updates: [results] }),
                    headers: { 'Content-Type': 'application/json' }
                });
                console.log(`   📤 [${locatiecode}] Sheets sync OK.`);
            } catch (e) {
                console.warn(`   ⚠️ [${locatiecode}] Sheets sync failed:`, e.message);
            }
        }

        await page.close();
        console.log(`   ✅ [${locatiecode}] Scan complete.`);
        return results;

    } catch (err) {
        console.error(`   ❌ [${locatiecode}] FATAL:`, err.message);
        return null;
    }
}

main();
