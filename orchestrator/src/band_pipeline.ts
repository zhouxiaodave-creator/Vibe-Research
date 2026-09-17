/**
 * 波段策略自动化流水线(app 内调度器,随 app 启停):
 * 开关开启时每 5 分钟检查一次;交易日 14:55 跑尾盘模拟盘,周五 15:30 评估/优化。
 * 状态与模拟盘结果落 .local/band-pipeline.json;引擎调用 stock 仓库的 band-trading Python 脚本。
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { safePath } from "./service.ts";

const TICK_MS = 5 * 60 * 1000;

export interface BandPipelineState {
  enabled: boolean;
  stage: "idle" | "paper" | "evaluate" | "optimize";
  last_run_at: string | null;
  last_run_summary: string | null;
  engine_path: string;
  python_path: string;
}

function statePath(dataRoot: string): string {
  return safePath({ dataRoot }, "band-pipeline.json");
}

export function readBandPipeline(dataRoot: string): BandPipelineState {
  try {
    return JSON.parse(fs.readFileSync(statePath(dataRoot), "utf8")) as BandPipelineState;
  } catch {
    return {
      enabled: false,
      stage: "idle",
      last_run_at: null,
      last_run_summary: null,
      engine_path: process.env.VRA_BAND_ENGINE || path.join(process.env.HOME || "", "workspace", "stock", "band-trading"),
      python_path: "",
    };
  }
}

export function readPaperState(dataRoot: string): Record<string, unknown> | null {
  const pipeline = readBandPipeline(dataRoot);
  try {
    const p = path.join(pipeline.engine_path, "paper", "state.json");
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function readEffectiveCombos(dataRoot: string): Record<string, unknown>[] {
  const pipeline = readBandPipeline(dataRoot);
  try {
    const p = path.join(pipeline.engine_path, "data", "effective_combos.json");
    return JSON.parse(fs.readFileSync(p, "utf8")) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function writeBandPipeline(dataRoot: string, state: BandPipelineState): void {
  fs.writeFileSync(statePath(dataRoot), JSON.stringify(state, null, 2), { mode: 0o600 });
}

function runPython(python: string, script: string, cwd: string): { ok: boolean; out: string } {
  try {
    const r = spawnSync(python, [script], { cwd, encoding: "utf8", timeout: 600_000 });
    return { ok: r.status === 0, out: (r.stdout || r.stderr || "").slice(-2000) };
  } catch (err) {
    return { ok: false, out: String(err) };
  }
}

function findPython(repoRoot: string): string {
  return path.join(repoRoot, ".venv", "bin", "python");
}

function isTradingDay(date: Date): boolean {
  const day = date.getDay();
  return day >= 1 && day <= 5; // 工作日近似;精确日历由引擎内部数据决定
}

function nowHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 调度 tick:由开关和当前时间决定执行动作。 */
function tick(repoRoot: string, dataRoot: string): void {
  const state = readBandPipeline(dataRoot);
  if (!state.enabled) return;
  const now = new Date();
  const hhmm = nowHHMM(now);
  const python = state.python_path || findPython(repoRoot);

  if (!isTradingDay(now)) return;

  // 尾盘 14:55-15:05 跑模拟盘
  if (hhmm >= "1455" && hhmm <= "1505") {
    const r = runPython(python, "paper.py", state.engine_path);
    state.stage = "paper";
    state.last_run_at = now.toISOString();
    state.last_run_summary = r.out.slice(-500);
    writeBandPipeline(dataRoot, state);
    return;
  }

  // 周五 15:30-15:45 评估 + 优化
  if (now.getDay() === 5 && hhmm >= "1530" && hhmm <= "1545") {
    const r = runPython(python, "optimize.py", state.engine_path);
    state.stage = "evaluate";
    state.last_run_at = now.toISOString();
    state.last_run_summary = r.out.slice(-500);
    writeBandPipeline(dataRoot, state);
  }
}

let timer: NodeJS.Timeout | null = null;

export function startBandPipeline(repoRoot: string, dataRoot: string): void {
  if (timer) return;
  timer = setInterval(() => {
    try {
      tick(repoRoot, dataRoot);
    } catch {
      // 调度异常不抛出,避免打断 app
    }
  }, TICK_MS);
  // 启动时立即检查一次
  tick(repoRoot, dataRoot);
}

export function stopBandPipeline(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function setBandPipelineEnabled(dataRoot: string, enabled: boolean): BandPipelineState {
  const state = readBandPipeline(dataRoot);
  state.enabled = enabled;
  writeBandPipeline(dataRoot, state);
  return state;
}

export function runBandPipelineNow(repoRoot: string, dataRoot: string, action: "paper" | "evaluate"): BandPipelineState {
  const state = readBandPipeline(dataRoot);
  const python = state.python_path || findPython(repoRoot);
  const script = action === "paper" ? "paper.py" : "optimize.py";
  const r = runPython(python, script, state.engine_path);
  state.stage = action === "paper" ? "paper" : "evaluate";
  state.last_run_at = new Date().toISOString();
  state.last_run_summary = r.out.slice(-500);
  writeBandPipeline(dataRoot, state);
  return state;
}
