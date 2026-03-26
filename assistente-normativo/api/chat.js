import fs from "fs";
import path from "path";

async function loadDocuments() {
  try {
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
    const docsDir = path.join(process.cwd(), "docs");
    if (!fs.existsSync(docsDir)) {
      console.log("Cartella docs non trovata:", docsDir);
      return "";
    }
    const files = fs.readdirSync(docsDir).filter(f => f.toLowerCase().endsWith(".pdf"));
    console.log("PDF trovati:", files);
    if (files.length === 0) return "";
    let context = "Documenti normativi disponibili:\n\n";
    for (const file of files) {
      try {
        const filePath = path.join(docsDir, file);
        const buffer = fs.readFileSync(filePath);
        const data = await pdfParse(buffer);
        const name = file.replace(/\.pdf$/i, "").replace(/_/g, " ");
        console.log(`Letto: ${file}, caratteri: ${data.text.length}`);
        context += `--- ${name} ---\n${data.text.slice(0, 10000)}\n\n`;
      } catch(e) {
        console.log(`Errore lettura ${file}:`, e.message);
      }
    }
    return context;
  } catch(e) {
    console.log("Errore loadDocuments:", e.message);
    return "";
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const docContext = await loadDocuments();
    console.log("Contesto documenti lunghezza:", docContext.length);

    const systemPrompt = `Sei un assistente tecnico specializzato in norme e regolamenti per la costruzione e l'ingegneria in Svizzera, per lo studio TERZIC URBAN ENGINEERING.
Rispondi SEMPRE in italiano, indipendentemente dalla lingua dei documenti.
Quando citi un documento, fallo con precisione: nome del documento, numero articolo o capitolo, pagina se nota.
Se un documento è disponibile nel contesto sottostante, citalo esplicitamente per nome e articolo.
Se non trovi l'informazione esatta nei documenti, dillo chiaramente e proponi piste di ricerca.

${docContext || "Nessun documento caricato al momento."}`;

    const body = { ...req.body, system: systemPrompt };

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
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
