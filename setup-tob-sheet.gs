// TOB Parser — Google Apps Script
// Deploy als Web App: Implementeren > Web App > Iedereen

const SHEET_NAME = 'Overzicht Locaties';
const CHECKLIST_NAME = 'Checklist';
const RULES_SHEET_NAME = 'Zoekregels';

/**
 * GET handler - returns current sheet data + dynamic search rules as JSON
 * Used by GitHub Actions to read existing locations before enriching
 * Used by TOB Parser React App to fetch dynamic text extraction rules
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // --- 1. Get Locations ---
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ success: false, error: 'Sheet not found' });
    }

    var data = sheet.getDataRange().getValues();
    var headers = data[0] || [];
    var locations = [];
    
    if (data.length > 1) {
      for (var i = 1; i < data.length; i++) {
        var row = {};
        for (var j = 0; j < headers.length; j++) {
          row[headers[j]] = data[i][j];
        }
        locations.push(row);
      }
    }

    // --- 2. Get Dynamic Rules ---
    var rulesSheet = ss.getSheetByName(RULES_SHEET_NAME);
    var rules = [];
    if (rulesSheet) {
      var rulesData = rulesSheet.getDataRange().getValues();
      if (rulesData.length > 1) {
        var rulesHeaders = rulesData[0];
        // Ensure expected columns exist
        var sleutelIdx = rulesHeaders.indexOf('Sleutel');
        var voorafIdx = rulesHeaders.indexOf('Zoekterm Vooraf');
        var achterafIdx = rulesHeaders.indexOf('Zoekterm Achteraf');

        if (sleutelIdx > -1 && voorafIdx > -1 && achterafIdx > -1) {
          for (var k = 1; k < rulesData.length; k++) {
            var r = rulesData[k];
            if (r[sleutelIdx]) { // Only add if Sleutel is not empty
              rules.push({
                sleutel: r[sleutelIdx],
                vooraf: r[voorafIdx] || '',
                achteraf: r[achterafIdx] || ''
              });
            }
          }
        }
      }
    }

    return jsonResponse({ 
      success: true, 
      locations: locations, 
      headers: headers,
      zoekregels: rules
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * POST handler - receives data from TOB Parser web app or GitHub Actions
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // === Mode 1: Bulk enrichment from GitHub Actions ===
    if (data.action === 'enrich') {
      return handleEnrich(ss, data);
    }

    // === Mode 2: Full export from web app ===
    return handleFullExport(ss, data);

  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

/**
 * Handle enrichment updates from GitHub Actions
 * Updates specific columns for existing rows
 */
function handleEnrich(ss, data) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return jsonResponse({ success: false, error: 'Sheet not found' });

  var allData = sheet.getDataRange().getValues();
  var headers = allData[0];
  var updates = data.updates || [];
  var updated = 0;

  // Find column indices
  var colMap = {};
  for (var h = 0; h < headers.length; h++) {
    colMap[headers[h]] = h;
  }

  // Add new columns if they don't exist
  var newCols = data.newColumns || [];
  for (var nc = 0; nc < newCols.length; nc++) {
    if (colMap[newCols[nc]] === undefined) {
      var newColIdx = headers.length;
      sheet.getRange(1, newColIdx + 1).setValue(newCols[nc]).setFontWeight('bold').setBackground('#4285f4').setFontColor('white');
      colMap[newCols[nc]] = newColIdx;
      headers.push(newCols[nc]);
    }
  }

  // Update rows by matching on Locatiecode
  var codeCol = colMap['Locatiecode'];
  if (codeCol === undefined) return jsonResponse({ success: false, error: 'No Locatiecode column' });

  for (var u = 0; u < updates.length; u++) {
    var upd = updates[u];
    for (var r = 1; r < allData.length; r++) {
      if (String(allData[r][codeCol]).trim() === String(upd.locatiecode).trim()) {
        // Update each enriched field
        for (var key in upd.fields) {
          var col = colMap[key];
          if (col !== undefined) {
            sheet.getRange(r + 1, col + 1).setValue(upd.fields[key]);
          }
        }
        updated++;
        break;
      }
    }
  }

  SpreadsheetApp.flush();
  return jsonResponse({ success: true, updated: updated, message: updated + ' locaties verrijkt' });
}

/**
 * Handle full export from web app (original functionality)
 */
function handleFullExport(ss, data) {
  var overzicht = ss.getSheetByName(SHEET_NAME);
  if (!overzicht) overzicht = ss.insertSheet(SHEET_NAME);

  // Read current headers to preserve any dynamically added columns
  var currentHeaders = overzicht.getLastColumn() > 0 ? overzicht.getRange(1, 1, 1, overzicht.getLastColumn()).getValues()[0] : [];
  
  // Clear existing data (keep headers)
  if (overzicht.getLastRow() > 1) {
    overzicht.getRange(2, 1, overzicht.getLastRow() - 1, Math.max(1, overzicht.getLastColumn())).clear();
  }

  // Default headers if none exist
  var defaultHeaders = [
    'Locatiecode', 'Locatienaam', 'Straatnaam', 'Huisnummer', 'Postcode',
    'Status rapport', 'Conclusie', 'Veiligheidsklasse', 'Melding', 'MKB',
    'BRL 7000', 'Opmerking', 'Complex', 'Beoordeling', 'Prioriteit',
    'Rapportjaar', 'Afstand trace (m)', 'Status AbelTalent', 'Opmerkingen AbelTalent',
    'Gemeente', 'Provincie', 'RD-X', 'RD-Y', 'Bodemkwaliteitsklasse',
    'Topotijdreis Link', 'Bodemloket Link', 'Toelichting', 'Actie'
  ];

  // If the incoming export data contains MORE headers than default, use those to create columns
  // This automatically captures dynamic columns from the frontend ExportPanel
  var incomingDataKeys = new Set();
  var locations = data.overzicht || [];
  
  // The first item should have all keys from the frontend
  if (locations.length > 0) {
      Object.keys(locations[0]).forEach(k => {
          // Ignore private properties
          if (!k.startsWith('_')) {
              incomingDataKeys.add(k);
          }
      });
  }

  // Base headers we always want mapped correctly
  var headers = currentHeaders.length > 0 ? currentHeaders : defaultHeaders;
  
  // Add any completely new keys from the dynamic rules (if sent by frontend but not in sheet)
  var newHeadersAdded = false;
  if (locations.length > 0 && data.dynamicKeys) {
      data.dynamicKeys.forEach(key => {
          if (!headers.includes(key)) {
              headers.push(key);
              newHeadersAdded = true;
          }
      });
  }

  // Write headers
  if (currentHeaders.length === 0 || newHeadersAdded) {
    overzicht.getRange(1, 1, 1, headers.length).setValues([headers]);
    overzicht.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#4285f4')
      .setFontColor('white');
    overzicht.setFrozenRows(1);
  }

  // Write data based on the current headers map
  for (var i = 0; i < locations.length; i++) {
    var loc = locations[i];
    var row = [];
    
    for (var h = 0; h < headers.length; h++) {
        var headerKey = headers[h];
        // Match header to data property. 
        // e.g., 'Locatiecode' -> 'locatiecode', 'TestSleutel' -> 'testSleutel'
        var propMap = {
            'Locatiecode': 'locatiecode',
            'Locatienaam': 'locatienaam',
            'Straatnaam': 'straatnaam',
            'Huisnummer': 'huisnummer',
            'Postcode': 'postcode',
            'Status rapport': 'status',
            'Conclusie': 'conclusie',
            'Veiligheidsklasse': 'veiligheidsklasse',
            'Melding': 'melding',
            'MKB': 'mkb',
            'BRL 7000': 'brl7000',
            'Opmerking': 'opmerking',
            'Complex': 'complex',
            'Beoordeling': 'beoordeling',
            'Prioriteit': 'prioriteit',
            'Rapportjaar': 'rapportJaar',
            'Afstand trace (m)': 'afstandTrace',
            'Status AbelTalent': 'statusAbel',
            'Opmerkingen AbelTalent': 'opmerkingenAbel',
            'Gemeente': 'gemeente',
            'Provincie': 'provincie',
            'RD-X': 'rdX',
            'RD-Y': 'rdY',
            'Bodemkwaliteitsklasse': 'bodemkwaliteitsklasse',
            'Topotijdreis Link': 'topotijdreisLink',
            'Bodemloket Link': 'bodemloketLink',
            'Toelichting': 'toelichting',
            'Actie': 'actie'
        };
        
        // If it's a known default header, map it. Otherwise, assume the header name exactly matches the key 
        // (or camelCased variant) from the dynamic rules
        var dataKey = propMap[headerKey];
        if (!dataKey) {
             // Try exact match first
             if (loc[headerKey] !== undefined) {
                 dataKey = headerKey;
             } else {
                 // Try camelCase mapping: 'Test Sleutel' -> 'testSleutel'
                 var camelKey = headerKey.replace(/(?:^\w|[A-Z]|\b\w)/g, function(word, index) {
                    return index === 0 ? word.toLowerCase() : word.toUpperCase();
                  }).replace(/\s+/g, '');
                 if (loc[camelKey] !== undefined) {
                     dataKey = camelKey;
                 }
                 // Last resort: simple exact match from raw data
                 else {
                     dataKey = headerKey;
                 }
             }
        }
        
        var val = loc[dataKey];
        // Special case for boolean 'complex'
        if (dataKey === 'complex') {
            val = val ? 'Ja' : 'Nee';
        }
        
        row.push(val !== undefined && val !== null ? val : '');
    }
    
    overzicht.getRange(i + 2, 1, 1, row.length).setValues([row]);

    if (loc.complex === 'Ja' || loc.complex === true) {
      overzicht.getRange(i + 2, 1, 1, row.length).setBackground('#fce4ec');
    }
  }

  // Create complex case tabs
  var cases = data.complexeCases || [];
  for (var c = 0; c < cases.length; c++) {
    var caseData = cases[c];
    var tabName = ('CZ - ' + (caseData.code || '').substring(0, 15) + ' ' + (caseData.stof || '')).substring(0, 31);
    var caseSheet = ss.getSheetByName(tabName);
    if (caseSheet) caseSheet.clear();
    else caseSheet = ss.insertSheet(tabName);
    if (caseData.smart) writeSmartContent(caseSheet, caseData);
  }

  // Update Checklist
  var checklist = ss.getSheetByName(CHECKLIST_NAME);
  if (!checklist) {
    checklist = ss.insertSheet(CHECKLIST_NAME);
    checklist.getRange(1, 1, 1, 5).setValues([['Locatiecode', 'Stof', 'Document', 'Status', 'Toelichting']]);
    checklist.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#ea4335').setFontColor('white');
  }
  if (checklist.getLastRow() > 1) {
    checklist.getRange(2, 1, checklist.getLastRow() - 1, 5).clear();
  }

  var checkRow = 2;
  var docs = ['Nader afperkend onderzoek', 'Saneringsplan', 'BUS-melding', 'V&G-plan', 'MKB-plan', 'Evaluatierapport'];
  for (var c2 = 0; c2 < cases.length; c2++) {
    for (var d = 0; d < docs.length; d++) {
      checklist.getRange(checkRow, 1, 1, 5).setValues([[ cases[c2].code, cases[c2].stof, docs[d], 'Nog te doen', '' ]]);
      checkRow++;
    }
  }

  SpreadsheetApp.flush();
  return jsonResponse({ success: true, count: locations.length });
}

/**
 * Write smart-fill content to a case sheet
 */
function writeSmartContent(sheet, caseData) {
  var smart = caseData.smart;
  var row = 1;
  sheet.getRange(row, 1).setValue('Complexe Zaak: ' + caseData.code);
  sheet.getRange(row, 1).setFontWeight('bold').setFontSize(14);
  row += 2;

  var sections = [
    { title: 'LOCATIEGEGEVENS', fields: smart.locatie },
    { title: 'VERONTREINIGING', fields: smart.verontreiniging },
    { title: 'HISTORISCH VOORONDERZOEK', fields: smart.historisch },
    { title: 'RISICOBEOORDELING', fields: smart.risico },
    { title: 'CONCLUSIE & ADVIES', fields: smart.conclusie },
    { title: 'PLAN VAN AANPAK', fields: smart.planVanAanpak },
    { title: 'MELDING BEVOEGD GEZAG', fields: smart.melding },
    { title: 'MKB & VEILIGHEID', fields: smart.mkb },
  ];

  for (var s = 0; s < sections.length; s++) {
    sheet.getRange(row, 1, 1, 2).merge();
    sheet.getRange(row, 1).setValue(sections[s].title).setFontWeight('bold').setBackground('#1a73e8').setFontColor('white');
    row++;
    var fields = sections[s].fields;
    if (fields) {
      for (var key in fields) {
        sheet.getRange(row, 1).setValue(camelToLabel(key)).setFontWeight('bold');
        sheet.getRange(row, 2).setValue(fields[key]).setFontColor('#e65100').setBackground('#fff8e1').setWrap(true);
        row++;
      }
    }
    row++;
  }
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 600);
}

function camelToLabel(str) {
  return str.replace(/([A-Z])/g, ' $1').replace(/^./, function(s) { return s.toUpperCase(); }).replace(/_/g, ' ');
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Initial setup - run once manually
 */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.rename('TOB Parser - Bronbestand Complexe Zaken');

  // --- 1. Main Sheet ---
  var sheet1 = ss.getSheets()[0];
  sheet1.setName(SHEET_NAME);
  sheet1.clear();

  var headers = [
    'Locatiecode', 'Locatienaam', 'Straatnaam', 'Huisnummer', 'Postcode',
    'Status rapport', 'Conclusie', 'Veiligheidsklasse', 'Melding', 'MKB',
    'BRL 7000', 'Opmerking', 'Complex', 'Beoordeling', 'Prioriteit',
    'Rapportjaar', 'Afstand trace (m)', 'Status AbelTalent', 'Opmerkingen AbelTalent',
    'Gemeente', 'Provincie', 'RD-X', 'RD-Y', 'Bodemkwaliteitsklasse',
    'Topotijdreis Link', 'Bodemloket Link', 'Toelichting', 'Actie'
  ];
  sheet1.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet1.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#4285f4').setFontColor('white');

  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Nog te doen', 'In uitvoering', 'Afgerond', 'N.v.t.'])
    .build();
  sheet1.getRange(2, 18, 500, 1).setDataValidation(statusRule); // Column R = Status AbelTalent
  sheet1.setFrozenRows(1);

  // --- 2. Checklist Sheet ---
  var checklistSheet = ss.getSheetByName(CHECKLIST_NAME);
  if (!checklistSheet) {
    checklistSheet = ss.insertSheet(CHECKLIST_NAME);
  } else {
    checklistSheet.clear();
  }
  checklistSheet.getRange(1, 1, 1, 5).setValues([['Locatiecode', 'Stof', 'Document', 'Status', 'Toelichting']]);
  checklistSheet.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#ea4335').setFontColor('white');
  checklistSheet.setFrozenRows(1);

  // --- 3. Dynamic Rules Sheet ---
  var rulesSheet = ss.getSheetByName(RULES_SHEET_NAME);
  if (!rulesSheet) {
    rulesSheet = ss.insertSheet(RULES_SHEET_NAME);
  } else {
    rulesSheet.clear();
  }
  
  var rulesHeaders = ['Sleutel', 'Zoekterm Vooraf', 'Zoekterm Achteraf'];
  rulesSheet.getRange(1, 1, 1, rulesHeaders.length).setValues([rulesHeaders]);
  rulesSheet.getRange(1, 1, 1, rulesHeaders.length).setFontWeight('bold').setBackground('#34a853').setFontColor('white');
  rulesSheet.setFrozenRows(1);

  SpreadsheetApp.getUi().alert('Setup voltooid! Publiceer nu als Web App.');
}
