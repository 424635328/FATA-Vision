"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { useMemo } from "react";

import { buildObjectiveGrid, getKnownGlobalOptimum } from "@/lib/objectives";
import type { AlgorithmResponse, ObjectiveFunctionName } from "@/lib/types";

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false
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

function createChartLayout(title: string, height: number) {
  return {
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
}

export default function Visualization({
  result,
  currentFrameIndex,
  selectedAgents,
  selectedMetricKey,
  objective,
  bounds
}: VisualizationProps) {
  const contourGrid = useMemo(() => {
    return buildObjectiveGrid({
      objective,
      lb: bounds.lb,
      ub: bounds.ub,
      steps: 60
    });
  }, [bounds.lb, bounds.ub, objective]);

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

    const trajectoryTraces = !showAllAgents
      ? visibleAgentIndices.map((agentIndex) => {
          // 当用户勾选了特定个体时，只绘制这些个体从第 1 代到当前代的轨迹折线。
          const path = result.history
            .slice(0, currentFrameIndex + 1)
            .map((frame) => frame.positions[agentIndex]);

          return {
            type: "scatter",
            mode: "lines",
            name: `Agent ${agentIndex + 1} 轨迹`,
            x: path.map((point) => point[0]),
            y: path.map((point) => point[1]),
            line: {
              color: TRACK_COLORS[agentIndex % TRACK_COLORS.length],
              width: 2.5
            },
            hovertemplate: `Agent ${agentIndex + 1} 轨迹<br>x=%{x:.3f}<br>y=%{y:.3f}<extra></extra>`
          };
        })
      : [];

    const currentPointsTrace = {
      type: "scatter",
      mode: "markers",
      name: showAllAgents ? "当前种群" : "选中个体",
      x: visibleAgentIndices.map((index) => currentFrame.positions[index][0]),
      y: visibleAgentIndices.map((index) => currentFrame.positions[index][1]),
      text: visibleAgentIndices.map((index) => `Agent ${index + 1}`),
      marker: {
        size: showAllAgents ? 11 : 14,
        color: visibleAgentIndices.map((index) => TRACK_COLORS[index % TRACK_COLORS.length]),
        line: {
          color: "#f8fafc",
          width: 1.2
        }
      },
      hovertemplate: "%{text}<br>x=%{x:.3f}<br>y=%{y:.3f}<extra></extra>"
    };

    const algorithmBestTrace = {
      type: "scatter",
      mode: "markers",
      name: "当前全局最优",
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
      hovertemplate: "当前全局最优<br>x=%{x:.4f}<br>y=%{y:.4f}<extra></extra>"
    };

    const theoreticalBestTrace = {
      type: "scatter",
      mode: "markers+text",
      name: "理论最优点",
      x: [optimum[0]],
      y: [optimum[1]],
      text: ["理论最优"],
      textposition: "top center",
      marker: {
        size: 16,
        color: "#facc15",
        symbol: "star"
      },
      hovertemplate: "理论最优点<br>x=%{x:.4f}<br>y=%{y:.4f}<extra></extra>"
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
        showscale: true,
        line: {
          width: 1
        },
        contours: {
          coloring: "heatmap",
          showlabels: false
        },
        hovertemplate: "x=%{x:.3f}<br>y=%{y:.3f}<br>f=%{z:.3f}<extra></extra>"
      },
      ...trajectoryTraces,
      currentPointsTrace,
      algorithmBestTrace,
      theoreticalBestTrace
    ];
  }, [contourGrid, currentFrame, currentFrameIndex, optimum, result, selectedAgents]);

  const convergenceData = useMemo(() => {
    if (!result) {
      return [];
    }

    const frames = result.history.slice(0, currentFrameIndex + 1);

    return [
      {
        type: "scatter",
        mode: "lines+markers",
        name: "当前最优适应度",
        x: frames.map((frame) => frame.iteration),
        y: frames.map((frame) => frame.currentBestScore),
        line: {
          color: "#22d3ee",
          width: 3
        },
        marker: {
          color: "#f97316",
          size: 7
        },
        hovertemplate: "迭代 %{x}<br>Best=%{y:.6f}<extra></extra>"
      }
    ];
  }, [currentFrameIndex, result]);

  const parameterData = useMemo(() => {
    if (!result) {
      return [];
    }

    const frames = result.history.slice(0, currentFrameIndex + 1);
    const metricSeries = selectedMetricKey
      ? frames.map((frame) => frame.metrics?.[selectedMetricKey] ?? null)
      : frames.map(() => null);

    return [
      {
        type: "scatter",
        mode: "lines+markers",
        name: selectedMetricKey || "未选择指标",
        x: frames.map((frame) => frame.iteration),
        y: metricSeries,
        line: {
          color: "#f97316",
          width: 3
        },
        marker: {
          color: "#facc15",
          size: 7
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
          width: 2,
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
            Visualization Ready
          </p>
          <h2 className="text-2xl font-semibold text-white">
            先在左侧设置参数，然后点击“开始计算”
          </h2>
          <p className="text-sm leading-7 text-slate-400">
            平台会一次性拿到完整历史数据，再用前端动画逐帧回放种群在二维搜索空间中的移动、收敛和参数变化。
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
            ...createChartLayout("2D 搜索空间动态轨迹图", 560),
            xaxis: {
              title: "X",
              range: [bounds.lb[0], bounds.ub[0]],
              gridcolor: "rgba(148, 163, 184, 0.12)",
              zerolinecolor: "rgba(148, 163, 184, 0.2)"
            },
            yaxis: {
              title: "Y",
              range: [bounds.lb[1], bounds.ub[1]],
              scaleanchor: "x",
              scaleratio: 1,
              gridcolor: "rgba(148, 163, 184, 0.12)",
              zerolinecolor: "rgba(148, 163, 184, 0.2)"
            }
          }}
          config={{
            responsive: true,
            displaylogo: false
          }}
          style={{ width: "100%", height: "100%" }}
          useResizeHandler
        />
      </div>

      <div className="grid gap-6">
        <div className="glass-card overflow-hidden p-3">
          <Plot
            data={convergenceData as never[]}
            layout={{
              ...createChartLayout("适应度收敛曲线图", 270),
              xaxis: {
                title: "Iteration",
                gridcolor: "rgba(148, 163, 184, 0.12)"
              },
              yaxis: {
                title: "Best Fitness",
                gridcolor: "rgba(148, 163, 184, 0.12)"
              }
            }}
            config={{
              responsive: true,
              displaylogo: false
            }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        </div>

        <div className="glass-card overflow-hidden p-3">
          <Plot
            data={parameterData as never[]}
            layout={{
              ...createChartLayout(
                selectedMetricKey
                  ? `参数动态变化图: ${selectedMetricKey}`
                  : "参数动态变化图",
                270
              ),
              xaxis: {
                title: "Iteration",
                gridcolor: "rgba(148, 163, 184, 0.12)"
              },
              yaxis: {
                title: "Parameter Value",
                gridcolor: "rgba(148, 163, 184, 0.12)"
              }
            }}
            config={{
              responsive: true,
              displaylogo: false
            }}
            style={{ width: "100%", height: "100%" }}
            useResizeHandler
          />
        </div>
      </div>
    </div>
  );
}
