/**
 * Tushare 连接探针:验证 token 与接入方式是否可用。
 * - tuaremax: MCP JSON-RPC(tools/call)
 * - official: tushare.pro HTTP POST
 */
import type { TushareConfig } from "./datasource_config.ts";

export interface TushareProbeResult {
  ok: boolean;
  mode: string;
  message: string;
  sample?: Record<string, unknown>;
  duration_ms: number;
}

async function probeTuaremax(cfg: TushareConfig): Promise<TushareProbeResult> {
  const t0 = Date.now();
  const res = await fetch(cfg.base_url.replace(/\/$/, ""), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "tushare_data",
        arguments: {
          api_name: "trade_cal",
          params: { exchange: "SSE", start_date: "20260916", end_date: "20260917" },
        },
      },
    }),
  });
  const json = (await res.json()) as Record<string, unknown>;
  const duration = Date.now() - t0;
  const content = (json as { result?: { content?: Array<{ text?: string }>; isError?: boolean } }).result;
  if (content?.isError || typeof content?.content?.[0]?.text !== "string") {
    return { ok: false, mode: "tuaremax", message: String(content?.content?.[0]?.text ?? "无返回"), duration_ms: duration };
  }
  const inner = JSON.parse(content.content[0].text) as { code?: number; msg?: string; data?: unknown };
  if (inner.code !== 0) {
    return { ok: false, mode: "tuaremax", message: inner.msg || `错误码 ${inner.code}`, duration_ms: duration };
  }
  return { ok: true, mode: "tuaremax", message: "连接成功", sample: inner.data as Record<string, unknown>, duration_ms: duration };
}

async function probeOfficial(cfg: TushareConfig): Promise<TushareProbeResult> {
  const t0 = Date.now();
  const res = await fetch(cfg.base_url.replace(/\/$/, ""), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_name: "trade_cal",
      token: cfg.token,
      params: { exchange: "SSE", start_date: "20260916", end_date: "20260917" },
      fields: "exchange,cal_date,is_open",
    }),
  });
  const json = (await res.json()) as { code?: number; msg?: string; data?: unknown };
  const duration = Date.now() - t0;
  if (json.code !== 0) {
    return { ok: false, mode: "official", message: json.msg || `错误码 ${json.code}`, duration_ms: duration };
  }
  return { ok: true, mode: "official", message: "连接成功", sample: json.data as Record<string, unknown>, duration_ms: duration };
}

export async function probeTushare(cfg: TushareConfig): Promise<TushareProbeResult> {
  if (!cfg.token) return { ok: false, mode: cfg.mode, message: "未填写 token", duration_ms: 0 };
  try {
    return cfg.mode === "official" ? await probeOfficial(cfg) : await probeTuaremax(cfg);
  } catch (err) {
    return { ok: false, mode: cfg.mode, message: String((err as Error).message || err), duration_ms: 0 };
  }
}
