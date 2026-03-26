const DOCUMENTS = require("../documents");

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const docContext = DOCUMENTS.length > 0
      ? "Documenti normativi di riferimento disponibili:\n" +
        DOCUMENTS.map((d, i) =>
          `[${i+1}] "${d.title}" (${d.category})${d.description ? " - " + d.description : ""}`
        ).join("\n")
      : "Nessun documento specifico caricato.";

    const systemPrompt = `Sei un assistente tecnico specializzato in norme e regolamenti per la costruzione e l'ingegneria in Svizzera, per lo studio TERZIC URBAN ENGINEERING.
Rispondi SEMPRE in italiano, indipendentemente dalla lingua dei documenti.
Quando citi un documento, fallo con precisione: nome del documento, numero articolo o capitolo, pagina se nota.
Se un documento è disponibile nella lista sottostante, citalo esplicitamente per nome.
Se non trovi l'informazione esatta, dillo chiaramente e proponi piste di ricerca.

${docContext}`;

    const body = req.body;
    body.system = systemPrompt;

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
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
