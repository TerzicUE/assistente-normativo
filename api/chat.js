import fs from "fs";
import path from "path";

async function loadDocuments() {
  try {
    const docsDir = path.join(process.cwd(), "docs");
    if (!fs.existsSync(docsDir)) return [];
    const files = fs.readdirSync(docsDir).filter(f => f.toLowerCase().endsWith(".pdf"));
    if (files.length === 0) return [];
    const docs = [];
    for (const file of files) {
      const filePath = path.join(docsDir, file);
      const buffer = fs.readFileSync(filePath);
      if (buffer.length > 8 * 1024 * 1024) {
        console.log(`File troppo grande, saltato: ${file}`);
        continue;
      }
      const base64 = buffer.toString("base64");
      const name = file.replace(/\.pdf$/i, "").replace(/_/g, " ");
      docs.push({ name, base64, size: buffer.length });
    }
    return docs;
  } catch(e) {
    console.log("Errore loadDocuments:", e.message);
    return [];
  }
}

function selectRelevantDocs(docs, question) {
  const q = question.toLowerCase();
  const keywords = q.split(/\s+/).filter(w => w.length > 3);

  const scored = docs.map(doc => {
    const name = doc.name.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (name.includes(kw)) score += 3;
    }
    // Parole chiave tematiche
    if ((q.includes("posteggi") || q.includes("parcheggio") || q.includes("stationnement") || q.includes("parking")) &&
        name.match(/stationnement|posteggi|parking|291|280|281|292/)) score += 5;
    if ((q.includes("ciclabil") || q.includes("bici") || q.includes("vélo") || q.includes("cyclable")) &&
        name.match(/vélo|ciclistic|cyclable|066/)) score += 5;
    if ((q.includes("pieton") || q.includes("pedone") || q.includes("piéton")) &&
        name.match(/piéton|pedone|075|238/)) score += 5;
    if ((q.includes("carrefour") || q.includes("incrocio") || q.includes("intersezione")) &&
        name.match(/carrefour|intersez|273/)) score += 5;
    if ((q.includes("commess") || q.includes("appalto") || q.includes("incarico")) &&
        name.match(/commess|appalto|lcpubb/)) score += 5;
    if ((q.includes("visibilit")) &&
        name.match(/visibilit|273/)) score += 5;
    if ((q.includes("trafic") || q.includes("traffico") || q.includes("moderat")) &&
        name.match(/trafic|traffico|213|075/)) score += 5;
    if ((q.includes("routier") || q.includes("strada") || q.includes("espace")) &&
        name.match(/routier|espace|201|211|303/)) score += 5;
    return { ...doc, score };
  });

  // Ordina per punteggio e prendi i migliori, rispettando il limite di ~15MB totali
  scored.sort((a, b) => b.score - a.score);
  const selected = [];
  let totalSize = 0;
  for (const doc of scored) {
    if (totalSize + doc.size > 15 * 1024 * 1024) break;
    if (selected.length >= 3) break;
    selected.push(doc);
    totalSize += doc.size;
  }
  console.log("Documenti selezionati:", selected.map(d => `${d.name} (score:${d.score})`));
  return selected;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const allDocs = await loadDocuments();
    const userMessages = req.body.messages || [];
    const lastUserMsg = userMessages[userMessages.length - 1];
    const question = lastUserMsg?.content || "";

    const docs = selectRelevantDocs(allDocs, question);
    const docNames = allDocs.map(d => d.name);

    const systemPrompt = `Sei un assistente tecnico specializzato in norme e regolamenti per la costruzione e l'ingegneria in Svizzera, per lo studio TERZIC URBAN ENGINEERING.
Rispondi SEMPRE in italiano, indipendentemente dalla lingua dei documenti allegati (che possono essere in francese, tedesco, italiano o inglese).
Quando citi un documento, fallo con precisione: nome del documento, numero articolo o capitolo, pagina se nota.
Basa le tue risposte sui documenti forniti. Se non trovi l'informazione esatta, dillo chiaramente e proponi piste di ricerca.

Documenti disponibili nell'archivio (non tutti allegati per limiti di dimensione):
${docNames.map((n, i) => `[${i+1}] ${n}`).join("\n")}`;

    let userContent = [];
    for (const doc of docs) {
      userContent.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: doc.base64 },
        title: doc.name
      });
    }
    userContent.push({ type: "text", text: question });

    const history = userMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));

    const body = {
      model: req.body.model || "claude-haiku-4-5-20251001",
      max_tokens: req.body.max_tokens || 1000,
      system: systemPrompt,
      messages: [...history, { role: "user", content: userContent }]
    };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25"
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch(e) {
    console.log("Errore handler:", e.message);
    res.status(500).json({ error: e.message });
  }
}
