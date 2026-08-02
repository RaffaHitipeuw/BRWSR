// GAS Sync - minimal

export async function syncHistoryToGas(items: unknown[], gasUrl: string) {
  if (!gasUrl || !items?.length) return { success: false, error: 'Missing URL or items' };
  try {
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors' as 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'appendHistory', data: items, timestamp: Date.now() }),
    });
    return { success: true, appended: items.length };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function clearGasHistory(gasUrl: string) {
  if (!gasUrl) return { success: false, error: 'Missing URL' };
  try {
    await fetch(gasUrl, {
      method: 'POST',
      mode: 'no-cors' as 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clearHistory' }),
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function testGasConnection(gasUrl: string) {
  if (!gasUrl) return { success: false, error: 'URL required' };
  if (!gasUrl.includes('script.google.com') || !gasUrl.includes('/exec')) {
    return { success: false, error: 'Invalid format' };
  }
  try {
    await fetch(gasUrl, { method: 'GET', mode: 'no-cors' as 'no-cors' });
    return { success: true };
  } catch {
    return { success: false, error: 'Connection failed' };
  }
}
