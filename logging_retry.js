// Logging + Retry helper example (node-fetch)
async function fetchWithRetry(url, options, retries = 2, backoffMs = 500) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      console.log(`Request attempt ${attempt+1} to ${url}`);
      const resp = await fetch(url, options);
      if (!resp.ok) {
        const text = await resp.text();
        const err = new Error(`Status ${resp.status}: ${text}`);
        if (attempt === retries) throw err;
        console.warn('Request failed, retrying...', err.message);
      } else {
        return resp;
      }
    } catch (e) {
      if (attempt === retries) throw e;
      await new Promise(r => setTimeout(r, backoffMs * (attempt+1)));
    }
  }
}
