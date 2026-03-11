/**
 * api.js — Supabase Service Layer voor TOB Backoffice
 * Phase 3: Database Integratie
 *
 * Bevat alle CRUD-operaties voor:
 *  - projects      (hoofd TOB-rapporten)
 *  - locations     (geëxtraheerde adressen/coördinaten)
 *  - researches    (onderzoeksstatus per locatie)
 */

import { supabase } from '../utils/supabaseClient';

// ─────────────────────────────────────────────
// PROJECTS
// ─────────────────────────────────────────────

/**
 * Sla een nieuw project op en geef het nieuwe project-ID terug.
 * @param {string} name       - Naam van het project / TOB rapport
 * @param {string} [client]   - Naam van de opdrachtgever (optioneel)
 * @returns {Promise<string>} - UUID van het nieuwe project
 */
export async function saveProject(name, client = null) {
  const { data, error } = await supabase
    .from('projects')
    .insert({ name, client })
    .select('id')
    .single();

  if (error) throw new Error(`saveProject fout: ${error.message}`);
  return data.id;
}

/**
 * Haal alle projecten op waartoe de ingelogde gebruiker toegang heeft.
 * RLS zorgt automatisch voor de juiste filtering (admin ziet alles,
 * external ziet alleen zijn project_members).
 * @returns {Promise<Array>}
 */
export async function fetchProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`fetchProjects fout: ${error.message}`);
  return data ?? [];
}

/**
 * Haal één project op inclusief alle bijbehorende locaties.
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
export async function fetchProject(projectId) {
  const { data, error } = await supabase
    .from('projects')
    .select('*, locations(*)')
    .eq('id', projectId)
    .single();

  if (error) throw new Error(`fetchProject fout: ${error.message}`);
  return data;
}

/**
 * Werk de naam of opdrachtgever van een project bij.
 * @param {string} projectId
 * @param {Object} updates  - bijv. { name: '...', client: '...' }
 * @returns {Promise<void>}
 */
export async function updateProject(projectId, updates) {
  const { error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId);

  if (error) throw new Error(`updateProject fout: ${error.message}`);
}

/**
 * Verwijder een project (en via ON DELETE CASCADE alle locaties/researches).
 * @param {string} projectId
 * @returns {Promise<void>}
 */
export async function deleteProject(projectId) {
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId);

  if (error) throw new Error(`deleteProject fout: ${error.message}`);
}

// ─────────────────────────────────────────────
// LOCATIONS
// ─────────────────────────────────────────────

/**
 * Sla een batch locaties op voor een project.
 * Elke locatie uit de parser-output wordt op de juiste kolommen gemapped.
 * @param {string} projectId
 * @param {Array}  locationsArray - array van location-objecten zoals uit de parser
 * @returns {Promise<Array>} - ingevoegde rijen inclusief gegenereerde IDs
 */
export async function saveLocations(projectId, locationsArray) {
  if (!locationsArray || locationsArray.length === 0) return [];

  const rows = locationsArray.map((loc) => ({
    project_id:        projectId,
    locatiecode:       loc.locatiecode       ?? null,
    locatienaam:       loc.locatienaam       ?? null,
    straatnaam:        loc.straatnaam        ?? null,
    huisnummer:        loc.huisnummer        ?? null,
    postcode:          loc.postcode          ?? null,
    woonplaats:        loc.woonplaats        ?? null,
    status:            loc.status            ?? null,
    conclusie:         loc.conclusie         ?? null,
    veiligheidsklasse: loc.veiligheidsklasse ?? null,
    melding:           loc.melding           ?? null,
    mkb:               loc.mkb               ?? null,
    brl7000:           loc.brl7000           ?? null,
    opmerking:         loc.opmerking         ?? null,
    complex:           loc.complex           ?? false,
    // Coördinaten
    lat:               loc._enriched?.lat    ?? null,
    lon:               loc._enriched?.lon    ?? null,
    rd_x:              loc._enriched?.rd?.x  ?? loc.rdX ?? null,
    rd_y:              loc._enriched?.rd?.y  ?? loc.rdY ?? null,
    // Verrijkte externe data als JSON-blob (inclusief Nazca detail)
    enriched_data:     {
      ...(loc._enriched ?? {}),
      ...(loc._nazcaDetail ? { nazcaDetail: loc._nazcaDetail } : {}),
    },
    // Stoffen als JSON-array
    stoffen:           loc.stoffen           ?? null,
    // AbelTalent tracking
    status_abel:       loc.statusAbel        ?? 'Nog te doen',
    opmerkingen_abel:  loc.opmerkingenAbel   ?? null,
    afstand_trace:     loc.afstandTrace      ?? null,
    // Brondocument
    source_file:       loc._source           ?? null,
    // Rapport jaar
    rapport_jaar:      loc.rapportJaar       ?? null,
  }));

  const { data, error } = await supabase
    .from('locations')
    .insert(rows)
    .select();

  if (error) throw new Error(`saveLocations fout: ${error.message}`);
  return data ?? [];
}

/**
 * Haal alle locaties op voor een project.
 * @param {string} projectId
 * @returns {Promise<Array>}
 */
export async function fetchLocations(projectId) {
  const { data, error } = await supabase
    .from('locations')
    .select('*')
    .eq('project_id', projectId)
    .order('locatiecode', { ascending: true });

  if (error) throw new Error(`fetchLocations fout: ${error.message}`);
  return data ?? [];
}

/**
 * Werk één locatie bij (bijv. na handmatige aanpassing in de UI).
 * @param {string} locationId  - UUID van de locatie
 * @param {Object} updates     - velden om bij te werken (React state namen)
 * @returns {Promise<void>}
 */
export async function updateLocation(locationId, updates) {
  // Map React state-namen naar database-kolommen
  const columnMap = {
    statusAbel:        'status_abel',
    opmerkingenAbel:   'opmerkingen_abel',
    afstandTrace:      'afstand_trace',
    veiligheidsklasse: 'veiligheidsklasse',
    conclusie:         'conclusie',
    _enriched:         'enriched_data',
    rdX:               'rd_x',
    rdY:               'rd_y',
  };

  const dbUpdates = {};
  for (const [key, value] of Object.entries(updates)) {
    const col = columnMap[key] ?? key;
    dbUpdates[col] = value;
  }

  const { error } = await supabase
    .from('locations')
    .update(dbUpdates)
    .eq('id', locationId);

  if (error) throw new Error(`updateLocation fout: ${error.message}`);
}

/**
 * Converteer een Supabase locatie-rij terug naar het React state-formaat
 * dat Dashboard.jsx en DataPreview.jsx verwachten.
 * @param {Object} row - rij uit de 'locations' tabel
 * @returns {Object}   - locatie-object voor React state
 */
export function dbRowToLocation(row) {
  return {
    // Primaire sleutel bewaren voor latere DB updates
    _db_id:            row.id,
    project_id:        row.project_id,
    locatiecode:       row.locatiecode,
    locatienaam:       row.locatienaam,
    straatnaam:        row.straatnaam,
    huisnummer:        row.huisnummer,
    postcode:          row.postcode,
    woonplaats:        row.woonplaats,
    status:            row.status,
    conclusie:         row.conclusie,
    veiligheidsklasse: row.veiligheidsklasse,
    melding:           row.melding,
    mkb:               row.mkb,
    brl7000:           row.brl7000,
    opmerking:         row.opmerking,
    complex:           row.complex,
    stoffen:           row.stoffen,
    rapportJaar:       row.rapport_jaar,
    statusAbel:        row.status_abel,
    opmerkingenAbel:   row.opmerkingen_abel,
    afstandTrace:      row.afstand_trace,
    _source:           row.source_file,
    rdX:               row.rd_x,
    rdY:               row.rd_y,
    isComplex:         row.complex ?? false,
    // Herstel genest _enriched object
    _enriched: row.enriched_data
      ? {
          ...row.enriched_data,
          lat: row.lat ?? row.latitude ?? row.enriched_data?.lat,
          lon: row.lon ?? row.longitude ?? row.enriched_data?.lon,
          rd: row.rd_x
            ? { x: row.rd_x, y: row.rd_y }
            : row.enriched_data?.rd ?? null,
        }
      : (row.lat ?? row.latitude)
        ? { lat: row.lat ?? row.latitude, lon: row.lon ?? row.longitude, rd: row.rd_x ? { x: row.rd_x, y: row.rd_y } : null }
        : null,
  };
}

// ─────────────────────────────────────────────
// RESEARCHES
// ─────────────────────────────────────────────

/**
/**
 * Sla de onderzoeksstatus (vinkjes) op voor een locatie.
 * Omdat we nu een rijen-gebaseerd systeem gebruiken (met type en status),
 * accepteren we een list van onderzoeken per locatie.
 * Bij een nieuw project maken we standaard records aan (bijv Bodemloket, PDOK, HBB).
 * @param {string} locationId     - UUID van de locatie
 * @param {Array<Object>} researchesList - Array van objecten: { type: 'Nazca', status: 'Wacht', notes: '...' }
 * @returns {Promise<Array<Object>>}     - ingevoegde rijen
 */
export async function saveResearches(locationId, researchesList = []) {
  if (!researchesList.length) return [];

  const rows = researchesList.map(r => ({
    location_id: locationId,
    type: r.type,
    status: r.status || 'Opgevraagd',
    notes: r.notes || null,
    document_url: r.document_url || null
  }));

  const { data, error } = await supabase
    .from('researches')
    .insert(rows)
    .select();

  if (error) throw new Error(`saveResearches fout: ${error.message}`);
  return data;
}

/**
 * Haal alle onderzoeken op voor een specifieke locatie.
 * @param {string} locationId
 * @returns {Promise<Array<Object>>}
 */
export async function fetchResearches(locationId) {
  const { data, error } = await supabase
    .from('researches')
    .select('*')
    .eq('location_id', locationId);

  if (error) throw new Error(`fetchResearches fout: ${error.message}`);
  return data || [];
}

/**
 * Werk een specifiek onderzoek bij.
 * @param {string} researchId - De UUID van het 'researches' record
 * @param {Object} updates - Te updaten velden, bijv { status: 'Afgerond', notes: 'Top' }
 * @returns {Promise<void>}
 */
export async function updateResearch(researchId, updates) {
  const { error } = await supabase
    .from('researches')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', researchId);

  if (error) throw new Error(`updateResearch fout: ${error.message}`);
}

// ─────────────────────────────────────────────
// PROJECT MEMBERS (voor externe gebruikers)
// ─────────────────────────────────────────────

/**
 * Voeg een externe gebruiker toe aan een project.
 * @param {string} projectId
 * @param {string} userId     - UUID van de externe gebruiker (auth.users)
 * @returns {Promise<void>}
 */
export async function addProjectMember(projectId, userId) {
  const { error } = await supabase
    .from('project_members')
    .insert({ project_id: projectId, user_id: userId });

  if (error) throw new Error(`addProjectMember fout: ${error.message}`);
}

/**
 * Verwijder een externe gebruiker uit een project.
 * @param {string} projectId
 * @param {string} userId
 * @returns {Promise<void>}
 */
export async function removeProjectMember(projectId, userId) {
  const { error } = await supabase
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) throw new Error(`removeProjectMember fout: ${error.message}`);
}

/**
 * Haal alle leden van een project op.
 * @param {string} projectId
 * @returns {Promise<Array>}
 */
export async function fetchProjectMembers(projectId) {
  const { data, error } = await supabase
    .from('project_members')
    .select('*, profiles(id, full_name, email, role)')
    .eq('project_id', projectId);

  if (error) throw new Error(`fetchProjectMembers fout: ${error.message}`);
  return data ?? [];
}
