/**
 * EduOS Browser History Sync - Google Apps Script
 *
 * Instructions:
 * 1. Go to script.google.com
 * 2. Create a new project
 * 3. Copy this code into Code.gs
 * 4. Deploy as Web App (Execute as: Me, Who has access: Anyone)
 * 5. Copy the Web App URL and paste it into the browser settings
 */

// Spreadsheet ID - set this to your spreadsheet ID or leave empty to auto-create
const SPREADSHEET_ID = '';

// Sheet name for history
const SHEET_NAME = 'History';

/**
 * Get or create the spreadsheet for storing history
 */
function getHistorySpreadsheet() {
  let ss;

  if (SPREADSHEET_ID) {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  } else {
    // Create new spreadsheet
    const spreadsheetName = `EduOS Browser History - ${new Date().toLocaleString()}`;
    ss = SpreadsheetApp.create(spreadsheetName);
    console.log('Created new spreadsheet: ' + ss.getUrl());
  }

  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    // Add headers
    sheet.getRange(1, 1, 1, 4).setValues([['Timestamp', 'Title', 'URL', 'Favicon']]);
    sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    // Format timestamp column
    sheet.getRange('A:A').setNumberFormat('yyyy-mm-dd hh:mm:ss');
    // Auto-resize columns
    sheet.autoResizeColumns(1, 4);
  }

  return { ss, sheet };
}

/**
 * Handle POST requests from the browser
 */
function doPost(e) {
  try {
    const { action, data, timestamp } = JSON.parse(e.postData.contents);

    if (action === 'appendHistory') {
      return appendHistory(data);
    } else if (action === 'clearHistory') {
      return clearHistory();
    } else if (action === 'getHistory') {
      return getHistory();
    } else {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Unknown action' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handle GET requests - show simple status page
 */
function doGet() {
  const { ss, sheet } = getHistorySpreadsheet();
  const lastRow = sheet.getLastRow();

  const html = `
    <html>
      <head>
        <title>EduOS Browser History Sync</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          .status { color: green; }
          .info { background: #f5f5f5; padding: 15px; border-radius: 5px; }
        </style>
      </head>
      <body>
        <h1>✅ EduOS Browser History Sync Active</h1>
        <div class="info">
          <p><strong>Spreadsheet:</strong> <a href="${ss.getUrl()}">${ss.getName()}</a></p>
          <p><strong>Sheet:</strong> ${SHEET_NAME}</p>
          <p><strong>Total entries:</strong> ${lastRow - 1}</p>
          <p><strong>Last sync:</strong> ${new Date().toLocaleString()}</p>
        </div>
        <p style="margin-top: 20px; color: #666;">
          Paste this URL in your browser settings to sync history automatically.
        </p>
      </body>
    </html>
  `;

  return HtmlService.createHtmlOutput(html);
}

/**
 * Append history items to the spreadsheet
 */
function appendHistory(items) {
  if (!items || !Array.isArray(items)) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: 'Invalid data format' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const { sheet } = getHistorySpreadsheet();

  // Prepare rows
  const rows = items.map(item => [
    new Date(item.timestamp || Date.now()),
    item.title || '',
    item.url || '',
    item.favicon || ''
  ]);

  // Append to sheet
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, 4).setValues(rows);

  return ContentService
    .createTextOutput(JSON.stringify({
      success: true,
      appended: rows.length,
      totalRows: sheet.getLastRow() - 1
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Clear all history from the spreadsheet
 */
function clearHistory() {
  const { sheet } = getHistorySpreadsheet();
  const lastRow = sheet.getLastRow();

  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, cleared: lastRow - 1 }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Get all history from the spreadsheet
 */
function getHistory() {
  const { sheet } = getHistorySpreadsheet();
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: true, data: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  const history = data.map(row => ({
    timestamp: row[0].toISOString(),
    title: row[1],
    url: row[2],
    favicon: row[3]
  }));

  return ContentService
    .createTextOutput(JSON.stringify({ success: true, data: history }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Test function - run this to test the script
 */
function testAppend() {
  const testData = [
    { timestamp: Date.now(), title: 'Test Page', url: 'https://example.com', favicon: '' },
    { timestamp: Date.now(), title: 'Another Page', url: 'https://example.org', favicon: '' }
  ];

  const result = appendHistory(testData);
  console.log(result.getContent());
}
