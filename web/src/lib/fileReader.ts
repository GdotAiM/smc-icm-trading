/**
 * File reader utility for the ICM dashboard.
 * Reads markdown output files from the stages/ and shared/ directories.
 */

export interface SessionData {
  pair: string;
  date: string;
  stageOutputs: Record<string, string>;
  engineReports: Record<string, unknown>;
  screenshots: string[];
}

/**
 * Read all stage outputs for the current session.
 * In the Vite dev server, files are served from the parent directory.
 * In production, a simple file server would serve them.
 */
export async function readStageOutput(
  stage: string,
  filename = "output.md",
): Promise<string | null> {
  try {
    const path = `/stages/${stage}/output/${filename}`;
    const res = await fetch(path);
    if (res.ok) return await res.text();
    return null;
  } catch {
    return null;
  }
}

/**
 * Read the engine report JSON for today's session.
 */
export async function readEngineReport(
  date: string,
  pair: string,
): Promise<unknown | null> {
  try {
    const path = `/shared/${date}/${pair}/engine_report.json`;
    const res = await fetch(path);
    if (res.ok) return await res.json();
    return null;
  } catch {
    return null;
  }
}
