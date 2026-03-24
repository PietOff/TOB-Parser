/**
 * api.js — Supabase Service Layer voor TOB Backoffice
 * Phase 3: Database Integratie
 *
 * Bevat alle CRUD-operaties voor:
 *  - projects      (hoofd TOB-rapporten)
 *  - locations     (geëxtraheerde adressen/coördinaten)
 *  - researches    (onderzoeksstatus per locatie)
 *
 * BELANGRIJK: Alle writes gebruiken supabaseAdmin (service_role) om RLS te omzeilen.
 * Reads gebruiken de standaard supabase (anon) client.
 */

import { supabase, supabaseAdmin } from '../utils/supabaseClient';

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
  const { data, error } = await supabaseAdmin
    .from('projects')
    .insert({ name, client })
    .select('id')
    .single();

  if (error) throw new Error(`saveProject fout: ${error.message}`);
  return data.id;
}

/**
 * Haal alle projecten op waartoe de ingelogde gebruiker toegang heeft.
 * @returns {Promise<Array>}
 */
export async function fetchProjects() {
  // Use supabaseAdmin so RLS never blocks project listing
  let { data, error } = await supabaseAdmin
    .from('projects')
    .select('*, project_folders(id, name, color)')
    .order('created_at', { ascending: false });

  if (error && (error.message.includes('project_folders') || error.message.includes('column') || error.message.includes('PGRST'))) {
    const fallback = await supabaseAdmin
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (fallback.error) throw new Error(`fetchProjects fout: ${fallback.error.message}`);
    return fallback.data ?? [];
  }

  if (error) throw new Error(`fetchProjects fout: ${error.message}`);
  return data ?? [];
}

/**
 * Haal één project op inclusief alle bijbehorende locaties.
 * @param {string} projectId
 * @returns {Promise<Object>}
 */
export async function fetchProject(projectId) {
  const { data, error } = await supabaseAdmin
    .from('projects')
    .select('*')
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
  const { error } = await supabaseAdmin
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
  const { error } = await supabaseAdmin
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
 * Mapt alleen kolommen die in de DB bestaan (na migratie: alle kolommen).
 * Valt gracefully terug naar minimal insert als extended kolommen ontbreken.
 * @param {string} projectId
 * @param {Array}  locationsArray
 * @returns {Promise<Array>}
 */
export async function saveLocations(projectId, locationsArray) {
  if (!locationsArray || locationsArray.length === 0) return [];

  // Convert empty strings / NaN to null for double precision columns
  const toNum = (v) => {
    if (v === '' || v === undefined || v === null) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };


  // Full row with all extended columns (after migration 001)
  const rows = locationsArray.map((loc) => {
    const enriched = loc._enriched ?? {};
    return {
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
            automatisch_advies: loc.automatischAdvies  ?? null,
      complex:           loc.complex           ?? false,
      // Coördinaten — must be null (not "") for double precision columns
      lat:               toNum(enriched.lat  ?? loc.lat),
      lon:               toNum(enriched.lon  ?? loc.lon),
      rd_x:              toNum(enriched.rd?.x ?? loc.rdX),
      rd_y:              toNum(enriched.rd?.y ?? loc.rdY),
      // Verrijkte externe data als JSON-blob
      enriched_data: {
        ...(enriched ?? {}),
        ...(loc._nazcaDetail ? { nazcaDetail: loc._nazcaDetail } : {}),
      },
      stoffen:           loc.stoffen           ?? null,
      status_abel:       loc.statusAbel        ?? 'Nog te doen',
      opmerkingen_abel:  loc.opmerkingenAbel   ?? null,
      afstand_trace:     toNum(loc.afstandTrace),
      source_file:       loc._source           ?? null,
      rapport_jaar:      toNum(loc.rapportJaar),
    };
  });

  // Try full insert first (after migration)
  const { data, error } = await supabaseAdmin
    .from('locations')
    .insert(rows)
    .select();

  if (error) {
    // If error is about missing columns, fall back to minimal insert
    if (error.message?.includes('column') || error.message?.includes('schema cache') || error.message?.includes('PGRST204')) {
      console.warn('[API] Extended columns not found — falling back to minimal insert. Run migration 001!');
      const minimalRows = rows.map(r => ({
        project_id:  r.project_id,
        locatiecode: r.locatiecode,
        straatnaam:  r.straatnaam,
        huisnummer:  r.huisnummer,
        postcode:    r.postcode,
        woonplaats:  r.woonplaats,
        complex:     r.complex,
        // Support both old (latitude/longitude) and new (lat/lon) column names
        latitude:    r.lat,
        longitude:   r.lon,
      }));
      const { data: minData, error: minError } = await supabaseAdmin
        .from('locations')
        .insert(minimalRows)
        .select();
      if (minError) throw new Error(`saveLocations (minimal) fout: ${minError.message}`);
      return minData ?? [];
    }
    throw new Error(`saveLocations fout: ${error.message}`);
  }

  return data ?? [];
}

/**
 * Haal alle locaties op voor een project.
 * @param {string} projectId
 * @returns {Promise<Array>}
 */
export async function fetchLocations(projectId) {
  const { data, error } = await supabaseAdmin
    .from('locations')
    .select('*')
    .eq('project_id', projectId)
    .order('locatiecode', { ascending: true });

  if (error) throw new Error(`fetchLocations fout: ${error.message}`);
  return data ?? [];
}

/**
 * Werk één locatie bij.
 * @param {string} locationId
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export async function updateLocation(locationId, updates) {
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

  const { error } = await supabaseAdmin
    .from('locations')
    .update(dbUpdates)
    .eq('id', locationId);

  if (error) throw new Error(`updateLocation fout: ${error.message}`);
}

/**
 * Converteer een Supabase locatie-rij terug naar het React state-formaat.
 * Ondersteunt zowel oude schema (latitude/longitude) als nieuwe (lat/lon).
 * @param {Object} row - rij uit de 'locations' tabel
 * @returns {Object}
 */
export function dbRowToLocation(row) {
  // Support both old (latitude/longitude) and new (lat/lon) column names
  const lat = row.lat ?? row.latitude ?? row.enriched_data?.lat ?? null;
  const lon = row.lon ?? row.longitude ?? row.enriched_data?.lon ?? null;
  const rdX = row.rd_x ?? row.enriched_data?.rd?.x ?? null;
  const rdY = row.rd_y ?? row.enriched_data?.rd?.y ?? null;

  return {
    _db_id:            row.id,
    project_id:        row.project_id,
    locatiecode:       row.locatiecode,
    locatienaam:       row.locatienaam   ?? null,
    straatnaam:        row.straatnaam    ?? null,
    huisnummer:        row.huisnummer    ?? null,
    postcode:          row.postcode      ?? null,
    woonplaats:        row.woonplaats    ?? null,
    status:            row.status        ?? null,
    conclusie:         row.conclusie     ?? null,
    veiligheidsklasse: row.veiligheidsklasse ?? null,
    melding:           row.melding       ?? null,
    mkb:               row.mkb           ?? null,
    brl7000:           row.brl7000       ?? null,
    opmerking:         row.opmerking     ?? null,
    automatischAdvies: row.automatisch_advies ?? null,
    rapportType:       row.rapport_type        ?? null,
    complex:           row.complex       ?? false,
    isComplex:         row.complex       ?? false,
    stoffen:           row.stoffen       ?? null,
    rapportJaar:       row.rapport_jaar  ?? null,
    statusAbel:        row.status_abel   ?? null,
    opmerkingenAbel:   row.opmerkingen_abel ?? null,
    afstandTrace:      row.afstand_trace ?? null,
    _source:           row.source_file   ?? null,
    rdX,
    rdY,
    _enriched: row.enriched_data
      ? { ...row.enriched_data, lat, lon, rd: rdX ? { x: rdX, y: rdY } : null }
      : lat
        ? { lat, lon, rd: rdX ? { x: rdX, y: rdY } : null }
        : null,
  };
}

// ─────────────────────────────────────────────
// RESEARCHES
// ─────────────────────────────────────────────

/**
 * Sla onderzoeken op voor een locatie (array-based).
 * @param {string} locationId
 * @param {Array<Object>} researchesList - [{ type, status, notes }]
 * @returns {Promise<Array>}
 */
export async function saveResearches(locationId, researchesList = []) {
  if (!researchesList.length) return [];

  const rows = researchesList.map(r => ({
    location_id:  locationId,
    type:         r.type,
    status:       r.status       || 'Nog op te vragen',
    notes:        r.notes        || null,
    document_url: r.document_url || null,
  }));

  const { data, error } = await supabaseAdmin
    .from('researches')
    .insert(rows)
    .select();

  if (error) throw new Error(`saveResearches fout: ${error.message}`);
  return data ?? [];
}

/**
 * Haal alle onderzoeken op voor een locatie.
 * @param {string} locationId
 * @returns {Promise<Array>}
 */
export async function fetchResearches(locationId) {
  if (!locationId) return [];
  const { data, error } = await supabaseAdmin
    .from('researches')
    .select('*')
    .eq('location_id', locationId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`fetchResearches fout: ${error.message}`);
  return data ?? [];
}

/**
 * Werk een specifiek onderzoek bij.
 * @param {string} researchId
 * @param {Object} updates
 * @returns {Promise<void>}
 */
export async function updateResearch(researchId, updates) {
  const { error } = await supabaseAdmin
    .from('researches')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', researchId);

  if (error) throw new Error(`updateResearch fout: ${error.message}`);
}

// ─────────────────────────────────────────────
// PROJECT MEMBERS
// ─────────────────────────────────────────────

export async function addProjectMember(projectId, userId) {
  const { error } = await supabaseAdmin
    .from('project_members')
    .insert({ project_id: projectId, user_id: userId });

  if (error) throw new Error(`addProjectMember fout: ${error.message}`);
}

export async function removeProjectMember(projectId, userId) {
  const { error } = await supabaseAdmin
    .from('project_members')
    .delete()
    .eq('project_id', projectId)
    .eq('user_id', userId);

  if (error) throw new Error(`removeProjectMember fout: ${error.message}`);
}

export async function fetchProjectMembers(projectId) {
  const { data, error } = await supabaseAdmin
    .from('project_members')
    .select('*, profiles(id, email, role)')
    .eq('project_id', projectId);

  if (error) throw new Error(`fetchProjectMembers fout: ${error.message}`);
  return data ?? [];
}

// ─────────────────────────────────────────────
// FOLDERS
// ─────────────────────────────────────────────

export async function fetchFolders() {
  // Use supabaseAdmin to bypass RLS on project_folders
  const { data, error } = await supabaseAdmin
    .from('project_folders')
    .select('*')
    .order('name', { ascending: true });

  if (error) throw new Error(`fetchFolders fout: ${error.message}`);
  return data ?? [];
}

export async function createFolder(name, color = '#3b82f6') {
  const { data, error } = await supabaseAdmin
    .from('project_folders')
    .insert({ name, color })
    .select()
    .single();

  if (error) throw new Error(`createFolder fout: ${error.message}`);
  return data;
}

export async function updateFolder(folderId, updates) {
  const { error } = await supabaseAdmin
    .from('project_folders')
    .update(updates)
    .eq('id', folderId);

  if (error) throw new Error(`updateFolder fout: ${error.message}`);
}

export async function deleteFolder(folderId) {
  // First unset folder_id on all projects in this folder
  await supabaseAdmin
    .from('projects')
    .update({ folder_id: null })
    .eq('folder_id', folderId);

  const { error } = await supabaseAdmin
    .from('project_folders')
    .delete()
    .eq('id', folderId);

  if (error) throw new Error(`deleteFolder fout: ${error.message}`);
}

export async function moveProjectToFolder(projectId, folderId) {
  const { error } = await supabaseAdmin
    .from('projects')
    .update({ folder_id: folderId })
    .eq('id', projectId);

  if (error) throw new Error(`moveProjectToFolder fout: ${error.message}`);
}

// ─────────────────────────────────────────────
// USER MANAGEMENT
// ─────────────────────────────────────────────

export async function fetchAllProfiles() {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .order('email', { ascending: true });

  if (error) throw new Error(`fetchAllProfiles fout: ${error.message}`);
  return data ?? [];
}

export async function updateUserRole(userId, role) {
  const { error } = await supabaseAdmin
    .from('profiles')
    .update({ role })
    .eq('id', userId);

  if (error) throw new Error(`updateUserRole fout: ${error.message}`);
}

export async function inviteUserByEmail(email) {
  const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email);
  if (error) throw new Error(`inviteUserByEmail fout: ${error.message}`);
  return data;
}
