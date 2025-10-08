// Azure-compatible backend example
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const app = express();
app.use(bodyParser.json({ limit: '2mb' }));

// For Azure OpenAI, set AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_KEY and DEPLOYMENT_NAME
const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_KEY = process.env.AZURE_OPENAI_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT; // e.g., 'gpt-4o-mini-deploy'

if (!AZURE_ENDPOINT || !AZURE_KEY || !AZURE_DEPLOYMENT) {
  console.error('Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, and AZURE_OPENAI_DEPLOYMENT');
  process.exit(1);
}

const AZURE_URL = `${AZURE_ENDPOINT}/openai/deployments/${AZURE_DEPLOYMENT}/chat/completions?api-version=2023-10-01-preview`;

app.post('/api/clean', async (req, res) => {
  try {
    const { rows, attrs } = req.body;
    if (!rows || !Array.isArray(rows)) return res.status(400).send('Invalid rows');

    const instructions = `You are a helpful assistant that cleans open-ended survey responses.
Requirements:
1) Fix grammar, punctuation, and phrasing without changing meaning.
2) If the verbatim clearly contradicts numeric ratings provided for attributes, minimally rephrase to align the verbatim to the ratings or flag as inconsistent.
3) Preserve respondent voice and avoid adding new opinions.
4) Return a JSON array of objects with fields: rowIndex, cleaned, note (optional).

Attributes: ${JSON.stringify(attrs)}

Respond only with valid JSON array.`;

    const examples = rows.map(r => `ROW_INDEX:${r.rowIndex}\nVERBATIM: ${escapeForPrompt(r.verbatim)}\nRATINGS: ${JSON.stringify(r.ratings)}`).join('\n---\n');
    const userPrompt = `${instructions}\n\n${examples}\n\nReturn the JSON array.`;

    const resp = await fetch(AZURE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': AZURE_KEY
      },
      body: JSON.stringify({
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.2,
        max_tokens: 2000
      })
    });

    const json = await resp.json();
    if (!json.choices || !json.choices.length) return res.status(500).send('No choices from Azure OpenAI');

    const content = json.choices[0].message.content;
    const parsed = extractJson(content);
    if (!parsed) {
      const fallback = rows.map(r => ({ rowIndex: r.rowIndex, cleaned: (r.verbatim||'').trim(), note: 'fallback' }));
      return res.json({ rows: fallback });
    }
    return res.json({ rows: parsed });

  } catch (err) {
    console.error(err);
    res.status(500).send(String(err));
  }
});

function escapeForPrompt(s) { if (!s) return ''; return s.replace(/\\/g,'\\\\').replace(/"/g,'\\\"').replace(/\n/g,' '); }
function extractJson(text) {
  try {
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end === -1) return null;
    const jsonStr = text.slice(start, end + 1);
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('JSON parse failed', e);
    return null;
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Azure Backend running on port ${PORT}`));
