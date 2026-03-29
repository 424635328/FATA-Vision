"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import Visualization from "@/components/Visualization";
import {
  ALGORITHM_OPTIONS,
  CUSTOM_JS_TEMPLATE,
  getEditorContent
} from "@/lib/algorithm-templates";
import { OBJECTIVE_OPTIONS } from "@/lib/objectives";
import type {
  AlgorithmKey,
  AlgorithmResponse,
  ObjectiveFunctionName,
  RunAlgorithmRequest
} from "@/lib/types";

const DEFAULT_AGENT_COUNT = 18;
const DEFAULT_MAX_FES = 80;
const DEFAULT_PLAYBACK_MS = 180;
const MIN_PLAYBACK_MS = 1;
const MAX_PLAYBACK_MS = 5000;
const PLAYBACK_PRESETS = [
  { label: "极速", value: 20 },
  { label: "快速", value: 60 },
  { label: "标准", value: DEFAULT_PLAYBACK_MS },
  { label: "慢速", value: 500 },
  { label: "演示", value: 1200 }
] as const;

function clampPlaybackSpeed(value: number) {
  return Math.min(Math.max(Math.round(value), MIN_PLAYBACK_MS), MAX_PLAYBACK_MS);
}

export default function HomePage() {
  const [algorithmKey, setAlgorithmKey] = useState<AlgorithmKey>("pso");
  const [algorithmCode, setAlgorithmCode] = useState(CUSTOM_JS_TEMPLATE);
  const [objective, setObjective] = useState<ObjectiveFunctionName>("rastrigin");
  const [populationSize, setPopulationSize] = useState(DEFAULT_AGENT_COUNT);
  const [maxFEs, setMaxFEs] = useState(DEFAULT_MAX_FES);
  const [lbX, setLbX] = useState(-5.12);
  const [lbY, setLbY] = useState(-5.12);
  const [ubX, setUbX] = useState(5.12);
  const [ubY, setUbY] = useState(5.12);
  const [speedMs, setSpeedMs] = useState(DEFAULT_PLAYBACK_MS);
  const [speedMsInput, setSpeedMsInput] = useState(String(DEFAULT_PLAYBACK_MS));
  const [fpsInput, setFpsInput] = useState((1000 / DEFAULT_PLAYBACK_MS).toFixed(2));
  const [selectedAgents, setSelectedAgents] = useState<number[]>([]);
  const [selectedMetricKey, setSelectedMetricKey] = useState<string>("");
  const [loopPlayback, setLoopPlayback] = useState(false);
  const [result, setResult] = useState<AlgorithmResponse | null>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isComputing, setIsComputing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const animationRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);
  const accumulatedTimeRef = useRef(0);

  const totalFrames = result?.history.length ?? 0;
  const effectiveAgentCount = result?.history[0]?.positions.length ?? populationSize;
  const currentSnapshot = result?.history[Math.min(currentFrameIndex, Math.max(totalFrames - 1, 0))];
  const editorValue = getEditorContent(algorithmKey, algorithmCode);
  const selectedAlgorithm = ALGORITHM_OPTIONS.find((item) => item.value === algorithmKey);
  const playbackFps = 1000 / Math.max(speedMs, 1);
  const playbackMultiplier = DEFAULT_PLAYBACK_MS / Math.max(speedMs, 1);
  const progressPercent =
    totalFrames > 1 ? ((currentFrameIndex + 1) / totalFrames) * 100 : 0;

  const availableMetricKeys = useMemo(() => {
    if (!result) {
      return [];
    }

    const metricSet = new Set<string>();

    for (const frame of result.history) {
      for (const key of Object.keys(frame.metrics ?? {})) {
        metricSet.add(key);
      }
    }

    return Array.from(metricSet);
  }, [result]);

  const agentOptions = useMemo(() => {
    return Array.from({ length: effectiveAgentCount }, (_, index) => ({
      label: `Agent ${index + 1}`,
      value: index
    }));
  }, [effectiveAgentCount]);

  useEffect(() => {
    if (!result || !isPlaying) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      lastTickRef.current = null;
      accumulatedTimeRef.current = 0;
      return;
    }

    const frameCount = result.history.length;

    const tick = (timestamp: number) => {
      if (lastTickRef.current === null) {
        lastTickRef.current = timestamp;
        accumulatedTimeRef.current = 0;
      }

      // 这里改成“累计时间差”模型：
      // 1. 用户可以输入非常快或非常慢的自定义速度；
      // 2. 浏览器某一帧如果卡顿，不会只推进 1 帧，而是会按累计时间补齐多帧；
      // 3. 这样快放时更稳定，慢放时也不会因为重置 timestamp 而产生明显漂移。
      const elapsed = timestamp - lastTickRef.current;
      lastTickRef.current = timestamp;
      accumulatedTimeRef.current += elapsed;

      if (accumulatedTimeRef.current >= speedMs) {
        const stepsToAdvance = Math.max(
          1,
          Math.floor(accumulatedTimeRef.current / speedMs)
        );
        accumulatedTimeRef.current -= stepsToAdvance * speedMs;

        setCurrentFrameIndex((previousFrame) => {
          if (frameCount <= 1) {
            setIsPlaying(false);
            return 0;
          }

          let nextFrame = previousFrame + stepsToAdvance;

          if (nextFrame >= frameCount) {
            if (loopPlayback) {
              nextFrame %= frameCount;
            } else {
              setIsPlaying(false);
              return frameCount - 1;
            }
          }

          return nextFrame;
        });
      }

      animationRef.current = requestAnimationFrame(tick);
    };

    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      lastTickRef.current = null;
      accumulatedTimeRef.current = 0;
    };
  }, [isPlaying, loopPlayback, result, speedMs]);

  useEffect(() => {
    setSpeedMsInput(String(speedMs));
    setFpsInput(playbackFps.toFixed(2));
  }, [playbackFps, speedMs]);

  useEffect(() => {
    if (!result) {
      return;
    }

    setSelectedAgents((previousSelected) =>
      previousSelected.filter((agentIndex) => agentIndex < effectiveAgentCount)
    );
  }, [effectiveAgentCount, result]);

  useEffect(() => {
    if (availableMetricKeys.length === 0) {
      setSelectedMetricKey("");
      return;
    }

    setSelectedMetricKey((previousMetricKey) => {
      if (previousMetricKey && availableMetricKeys.includes(previousMetricKey)) {
        return previousMetricKey;
      }

      return availableMetricKeys[0];
    });
  }, [availableMetricKeys]);

  function applyPlaybackSpeed(nextSpeedMs: number) {
    const clampedSpeed = clampPlaybackSpeed(nextSpeedMs);

    setSpeedMs(clampedSpeed);
    lastTickRef.current = null;
    accumulatedTimeRef.current = 0;
  }

  function commitSpeedMsInput() {
    const parsed = Number(speedMsInput);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setSpeedMsInput(String(speedMs));
      return;
    }

    applyPlaybackSpeed(parsed);
  }

  function commitFpsInput() {
    const parsed = Number(fpsInput);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFpsInput(playbackFps.toFixed(2));
      return;
    }

    applyPlaybackSpeed(1000 / parsed);
  }

  async function handleRunAlgorithm() {
    setIsComputing(true);
    setErrorMessage(null);
    setIsPlaying(false);
    setCurrentFrameIndex(0);
    lastTickRef.current = null;
    accumulatedTimeRef.current = 0;

    try {
      const payload: RunAlgorithmRequest = {
        algorithmKey,
        algorithmCode: algorithmKey === "custom-js" ? algorithmCode : undefined,
        params: {
          N: populationSize,
          MaxFEs: maxFEs,
          dim: 2,
          lb: [lbX, lbY],
          ub: [ubX, ubY],
          objective
        }
      };

      const response = await fetch("/api/run-algorithm", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = (await response.json()) as AlgorithmResponse & {
        message?: string;
      };

      if (!response.ok) {
        throw new Error(data.message ?? "算法运行失败。");
      }

      setResult(data);
      setSelectedAgents([]);
      setCurrentFrameIndex(0);
      setIsPlaying(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "算法运行失败。");
    } finally {
      setIsComputing(false);
    }
  }

  function handlePlay() {
    if (!result) {
      return;
    }

    if (currentFrameIndex >= result.history.length - 1) {
      setCurrentFrameIndex(0);
    }

    lastTickRef.current = null;
    accumulatedTimeRef.current = 0;
    setIsPlaying(true);
  }

  function handlePause() {
    setIsPlaying(false);
  }

  function handleReset() {
    setIsPlaying(false);
    setCurrentFrameIndex(0);
    lastTickRef.current = null;
    accumulatedTimeRef.current = 0;
  }

  function handlePrevFrame() {
    setIsPlaying(false);
    lastTickRef.current = null;
    accumulatedTimeRef.current = 0;
    setCurrentFrameIndex((previousFrame) => Math.max(previousFrame - 1, 0));
  }

  function handleNextFrame() {
    setIsPlaying(false);
    lastTickRef.current = null;
    accumulatedTimeRef.current = 0;
    setCurrentFrameIndex((previousFrame) =>
      Math.min(previousFrame + 1, Math.max(totalFrames - 1, 0))
    );
  }

  function handleExportResult() {
    if (!result) {
      return;
    }

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      config: {
        algorithmKey,
        objective,
        N: populationSize,
        MaxFEs: maxFEs,
        dim: 2,
        lb: [lbX, lbY],
        ub: [ubX, ubY],
        speedMs
      },
      result
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${algorithmKey}-${objective}-history.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function toggleAgent(agentIndex: number) {
    setSelectedAgents((previousSelected) => {
      if (previousSelected.includes(agentIndex)) {
        return previousSelected.filter((value) => value !== agentIndex);
      }

      return [...previousSelected, agentIndex].sort((a, b) => a - b);
    });
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-6 xl:px-8">
      <div className="mx-auto flex w-full max-w-[1700px] flex-col gap-6">
        <section className="glass-card overflow-hidden px-6 py-7 md:px-8">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-4xl space-y-4">
              <p className="text-sm uppercase tracking-[0.32em] text-cyan-300/80">
                Heuristic Optimization Visual Lab
              </p>
              <div className="space-y-3">
                <h1 className="text-3xl font-semibold tracking-tight text-white md:text-5xl">
                  启发式优化算法寻优过程动态可视化平台
                </h1>
                <p className="max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
                  这个示例工程基于 Next.js App Router、Tailwind CSS 和 Plotly.js，
                  支持一次性获取完整迭代历史，再由前端按可调速度回放 2D 搜索空间轨迹、适应度收敛曲线与参数变化。
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Current Iter</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {currentSnapshot?.iteration ?? 0}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Best Score</p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {currentSnapshot?.currentBestScore?.toExponential(3) ?? "--"}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Playback</p>
                <div className="mt-2 space-y-1">
                  <p className="text-2xl font-semibold text-white">
                    {isPlaying ? "Playing" : "Paused"}
                  </p>
                  <p className="text-xs text-cyan-200">
                    {playbackFps.toFixed(2)} FPS / {playbackMultiplier.toFixed(2)}x
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <aside className="glass-card h-fit p-5 md:p-6 xl:sticky xl:top-6">
            <div className="space-y-6">
              <section className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <div>
                    <label className="panel-label">算法类型</label>
                    <select
                      className="panel-select"
                      value={algorithmKey}
                      onChange={(event) => setAlgorithmKey(event.target.value as AlgorithmKey)}
                    >
                      {ALGORITHM_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="panel-label">目标函数</label>
                    <select
                      className="panel-select"
                      value={objective}
                      onChange={(event) => setObjective(event.target.value as ObjectiveFunctionName)}
                    >
                      {OBJECTIVE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="mb-3 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-500">Algorithm Note</p>
                    <p className="mt-2 text-sm leading-6 text-slate-300">
                      {selectedAlgorithm?.description}
                    </p>
                  </div>

                  <label className="panel-label">算法代码 / 模板</label>
                  <textarea
                    className="panel-input min-h-[260px] resize-y font-mono text-[13px] leading-6"
                    value={editorValue}
                    readOnly={algorithmKey !== "custom-js"}
                    onChange={(event) => setAlgorithmCode(event.target.value)}
                    spellCheck={false}
                  />
                  <p className="mt-2 text-xs leading-6 text-slate-400">
                    选择“自定义 JS”后，API 会按 <code>runAlgorithm(context)</code> 契约执行该代码。
                  </p>
                </div>
              </section>

              <section className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="panel-label">种群数量 N</label>
                    <input
                      className="panel-input"
                      type="number"
                      min={2}
                      max={200}
                      value={populationSize}
                      onChange={(event) => setPopulationSize(Number(event.target.value))}
                    />
                  </div>

                  <div>
                    <label className="panel-label">最大迭代 MaxFEs</label>
                    <input
                      className="panel-input"
                      type="number"
                      min={1}
                      max={5000}
                      value={maxFEs}
                      onChange={(event) => setMaxFEs(Number(event.target.value))}
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="panel-label">下界 lb = [x, y]</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className="panel-input"
                        type="number"
                        step="0.01"
                        value={lbX}
                        onChange={(event) => setLbX(Number(event.target.value))}
                      />
                      <input
                        className="panel-input"
                        type="number"
                        step="0.01"
                        value={lbY}
                        onChange={(event) => setLbY(Number(event.target.value))}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="panel-label">上界 ub = [x, y]</label>
                    <div className="grid grid-cols-2 gap-3">
                      <input
                        className="panel-input"
                        type="number"
                        step="0.01"
                        value={ubX}
                        onChange={(event) => setUbX(Number(event.target.value))}
                      />
                      <input
                        className="panel-input"
                        type="number"
                        step="0.01"
                        value={ubY}
                        onChange={(event) => setUbY(Number(event.target.value))}
                      />
                    </div>
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <label className="panel-label !mb-0">动画暂停时长</label>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-200">
                        {speedMs} ms / 帧
                      </span>
                      <span className="rounded-full border border-orange-300/20 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-200">
                        {playbackFps.toFixed(2)} FPS
                      </span>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <label className="panel-label">精确速度 ms/frame</label>
                      <input
                        className="panel-input"
                        type="number"
                        min={MIN_PLAYBACK_MS}
                        max={MAX_PLAYBACK_MS}
                        step={1}
                        value={speedMsInput}
                        onChange={(event) => setSpeedMsInput(event.target.value)}
                        onBlur={commitSpeedMsInput}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitSpeedMsInput();
                          }
                        }}
                      />
                    </div>

                    <div>
                      <label className="panel-label">换算速度 FPS</label>
                      <input
                        className="panel-input"
                        type="number"
                        min={0.2}
                        max={1000}
                        step={0.1}
                        value={fpsInput}
                        onChange={(event) => setFpsInput(event.target.value)}
                        onBlur={commitFpsInput}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            commitFpsInput();
                          }
                        }}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {PLAYBACK_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                          speedMs === preset.value
                            ? "border-cyan-300/40 bg-cyan-400/10 text-cyan-100"
                            : "border-white/10 bg-slate-900/50 text-slate-300 hover:border-white/20"
                        }`}
                        type="button"
                        onClick={() => applyPlaybackSpeed(preset.value)}
                      >
                        {preset.label} · {preset.value}ms
                      </button>
                    ))}
                  </div>

                  <input
                    className="mt-4 h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-orange-400"
                    type="range"
                    min={MIN_PLAYBACK_MS}
                    max={MAX_PLAYBACK_MS}
                    step={1}
                    value={speedMs}
                    onChange={(event) => applyPlaybackSpeed(Number(event.target.value))}
                  />
                  <div className="mt-2 flex justify-between text-xs text-slate-500">
                    <span>{MIN_PLAYBACK_MS}ms</span>
                    <span>{MAX_PLAYBACK_MS}ms</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-xs text-slate-400">
                    <span>支持自定义 1 到 5000 ms/帧，也可直接输入 FPS。</span>
                    <span className="font-semibold text-slate-200">
                      当前速度 {playbackMultiplier.toFixed(2)}x
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <button
                    className="panel-button-primary"
                    type="button"
                    disabled={isComputing}
                    onClick={handleRunAlgorithm}
                  >
                    {isComputing ? "计算中..." : "开始计算"}
                  </button>
                  <button
                    className="panel-button-secondary"
                    type="button"
                    disabled={!result}
                    onClick={handlePlay}
                  >
                    播放
                  </button>
                  <button
                    className="panel-button-secondary"
                    type="button"
                    disabled={!result}
                    onClick={handlePause}
                  >
                    暂停
                  </button>
                  <button
                    className="panel-button-danger"
                    type="button"
                    disabled={!result}
                    onClick={handleReset}
                  >
                    重置
                  </button>
                  <button
                    className="panel-button-secondary"
                    type="button"
                    disabled={!result}
                    onClick={handlePrevFrame}
                  >
                    上一帧
                  </button>
                  <button
                    className="panel-button-secondary"
                    type="button"
                    disabled={!result}
                    onClick={handleNextFrame}
                  >
                    下一帧
                  </button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-slate-950/35 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <label className="panel-label !mb-1">当前回放进度</label>
                      <p className="text-sm text-slate-300">
                        第 {currentSnapshot?.iteration ?? 0} / {totalFrames} 代
                      </p>
                    </div>
                    <span className="text-xs text-slate-500">
                      进度 {progressPercent.toFixed(1)}% / 选中 {selectedAgents.length || "全部"} 个体
                    </span>
                  </div>
                  <input
                    className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-800 accent-cyan-400"
                    type="range"
                    min={0}
                    max={Math.max(totalFrames - 1, 0)}
                    step={1}
                    value={Math.min(currentFrameIndex, Math.max(totalFrames - 1, 0))}
                    disabled={!result}
                    onChange={(event) => {
                      setIsPlaying(false);
                      lastTickRef.current = null;
                      accumulatedTimeRef.current = 0;
                      setCurrentFrameIndex(Number(event.target.value));
                    }}
                  />
                </div>

                <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-500 bg-transparent accent-cyan-400"
                    checked={loopPlayback}
                    onChange={(event) => setLoopPlayback(event.target.checked)}
                  />
                  <span>播放到末尾后自动循环</span>
                </label>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="panel-label !mb-1">观察点定向追踪</label>
                    <p className="text-xs leading-6 text-slate-400">
                      不勾选时显示全部个体；勾选后仅显示所选个体，并额外绘制它们的历史轨迹。
                    </p>
                  </div>
                  <button
                    className="text-xs font-semibold text-cyan-300 transition hover:text-cyan-200"
                    type="button"
                    onClick={() => setSelectedAgents([])}
                  >
                    清空选择
                  </button>
                </div>

                <div className="max-h-56 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/35 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {agentOptions.map((agent) => {
                      const checked = selectedAgents.includes(agent.value);

                      return (
                        <label
                          key={agent.value}
                          className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                            checked
                              ? "border-cyan-400/40 bg-cyan-400/10 text-cyan-100"
                              : "border-white/5 bg-slate-900/40 text-slate-300 hover:border-white/10"
                          }`}
                        >
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-500 bg-transparent accent-orange-400"
                            checked={checked}
                            onChange={() => toggleAgent(agent.value)}
                          />
                          <span>{agent.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <label className="panel-label !mb-1">参数曲线指标</label>
                    <p className="text-xs leading-6 text-slate-400">
                      自动读取算法返回的 <code>metrics</code> 字段，可切换查看不同参数。
                    </p>
                  </div>
                  <button
                    className="text-xs font-semibold text-orange-300 transition hover:text-orange-200"
                    type="button"
                    disabled={!result}
                    onClick={handleExportResult}
                  >
                    导出结果 JSON
                  </button>
                </div>

                <select
                  className="panel-select"
                  value={selectedMetricKey}
                  disabled={availableMetricKeys.length === 0}
                  onChange={(event) => setSelectedMetricKey(event.target.value)}
                >
                  {availableMetricKeys.length === 0 ? (
                    <option value="">暂无可选指标</option>
                  ) : (
                    availableMetricKeys.map((metricKey) => (
                      <option key={metricKey} value={metricKey}>
                        {metricKey}
                      </option>
                    ))
                  )}
                </select>

                <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-4 py-3 text-sm text-slate-300">
                  当前全局最优位置：
                  <span className="ml-2 font-mono text-cyan-200">
                    {result
                      ? `[${result.bestPos[0].toFixed(4)}, ${result.bestPos[1].toFixed(4)}]`
                      : "--"}
                  </span>
                </div>
              </section>

              {errorMessage ? (
                <section className="rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {errorMessage}
                </section>
              ) : null}
            </div>
          </aside>

          <section className="min-w-0">
            <Visualization
              result={result}
              currentFrameIndex={currentFrameIndex}
              selectedAgents={selectedAgents}
              selectedMetricKey={selectedMetricKey}
              objective={objective}
              bounds={{
                lb: [lbX, lbY],
                ub: [ubX, ubY]
              }}
            />
          </section>
        </div>
      </div>
    </main>
  );
}
