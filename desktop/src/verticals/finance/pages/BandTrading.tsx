import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Play, RefreshCw, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { GlassCard } from "@/components/ui/GlassCard";
import { Disclaimer } from "@/components/ui/Disclaimer";
import { backend, type BandPipelineBundle } from "@/lib/backend";

const STAGE_LABEL: Record<string, string> = {
  idle: "空闲",
  paper: "模拟盘",
  evaluate: "评估",
  optimize: "优化",
};

export function BandTrading() {
  const [bundle, setBundle] = useState<BandPipelineBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const b = await backend.bandPipeline();
    setBundle(b);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      await backend.bandPipelineToggle(enabled);
      await load();
      setMsg(enabled ? "流水线已开启" : "流水线已关闭");
    } finally {
      setBusy(false);
    }
  };

  const runNow = async (action: "paper" | "evaluate") => {
    setBusy(true);
    setMsg("");
    try {
      await backend.bandPipelineRun(action);
      await load();
      setMsg(action === "paper" ? "已执行一次尾盘模拟" : "已执行一次评估");
    } finally {
      setBusy(false);
    }
  };

  const p = bundle?.pipeline;
  const paper = bundle?.paper as Record<string, unknown> | null;
  const combos = bundle?.combos ?? [];
  const positions = (paper?.positions as Record<string, Record<string, unknown>>) ?? {};
  const trades = (paper?.trades as Array<Record<string, unknown>>) ?? [];
  const equity = (paper?.equity_history as Array<Record<string, unknown>>) ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <PageHeader title="波段策略" subtitle="研究 → 模拟盘 → 评估优化 全自动流水线" />

      <GlassCard className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">自动流水线</h2>
            <span className={`rounded-full px-2 py-0.5 text-xs ${p?.enabled ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
              {p?.enabled ? "运行中" : "已关闭"}
            </span>
          </div>
          <button
            onClick={() => void toggle(!p?.enabled)}
            disabled={busy}
            aria-pressed={p?.enabled}
            className={`relative h-7 w-12 rounded-full transition-colors ${p?.enabled ? "bg-success" : "bg-muted"}`}
          >
            <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${p?.enabled ? "left-5" : "left-0.5"}`} />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">当前阶段</div>
            <div className="mt-1 font-semibold">{STAGE_LABEL[p?.stage ?? "idle"]}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">上次运行</div>
            <div className="mt-1 font-mono text-xs">{p?.last_run_at ? new Date(p.last_run_at).toLocaleString("zh-CN", { hour12: false }) : "—"}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">有效组合</div>
            <div className="mt-1 font-semibold">{combos.length} 个</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">引擎路径</div>
            <div className="mt-1 truncate font-mono text-xs">{p?.engine_path ?? "未配置"}</div>
          </div>
        </div>
        <div className="mt-4 flex gap-3">
          <button onClick={() => void runNow("paper")} disabled={busy} className="flex items-center gap-1 rounded-lg border border-primary/40 px-4 py-2 text-sm text-primary disabled:opacity-60">
            <Play className="h-4 w-4" /> 立即跑尾盘模拟
          </button>
          <button onClick={() => void runNow("evaluate")} disabled={busy} className="flex items-center gap-1 rounded-lg border border-primary/40 px-4 py-2 text-sm text-primary disabled:opacity-60">
            <RefreshCw className="h-4 w-4" /> 立即评估
          </button>
          {msg && <span className="self-center text-sm text-muted-foreground">{msg}</span>}
        </div>
        {p?.last_run_summary && (
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-muted/40 p-3 font-mono text-xs">{p.last_run_summary}</pre>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">模拟盘</h2>
        </div>
        {paper ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">现金</div>
                <div className="mt-1 font-mono">¥{Number(paper.cash).toFixed(2)}</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">持仓数</div>
                <div className="mt-1 font-mono">{Object.keys(positions).length} 只</div>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-xs text-muted-foreground">最新净值</div>
                <div className="mt-1 font-mono">¥{equity.length ? Number(equity[equity.length - 1]?.equity).toFixed(2) : "—"}</div>
              </div>
            </div>
            {Object.keys(positions).length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">当前持仓</h3>
                <div className="space-y-2">
                  {Object.entries(positions).map(([code, pos]) => (
                    <div key={code} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span className="font-mono">{code}</span>
                      <span>{Number(pos.shares)} 份 @ {Number(pos.cost).toFixed(4)}</span>
                      <span className="text-xs text-muted-foreground">{String(pos.strategy)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {trades.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-muted-foreground">交易流水（最近 8 笔）</h3>
                <div className="space-y-1">
                  {trades.slice(-8).reverse().map((t, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-lg border px-3 py-1.5 font-mono text-xs">
                      <span>{String(t.date)}</span>
                      <span className={t.side === "buy" ? "text-success" : "text-destructive"}>{t.side === "buy" ? "买入" : "卖出"}</span>
                      <span>{String(t.etf)}</span>
                      <span>{Number(t.shares)} 份 @ {Number(t.price).toFixed(4)}</span>
                      <span className="text-muted-foreground">{String(t.reason)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">模拟盘尚未初始化。开启流水线或点击「立即跑尾盘模拟」。</p>
        )}
      </GlassCard>

      <GlassCard className="p-5">
        <div className="mb-3 flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">当前有效组合</h2>
        </div>
        {combos.length ? (
          <div className="space-y-2">
            {combos.slice(0, 10).map((c, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                <span className="font-mono">{String(c.etf)} × {String(c.strategy_name)}</span>
                <span className="text-success">+{Number(c.avg_excess)}% 超额</span>
                <span className="text-xs text-muted-foreground">{JSON.stringify(c.best_params)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">暂无有效组合，请先在研究阶段跑矩阵。</p>
        )}
      </GlassCard>

      <Disclaimer />
    </div>
  );
}
