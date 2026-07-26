// GAS Sync service - Google Apps Script synchronization

/**
 * Sync history items to Google Sheets via GAS
 */
export async function syncHistoryToGas(items, gasUrl) {
  if (!gasUrl || !items || items.length === 0) {
    return { success: false, error: 'Missing URL or items' };
  }

  try {
    const response = await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors', // Required for GAS
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'appendHistory',
        data: items,
        timestamp: Date.now(),
      }),
    });

    // Note: GAS returns text/plain, so we can't parse JSON response
    // but the request should have been sent
    return { success: true, appended: items.length };
  } catch (error) {
    console.error('GAS sync error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Clear history in Google Sheets via GAS
 */
export async function clearGasHistory(gasUrl) {
  if (!gasUrl) {
    return { success: false, error: 'Missing URL' };
  }

  try {
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'clearHistory',
      }),
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Test GAS connection
 */
export async function testGasConnection(gasUrl) {
  if (!gasUrl) {
    return { success: false, error: 'URL is required' };
  }

  // Basic URL validation
  if (!gasUrl.includes('script.google.com') || !gasUrl.includes('/exec')) {
    return { success: false, error: 'Invalid GAS URL format' };
  }

  try {
    // Try a simple GET request
    const response = await fetch(gasUrl, {
      method: 'GET',
      mode: 'no-cors',
    });

    return { success: true };
  } catch (error) {
    return { success: false, error: 'Connection failed' };
  }
}
