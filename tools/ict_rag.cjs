// ICT Knowledge RAG — Phase 2: Retrieval-Augmented Generation Engine
// Chunks concepts, builds TF-IDF index, enables semantic search with citations

const fs = require("fs");
const path = require("path");

const ICT_ROOT = "C:\\Users\\cash\\Desktop\\ICT Knowledge Centre";
const INDEX_DIR = path.join(__dirname, "..", "references", "ict_knowledge");
const RAG_DIR = path.join(INDEX_DIR, "rag");
fs.mkdirSync(RAG_DIR, { recursive: true });

const taxonomy = JSON.parse(fs.readFileSync(path.join(INDEX_DIR, "taxonomy.json"), "utf8"));

// ═══════════════ CHUNKING ═══════════════
function chunkConcept(concept) {
  const filepath = path.join(ICT_ROOT, concept.file);
  if (!fs.existsSync(filepath)) return [];

  const content = fs.readFileSync(filepath, "utf8");
  const frontMatterMatch = content.match(/^---\n[\s\S]*?\n---\n?/);
  const body = frontMatterMatch ? content.slice(frontMatterMatch[0].length) : content;

  const chunks = [];
  const lines = body.split("\n");
  let currentSection = concept.title;
  let currentChunk = [];
  let lineStart = frontMatterMatch ? frontMatterMatch[0].split("\n").length : 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{2,4})\s+(.+)/);

    if (headingMatch && currentChunk.length > 3) {
      // Save previous chunk
      chunks.push({
        conceptId: concept.id,
        title: concept.title,
        section: currentSection,
        content: currentChunk.join("\n").trim(),
        lineStart: lineStart,
        lineEnd: lineStart + i,
        tier: concept.tier,
        tags: concept.tags,
        source: concept.source,
        file: concept.file,
      });
      currentSection = headingMatch[2];
      currentChunk = [];
      lineStart += i;
    }
    currentChunk.push(line);
  }

  // Final chunk
  if (currentChunk.length > 0) {
    chunks.push({
      conceptId: concept.id,
      title: concept.title,
      section: currentSection,
      content: currentChunk.join("\n").trim(),
      lineStart: lineStart,
      lineEnd: lineStart + lines.length,
      tier: concept.tier,
      tags: concept.tags,
      source: concept.source,
      file: concept.file,
    });
  }

  return chunks;
}

// ═══════════════ TF-IDF INDEX ═══════════════
function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter(w => !STOP_WORDS.has(w));
}

const STOP_WORDS = new Set([
  "the", "and", "that", "this", "with", "from", "for", "are", "not", "you", "your",
  "can", "has", "was", "all", "but", "its", "have", "been", "will", "when", "what",
  "how", "which", "their", "about", "into", "more", "than", "just", "like", "some",
  "over", "such", "only", "also", "then", "now", "each", "most", "other", "does",
  "should", "could", "would", "these", "those", "they", "them", "being", "been",
]);

function buildTFIDF(chunks) {
  const tf = [];        // term frequency per document
  const df = new Map(); // document frequency per term
  const N = chunks.length;

  for (const chunk of chunks) {
    const tokens = tokenize(chunk.content + " " + chunk.section + " " + (chunk.tags || []).join(" "));
    const termCounts = new Map();
    for (const t of tokens) {
      termCounts.set(t, (termCounts.get(t) || 0) + 1);
    }
    // Normalize TF
    const maxFreq = Math.max(...termCounts.values());
    const tfNorm = {};
    for (const [t, count] of termCounts) {
      tfNorm[t] = 0.5 + 0.5 * (count / maxFreq); // augmented TF
      df.set(t, (df.get(t) || 0) + 1);
    }
    tf.push({ id: chunks.indexOf(chunk), terms: tfNorm, chunk });
  }

  // Compute IDF
  const idf = new Map();
  for (const [term, docFreq] of df) {
    idf.set(term, Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5)));
  }

  // Build vector index (sparse)
  const vectors = tf.map(doc => {
    const vec = {};
    for (const [term, tfVal] of Object.entries(doc.terms)) {
      vec[term] = tfVal * (idf.get(term) || 0);
    }
    // Normalize vector
    const norm = Math.sqrt(Object.values(vec).reduce((s, v) => s + v * v, 0));
    if (norm > 0) {
      for (const t of Object.keys(vec)) vec[t] /= norm;
    }
    return { id: doc.id, vec, chunk: doc.chunk };
  });

  return { vectors, idf, N };
}

function cosineSimilarity(vecA, vecB) {
  let dot = 0;
  for (const [t, v] of Object.entries(vecA)) {
    if (vecB[t]) dot += v * vecB[t];
  }
  return dot; // Vectors are already normalized
}

// ═══════════════ QUERY ENGINE ═══════════════
function query(queryText, vectors, topK = 5) {
  const queryTokens = tokenize(queryText);
  const queryVec = {};

  // Build query vector
  for (const t of queryTokens) {
    queryVec[t] = (queryVec[t] || 0) + 1;
  }
  const norm = Math.sqrt(Object.values(queryVec).reduce((s, v) => s + v * v, 0));
  if (norm > 0) {
    for (const t of Object.keys(queryVec)) queryVec[t] /= norm;
  }

  // Score all documents
  const scored = vectors.map(doc => {
    const similarity = cosineSimilarity(queryVec, doc.vec);

    // Tier boost: tier 0 gets ×1.5, tier 1 ×1.3, tier 2 ×1.1
    const tierBoost = [1.5, 1.3, 1.1, 1.0, 0.8][doc.chunk.tier] || 1.0;

    // Keyword match bonus: exact phrase match
    const exactBonus = doc.chunk.content.toLowerCase().includes(queryText.toLowerCase()) ? 1.5 : 1.0;

    // Title match bonus
    const titleBonus = doc.chunk.title.toLowerCase().includes(queryTokens.slice(0, 3).join(" ")) ? 1.3 : 1.0;

    const finalScore = similarity * tierBoost * exactBonus * titleBonus;

    return { ...doc, score: finalScore, rawSimilarity: similarity };
  });

  scored.sort((a, b) => b.score - a.score);

  // Deduplicate by concept ID (keep highest scoring chunk per concept)
  const seen = new Set();
  const results = [];
  for (const s of scored) {
    if (s.score < 0.01) continue;
    if (!seen.has(s.chunk.conceptId)) {
      seen.add(s.chunk.conceptId);
      results.push(formatResult(s, queryTokens));
    }
    if (results.length >= topK) break;
  }

  return results;
}

function formatResult(scored, queryTokens) {
  const c = scored.chunk;
  // Extract most relevant sentences (up to 3)
  const sentences = c.content.split(/[.!?]\s+/);
  const relevantSentences = sentences
    .filter(s => queryTokens.some(t => s.toLowerCase().includes(t)))
    .slice(0, 3)
    .map(s => s.trim().slice(0, 200))
    .join(". ");

  return {
    conceptId: c.conceptId,
    title: c.title,
    section: c.section,
    tier: c.tier,
    tierName: ["Foundations", "Core Mechanics", "Strategies", "Advanced", "Meta"][c.tier] || "Unknown",
    score: scored.score.toFixed(3),
    excerpt: relevantSentences || c.content.slice(0, 300).replace(/\n/g, " "),
    source: c.source,
    file: c.file,
    lineRef: `L${c.lineStart}-L${c.lineEnd}`,
    cite: `${c.file}#L${c.lineStart}`,
    tags: c.tags,
  };
}

// ═══════════════ CONCEPT LOOKUP ═══════════════
function lookupConcept(conceptName) {
  const name = conceptName.toLowerCase().replace(/[\s-]+/g, "-");
  // Try exact match, then fuzzy
  for (const [id, concept] of Object.entries(taxonomy)) {
    if (id.includes(name) || concept.title.toLowerCase().includes(conceptName.toLowerCase())) {
      return {
        id: concept.id,
        title: concept.title,
        tier: concept.tier,
        tierName: concept.tierName,
        source: concept.source,
        file: concept.file,
        tags: concept.tags,
        excerpt: concept.excerpt,
        prerequisites: concept.prerequisites,
        keyRules: concept.keySections.filter(s => s.type === "rule").map(s => s.text),
        keyPoints: concept.keySections.filter(s => s.type === "keypoint").map(s => s.text).slice(0, 10),
      };
    }
  }
  // Try tag search
  const tagResults = [];
  for (const [id, concept] of Object.entries(taxonomy)) {
    if (concept.tags && concept.tags.some(t => t.toLowerCase().includes(conceptName.toLowerCase()))) {
      tagResults.push(id);
    }
  }
  if (tagResults.length > 0) {
    return { type: "tag_search", tag: conceptName, matches: tagResults.slice(0, 10) };
  }
  return null;
}

// ═══════════════ MAIN ═══════════════
function main() {
  const args = process.argv.slice(2);
  const mode = args[0];

  if (!mode || mode === "--help") {
    console.log(`
ICT Knowledge RAG — Phase 2
Usage:
  node tools/ict_rag.cjs --query "<question>"     Semantic search (top 5)
  node tools/ict_rag.cjs --concept <name>          Concept lookup with rules
  node tools/ict_rag.cjs --build                    Rebuild RAG index
  node tools/ict_rag.cjs --list [tier]              List concepts by tier
  node tools/ict_rag.cjs --stats                    Index statistics

Examples:
  node tools/ict_rag.cjs --query "Silver Bullet entry rules"
  node tools/ict_rag.cjs --query "How to identify a fair value gap"
  node tools/ict_rag.cjs --concept "silver-bullet"
  node tools/ict_rag.cjs --list 2
`);
    return;
  }

  // ── Build Index ──────────────────────────────────────
  if (mode === "--build") {
    console.log("Building RAG index...");
    const allChunks = [];
    for (const [id, concept] of Object.entries(taxonomy)) {
      const chunks = chunkConcept(concept);
      allChunks.push(...chunks);
    }
    console.log(`  Chunked ${Object.keys(taxonomy).length} concepts → ${allChunks.length} sections`);

    const { vectors, N } = buildTFIDF(allChunks);
    console.log(`  TF-IDF index: ${N} documents, vocabulary built`);

    // Save index (vectors only, chunks referenced from taxonomy)
    const indexData = {
      built: new Date().toISOString(),
      totalChunks: N,
      totalConcepts: Object.keys(taxonomy).length,
      vectors: vectors.map(v => ({ id: v.id, vec: v.vec, conceptId: v.chunk.conceptId, section: v.chunk.section })),
      chunks: allChunks.map(c => ({ id: allChunks.indexOf(c), conceptId: c.conceptId, section: c.section, lineStart: c.lineStart, lineEnd: c.lineEnd })),
    };
    fs.writeFileSync(path.join(RAG_DIR, "rag_index.json"), JSON.stringify(indexData));
    fs.writeFileSync(path.join(RAG_DIR, "chunks.json"), JSON.stringify(allChunks));
    console.log(`  Saved to ${RAG_DIR}/`);
    console.log(`  Index ready. Total: ${N} searchable sections.`);
    return;
  }

  // ── Query ──────────────────────────────────────────
  if (mode === "--query") {
    const queryText = args.slice(1).join(" ");
    if (!queryText) { console.log("Error: Provide a query"); return; }

    const indexPath = path.join(RAG_DIR, "rag_index.json");
    const chunksPath = path.join(RAG_DIR, "chunks.json");

    if (!fs.existsSync(indexPath) || !fs.existsSync(chunksPath)) {
      console.log("Index not found. Run --build first.");
      return;
    }

    const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
    const chunks = JSON.parse(fs.readFileSync(chunksPath, "utf8"));

    // Reconstruct vectors with chunk references
    const vectors = index.vectors.map(v => ({
      ...v,
      chunk: chunks[v.id] || chunks.find(c => c.conceptId === v.conceptId && c.section === v.section)
    }));

    const results = query(queryText, vectors, 7);

    console.log(`\n🔍 Query: "${queryText}"\n`);
    console.log(`Results: ${results.length} relevant concepts\n`);
    console.log("═".repeat(70));

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(`\n${i + 1}. ${r.title} — Score: ${r.score}`);
      console.log(`   Tier: ${r.tierName} | Section: ${r.section}`);
      console.log(`   ${r.excerpt}`);
      console.log(`   📄 ${r.cite}`);
      if (r.source) console.log(`   🔗 ${r.source}`);
    }

    // Best match summary
    if (results.length > 0) {
      const best = results[0];
      console.log(`\n═`.repeat(70));
      console.log(`BEST MATCH: ${best.title}`);
      console.log(`Cite: ${best.cite}`);
      console.log(`Tier: ${best.tierName} | Section: ${best.section}`);
    }
    return;
  }

  // ── Concept Lookup ─────────────────────────────────
  if (mode === "--concept") {
    const name = args.slice(1).join(" ");
    if (!name) { console.log("Error: Provide concept name"); return; }

    const result = lookupConcept(name);
    if (!result) { console.log(`Concept "${name}" not found`); return; }

    if (result.type === "tag_search") {
      console.log(`\nConcepts tagged with "${result.tag}":`);
      for (const id of result.matches) console.log(`  - ${id}`);
      return;
    }

    console.log(`\n📘 ${result.title}`);
    console.log(`═`.repeat(70));
    console.log(`ID: ${result.id}`);
    console.log(`Tier: ${result.tier} (${result.tierName})`);
    console.log(`File: ${result.file}`);
    if (result.source) console.log(`Source: ${result.source}`);
    if (result.tags.length) console.log(`Tags: ${result.tags.join(", ")}`);
    console.log(`\nExcerpt: ${result.excerpt}`);

    if (result.prerequisites.length) {
      console.log(`\n📋 Prerequisites:`);
      for (const p of result.prerequisites) console.log(`  - ${p}`);
    }

    if (result.keyRules.length) {
      console.log(`\n📋 Key Rules:`);
      for (const r of result.keyRules) console.log(`  ${result.keyRules.indexOf(r) + 1}. ${r}`);
    }

    if (result.keyPoints.length) {
      console.log(`\n💡 Key Points:`);
      for (const p of result.keyPoints.slice(0, 5)) console.log(`  • ${p}`);
    }
    return;
  }

  // ── List by Tier ───────────────────────────────────
  if (mode === "--list") {
    const tier = parseInt(args[1]) || 0;
    const tierNames = ["Foundations", "Core Mechanics", "Strategies", "Advanced", "Meta"];
    const tierConcepts = Object.entries(taxonomy)
      .filter(([_, c]) => c.tier === tier)
      .sort((a, b) => a[1].title.localeCompare(b[1].title));

    console.log(`\nTier ${tier} — ${tierNames[tier] || "?"} (${tierConcepts.length} concepts)\n`);
    for (const [id, c] of tierConcepts) {
      console.log(`  ${c.title}`);
      console.log(`    ID: ${id} | Tags: ${(c.tags||[]).slice(0, 3).join(", ")} | Prereqs: ${c.prerequisites.length}`);
    }
    return;
  }

  // ── Stats ──────────────────────────────────────────
  if (mode === "--stats") {
    const indexPath = path.join(RAG_DIR, "rag_index.json");
    if (fs.existsSync(indexPath)) {
      const idx = JSON.parse(fs.readFileSync(indexPath, "utf8"));
      console.log(`\nRAG Index Statistics`);
      console.log(`═`.repeat(50));
      console.log(`Built: ${idx.built}`);
      console.log(`Total chunks: ${idx.totalChunks}`);
      console.log(`Total concepts: ${idx.totalConcepts}`);
      console.log(`Avg chunks/concept: ${(idx.totalChunks / idx.totalConcepts).toFixed(1)}`);
    } else {
      console.log("No RAG index found. Run --build first.");
    }

    // Concept stats
    let totalRules = 0, totalPoints = 0;
    for (const [_, c] of Object.entries(taxonomy)) {
      totalRules += c.keySections.filter(s => s.type === "rule").length;
      totalPoints += c.keySections.filter(s => s.type === "keypoint").length;
    }
    console.log(`Total key rules extracted: ${totalRules}`);
    console.log(`Total key points extracted: ${totalPoints}`);
    console.log(`Avg rules per concept: ${(totalRules / Object.keys(taxonomy).length).toFixed(1)}`);
    return;
  }

  console.log(`Unknown mode: ${mode}. Use --help.`);
}

main();
