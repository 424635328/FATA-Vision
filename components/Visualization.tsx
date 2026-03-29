"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useMemo, useRef, useState, useEffect } from "react";

import { buildObjectiveGrid, getKnownGlobalOptimum } from "@/lib/objectives";
import type { AlgorithmResponse, ObjectiveFunctionName } from "@/lib/types";

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent"></div>
    </div>
  )
}) as ComponentType<any>;

const TRACK_COLORS = [
  "#f97316",
  "#22d3ee",
  "#facc15",
  "#38bdf8",
  "#fb7185",
  "#4ade80",
  "#c084fc",
  "#f59e0b"
];

// 智能计算等高线步长，平衡精度与性能
function getOptimalContourSteps(dataSize: number): number {
  if (dataSize > 200) return 40; // 大数据量降低精度
  if (dataSize > 100) return 50; // 中等数据量
  return 60; // 小数据量保持高精度
}

// 轨迹采样率，避免过多数据点
function getTrajectorySampleRate(totalFrames: number): number {
  if (totalFrames <= 50) return 1; // 50帧以内不采样
  if (totalFrames <= 200) return 2; // 200帧以内每2帧取1
  if (totalFrames <= 500) return 4; // 500帧以内每4帧取1
  return 8; // 超过500帧每8帧取1
}

type VisualizationProps = {
  result: AlgorithmResponse | null;
  currentFrameIndex: number;
  selectedAgents: number[];
  selectedMetricKey: string;
  objective: ObjectiveFunctionName;
  bounds: {
    lb: [number, number];
    ub: [number, number];
  };
};

// 缓存ChartLayout，避免重复创建
const chartLayoutCache = new Map<string, any>();

function createChartLayout(title: string, height: number) {
  const cacheKey = `${title}-${height}`;
  if (chartLayoutCache.has(cacheKey)) {
    return chartLayoutCache.get(cacheKey);
  }

  const layout = {
    title: {
      text: title,
      font: {
        size: 16,
        color: "#f8fafc"
      },
      x: 0.03
    },
    autosize: true,
    height,
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(8, 17, 29, 0.55)",
    font: {
      color: "#cbd5e1",
      family: "var(--font-display)"
    },
    margin: {
      l: 56,
      r: 24,
      t: 56,
      b: 48
    },
    xaxis: {
      gridcolor: "rgba(148, 163, 184, 0.12)",
      zerolinecolor: "rgba(148, 163, 184, 0.2)"
    },
    yaxis: {
      gridcolor: "rgba(148, 163, 184, 0.12)",
      zerolinecolor: "rgba(148, 163, 184, 0.2)"
    },
    legend: {
      orientation: "h",
      y: 1.13,
      x: 0.01
    }
  };

  // 限制缓存大小
  if (chartLayoutCache.size > 20) {
    chartLayoutCache.clear();
  }
  chartLayoutCache.set(cacheKey, layout);
  return layout;
}

export default function Visualization({
  result,
  currentFrameIndex,
  selectedAgents,
  selectedMetricKey,
  objective,
  bounds
}: VisualizationProps) {
  const previousFrameIndexRef = useRef<number>(-1);
  const [isFrameChanging, setIsFrameChanging] = useState(false);

  // 所有 Hooks 必须放在条件语句之前！
  // Plot配置优化，提升性能
  const plotConfig = useMemo(() => ({
    responsive: true,
    displaylogo: false,
    displayModeBar: false, // 隐藏模式栏，减少UI元素
    staticPlot: false,
    doubleClick: false,
    scrollZoom: false,
    showTips: false
  }), []);

  // 检测帧变化，用于优化渲染
  useEffect(() => {
    if (previousFrameIndexRef.current !== currentFrameIndex) {
      setIsFrameChanging(true);
      previousFrameIndexRef.current = currentFrameIndex;
      const timer = setTimeout(() => setIsFrameChanging(false), 50);
      return () => clearTimeout(timer);
    }
  }, [currentFrameIndex]);

  // 根据数据量动态计算等高线精度
  const dataSize = result?.history.length ?? 0;
  const contourSteps = useMemo(() => getOptimalContourSteps(dataSize), [dataSize]);

  const contourGrid = useMemo(() => {
    return buildObjectiveGrid({
      objective,
      lb: bounds.lb,
      ub: bounds.ub,
      steps: contourSteps
    });
  }, [bounds.lb, bounds.ub, objective, contourSteps]);

  const currentFrame =
    result?.history[
      Math.min(currentFrameIndex, Math.max((result?.history.length ?? 1) - 1, 0))
    ];
  const optimum = getKnownGlobalOptimum(objective);

  const searchSpaceData = useMemo(() => {
    if (!result || !currentFrame) {
      return [];
    }

    const showAllAgents = selectedAgents.length === 0;
    const visibleAgentIndices = showAllAgents
      ? currentFrame.positions.map((_, index) => index)
      : selectedAgents.filter((index) => currentFrame.positions[index]);

    // 智能采样轨迹点，减少渲染负载
    const sampleRate = getTrajectorySampleRate(result.history.length);
    
    const trajectoryTraces = !showAllAgents
      ? visibleAgentIndices.map((agentIndex) => {
          // 使用采样减少数据点数量
          const pathFrames = result.history.slice(0, currentFrameIndex + 1);
          const sampledFrames = pathFrames.filter((_, idx) => idx % sampleRate === 0);
          // 确保最后一帧总是被包含
          if (sampledFrames[sampledFrames.length - 1] !== pathFrames[pathFrames.length - 1]) {
            sampledFrames.push(pathFrames[pathFrames.length - 1]);
          }
          
          const path = sampledFrames.map((frame) => frame.positions[agentIndex]);

          return {
            type: "scatter",
            mode: "lines",
            name: `个体 ${agentIndex + 1} 轨迹`,
            x: path.map((point) => point[0]),
            y: path.map((point) => point[1]),
            line: {
              color: TRACK_COLORS[agentIndex % TRACK_COLORS.length],
              width: showAllAgents ? 2 : 2.5
            },
            hovertemplate: `个体 ${agentIndex + 1} 轨迹<br>x=%{x:.3f}<br>y=%{y:.3f}<extra></extra>`
          };
        })
      : [];

    const currentPointsTrace = {
      type: "scatter",
      mode: "markers",
      name: showAllAgents ? "当前种群" : "选中个体",
      x: visibleAgentIndices.map((index) => currentFrame.positions[index][0]),
      y: visibleAgentIndices.map((index) => currentFrame.positions[index][1]),
      text: visibleAgentIndices.map((index) => `个体 ${index + 1}`),
      marker: {
        size: showAllAgents ? (visibleAgentIndices.length > 30 ? 8 : 11) : 14,
        color: visibleAgentIndices.map((index) => TRACK_COLORS[index % TRACK_COLORS.length]),
        line: {
          color: "#f8fafc",
          width: showAllAgents ? 1 : 1.2
        }
      },
      hovertemplate: "%{text}<br>x=%{x:.3f}<br>y=%{y:.3f}<extra></extra>"
    };

    const algorithmBestTrace = {
      type: "scatter",
      mode: "markers",
      name: "算法最优解",
      x: [currentFrame.globalBestPos[0]],
      y: [currentFrame.globalBestPos[1]],
      marker: {
        size: 18,
        color: "#f8fafc",
        symbol: "diamond",
        line: {
          color: "#22d3ee",
          width: 2
        }
      },
      hovertemplate: "算法最优解<br>x=%{x:.4f}<br>y=%{y:.4f}<extra></extra>"
    };

    const theoreticalBestTrace = {
      type: "scatter",
      mode: "markers+text",
      name: "理论最优解",
      x: [optimum[0]],
      y: [optimum[1]],
      text: ["理论最优"],
      textposition: "top center",
      marker: {
        size: 16,
        color: "#facc15",
        symbol: "star"
      },
      hovertemplate: "理论最优解<br>x=%{x:.4f}<br>y=%{y:.4f}<extra></extra>"
    };

    return [
      {
        type: "contour",
        name: "目标函数等高线",
        x: contourGrid.xs,
        y: contourGrid.ys,
        z: contourGrid.z,
        colorscale: "YlOrRd",
        opacity: 0.78,
        showscale: dataSize <= 200, // 大数据量隐藏色标
        line: {
          width: dataSize <= 100 ? 1 : 0.5
        },
        contours: {
          coloring: "heatmap",
          showlabels: false,
          ncontours: dataSize <= 100 ? 15 : 10
        },
        hovertemplate: "x=%{x:.3f}<br>y=%{y:.3f}<br>f=%{z:.3f}<extra></extra>"
      },
      ...trajectoryTraces,
      currentPointsTrace,
      algorithmBestTrace,
      theoreticalBestTrace
    ];
  }, [contourGrid, currentFrame, currentFrameIndex, optimum, result, selectedAgents, dataSize]);

  // 收敛曲线数据采样优化
  const convergenceData = useMemo(() => {
    if (!result) {
      return [];
    }

    const totalFrames = result.history.length;
    const sampleRate = getTrajectorySampleRate(totalFrames);
    const frames = result.history
      .slice(0, currentFrameIndex + 1)
      .filter((_, idx) => idx % sampleRate === 0);
    
    // 确保最后一帧总是被包含
    const lastFrame = result.history[currentFrameIndex];
    if (frames[frames.length - 1] !== lastFrame) {
      frames.push(lastFrame);
    }

    return [
      {
        type: "scatter",
        mode: "lines",
        name: "最优适应度",
        x: frames.map((frame) => frame.iteration),
        y: frames.map((frame) => frame.currentBestScore),
        line: {
          color: "#22d3ee",
          width: 2.5
        },
        hovertemplate: "迭代 %{x}<br>Best=%{y:.6f}<extra></extra>"
      }
    ];
  }, [currentFrameIndex, result]);

  const parameterData = useMemo(() => {
    if (!result) {
      return [];
    }

    const totalFrames = result.history.length;
    const sampleRate = getTrajectorySampleRate(totalFrames);
    const frames = result.history
      .slice(0, currentFrameIndex + 1)
      .filter((_, idx) => idx % sampleRate === 0);
    
    const lastFrame = result.history[currentFrameIndex];
    if (frames[frames.length - 1] !== lastFrame) {
      frames.push(lastFrame);
    }

    const metricSeries = selectedMetricKey
      ? frames.map((frame) => frame.metrics?.[selectedMetricKey] ?? null)
      : frames.map(() => null);

    return [
      {
        type: "scatter",
        mode: "lines",
        name: selectedMetricKey || "未选择指标",
        x: frames.map((frame) => frame.iteration),
        y: metricSeries,
        line: {
          color: "#f97316",
          width: 2.5
        },
        hovertemplate: `迭代 %{x}<br>${selectedMetricKey || "metric"}=%{y:.4f}<extra></extra>`
      },
      {
        type: "scatter",
        mode: "lines",
        name: "currentBestScore",
        x: frames.map((frame) => frame.iteration),
        y: frames.map((frame) => frame.currentBestScore),
        line: {
          color: "#4ade80",
          width: 1.5,
          dash: "dot"
        },
        hovertemplate: "迭代 %{x}<br>currentBestScore=%{y:.6f}<extra></extra>"
      }
    ];
  }, [currentFrameIndex, result, selectedMetricKey]);

  if (!result || !currentFrame) {
    return (
      <div className="glass-card flex min-h-[620px] items-center justify-center p-8 text-center">
        <div className="max-w-md space-y-3">
          <p className="text-sm uppercase tracking-[0.28em] text-cyan-300/80">
            可视化就绪
          </p>
          <h2 className="text-2xl font-semibold text-white">
            请在左侧配置参数，然后点击"开始运行"
          </h2>
          <p className="text-sm leading-7 text-slate-400">
            系统将一次性获取完整的迭代历史数据，然后通过前端动画逐帧回放种群在二维搜索空间中的移动、收敛过程及参数变化。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
      <div className="glass-card overflow-hidden p-3">
        <Plot
          data={searchSpaceData as never[]}
          layout={{
            ...createChartLayout("可视化", 560),
            xaxis: {
              title: "X",
              range: [bounds.lb[0], bounds.ub[0]],
              gridcolor: "rgba(148, 163, 184, 0.12)",
              zerolinecolor: "rgba(148, 163, 184, 0.2)",
              showspikes: false,
              showticklabels: true
            },
            yaxis: {
              title: "Y",
              range: [bounds.lb[1], bounds.ub[1]],
              scaleanchor: "x",
              scaleratio: 1,
              gridcolor: "rgba(148, 163, 184, 0.12)",
              zerolinecolor: "rgba(148, 163, 184, 0.2)",
              showspikes: false,
              showticklabels: true
            }
          }}
          config={plotConfig}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler={false} // 禁用自动重绘，减少不必要的更新
        />
      </div>

      <div className="grid gap-6">
        <div className="glass-card overflow-hidden p-3">
          <Plot
            data={convergenceData as never[]}
            layout={{
              ...createChartLayout("收敛曲线", 270),
              xaxis: {
                title: "迭代",
                gridcolor: "rgba(148, 163, 184, 0.12)",
                showspikes: false
              },
              yaxis: {
                title: "最优适应度",
                gridcolor: "rgba(148, 163, 184, 0.12)",
                showspikes: false
              }
            }}
            config={plotConfig}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler={false}
          />
        </div>

        <div className="glass-card overflow-hidden p-3">
          <Plot
            data={parameterData as never[]}
            layout={{
              ...createChartLayout(
                selectedMetricKey
                  ? `参数变化: ${selectedMetricKey}`
                  : "参数变化",
                270
              ),
              xaxis: {
                title: "迭代",
                gridcolor: "rgba(148, 163, 184, 0.12)",
                showspikes: false
              },
              yaxis: {
                title: "参数值",
                gridcolor: "rgba(148, 163, 184, 0.12)",
                showspikes: false
              }
            }}
            config={plotConfig}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler={false}
          />
        </div>
      </div>
    </div>
  );
}
