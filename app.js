const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const app = express();
app.use(bodyParser.json({ limit: '2mb' }));

const OPENAI_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_KEY) {
  console.error('Set OPENAI_API_KEY env variable');
  process.exit(1);
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const MODEL = 'gpt-4o-mini'; // change as desired

app.post('/api/clean', async (req, res) => {
  try {
    const { rows, attrs } = req.body; // rows: [{rowIndex, verbatim, ratings}]
    if (!rows || !Array.isArray(rows)) return res.status(400).send('Invalid rows');

    const instructions = `You are a helpful assistant that cleans open-ended survey responses.
Requirements:
1) Fix grammar, punctuation, and phrasing without changing meaning.
2) If the verbatim clearly contradicts numeric ratings provided for attributes, minimally rephrase to align the verbatim to the ratings or flag as inconsistent.
3) Preserve respondent voice and avoid adding new opinions.
4) Return a JSON array of objects with fields: rowIndex, cleaned, note (optional, e.g., 'Adjusted for mismatch').

Attributes: ${JSON.stringify(attrs)}

Respond only with valid JSON array.`;

    const examples = rows.map(r => `ROW_INDEX:${r.rowIndex}\nVERBATIM: ${escapeForPrompt(r.verbatim)}\nRATINGS: ${JSON.stringify(r.ratings)}`).join('\n---\n');

    const userPrompt = `${instructions}\n\n${examples}\n\nReturn the JSON array.`;

    const resp = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: 0.2,
        max_tokens: 2000
      })
    });

    const json = await resp.json();
    if (!json.choices || !json.choices.length) return res.status(500).send('No choices from OpenAI');

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
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
