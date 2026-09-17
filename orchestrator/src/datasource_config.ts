/**
 * 数据源配置(用户覆盖层):
 * - Tushare / tuaremax 接入配置(token / base_url / mode)
 * - 各端点覆盖(enabled / auth_key / sample)
 * 存储在 <dataRoot>/datasources-config.json,不进 git、不进日志。
 */
import fs from "node:fs";
import path from "node:path";
import { safePath } from "./service.ts";

export interface TushareConfig {
  mode: "tuaremax" | "official";
  token: string;
  base_url: string;
}

export interface EndpointOverride {
  enabled?: boolean;
  auth_key?: string;
  sample?: string;
}

export interface DatasourceConfig {
  version: 1;
  tushare: TushareConfig | null;
  endpoints: Record<string, EndpointOverride>;
}

export const DEFAULT_TUSHARE = {
  tuaremax: { base_url: "https://tuaremax.top/mcp" },
  official: { base_url: "https://api.tushare.pro" },
} as const;

function configPath(dataRoot: string): string {
  return safePath({ dataRoot }, "datasources-config.json");
}

export function readDatasourceConfig(dataRoot: string): DatasourceConfig {
  const p = configPath(dataRoot);
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as Partial<DatasourceConfig>;
    return {
      version: 1,
      tushare:
        raw.tushare && typeof raw.tushare === "object"
          ? {
              mode: raw.tushare.mode === "official" ? "official" : "tuaremax",
              token: String(raw.tushare.token ?? ""),
              base_url: String(raw.tushare.base_url ?? DEFAULT_TUSHARE.tuaremax.base_url),
            }
          : null,
      endpoints:
        raw.endpoints && typeof raw.endpoints === "object" ? (raw.endpoints as Record<string, EndpointOverride>) : {},
    };
  } catch {
    return { version: 1, tushare: null, endpoints: {} };
  }
}

export function writeDatasourceConfig(dataRoot: string, next: DatasourceConfig): void {
  const p = configPath(dataRoot);
  fs.mkdirSync(path.dirname(p), { recursive: true, mode: 0o700 });
  fs.writeFileSync(p, JSON.stringify(next, null, 2), { mode: 0o600 });
}

/** 校验前端提交的更新片段,返回清洗后的完整配置。 */
export function sanitizeDatasourceUpdate(dataRoot: string, patch: unknown): DatasourceConfig {
  const current = readDatasourceConfig(dataRoot);
  const p = (patch ?? {}) as Record<string, unknown>;

  if (p.tushare !== undefined) {
    if (p.tushare === null) {
      current.tushare = null;
    } else if (typeof p.tushare === "object") {
      const t = p.tushare as Record<string, unknown>;
      const mode = t.mode === "official" ? "official" : "tuaremax";
      const token = String(t.token ?? "").trim().slice(0, 200);
      const baseUrl = String(t.base_url ?? DEFAULT_TUSHARE[mode].base_url).trim().slice(0, 500);
      if (!/^https?:\/\//.test(baseUrl)) throw new Error("Tushare API 地址不合法");
      current.tushare = { mode, token, base_url: baseUrl };
    }
  }

  if (p.endpoints !== undefined && typeof p.endpoints === "object") {
    const eps = p.endpoints as Record<string, Record<string, unknown>>;
    for (const [id, ov] of Object.entries(eps)) {
      if (!/^[a-z0-9_-]{1,64}$/.test(id)) continue;
      const clean: EndpointOverride = {};
      if (typeof ov.enabled === "boolean") clean.enabled = ov.enabled;
      if (typeof ov.auth_key === "string") clean.auth_key = ov.auth_key.trim().slice(0, 500);
      if (typeof ov.sample === "string") clean.sample = ov.sample.trim().slice(0, 40);
      if (Object.keys(clean).length) current.endpoints[id] = clean;
      else delete current.endpoints[id];
    }
  }

  return current;
}
