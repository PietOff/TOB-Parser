/**
 * TOB Parser — Server-side Location Enrichment Script
 * Runs via GitHub Actions to enrich locations in Google Sheet
 * with data from PDOK, Topotijdreis, and Bodemloket APIs.
 */

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbxkDL0r8JGlPiqsLvDW7daqek4yhNpMWIID0gZZ4FJ02X7Hrs3HOxk-tOR3CoNX_48S/exec';

const PDOK_BASE = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1';

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
            const m = doc.centroide_rd.match(/POINT\((\d+\.?\d*)\s+(\d+\.?\d*)\)/);
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
    const currentYear = new Date().getFullYear();
    const rapportJaar = parseInt(loc['Rapportjaar']) || null;
    const rapportLeeftijd = rapportJaar ? currentYear - rapportJaar : null;
    const afstandTrace = parseFloat(loc['Afstand trace (m)']) || null;
    const conclusie = (loc['Conclusie'] || '').toLowerCase().trim();
    const verdacht = parseInt(loc['Verdachte activiteiten']) || 0;

    let prioriteit = 'laag';
    if (verdacht > 5 || conclusie === 'wel') prioriteit = 'hoog';
    if (rapportJaar && rapportJaar >= 2021) prioriteit = prioriteit === 'hoog' ? 'hoog' : 'midden';

    if (conclusie === 'onverdacht') {
        return { beoordeling: 'Onverdacht', prioriteit: 'Geen', toelichting: 'Locatie beoordeeld als onverdacht.', actie: 'Geen verdere actie nodig.' };
    }
    if (conclusie === 'verontreinigd' && rapportLeeftijd !== null && rapportLeeftijd < 5 && afstandTrace !== null && afstandTrace <= 5) {
        return { beoordeling: 'Verontreinigd (zeker)', prioriteit: 'Hoog', toelichting: `Verontreiniging binnen ${afstandTrace}m van trace, rapport ${rapportJaar} (${rapportLeeftijd}j oud).`, actie: 'Sanering/MKB vereist.' };
    }
    if (conclusie === 'verontreinigd' && rapportLeeftijd !== null && rapportLeeftijd >= 5 && afstandTrace !== null && afstandTrace <= 25) {
        return { beoordeling: 'Verontreinigd (onzeker)', prioriteit: 'Midden', toelichting: `Verontreiniging binnen ${afstandTrace}m, maar rapport van ${rapportJaar} (${rapportLeeftijd}j oud). Nader onderzoek.`, actie: 'Nader onderzoek / actualisatie.' };
    }
    if (conclusie === 'verdacht' || verdacht > 0) {
        return { beoordeling: 'Verdacht', prioriteit: 'Hoog', toelichting: `Verdachte locatie${verdacht ? ` (${verdacht} activiteiten)` : ''}.`, actie: 'Nader bodemonderzoek.' };
    }
    if (!conclusie || conclusie === 'onbekend') {
        return { beoordeling: 'Onvoldoende info', prioriteit: prioriteit, toelichting: 'Onvoldoende informatie beschikbaar.', actie: 'Aanvullend onderzoek.' };
    }
    return { beoordeling: 'Onbekend', prioriteit: prioriteit, toelichting: 'Handmatige review vereist.', actie: 'Handmatig beoordelen.' };
}

// ═══════════════════════════════════════
// MAIN
// ═══════════════════════════════════════

(async () => {
    console.log('🚀 TOB Parser — Location Enrichment Script');
    console.log(`   Web App URL: ${WEB_APP_URL}`);

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
