import { NextRequest, NextResponse } from "next/server";

import { evaluateObjective } from "@/lib/objectives";
import type {
  AlgorithmParams,
  AlgorithmResponse,
  HistoryFrame,
  RunAlgorithmRequest
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

type HelperContext = {
  evaluate: (position: [number, number]) => number;
  clampPosition: (position: [number, number]) => [number, number];
  randomInBounds: () => [number, number];
  randomWalk: (position: [number, number], scale?: number) => [number, number];
  meanDistance: (
    positions: [number, number][],
    target: [number, number]
  ) => number;
};

type CustomAlgorithmContext = {
  params: AlgorithmParams;
  helpers: HelperContext;
};

function assertValidParams(params: AlgorithmParams) {
  if (params.dim !== 2) {
    throw new Error("当前演示平台固定使用二维搜索空间，dim 必须为 2。");
  }

  if (!Number.isInteger(params.N) || params.N < 2 || params.N > 200) {
    throw new Error("N 必须是 2 到 200 之间的整数。");
  }

  if (!Number.isInteger(params.MaxFEs) || params.MaxFEs < 1 || params.MaxFEs > 5000) {
    throw new Error("MaxFEs 必须是 1 到 5000 之间的整数。");
  }

  if (params.lb.length !== 2 || params.ub.length !== 2) {
    throw new Error("lb 和 ub 必须是长度为 2 的边界数组。");
  }

  if (params.lb[0] >= params.ub[0] || params.lb[1] >= params.ub[1]) {
    throw new Error("每个维度都必须满足 lb < ub。");
  }
}

function createHelpers(params: AlgorithmParams): HelperContext {
  const clampPosition = (position: [number, number]): [number, number] => [
    Math.min(Math.max(position[0], params.lb[0]), params.ub[0]),
    Math.min(Math.max(position[1], params.lb[1]), params.ub[1])
  ];

  const randomInBounds = (): [number, number] => [
    params.lb[0] + Math.random() * (params.ub[0] - params.lb[0]),
    params.lb[1] + Math.random() * (params.ub[1] - params.lb[1])
  ];

  const randomWalk = (
    position: [number, number],
    scale = 0.1
  ): [number, number] => {
    const xSpan = params.ub[0] - params.lb[0];
    const ySpan = params.ub[1] - params.lb[1];

    return clampPosition([
      position[0] + (Math.random() * 2 - 1) * xSpan * scale,
      position[1] + (Math.random() * 2 - 1) * ySpan * scale
    ]);
  };

  return {
    evaluate: (position) => evaluateObjective(params.objective, position),
    clampPosition,
    randomInBounds,
    randomWalk,
    meanDistance: (positions, target) =>
      positions.reduce((sum, position) => {
        return sum + Math.hypot(position[0] - target[0], position[1] - target[1]);
      }, 0) / Math.max(positions.length, 1)
  };
}

function cloneHistoryFrame(frame: HistoryFrame): HistoryFrame {
  return {
    iteration: frame.iteration,
    positions: frame.positions.map((position) => [...position] as [number, number]),
    currentBestScore: frame.currentBestScore,
    ipValue: frame.ipValue,
    globalBestPos: [...frame.globalBestPos] as [number, number],
    meanVelocity: frame.meanVelocity,
    metrics: frame.metrics ? { ...frame.metrics } : undefined
  };
}

function validateResponseShape(
  candidate: unknown,
  params: AlgorithmParams
): AlgorithmResponse {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    !("history" in candidate) ||
    !("bestScore" in candidate) ||
    !("bestPos" in candidate)
  ) {
    throw new Error("算法返回值缺少 bestScore / bestPos / history 字段。");
  }

  const response = candidate as AlgorithmResponse;

  if (!Array.isArray(response.history) || response.history.length === 0) {
    throw new Error("history 必须是非空数组。");
  }

  if (!Array.isArray(response.bestPos) || response.bestPos.length !== 2) {
    throw new Error("bestPos 必须是长度为 2 的数组。");
  }

  for (const frame of response.history) {
    if (!Array.isArray(frame.positions) || frame.positions.length !== params.N) {
      throw new Error("每一代的 positions 数量必须与 N 一致。");
    }

    for (const position of frame.positions) {
      if (!Array.isArray(position) || position.length !== 2) {
        throw new Error("positions 中的每个点都必须是 [x, y]。");
      }
    }

    if (frame.metrics !== undefined) {
      if (
        typeof frame.metrics !== "object" ||
        frame.metrics === null ||
        Array.isArray(frame.metrics)
      ) {
        throw new Error("metrics 必须是键值对象。");
      }

      for (const [metricKey, metricValue] of Object.entries(frame.metrics)) {
        if (!metricKey.trim() || typeof metricValue !== "number" || !Number.isFinite(metricValue)) {
          throw new Error("metrics 中的每个指标都必须是有限数值。");
        }
      }
    }
  }

  return {
    bestScore: Number(response.bestScore),
    bestPos: [...response.bestPos] as [number, number],
    history: response.history.map(cloneHistoryFrame)
  };
}

function runPSO(params: AlgorithmParams): AlgorithmResponse {
  const helpers = createHelpers(params);
  const { N, MaxFEs, lb, ub } = params;
  const history: HistoryFrame[] = [];

  const xSpan = ub[0] - lb[0];
  const ySpan = ub[1] - lb[1];
  const velocityLimit: [number, number] = [xSpan * 0.25, ySpan * 0.25];

  const positions = Array.from({ length: N }, () => helpers.randomInBounds());
  const velocities = Array.from({ length: N }, () => [
    (Math.random() * 2 - 1) * velocityLimit[0],
    (Math.random() * 2 - 1) * velocityLimit[1]
  ]) as [number, number][];

  const personalBestPositions = positions.map(
    (position) => [...position] as [number, number]
  );
  const personalBestScores = positions.map((position) => helpers.evaluate(position));

  let globalBestIndex = personalBestScores.reduce((bestIndex, score, index, scores) => {
    return score < scores[bestIndex] ? index : bestIndex;
  }, 0);

  let globalBestScore = personalBestScores[globalBestIndex];
  let globalBestPos = [...personalBestPositions[globalBestIndex]] as [number, number];

  for (let iteration = 1; iteration <= MaxFEs; iteration += 1) {
    const progress = MaxFEs === 1 ? 1 : (iteration - 1) / (MaxFEs - 1);
    const inertiaWeight = 0.9 - 0.5 * progress;
    const c1 = 1.7;
    const c2 = 1.7;

    for (let agentIndex = 0; agentIndex < N; agentIndex += 1) {
      const position = positions[agentIndex];
      const velocity = velocities[agentIndex];
      const pBest = personalBestPositions[agentIndex];

      const r1 = Math.random();
      const r2 = Math.random();

      const nextVelocity: [number, number] = [
        inertiaWeight * velocity[0] +
          c1 * r1 * (pBest[0] - position[0]) +
          c2 * r2 * (globalBestPos[0] - position[0]),
        inertiaWeight * velocity[1] +
          c1 * r1 * (pBest[1] - position[1]) +
          c2 * r2 * (globalBestPos[1] - position[1])
      ];

      nextVelocity[0] = Math.max(Math.min(nextVelocity[0], velocityLimit[0]), -velocityLimit[0]);
      nextVelocity[1] = Math.max(Math.min(nextVelocity[1], velocityLimit[1]), -velocityLimit[1]);

      const nextPosition = helpers.clampPosition([
        position[0] + nextVelocity[0],
        position[1] + nextVelocity[1]
      ]);

      positions[agentIndex] = nextPosition;
      velocities[agentIndex] = nextVelocity;

      const score = helpers.evaluate(nextPosition);

      if (score < personalBestScores[agentIndex]) {
        personalBestScores[agentIndex] = score;
        personalBestPositions[agentIndex] = [...nextPosition];
      }

      if (score < globalBestScore) {
        globalBestScore = score;
        globalBestPos = [...nextPosition];
        globalBestIndex = agentIndex;
      }
    }

    const meanVelocity =
      velocities.reduce((sum, [vx, vy]) => sum + Math.hypot(vx, vy), 0) / velocities.length;

    history.push({
      iteration,
      positions: positions.map((position) => [...position] as [number, number]),
      currentBestScore: globalBestScore,
      ipValue: inertiaWeight,
      globalBestPos: [...globalBestPos],
      meanVelocity,
      metrics: {
        inertiaWeight,
        meanVelocity
      }
    });
  }

  return {
    bestScore: globalBestScore,
    bestPos: [...globalBestPos],
    history
  };
}

function runDBO(params: AlgorithmParams): AlgorithmResponse {
  const helpers = createHelpers(params);
  const { N, MaxFEs, lb, ub } = params;
  const history: HistoryFrame[] = [];

  const xSpan = ub[0] - lb[0];
  const ySpan = ub[1] - lb[1];

  const positions = Array.from({ length: N }, () => helpers.randomInBounds());
  const personalBestPositions = positions.map(
    (position) => [...position] as [number, number]
  );
  const personalBestScores = positions.map((position) => helpers.evaluate(position));

  let globalBestIndex = personalBestScores.reduce((bestIndex, score, index, scores) => {
    return score < scores[bestIndex] ? index : bestIndex;
  }, 0);
  let globalBestScore = personalBestScores[globalBestIndex];
  let globalBestPos = [...personalBestPositions[globalBestIndex]] as [number, number];

  for (let iteration = 1; iteration <= MaxFEs; iteration += 1) {
    const progress = MaxFEs === 1 ? 1 : (iteration - 1) / (MaxFEs - 1);
    const dangerFactor = 0.15 + 0.85 * (1 - progress);
    const producerRatio = 0.2;
    const producerCount = Math.max(1, Math.floor(N * producerRatio));
    const scores = positions.map((position) => helpers.evaluate(position));
    const rankedIndices = scores
      .map((score, index) => ({ score, index }))
      .sort((left, right) => left.score - right.score)
      .map((item) => item.index);

    let stepAccumulator = 0;

    for (let rank = 0; rank < rankedIndices.length; rank += 1) {
      const agentIndex = rankedIndices[rank];
      const current = positions[agentIndex];
      const pBest = personalBestPositions[agentIndex];
      const referenceProducer =
        positions[rankedIndices[Math.min(rank, producerCount - 1)]];

      let nextPosition: [number, number];

      if (rank < producerCount) {
        const rollingSign = Math.random() > 0.5 ? 1 : -1;
        nextPosition = helpers.clampPosition([
          current[0] +
            rollingSign * dangerFactor * 0.16 * xSpan * (Math.random() - 0.5) +
            0.45 * Math.random() * (globalBestPos[0] - current[0]),
          current[1] +
            rollingSign * dangerFactor * 0.16 * ySpan * (Math.random() - 0.5) +
            0.45 * Math.random() * (globalBestPos[1] - current[1])
        ]);
      } else if (rank < Math.floor(N * 0.7)) {
        nextPosition = helpers.clampPosition([
          current[0] +
            0.55 * Math.random() * (referenceProducer[0] - current[0]) +
            0.25 * Math.random() * (pBest[0] - current[0]),
          current[1] +
            0.55 * Math.random() * (referenceProducer[1] - current[1]) +
            0.25 * Math.random() * (pBest[1] - current[1])
        ]);
      } else {
        nextPosition = helpers.clampPosition([
          globalBestPos[0] +
            (Math.random() * 2 - 1) * xSpan * 0.12 * dangerFactor +
            0.2 * (pBest[0] - current[0]),
          globalBestPos[1] +
            (Math.random() * 2 - 1) * ySpan * 0.12 * dangerFactor +
            0.2 * (pBest[1] - current[1])
        ]);
      }

      stepAccumulator += Math.hypot(nextPosition[0] - current[0], nextPosition[1] - current[1]);
      positions[agentIndex] = nextPosition;

      const nextScore = helpers.evaluate(nextPosition);
      if (nextScore < personalBestScores[agentIndex]) {
        personalBestScores[agentIndex] = nextScore;
        personalBestPositions[agentIndex] = [...nextPosition];
      }

      if (nextScore < globalBestScore) {
        globalBestScore = nextScore;
        globalBestPos = [...nextPosition];
        globalBestIndex = agentIndex;
      }
    }

    const meanStep = stepAccumulator / N;

    history.push({
      iteration,
      positions: positions.map((position) => [...position] as [number, number]),
      currentBestScore: globalBestScore,
      ipValue: dangerFactor,
      globalBestPos: [...globalBestPos],
      metrics: {
        dangerFactor,
        meanStep,
        producerRatio
      }
    });
  }

  return {
    bestScore: globalBestScore,
    bestPos: [...globalBestPos],
    history
  };
}

function runFATALite(params: AlgorithmParams): AlgorithmResponse {
  const helpers = createHelpers(params);
  const { N, MaxFEs, lb, ub } = params;
  const history: HistoryFrame[] = [];

  const xSpan = ub[0] - lb[0];
  const ySpan = ub[1] - lb[1];

  const positions = Array.from({ length: N }, () => helpers.randomInBounds());
  const personalBestPositions = positions.map(
    (position) => [...position] as [number, number]
  );
  const personalBestScores = positions.map((position) => helpers.evaluate(position));

  let globalBestIndex = personalBestScores.reduce((bestIndex, score, index, scores) => {
    return score < scores[bestIndex] ? index : bestIndex;
  }, 0);
  let globalBestScore = personalBestScores[globalBestIndex];
  let globalBestPos = [...personalBestPositions[globalBestIndex]] as [number, number];

  for (let iteration = 1; iteration <= MaxFEs; iteration += 1) {
    const progress = MaxFEs === 1 ? 1 : (iteration - 1) / (MaxFEs - 1);
    const mirageFactor = 1 - progress;
    const explorationGain = 0.08 + 0.28 * mirageFactor;
    let stepAccumulator = 0;

    for (let agentIndex = 0; agentIndex < N; agentIndex += 1) {
      const current = positions[agentIndex];
      const pBest = personalBestPositions[agentIndex];
      const peerIndex = Math.floor(Math.random() * N);
      const peer = positions[peerIndex];
      const refraction = Math.random() * 2 - 1;

      const nextPosition = helpers.clampPosition([
        current[0] +
          mirageFactor * 0.45 * Math.random() * (peer[0] - current[0]) +
          (1 - mirageFactor) * 0.65 * Math.random() * (globalBestPos[0] - current[0]) +
          explorationGain * refraction * xSpan +
          0.18 * Math.random() * (pBest[0] - current[0]),
        current[1] +
          mirageFactor * 0.45 * Math.random() * (peer[1] - current[1]) +
          (1 - mirageFactor) * 0.65 * Math.random() * (globalBestPos[1] - current[1]) +
          explorationGain * refraction * ySpan +
          0.18 * Math.random() * (pBest[1] - current[1])
      ]);

      stepAccumulator += Math.hypot(nextPosition[0] - current[0], nextPosition[1] - current[1]);
      positions[agentIndex] = nextPosition;

      const nextScore = helpers.evaluate(nextPosition);
      if (nextScore < personalBestScores[agentIndex]) {
        personalBestScores[agentIndex] = nextScore;
        personalBestPositions[agentIndex] = [...nextPosition];
      }

      if (nextScore < globalBestScore) {
        globalBestScore = nextScore;
        globalBestPos = [...nextPosition];
        globalBestIndex = agentIndex;
      }
    }

    const meanStep = stepAccumulator / N;

    history.push({
      iteration,
      positions: positions.map((position) => [...position] as [number, number]),
      currentBestScore: globalBestScore,
      ipValue: mirageFactor,
      globalBestPos: [...globalBestPos],
      metrics: {
        mirageFactor,
        explorationGain,
        meanStep
      }
    });
  }

  return {
    bestScore: globalBestScore,
    bestPos: [...globalBestPos],
    history
  };
}

async function runCustomAlgorithm(
  code: string,
  params: AlgorithmParams
): Promise<AlgorithmResponse> {
  const context: CustomAlgorithmContext = {
    params,
    helpers: createHelpers(params)
  };

  try {
    // 仅用于本地演示或可信环境。
    // 如果未来要开放公网用户上传代码，建议切换为沙箱执行或独立队列服务。
    const executor = new Function(
      "context",
      `"use strict"; ${code}
      if (typeof runAlgorithm !== "function") {
        throw new Error("请在代码中声明 runAlgorithm(context) 函数。");
      }
      return runAlgorithm(context);`
    ) as (context: CustomAlgorithmContext) => Promise<AlgorithmResponse> | AlgorithmResponse;

    const candidate = await executor(context);
    return validateResponseShape(candidate, params);
  } catch (error) {
    const message = error instanceof Error ? error.message : "未知错误";
    throw new Error(`自定义算法执行失败：${message}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RunAlgorithmRequest;

    if (!body?.params) {
      return NextResponse.json(
        { message: "请求体缺少 params。" },
        { status: 400 }
      );
    }

    assertValidParams(body.params);

    let result: AlgorithmResponse;

    if (body.algorithmKey === "custom-js" && body.algorithmCode?.trim()) {
      result = await runCustomAlgorithm(body.algorithmCode, body.params);
    } else if (body.algorithmKey === "dbo") {
      result = runDBO(body.params);
    } else if (body.algorithmKey === "fata-lite") {
      result = runFATALite(body.params);
    } else {
      result = runPSO(body.params);
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "运行算法失败";

    return NextResponse.json(
      {
        message
      },
      {
        status: 400
      }
    );
  }
}
