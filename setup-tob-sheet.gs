// TOB Parser — Google Apps Script
// Deploy als Web App: Implementeren > Web App > Iedereen

const SHEET_NAME = 'Overzicht Locaties';
const CHECKLIST_NAME = 'Checklist';

/**
 * GET handler - returns current sheet data as JSON
 * Used by GitHub Actions to read existing locations before enriching
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ success: false, error: 'Sheet not found' });
    }

    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      return jsonResponse({ success: true, locations: [], headers: data[0] || [] });
    }

    var headers = data[0];
    var locations = [];
    for (var i = 1; i < data.length; i++) {
      var row = {};
      for (var j = 0; j < headers.length; j++) {
        row[headers[j]] = data[i][j];
      }
      locations.push(row);
    }

    return jsonResponse({ success: true, locations: locations, headers: headers });
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

  // Clear existing data (keep headers)
  if (overzicht.getLastRow() > 1) {
    overzicht.getRange(2, 1, overzicht.getLastRow() - 1, overzicht.getLastColumn()).clear();
  }

  // Write headers if empty
  if (overzicht.getLastRow() === 0) {
    var headers = [
      'Locatiecode', 'Locatienaam', 'Straatnaam', 'Huisnummer', 'Postcode',
      'Status rapport', 'Conclusie', 'Veiligheidsklasse', 'Melding', 'MKB',
      'BRL 7000', 'Opmerking', 'Complex', 'Beoordeling', 'Prioriteit',
      'Rapportjaar', 'Afstand trace (m)', 'Status AbelTalent', 'Opmerkingen AbelTalent',
      'Gemeente', 'Provincie', 'RD-X', 'RD-Y', 'Bodemkwaliteitsklasse',
      'Topotijdreis Link', 'Bodemloket Link', 'Toelichting', 'Actie'
    ];
    overzicht.getRange(1, 1, 1, headers.length).setValues([headers]);
    overzicht.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#4285f4')
      .setFontColor('white');
    overzicht.setFrozenRows(1);
  }

  var locations = data.overzicht || [];
  for (var i = 0; i < locations.length; i++) {
    var loc = locations[i];
    var row = [
      loc.locatiecode, loc.locatienaam, loc.straatnaam, loc.huisnummer, loc.postcode,
      loc.status, loc.conclusie, loc.veiligheidsklasse, loc.melding, loc.mkb,
      loc.brl7000, loc.opmerking, loc.complex, loc.beoordeling, loc.prioriteit,
      loc.rapportJaar, loc.afstandTrace, loc.statusAbel, loc.opmerkingenAbel,
      loc.gemeente || '', loc.provincie || '', loc.rdX || '', loc.rdY || '',
      loc.bodemkwaliteitsklasse || '', loc.topotijdreisLink || '',
      loc.bodemloketLink || '', loc.toelichting || '', loc.actie || ''
    ];
    overzicht.getRange(i + 2, 1, 1, row.length).setValues([row]);

    if (loc.complex === 'Ja') {
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
  sheet1.getRange(2, 18, 500, 1).setDataValidation(statusRule);
  sheet1.setFrozenRows(1);

  var sheet3 = ss.insertSheet(CHECKLIST_NAME);
  sheet3.getRange(1, 1, 1, 5).setValues([['Locatiecode', 'Stof', 'Document', 'Status', 'Toelichting']]);
  sheet3.getRange(1, 1, 1, 5).setFontWeight('bold').setBackground('#ea4335').setFontColor('white');

  SpreadsheetApp.getUi().alert('Setup voltooid! Publiceer nu als Web App.');
}
