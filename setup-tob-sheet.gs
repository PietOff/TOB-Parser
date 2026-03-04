// TOB Parser — Google Apps Script
// Plak dit script in de Script Editor van een nieuwe Google Sheet
// Publiceer als Web App: Implementeren > Web App > Iedereen die de URL heeft

/**
 * Eerste setup: maak alle tabbladen aan
 */
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.rename("TOB Parser — Bronbestand Complexe Zaken");

  // === TAB 1: Overzicht Locaties ===
  var sheet1 = ss.getSheets()[0];
  sheet1.setName("Overzicht Locaties");
  sheet1.clear();
  var headers = [
    ["Locatiecode", "Locatienaam", "Straatnaam", "Huisnummer", "Postcode",
     "Status rapport", "Conclusie", "Veiligheidsklasse", "Melding", "MKB",
     "BRL 7000", "Opmerking", "Complex", "Beoordeling", "Prioriteit",
     "Rapportjaar", "Afstand tracé (m)", "Status AbelTalent", "Opmerkingen AbelTalent"]
  ];
  sheet1.getRange(1, 1, 1, headers[0].length).setValues(headers);
  sheet1.getRange(1, 1, 1, headers[0].length)
    .setFontWeight("bold")
    .setBackground("#4285f4")
    .setFontColor("white");

  // Data validation for Status AbelTalent
  var statusRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Nog te doen", "In uitvoering", "Afgerond", "N.v.t."])
    .build();
  sheet1.getRange(2, 18, 500, 1).setDataValidation(statusRule);

  // Freeze header
  sheet1.setFrozenRows(1);

  // === TAB 2: Template (wordt per case aangemaakt) ===
  // Tabbladen worden dynamisch aangemaakt via doPost()

  // === TAB 3: Checklist ===
  var sheet3 = ss.insertSheet("Checklist");
  var checkHeaders = [
    ["Locatiecode", "Stof", "Document", "Status", "Toelichting"]
  ];
  sheet3.getRange(1, 1, 1, 5).setValues(checkHeaders);
  sheet3.getRange(1, 1, 1, 5)
    .setFontWeight("bold")
    .setBackground("#ea4335")
    .setFontColor("white");

  var checkRule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["Nog te doen", "In uitvoering", "Gereed", "N.v.t."])
    .build();
  sheet3.getRange(2, 4, 200, 1).setDataValidation(checkRule);

  SpreadsheetApp.flush();
  SpreadsheetApp.getUi().alert(
    "✅ Setup voltooid!\n\nTabbladen aangemaakt:\n- Overzicht Locaties\n- Checklist\n\n" +
    "Publiceer nu als Web App:\nImplementeren > Nieuwe implementatie > Web-app > Iedereen"
  );
}

/**
 * Receive data from TOB Parser web app
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    // === Write Overzicht Locaties ===
    var overzicht = ss.getSheetByName("Overzicht Locaties");
    if (!overzicht) overzicht = ss.insertSheet("Overzicht Locaties");

    // Clear existing data (keep headers)
    if (overzicht.getLastRow() > 1) {
      overzicht.getRange(2, 1, overzicht.getLastRow() - 1, 19).clear();
    }

    var locations = data.overzicht || [];
    for (var i = 0; i < locations.length; i++) {
      var loc = locations[i];
      var row = [
        loc.locatiecode, loc.locatienaam, loc.straatnaam, loc.huisnummer, loc.postcode,
        loc.status, loc.conclusie, loc.veiligheidsklasse, loc.melding, loc.mkb,
        loc.brl7000, loc.opmerking, loc.complex, loc.beoordeling, loc.prioriteit,
        loc.rapportJaar, loc.afstandTrace, loc.statusAbel, loc.opmerkingenAbel
      ];
      overzicht.getRange(i + 2, 1, 1, row.length).setValues([row]);

      // Highlight complex cases
      if (loc.complex === "Ja") {
        overzicht.getRange(i + 2, 1, 1, row.length).setBackground("#fce4ec");
      }
    }

    // === Create tabs for complex cases ===
    var cases = data.complexeCases || [];
    for (var c = 0; c < cases.length; c++) {
      var caseData = cases[c];
      var tabName = "CZ - " + caseData.code.substring(0, 15) + " " + caseData.stof;
      tabName = tabName.substring(0, 31); // Sheet name max 31 chars

      var caseSheet = ss.getSheetByName(tabName);
      if (caseSheet) caseSheet.clear();
      else caseSheet = ss.insertSheet(tabName);

      if (caseData.smart) {
        writeSmartContent(caseSheet, caseData);
      }
    }

    // === Update Checklist ===
    var checklist = ss.getSheetByName("Checklist");
    if (checklist && checklist.getLastRow() > 1) {
      checklist.getRange(2, 1, checklist.getLastRow() - 1, 5).clear();
    }

    var checkRow = 2;
    var docs = ["Nader afperkend onderzoek", "Saneringsplan", "BUS-melding",
                "V&G-plan", "MKB-plan", "Evaluatierapport"];
    for (var c = 0; c < cases.length; c++) {
      for (var d = 0; d < docs.length; d++) {
        checklist.getRange(checkRow, 1, 1, 5).setValues([[
          cases[c].code, cases[c].stof, docs[d], "Nog te doen", ""
        ]]);
        checkRow++;
      }
    }

    SpreadsheetApp.flush();

    return ContentService
      .createTextOutput(JSON.stringify({ success: true, count: locations.length }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Write smart-fill content to a case sheet
 */
function writeSmartContent(sheet, caseData) {
  var smart = caseData.smart;
  var row = 1;

  // Header
  sheet.getRange(row, 1).setValue("Complexe Zaak: " + caseData.code);
  sheet.getRange(row, 1).setFontWeight("bold").setFontSize(14);
  row += 2;

  // Sections
  var sections = [
    { title: "LOCATIEGEGEVENS", fields: smart.locatie },
    { title: "VERONTREINIGING", fields: smart.verontreiniging },
    { title: "HISTORISCH VOORONDERZOEK", fields: smart.historisch },
    { title: "RISICOBEOORDELING", fields: smart.risico },
    { title: "CONCLUSIE & ADVIES", fields: smart.conclusie },
    { title: "PLAN VAN AANPAK", fields: smart.planVanAanpak },
    { title: "MELDING BEVOEGD GEZAG", fields: smart.melding },
    { title: "MKB & VEILIGHEID", fields: smart.mkb },
  ];

  for (var s = 0; s < sections.length; s++) {
    // Section header
    sheet.getRange(row, 1, 1, 2).merge();
    sheet.getRange(row, 1)
      .setValue(sections[s].title)
      .setFontWeight("bold")
      .setBackground("#1a73e8")
      .setFontColor("white");
    row++;

    // Fields
    var fields = sections[s].fields;
    for (var key in fields) {
      sheet.getRange(row, 1).setValue(camelToLabel(key)).setFontWeight("bold");
      sheet.getRange(row, 2)
        .setValue(fields[key])
        .setFontColor("#e65100")
        .setBackground("#fff8e1")
        .setWrap(true);
      row++;
    }
    row++; // Spacing
  }

  // Set column widths
  sheet.setColumnWidth(1, 200);
  sheet.setColumnWidth(2, 600);
}

/**
 * Convert camelCase to readable label
 */
function camelToLabel(str) {
  return str
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, function(s) { return s.toUpperCase(); })
    .replace(/_/g, ' ');
}
