import fs from "fs";
import path from "path";

async function loadDocuments() {
  try {
    const docsDir = path.join(process.cwd(), "docs");
    console.log("process.cwd():", process.cwd());
    console.log("docsDir:", docsDir);
    console.log("esiste:", fs.existsSync(docsDir));
    if (fs.existsSync(docsDir)) {
      console.log("contenuto:", fs.readdirSync(docsDir));
    }
    const files = fs.readdirSync(docsDir).filter(f => f.toLowerCase().endsWith(".pdf"));
    if (files.length === 0) return [];
    const docs = [];
    for (const file of files) {
      const filePath = path.join(docsDir, file);
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString("base64");
      const name = file.replace(/\.pdf$/i, "").replace(/_/g, " ");
      docs.push({ name, base64 });
    }
    return docs;
  } catch(e) {
    console.log("Errore loadDocuments:", e.message);
    return [];
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const docs = await loadDocuments();
    console.log("Documenti trovati:", docs.map(d => d.name));

    const systemPrompt = `Sei un assistente tecnico specializzato in norme e regolamenti per la costruzione e l'ingegneria in Svizzera, per lo studio TERZIC URBAN ENGINEERING.
Rispondi SEMPRE in italiano, indipendentemente dalla lingua dei documenti allegati.
Quando citi un documento, fallo con precisione: nome del documento, numero articolo o capitolo, pagina se nota.
Basa le tue risposte sui documenti forniti. Se non trovi l'informazione esatta, dillo chiaramente e proponi piste di ricerca.`;

    const userMessages = req.body.messages || [];
    const lastUserMsg = userMessages[userMessages.length - 1];

    // Costruisce il contenuto del messaggio utente con i PDF allegati
    let userContent = [];
    for (const doc of docs) {
      userContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: doc.base64
        },
        title: doc.name
      });
    }
    userContent.push({ type: "text", text: lastUserMsg?.content || "" });

    // Costruisce la history senza l'ultimo messaggio (già incluso sopra)
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
