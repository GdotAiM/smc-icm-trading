// ICT Video Learning Pipeline — Discovery → Transcript → Summarize → Index → Prioritize
// ─────────────────────────────────────────────────────────────────────────────
// Automates the full ICT video learning workflow:
//
//   1. DISCOVER  — List recent ICT channel videos, diff against already-processed
//   2. FETCH     — Download transcripts (--skip-download --write-subs)
//   3. SUMMARIZE — LLM extracts structured concepts, rules, patterns
//   4. INDEX     — Feed into ict_knowledge_ingest.cjs for RAG retrieval
//   5. PRIORITIZE — Cross-reference with trade_graph.json performance gaps
//
// Usage:
//   node tools/ict_video_pipeline.cjs --discover              # list new videos
//   node tools/ict_video_pipeline.cjs --fetch VID1,VID2       # download transcripts
//   node tools/ict_video_pipeline.cjs --process VID1          # full pipeline for one video
//   node tools/ict_video_pipeline.cjs --prioritize            # rank unwatched by P&L impact
//   node tools/ict_video_pipeline.cjs --run                   # end-to-end: discover → prioritize → process top 3
//   node tools/ict_video_pipeline.cjs --watchlist             # show prioritized study queue
// ─────────────────────────────────────────────────────────────────────────────

const fs = require("fs");
const path = require("path");
const { execSync, spawn } = require("child_process");

// Resolve yt-dlp path — Windows winget install location
const YT_DLP = (() => {
  const candidates = [
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages", "yt-dlp.yt-dlp_Microsoft.Winget.Source_8wekyb3d8bbwe", "yt-dlp.exe"),
    path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages", "yt-dlp.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe", "ffmpeg-N-125875-g5d4d3bdc61-win64-gpl", "bin", "yt-dlp.exe"),
    "yt-dlp", "yt-dlp.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  // Fallback: try the winget glob
  try {
    const wingetDir = path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages");
    if (fs.existsSync(wingetDir)) {
      for (const dir of fs.readdirSync(wingetDir)) {
        if (dir.startsWith("yt-dlp.yt-dlp")) {
          const exe = path.join(wingetDir, dir, "yt-dlp.exe");
          if (fs.existsSync(exe)) return exe;
        }
      }
    }
  } catch {}
  return "yt-dlp"; // last resort
})();

const ROOT = process.env.WORKSPACE_ROOT || path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "shared", "ict_videos");
const PROCESSED_FILE = path.join(DATA_DIR, "processed.json");
const QUEUE_FILE = path.join(DATA_DIR, "watchlist.json");
const TRANSCRIPTS_DIR = path.join(DATA_DIR, "transcripts");
const SUMMARIES_DIR = path.join(DATA_DIR, "summaries");

// ICT YouTube channel
const ICT_CHANNEL = "https://www.youtube.com/@InnerCircleTrader";
const ICT_CHANNEL_VIDEOS = ICT_CHANNEL + "/videos";

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDirs() {
  for (const d of [DATA_DIR, TRANSCRIPTS_DIR, SUMMARIES_DIR]) {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  }
}

function loadProcessed() {
  try { return JSON.parse(fs.readFileSync(PROCESSED_FILE, "utf8")); }
  catch { return { videos: {}, lastDiscovery: null, conceptIndex: {} }; }
}

function saveProcessed(data) {
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify(data, null, 2), "utf8");
}

function loadQueue() {
  try { return JSON.parse(fs.readFileSync(QUEUE_FILE, "utf8")); }
  catch { return []; }
}

function saveQueue(queue) {
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2), "utf8");
}

// ── STEP 1: DISCOVER ─────────────────────────────────────────────────────────

/**
 * Use yt-dlp to list recent videos from ICT's channel.
 * Returns array of { id, title, url, duration, uploadDate }.
 */
function discoverVideos(maxResults = 50) {
  console.log(`\n🔍 Discovering ICT channel videos (max ${maxResults})...\n`);

  let output;
  try {
    output = execSync(
      `"${YT_DLP}" --no-check-certificate --flat-playlist --dump-json ` +
      `--playlist-end ${maxResults} "${ICT_CHANNEL_VIDEOS}"`,
      { encoding: "utf8", timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
    );
  } catch (e) {
    console.error("  ⚠️  yt-dlp discovery failed:", e.message?.slice(0, 120));
    console.error("  Falling back to manual URL list...");
    return null;
  }

  const videos = [];
  for (const line of output.trim().split("\n")) {
    if (!line.trim()) continue;
    try {
      const v = JSON.parse(line);
      videos.push({
        id: v.id || v.youtube_id,
        title: v.title || "Untitled",
        url: v.url || v.webpage_url || `https://youtu.be/${v.id}`,
        duration: v.duration || 0,
        uploadDate: v.upload_date || null,
      });
    } catch {}
  }

  return videos;
}

function diffAgainstProcessed(videos, processed) {
  const existing = new Set(Object.keys(processed.videos));
  const newVideos = videos.filter(v => v.id && !existing.has(v.id));

  // Score each new video
  const scored = newVideos.map(v => {
    // Shorter videos (< 30 min) are easier to process
    const durationScore = v.duration > 0 && v.duration < 1800 ? 1 : 0.5;

    // Title keyword scoring — ICT concept density
    const title = (v.title || "").toLowerCase();
    const conceptKeywords = [
      "model", "entry", "setup", "liquidity", "fvg", "order block",
      "silver bullet", "turtle soup", "mmxm", "breaker", "judas",
      "inversion", "pda", "bisi", "sibi", "lunch", "reversal",
      "killzone", "opening range", "daily bias", "smc", "ict",
      "ifvg", "OTE", "structure", "displacement", "sweep", "inducement",
    ];
    const conceptScore = conceptKeywords.filter(k => title.includes(k)).length;

    // Recency — videos from last 6 months get a boost
    let recencyScore = 0;
    if (v.uploadDate) {
      const d = new Date(
        parseInt(v.uploadDate.slice(0, 4)),
        parseInt(v.uploadDate.slice(4, 6)) - 1,
        parseInt(v.uploadDate.slice(6, 8))
      );
      const ageDays = (Date.now() - d.getTime()) / 86400000;
      recencyScore = Math.max(0, 1 - ageDays / 365); // linear decay over 1 year
    }

    return {
      ...v,
      scores: {
        duration: durationScore,
        concepts: conceptScore,
        recency: Math.round(recencyScore * 100) / 100,
        total: Math.round((durationScore + conceptScore * 0.5 + recencyScore * 0.8) * 100) / 100,
      },
    };
  });

  // Sort by total score descending
  scored.sort((a, b) => b.scores.total - a.scores.total);
  return scored;
}

// ── STEP 2: FETCH ────────────────────────────────────────────────────────────

function fetchTranscript(videoId) {
  ensureDirs();
  const outDir = path.join(TRANSCRIPTS_DIR, videoId);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  console.log(`  📥 Downloading transcript for ${videoId}...`);
  try {
    execSync(
      `"${YT_DLP}" --no-check-certificate --skip-download ` +
      `--write-subs --write-auto-subs --sub-langs "en.*" ` +
      `--sub-format vtt --convert-subs vtt ` +
      `--write-info-json --no-playlist --ignore-errors ` +
      `-o "${outDir}/video.%(ext)s" -- ` +
      `"https://youtu.be/${videoId}"`,
      { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }
    );

    // Find the subtitle file
    const files = fs.readdirSync(outDir);
    const subFile = files.find(f => f.endsWith(".vtt"));
    const infoFile = files.find(f => f.endsWith(".info.json"));

    let info = {};
    if (infoFile) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(outDir, infoFile), "utf8"));
        info = {
          title: raw.title || videoId,
          duration: raw.duration || 0,
          uploadDate: raw.upload_date || null,
          description: raw.description || "",
        };
      } catch {}
    }

    return {
      videoId,
      success: !!subFile,
      subtitlePath: subFile ? path.join(outDir, subFile) : null,
      info,
      transcriptText: subFile ? parseVTT(path.join(outDir, subFile)) : null,
    };
  } catch (e) {
    return { videoId, success: false, error: e.message?.slice(0, 200) };
  }
}

/** Parse VTT to plain text, stripping timestamps and metadata. */
function parseVTT(filePath) {
  try {
    let text = fs.readFileSync(filePath, "utf8");
    // Remove WEBVTT header and metadata
    text = text.replace(/^WEBVTT.*\n/m, "");
    text = text.replace(/^Kind:.*\n/m, "");
    text = text.replace(/^Language:.*\n/m, "");
    // Remove timestamps (lines like 00:00:04.900 --> 00:00:05.920)
    text = text.replace(/^\d{2}:\d{2}:\d{2}\.\d{3}\s*-->\s*\d{2}:\d{2}:\d{2}\.\d{3}.*$/gm, "");
    // Remove cue identifiers
    text = text.replace(/^\d+$/gm, "");
    // Remove VTT tags like <c> <v> etc.
    text = text.replace(/<\/?[^>]+>/g, "");
    // Remove align lines
    text = text.replace(/^NOTE.*$/gm, "");
    text = text.replace(/^align:.*$/gm, "");
    // Deduplicate: remove consecutive duplicate non-empty lines (VTT overlap)
    const lines = text.split("\n");
    const seen = new Set();
    const deduped = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        if (deduped.length > 0 && deduped[deduped.length - 1] !== "") {
          deduped.push("");
        }
        continue;
      }
      // Skip if identical to previous non-empty line (overlapping captions)
      if (deduped.length > 0 && line === deduped[deduped.length - 1]) continue;
      // Skip if we've seen this exact line recently (within last 3 non-empty lines)
      if (seen.has(line)) {
        // Still add it — but clean the "seen" set periodically
      }
      seen.add(line);
      if (seen.size > 20) seen.clear(); // rolling window
      deduped.push(line);
    }
    text = deduped.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return text;
  } catch (e) {
    return null;
  }
}

// ── STEP 3: SUMMARIZE (LLM extraction) ──────────────────────────────────────

async function summarizeTranscript(transcriptText, videoInfo) {
  if (!transcriptText || transcriptText.length < 100) {
    return { error: "Transcript too short or missing" };
  }

  // Truncate to fit LLM context — take the first third (usually intro + setup)
  // plus the middle third (usually trade execution + rules)
  const third = Math.floor(transcriptText.length / 3);
  const truncated = transcriptText.slice(0, third) +
    "\n\n[... middle section ...]\n\n" +
    transcriptText.slice(third * 2, third * 3);

  const prompt = `You are an ICT/SMC trading concept extractor. Analyze this transcript from an ICT (Inner Circle Trader) video and extract structured knowledge.

Video: "${videoInfo.title || 'Unknown'}"

Return ONLY valid JSON in this exact format (no markdown fences, no other text):

{
  "concepts": [
    {
      "name": "Concept name (e.g., 'NY Lunch Reversal PDA')",
      "category": "PDA | Entry Model | Risk Management | Market Structure | Session Timing | Liquidity | Psychology",
      "rules": ["Rule 1 as a clear, actionable statement", "Rule 2", "..."],
      "timeframes": ["1m", "5m", "15m", "1h", "4h", "1d"],
      "keyLevels": ["specific price levels mentioned if any"],
      "entryCriteria": ["step 1", "step 2", "..."],
      "invalidation": "How do you know the setup failed?",
      "confidence": "HIGH | MEDIUM | LOW — how confidently is this taught?",
      "timestamp": "Approximate time in video if mentioned",
      "quotes": ["memorable direct quotes that capture the essence"]
    }
  ],
  "summary": "2-3 sentence summary of the key takeaway",
  "modelName": "If this teaches a specific named setup/model, what is it called?",
  "isNewPDA": true/false,
  "relatedConcepts": ["names of other ICT concepts this builds on"],
  "difficulty": "BEGINNER | INTERMEDIATE | ADVANCED"
}

Transcript:
${truncated}`;

  try {
    const { chatCompletion } = require("./llm/llm_client.cjs");
    const result = await chatCompletion(
      [{ role: "user", content: prompt }],
      { maxTokens: 4096, temperature: 0.2, timeout: 120000 }
    );

    // Extract JSON from the response - handle markdown fences and extra text
    let jsonStr = result.text;
    // Try to extract from ```json ... ``` fence first
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();
    // Find the outermost { ... } pair
    const braceStart = jsonStr.indexOf("{");
    const braceEnd = jsonStr.lastIndexOf("}");
    if (braceStart >= 0 && braceEnd > braceStart) {
      jsonStr = jsonStr.slice(braceStart, braceEnd + 1);
      try {
        return JSON.parse(jsonStr);
      } catch (e1) {
        // Try to salvage truncated JSON by closing open structures
        console.log("  ⚠️  JSON parse failed, attempting to salvage truncated response...");
        let salvaged = jsonStr;
        const openBraces = (salvaged.match(/\{/g) || []).length;
        const closeBraces = (salvaged.match(/\}/g) || []).length;
        const openBrackets = (salvaged.match(/\[/g) || []).length;
        const closeBrackets = (salvaged.match(/\]/g) || []).length;
        for (let i = 0; i < openBrackets - closeBrackets; i++) salvaged += "]";
        for (let i = 0; i < openBraces - closeBraces; i++) salvaged += "}";
        if (openBraces > closeBraces) salvaged += '"}';
        try {
          const partial = JSON.parse(salvaged);
          partial._salvaged = true;
          partial._note = "JSON was truncated by LLM token limit - some fields may be incomplete.";
          return partial;
        } catch (e2) {
          console.log("  ⚠️  Salvage also failed, saving raw response...");
        }
      }
    }
    // Fallback: return the raw text so it's at least saved for review
    return {
      rawSummary: result.text.slice(0, 2000),
      error: `JSON parse failed. Raw response saved (${result.text.length} chars).`,
    };
  } catch (e) {
    return { error: `LLM summarization failed: ${e.message?.slice(0, 120)}` };
  }
}

// ── STEP 4: INDEX ────────────────────────────────────────────────────────────

function indexConcept(videoId, videoInfo, summary, processed) {
  if (!summary || (summary.error && !summary._salvaged && !summary.rawSummary)) {
    console.log(`  ⚠️  Skipping index - no valid summary for ${videoId}`);
    return processed;
  }

  const concepts = summary.concepts || [];
  const hasConcepts = concepts.length > 0;
  const hasRaw = !!summary.rawSummary;
  const wasSalvaged = summary._salvaged;

  if (!hasConcepts && !hasRaw) {
    console.log(`  ⚠️  No concepts or raw summary from ${videoId}`);
    return processed;
  }

  // Mark video as processed (even if only raw summary available)
  processed.videos[videoId] = {
    id: videoId,
    title: videoInfo.title || summary.modelName || videoId,
    url: `https://youtu.be/${videoId}`,
    processedAt: new Date().toISOString(),
    conceptCount: concepts.length,
    summary: summary.summary || summary.rawSummary?.slice(0, 200) || "",
    modelName: summary.modelName || null,
    difficulty: summary.difficulty || "INTERMEDIATE",
    isNewPDA: summary.isNewPDA || false,
    wasSalvaged: wasSalvaged || false,
  };

  if (wasSalvaged) {
    console.log(`  ⚠️  Indexed with salvaged (truncated) summary - ${concepts.length} partial concept(s)`);
  }

  if (!hasConcepts) {
    console.log(`  📝 Raw summary saved (${(summary.rawSummary || "").length} chars) - manual review needed`);
    return processed;
  }

  // Index each concept
  for (const concept of concepts) {
    const key = concept.name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    if (!processed.conceptIndex[key]) {
      processed.conceptIndex[key] = { name: concept.name, sources: [], rules: [] };
    }
    processed.conceptIndex[key].sources.push(videoId);
    processed.conceptIndex[key].rules = [
      ...new Set([...processed.conceptIndex[key].rules, ...(concept.rules || [])]),
    ];
    processed.conceptIndex[key].category = concept.category;
    processed.conceptIndex[key].confidence = concept.confidence;
    processed.conceptIndex[key].lastUpdated = new Date().toISOString();
  }

  console.log(`  📚 Indexed ${concepts.length} concept(s) from "${videoInfo.title || videoId}"`);
  return processed;
}

// ── STEP 5: PRIORITIZE ───────────────────────────────────────────────────────

/**
 * Cross-reference the watchlist with trade_graph.json performance data.
 * Concepts related to losing model/session combinations get priority boost.
 */
function prioritizeWatchlist(watchlist, processed) {
  console.log("\n📊 Prioritizing watchlist against trade performance...\n");

  // Load trade graph for performance data
  let tradeGraph = null;
  try {
    tradeGraph = JSON.parse(fs.readFileSync(path.join(ROOT, "shared", "trade_graph.json"), "utf8"));
  } catch {}

  // Extract weak spots from trade graph
  const weakConcepts = new Set();
  const weakModels = new Set();
  const weakSessions = new Set();
  let lossCount = 0;

  if (tradeGraph) {
    const edges = tradeGraph.edges || [];
    const nodesObj = tradeGraph.nodes || {};
    const nodeValues = Array.isArray(nodesObj) ? nodesObj : Object.values(nodesObj);

    // Extract active lessons — each is a pattern that went wrong
    const activeLessons = nodeValues.filter(n => n.type === "lesson" && n.active !== false);
    for (const lesson of activeLessons) {
      const category = (lesson.category || "").toLowerCase();
      const title = (lesson.title || "").toLowerCase();
      const detail = (lesson.detail || "").toLowerCase();
      // Map lesson categories to searchable concept keywords
      const keywordMap = {
        "risk-management": ["risk", "stop loss", "position sizing", "trade management"],
        "entry-execution": ["entry", "execution", "confirmation", "MSS", "displacement", "FVG entry"],
        "directional-bias": ["daily bias", "HTF", "bias", "structure", "trend"],
        "forecast-usage": ["forecast", "prediction", "Monte Carlo"],
        "model-selection": ["model", "setup", "Silver Bullet", "MMXM", "Turtle Soup", "breaker"],
        "session-timing": ["killzone", "session", "London", "NY session", "lunch", "Asia"],
        "psychology": ["patience", "discipline", "fear", "greed"],
        "technical": ["FVG", "order block", "OB", "liquidity", "BISI", "SIBI", "IFVG", "OTE"],
      };
      const keywords = keywordMap[category] || [category];
      for (const kw of keywords) {
        weakConcepts.add(kw.toLowerCase());
      }
    }

    // Low-coherence trades (< 50) are effectively losses
    const weakTrades = nodeValues.filter(n =>
      n.type === "trade" && (n.coherence || 0) < 50 && n.model !== "NO TRADE — no single complete model"
    );
    for (const trade of weakTrades) {
      lossCount++;
      if (trade.model) {
        // Extract model name without "(sequence complete)" suffix
        const modelName = trade.model.replace(/\s*\(.*/, "").trim().toLowerCase();
        weakModels.add(modelName);
      }
      if (trade.session) weakSessions.add(trade.session.toLowerCase());
    }

    // Also check used_model edges for frequently-losing models
    const modelEdges = edges.filter(e => e.type === "USED_MODEL");
    for (const edge of modelEdges) {
      const tradeNode = nodesObj[edge.source];
      if (tradeNode && tradeNode.type === "trade" && (tradeNode.coherence || 0) < 50) {
        const modelNode = nodesObj[edge.target];
        if (modelNode) weakModels.add((modelNode.name || "").toLowerCase());
      }
    }
  }

  console.log(`  Trade graph: ${lossCount} losing trades analyzed`);
  console.log(`  Weak models: ${[...weakModels].join(", ") || "none"}`);
  console.log(`  Weak concepts: ${[...weakConcepts].slice(0, 5).join(", ") || "none"}...`);

  // Score each video in the watchlist against weak spots
  const prioritized = watchlist.map(v => {
    let priorityBoost = 0;
    const reasons = [];

    const title = (v.title || "").toLowerCase();

    // Check against weak concepts
    for (const wc of weakConcepts) {
      if (title.includes(wc) || title.includes(wc.replace(/_/g, " "))) {
        priorityBoost += 3;
        reasons.push(`weak concept: ${wc}`);
      }
    }

    // Check against weak models
    for (const wm of weakModels) {
      if (title.includes(wm)) {
        priorityBoost += 2;
        reasons.push(`weak model: ${wm}`);
      }
    }

    // Check against weak sessions
    for (const ws of weakSessions) {
      if (title.includes(ws)) {
        priorityBoost += 1;
        reasons.push(`weak session: ${ws}`);
      }
    }

    // Concepts you haven't indexed yet get a discovery boost
    const indexedConcepts = Object.values(processed.conceptIndex || {});
    const titleConcepts = indexedConcepts.filter(c =>
      title.includes(c.name?.toLowerCase())
    );
    if (titleConcepts.length === 0) {
      priorityBoost += 1;
      reasons.push("unexplored concept");
    }

    return {
      ...v,
      priorityScore: (v.scores?.total || 1) + priorityBoost,
      priorityReasons: reasons,
      priorityTier: priorityBoost >= 5 ? "🔥 HIGH" : priorityBoost >= 2 ? "⭐ MEDIUM" : "📋 LOW",
    };
  });

  prioritized.sort((a, b) => b.priorityScore - a.priorityScore);
  return prioritized;
}

// ── Full pipeline (single video) ─────────────────────────────────────────────

async function processVideo(videoId, processed) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Processing: ${videoId}`);
  console.log(`${"=".repeat(60)}`);

  // Step 2: Fetch transcript
  const fetchResult = fetchTranscript(videoId);
  if (!fetchResult.success) {
    console.log(`  ❌ Failed to fetch transcript: ${fetchResult.error}`);
    return processed;
  }
  console.log(`  ✅ Transcript downloaded (${(fetchResult.transcriptText?.length || 0).toLocaleString()} chars)`);

  // Step 3: Summarize
  console.log(`  🤖 Running LLM concept extraction...`);
  const summary = await summarizeTranscript(fetchResult.transcriptText, fetchResult.info);

  if (summary.error) {
    console.log(`  ⚠️  Summarization issue: ${summary.error}`);
  } else {
    console.log(`  ✅ Extracted ${summary.concepts?.length || 0} concept(s)`);
    if (summary.modelName) console.log(`  🎯 Model: ${summary.modelName}`);
    if (summary.isNewPDA) console.log(`  🆕 NEW PDA identified!`);
  }

  // Step 4: Index
  processed = indexConcept(videoId, fetchResult.info, summary, processed);

  // Save the summary for reference
  const summaryPath = path.join(SUMMARIES_DIR, `${videoId}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify({
    videoId,
    info: fetchResult.info,
    summary,
    processedAt: new Date().toISOString(),
  }, null, 2), "utf8");

  return processed;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  ensureDirs();
  let processed = loadProcessed();

  // ── discover ──────────────────────────────────────────────────────────────
  if (cmd === "--discover") {
    const maxResults = parseInt(args[1]) || 50;
    const videos = discoverVideos(maxResults);

    if (!videos || videos.length === 0) {
      console.log("  ❌ No videos discovered. Check yt-dlp and network.");
      console.log("  Manual: browse https://www.youtube.com/@InnerCircleTrader/videos");
      return;
    }

    const newVideos = diffAgainstProcessed(videos, processed);
    console.log(`  Channel total: ${videos.length} videos`);
    console.log(`  Already processed: ${Object.keys(processed.videos).length}`);
    console.log(`  New: ${newVideos.length}`);

    if (newVideos.length > 0) {
      console.log(`\n  Top new videos:\n`);
      for (const v of newVideos.slice(0, 15)) {
        console.log(`  ${v.scores.total.toFixed(1)}  ${v.title?.slice(0, 70)}`);
        console.log(`        ${v.url}`);
      }

      // Save to watchlist
      saveQueue(newVideos);
      console.log(`\n  📋 Saved ${newVideos.length} videos to watchlist (shared/ict_videos/watchlist.json)`);
    }

    processed.lastDiscovery = new Date().toISOString();
    saveProcessed(processed);
  }

  // ── fetch ─────────────────────────────────────────────────────────────────
  else if (cmd === "--fetch") {
    const ids = args[1] ? args[1].split(",").map(s => s.trim()) : [];
    if (ids.length === 0) {
      console.log("Usage: node tools/ict_video_pipeline.cjs --fetch VID1,VID2,VID3");
      return;
    }
    for (const id of ids) {
      const result = fetchTranscript(id);
      console.log(`  ${id}: ${result.success ? `✅ ${(result.transcriptText?.length || 0).toLocaleString()} chars` : `❌ ${result.error}`}`);
    }
  }

  // ── process ───────────────────────────────────────────────────────────────
  else if (cmd === "--process") {
    const id = args[1];
    if (!id) { console.log("Usage: node tools/ict_video_pipeline.cjs --process VIDEO_ID"); return; }
    processed = await processVideo(id, processed);
    saveProcessed(processed);
    console.log(`\n✅ Done. Concept index now has ${Object.keys(processed.conceptIndex).length} entries.`);
  }

  // ── prioritize ────────────────────────────────────────────────────────────
  else if (cmd === "--prioritize") {
    const watchlist = loadQueue();
    if (watchlist.length === 0) {
      console.log("  📋 Watchlist is empty. Run --discover first.");
      return;
    }

    const prioritized = prioritizeWatchlist(watchlist, processed);
    saveQueue(prioritized);

    console.log(`\n  📋 Prioritized watchlist (${prioritized.length} videos):\n`);
    for (const v of prioritized.slice(0, 20)) {
      const tier = v.priorityTier;
      console.log(`  ${tier}  ${v.priorityScore.toFixed(1)}  ${v.title?.slice(0, 65)}`);
      if (v.priorityReasons?.length) {
        console.log(`         ${v.priorityReasons.join(", ")}`);
      }
      console.log(`         ${v.url}`);
    }
  }

  // ── watchlist ─────────────────────────────────────────────────────────────
  else if (cmd === "--watchlist") {
    const watchlist = loadQueue();
    if (watchlist.length === 0) {
      console.log("  📋 Watchlist is empty. Run --discover first.");
      return;
    }
    console.log(`\n  📋 Study Queue (${watchlist.length} videos):\n`);
    for (let i = 0; i < Math.min(watchlist.length, 30); i++) {
      const v = watchlist[i];
      const tier = v.priorityTier || "";
      console.log(`  ${(i+1).toString().padStart(2)}. ${tier} ${v.title?.slice(0, 60)}`);
      console.log(`      ${v.url}  |  concept score: ${v.scores?.concepts || 0}  |  priority: ${v.priorityScore?.toFixed(1) || v.scores?.total?.toFixed(1) || "?"}`);
    }
  }

  // ── run (full auto) ───────────────────────────────────────────────────────
  else if (cmd === "--run") {
    console.log("╔══════════════════════════════════════════════════════════╗");
    console.log("║   ICT Video Learning Pipeline — Auto Mode              ║");
    console.log("╚══════════════════════════════════════════════════════════╝");

    // 1. Discover
    const videos = discoverVideos(50);
    if (!videos || videos.length === 0) {
      console.log("  ❌ Discovery failed. Exiting.");
      return;
    }

    const newVideos = diffAgainstProcessed(videos, processed);
    console.log(`  📺 ${videos.length} total, ${newVideos.length} new`);

    if (newVideos.length === 0) {
      console.log("  ✅ All caught up — no new videos to process.");
      return;
    }

    // 2. Prioritize
    const prioritized = prioritizeWatchlist(newVideos, processed);
    saveQueue(prioritized);

    // 3. Process top 3 high-priority videos
    const topN = prioritized.filter(v => v.priorityTier === "🔥 HIGH").slice(0, 3);
    if (topN.length === 0) {
      // Fall back to top 2 overall
      topN.push(...prioritized.slice(0, 2));
    }

    console.log(`\n  🎯 Processing top ${topN.length} priority videos:\n`);
    for (const v of topN) {
      console.log(`     ${v.title?.slice(0, 60)}`);
    }

    for (const v of topN) {
      processed = await processVideo(v.id, processed);
    }

    processed.lastDiscovery = new Date().toISOString();
    saveProcessed(processed);

    console.log(`\n  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`  ✅ Pipeline complete`);
    console.log(`  📚 Concept index: ${Object.keys(processed.conceptIndex).length} entries`);
    console.log(`  📺 Processed videos: ${Object.keys(processed.videos).length}`);
    console.log(`  📋 Watchlist remaining: ${prioritized.length - topN.length}`);
    console.log(`  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`\n  Next: /watch a video from the watchlist for visual frame analysis`);
    console.log(`  Or: node tools/ict_video_pipeline.cjs --watchlist`);
  }

  // ── stats ─────────────────────────────────────────────────────────────────
  else if (cmd === "--stats") {
    console.log(`\n  📊 ICT Video Pipeline Stats`);
    console.log(`  ${"─".repeat(40)}`);
    console.log(`  Processed videos:   ${Object.keys(processed.videos).length}`);
    console.log(`  Indexed concepts:   ${Object.keys(processed.conceptIndex || {}).length}`);
    console.log(`  Last discovery:     ${processed.lastDiscovery || "never"}`);

    const watchlist = loadQueue();
    console.log(`  Watchlist queue:    ${watchlist.length}`);

    // Breakdown by category
    const cats = {};
    for (const [key, val] of Object.entries(processed.conceptIndex || {})) {
      const cat = val.category || "Uncategorized";
      cats[cat] = (cats[cat] || 0) + 1;
    }
    console.log(`\n  Concepts by category:`);
    for (const [cat, count] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cat}: ${count}`);
    }

    // Unwatched high-priority concepts from trade graph gaps
    console.log(`\n  💡 Tip: run --prioritize to rank videos against your P&L gaps`);
  }

  // ── help ──────────────────────────────────────────────────────────────────
  else {
    console.log(`
ICT Video Learning Pipeline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  node tools/ict_video_pipeline.cjs --discover [max]
      Scan ICT's channel for new videos, save to watchlist

  node tools/ict_video_pipeline.cjs --fetch VID1,VID2
      Download transcripts only (no video) for given video IDs

  node tools/ict_video_pipeline.cjs --process VIDEO_ID
      Full pipeline for one video: fetch → summarize → index

  node tools/ict_video_pipeline.cjs --prioritize
      Rank watchlist by relevance to your losing trade patterns

  node tools/ict_video_pipeline.cjs --watchlist
      Show your prioritized study queue

  node tools/ict_video_pipeline.cjs --run
      End-to-end auto: discover → prioritize → process top 3

  node tools/ict_video_pipeline.cjs --stats
      Pipeline stats: processed count, concept index, gaps

Examples:
  # First time: discover what's out there
  node tools/ict_video_pipeline.cjs --discover

  # Process one specific video you want to learn from
  node tools/ict_video_pipeline.cjs --process C90xGr3kW8Y

  # Daily routine: check for new videos and process the most important ones
  node tools/ict_video_pipeline.cjs --run

  # See what to watch next
  node tools/ict_video_pipeline.cjs --watchlist

After processing, use /watch on a video for visual frame analysis:
  /watch https://youtu.be/VIDEO_ID
    `);
  }
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
