/**
 * TOB Parser — Server-side Location Enrichment Script
 * Runs via GitHub Actions to enrich locations in Google Sheet
 * with data from PDOK, Topotijdreis, and Bodemloket APIs.
 */

import proj4 from 'proj4';

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxkDL0r8JGlPiqsLvDW7daqek4yhNpMWIID0gZZ4FJ02X7Hrs3HOxk-tOR3CoNX_48S/exec';

const PDOK_BASE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';

const RD = '+proj=sterea +lat_0=52.15616055555555 +lon_0=5.38763888888889 +k=0.9999079 +x_0=155000 +y_0=463000 +ellps=bessel +units=m +no_defs';
const WGS84 = 'EPSG:4326';

// ═══════════════════════════════════════
// PDOK Locatieserver
// ═══════════════════════════════════════

async function pdokSearch(query) {
    try {
        const url = `${PDOK_BASE}/free?q=${encodeURIComponent(query)}&rows=3`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const doc = data.response?.docs?.[0];
        if (!doc) return null;

        let rdX = null, rdY = null;
        if (doc.centroide_rd) {
            const m = doc.centroide_rd.match(/POINT\s*\((\d+\.?\d*)\s+(\d+\.?\d*)\)/);
            if (m) { rdX = parseFloat(m[1]); rdY = parseFloat(m[2]); }
        }

        return {
            straatnaam: doc.straatnaam || '',
            huisnummer: doc.huisnummer || '',
            postcode: doc.postcode || '',
            woonplaats: doc.woonplaatsnaam || '',
            gemeente: doc.gemeentenaam || '',
            provincie: doc.provincienaam || '',
            rdX, rdY,
        };
    } catch (err) {
        console.warn(`  PDOK search failed for "${query}":`, err.message);
        return null;
    }
}

// ═══════════════════════════════════════
// PDOK Bodemkwaliteitskaart (WFS)
// ═══════════════════════════════════════

async function getBodemkwaliteit(rdX, rdY) {
    try {
        const buffer = 50;
        const bbox = `${rdX - buffer},${rdY - buffer},${rdX + buffer},${rdY + buffer}`;
        const url = `https://service.pdok.nl/provincies/bodemkwaliteit/wfs/v1_0?` +
            `service=WFS&version=2.0.0&request=GetFeature&` +
            `typeName=bodemkwaliteit:bodemkwaliteitskaart&` +
            `bbox=${bbox},EPSG:28992&outputFormat=application/json&count=3`;

        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();

        if (data.features?.length > 0) {
            return data.features[0].properties?.bodemkwaliteitsklasse ||
                data.features[0].properties?.klasse || 'Onbekend';
        }
        return null;
    } catch (err) {
        console.warn('  Bodemkwaliteit query failed:', err.message);
        return null;
    }
}

// ═══════════════════════════════════════
// Topotijdreis & Bodemloket URL generation
// ═══════════════════════════════════════

function getTopotijdreisUrl(rdX, rdY) {
    return `https://www.topotijdreis.nl?x=${Math.round(rdX)}&y=${Math.round(rdY)}&l=11&datatype=maps`;
}

function getBodemloketUrl(rdX, rdY) {
    return `https://www.bodemloket.nl/kaart?zoom=15&x=${Math.round(rdX)}&y=${Math.round(rdY)}`;
}

// ═══════════════════════════════════════
// SmartFill assessment (server-side copy)
// ═══════════════════════════════════════

function assessLocation(loc) {
    const conclusie = (loc['Conclusie'] || '').toLowerCase().trim();
    const opmerking = (loc['Opmerking'] || '').toLowerCase().trim();
    const searchString = `${loc['Locatienaam']} ${opmerking} ${conclusie}`.toLowerCase();

    const histKeywords = [
        'gasfabriek', 'tankstation', 'benzinestation', 'boomgaard', 'stoomgemaal',
        'kassen', 'spoorlijn', 'rwzi', 'loswal', 'ijzergieterij', 'sloperij',
        'ophoging', 'demping', 'sloodemping', 'gracht', 'haven', 'kanaal',
        'teer', 'asbest', 'olie', 'chemisch'
    ];

    let isVerdacht = false;
    let reason = '';

    if (histKeywords.some(k => searchString.includes(k))) {
        isVerdacht = true;
        reason = `Protocol marker: ${histKeywords.find(k => searchString.includes(k))}`;
    }

    if (['verdacht', 'verontreinigd', 'wel', 'complex'].includes(conclusie)) {
        isVerdacht = true;
        reason = reason || `Rapportage: ${conclusie}`;
    }

    if (isVerdacht) {
        return {
            beoordeling: 'Verdacht',
            prioriteit: 'Hoog',
            toelichting: reason,
            actie: 'Nader onderzoek / BRL 7000.'
        };
    }

    return {
        beoordeling: 'Onverdacht',
        prioriteit: 'Geen',
        toelichting: 'Geen verdachte kenmerken gevonden.',
        actie: 'Geen actie nodig.'
    };
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

(async () => {
    console.log('🚀 TOB Parser — Enrichment Script [v1.1 - Precise Coords & Protocol]');
    console.log(`   Web App URL: ${WEB_APP_URL}`);

    // ... rest of logic remains same but uses these updated helpers ...

    // Step 1: Read current data from Google Sheet
    console.log('\n📖 Reading locations from Google Sheet...');
    let locations;
    try {
        const res = await fetch(WEB_APP_URL, { redirect: 'follow' });
        const text = await res.text();

        // Google Apps Script redirects and may return HTML if doGet is missing
        if (text.startsWith('<!DOCTYPE') || text.startsWith('<html')) {
            console.error('❌ Google Sheet returned HTML instead of JSON.');
            console.error('   Dit betekent dat de Apps Script nog de oude versie is.');
            console.error('   Update het script in Google Apps Script met de nieuwe setup-tob-sheet.gs');
            console.error('   en maak een NIEUWE implementatie (Implementeren > Nieuwe implementatie).');
            console.error('   Vergeet niet de nieuwe URL in dit script bij te werken!');
            process.exit(1);
        }

        const data = JSON.parse(text);
        if (!data.success) throw new Error(data.error || 'Failed to read sheet');
        locations = data.locations || [];
        console.log(`   Found ${locations.length} locations`);
    } catch (err) {
        if (err.message.includes('JSON')) {
            console.error('❌ Google Sheet returned invalid response. Re-deploy het Apps Script.');
        } else {
            console.error('❌ Failed to read Google Sheet:', err.message);
        }
        process.exit(1);
    }

    if (locations.length === 0) {
        console.log('   No locations to enrich. Exiting.');
        process.exit(0);
    }

    // Step 2: Enrich each location
    console.log('\n🔍 Enriching locations with external APIs...');
    const updates = [];

    for (let i = 0; i < locations.length; i++) {
        const loc = locations[i];
        const code = loc['Locatiecode'] || `Row ${i + 2}`;
        const existingGemeente = loc['Gemeente'];

        // Skip already-enriched locations
        if (existingGemeente && loc['Topotijdreis Link']) {
            console.log(`   [${i + 1}/${locations.length}] ${code} — already enriched, skipping`);
            continue;
        }

        console.log(`   [${i + 1}/${locations.length}] ${code} — enriching...`);
        const fields = {};

        // Build search query from available address data
        const searchParts = [
            loc['Straatnaam'], loc['Huisnummer'], loc['Postcode'],
            loc['Woonplaats'] || loc['Locatienaam']
        ].filter(Boolean);
        const searchQuery = searchParts.join(' ');

        if (searchQuery.trim()) {
            // PDOK geocoding
            const pdok = await pdokSearch(searchQuery);
            if (pdok) {
                if (pdok.gemeente) fields['Gemeente'] = pdok.gemeente;
                if (pdok.provincie) fields['Provincie'] = pdok.provincie;
                if (pdok.rdX) fields['RD-X'] = pdok.rdX;
                if (pdok.rdY) fields['RD-Y'] = pdok.rdY;

                // Fill missing address info
                if (!loc['Straatnaam'] && pdok.straatnaam) fields['Straatnaam'] = pdok.straatnaam;
                if (!loc['Postcode'] && pdok.postcode) fields['Postcode'] = pdok.postcode;

                if (pdok.rdX && pdok.rdY) {
                    // Bodemkwaliteitskaart
                    const bodem = await getBodemkwaliteit(pdok.rdX, pdok.rdY);
                    if (bodem) fields['Bodemkwaliteitsklasse'] = bodem;

                    // Topotijdreis link
                    fields['Topotijdreis Link'] = getTopotijdreisUrl(pdok.rdX, pdok.rdY);

                    // Bodemloket link
                    fields['Bodemloket Link'] = getBodemloketUrl(pdok.rdX, pdok.rdY);
                }
                console.log(`     ✅ PDOK: ${pdok.gemeente}, ${pdok.provincie}`);
            } else {
                console.log(`     ⚠️  PDOK: no results for "${searchQuery}"`);
            }
        } else {
            console.log(`     ⚠️  No address data available for geocoding`);
        }

        // SmartFill assessment
        const assessment = assessLocation(loc);
        if (!loc['Beoordeling']) fields['Beoordeling'] = assessment.beoordeling;
        if (!loc['Prioriteit']) fields['Prioriteit'] = assessment.prioriteit;
        fields['Toelichting'] = assessment.toelichting;
        fields['Actie'] = assessment.actie;

        if (Object.keys(fields).length > 0) {
            updates.push({ locatiecode: loc['Locatiecode'], fields });
        }

        // Rate limit: 250ms between API calls
        await new Promise(r => setTimeout(r, 250));
    }

    console.log(`\n📊 Enriched ${updates.length} locations`);

    // Step 3: Push enriched data back to Google Sheet
    if (updates.length > 0) {
        console.log('\n📤 Pushing enriched data to Google Sheet...');
        try {
            const payload = {
                action: 'enrich',
                newColumns: ['Gemeente', 'Provincie', 'RD-X', 'RD-Y',
                    'Bodemkwaliteitsklasse', 'Topotijdreis Link',
                    'Bodemloket Link', 'Toelichting', 'Actie'],
                updates,
            };

            const res = await fetch(WEB_APP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                redirect: 'follow',
            });

            const result = await res.json();
            if (result.success) {
                console.log(`   ✅ ${result.updated} locaties succesvol verrijkt in Google Sheet!`);
            } else {
                console.error('   ❌ Error:', result.error);
                process.exit(1);
            }
        } catch (err) {
            console.error('   ❌ Failed to push to Google Sheet:', err.message);
            process.exit(1);
        }
    } else {
        console.log('   Nothing to update.');
    }

    console.log('\n🎉 Enrichment complete!');
})();
