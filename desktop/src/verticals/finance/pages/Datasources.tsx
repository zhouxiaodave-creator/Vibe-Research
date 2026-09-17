import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Database, KeyRound, PlugZap, Server, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { backend, type DatasourceConfig, type EndpointSummary, type TushareProbeResult } from "@/lib/backend";

const TUSHARE_DEFAULTS = {
  tuaremax: "https://tuaremax.top/mcp",
  official: "https://api.tushare.pro",
};

export function Datasources() {
  const [, setConfig] = useState<DatasourceConfig | null>(null);
  const [endpoints, setEndpoints] = useState<EndpointSummary[]>([]);
  const [tushareMode, setTushareMode] = useState<"tuaremax" | "official">("tuaremax");
  const [tushareToken, setTushareToken] = useState("");
  const [tushareUrl, setTushareUrl] = useState(TUSHARE_DEFAULTS.tuaremax);
  const [probe, setProbe] = useState<TushareProbeResult | null>(null);
  const [probeBusy, setProbeBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const [cfg, eps] = await Promise.all([backend.datasourcesConfig(), backend.endpoints()]);
    setConfig(cfg);
    setEndpoints(eps);
    if (cfg.tushare) {
      setTushareMode(cfg.tushare.mode);
      setTushareToken(cfg.tushare.token);
      setTushareUrl(cfg.tushare.base_url);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const grouped = useMemo(() => {
    const m = new Map<string, EndpointSummary[]>();
    for (const e of endpoints) {
      const key = e.layer || "其他";
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(e);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh"));
  }, [endpoints]);

  const filtered = useMemo(() => {
    if (!query.trim()) return grouped;
    const q = query.trim().toLowerCase();
    return grouped
      .map(([layer, eps]) => [layer, eps.filter((e) => `${e.id} ${e.title} ${e.source}`.toLowerCase().includes(q))] as const)
      .filter(([, eps]) => eps.length > 0);
  }, [grouped, query]);

  const toggleEndpoint = async (id: string, enabled: boolean) => {
    setConfig((c) => c ? { ...c, endpoints: { ...c.endpoints, [id]: { ...c.endpoints[id], enabled } } } : c);
    setEndpoints((eps) => eps.map((e) => (e.id === id ? { ...e, enabled } : e)));
    await backend.saveDatasourcesConfig({ endpoints: { [id]: { enabled } } });
  };

  const saveTushare = async () => {
    setSaveBusy(true);
    setSaveMsg("");
    try {
      const next = await backend.saveDatasourcesConfig({
        tushare: { mode: tushareMode, token: tushareToken.trim(), base_url: tushareUrl.trim() || TUSHARE_DEFAULTS[tushareMode] },
      });
      setConfig(next);
      setSaveMsg("已保存");
    } catch (err) {
      setSaveMsg(`保存失败:${String(err)}`);
    } finally {
      setSaveBusy(false);
    }
  };

  const testTushare = async () => {
    setProbeBusy(true);
    setProbe(null);
    try {
      const r = await backend.probeTushare({
        mode: tushareMode,
        token: tushareToken.trim(),
        base_url: tushareUrl.trim() || TUSHARE_DEFAULTS[tushareMode],
      });
      setProbe(r);
    } catch (err) {
      setProbe({ ok: false, mode: tushareMode, message: String(err), duration_ms: 0 });
    } finally {
      setProbeBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <PageHeader title="数据源" subtitle="配置 Tushare 与 117 个内置数据端点" />

      <GlassCard className="p-5">
        <div className="mb-4 flex items-center gap-2">
          <PlugZap className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Tushare 数据源</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">接入方式</label>
            <select
              value={tushareMode}
              onChange={(e) => {
                const m = e.target.value as "tuaremax" | "official";
                setTushareMode(m);
                setTushareUrl(TUSHARE_DEFAULTS[m]);
              }}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="tuaremax">tuaremax 代理（默认）</option>
              <option value="official">官方 Tushare</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">API 地址</label>
            <input
              value={tushareUrl}
              onChange={(e) => setTushareUrl(e.target.value)}
              placeholder={TUSHARE_DEFAULTS[tushareMode]}
              className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Token</label>
            <input
              type="password"
              value={tushareToken}
              onChange={(e) => setTushareToken(e.target.value)}
              placeholder={tushareMode === "official" ? "官方 40 位 token" : "tuaremax 60 位 token"}
              className="w-full rounded-lg border bg-background px-3 py-2 font-mono text-xs"
            />
          </div>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => void testTushare()} disabled={probeBusy || !tushareToken.trim()}
            className="rounded-lg border border-primary/40 px-4 py-2 text-sm text-primary disabled:opacity-60">
            {probeBusy ? "测试中…" : "测试连接"}
          </button>
          <button onClick={() => void saveTushare()} disabled={saveBusy}
            className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-60">
            {saveBusy ? "保存中…" : "保存"}
          </button>
          {probe && (
            <span className={`flex items-center gap-1 text-sm ${probe.ok ? "text-success" : "text-destructive"}`}>
              {probe.ok ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              {probe.message}（{probe.duration_ms}ms）
            </span>
          )}
          {saveMsg && <span className="text-sm text-muted-foreground">{saveMsg}</span>}
        </div>
      </GlassCard>

      <GlassCard className="p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">内置数据端点（{endpoints.length}）</h2>
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索端点 / 数据源"
            className="w-64 rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="space-y-5">
          {filtered.map(([layer, eps]) => (
            <div key={layer}>
              <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{layer}（{eps.length}）</h3>
              <div className="space-y-2">
                {eps.map((e) => (
                  <div key={e.id} className="flex items-start justify-between gap-3 rounded-lg border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{e.id}</span>
                        {e.auth_env && <KeyRound className="h-3.5 w-3.5 text-amber-500" />}
                        {e.computed && <Server className="h-3.5 w-3.5 text-sky-500" />}
                      </div>
                      <div className="mt-0.5 truncate text-sm">{e.title}</div>
                      <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                        <span>{e.source}</span>
                        <span>{e.compliance}</span>
                        <span>{e.market.join("/")}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => void toggleEndpoint(e.id, !e.enabled)}
                      aria-pressed={e.enabled}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs ${e.enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                    >
                      {e.enabled ? "启用" : "禁用"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <Disclaimer />
    </div>
  );
}
