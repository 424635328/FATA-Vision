import type { AlgorithmKey } from "@/lib/types";

export const ALGORITHM_OPTIONS: Array<{
  label: string;
  value: AlgorithmKey;
  description: string;
}> = [
  {
    label: "内置 PSO",
    value: "pso",
    description: "经典粒子群优化，指标包含惯性权重与平均速度。"
  },
  {
    label: "内置 DBO",
    value: "dbo",
    description: "简化版 Dung Beetle Optimizer，指标包含 dangerFactor 与 meanStep。"
  },
  {
    label: "内置 FATA-Lite",
    value: "fata-lite",
    description: "受 FATA 启发的轻量化示例，指标包含 mirageFactor 与 explorationGain。"
  },
  {
    label: "自定义 JS",
    value: "custom-js",
    description: "按 runAlgorithm(context) 契约自定义二维优化算法。"
  }
];

const BUILTIN_PREVIEWS: Record<Exclude<AlgorithmKey, "custom-js">, string> = {
  pso: `// 当前选中的是内置 PSO（Particle Swarm Optimization）。
// 真正执行逻辑位于 app/api/run-algorithm/route.ts。
//
// 这一版会返回：
// - metrics.inertiaWeight
// - metrics.meanVelocity
// - ipValue（兼容字段，等于 inertiaWeight）`,
  dbo: `// 当前选中的是内置 DBO（简化示例版）。
// 真正执行逻辑位于 app/api/run-algorithm/route.ts。
//
// 这一版会返回：
// - metrics.dangerFactor
// - metrics.meanStep
// - metrics.producerRatio
// - ipValue（兼容字段，等于 dangerFactor）`,
  "fata-lite": `// 当前选中的是内置 FATA-Lite（受 FATA 启发的演示版）。
// 真正执行逻辑位于 app/api/run-algorithm/route.ts。
//
// 这一版会返回：
// - metrics.mirageFactor
// - metrics.explorationGain
// - metrics.meanStep
// - ipValue（兼容字段，等于 mirageFactor）`
};

export const CUSTOM_JS_TEMPLATE = `function runAlgorithm(context) {
  const { params, helpers } = context;
  const agents = Array.from({ length: params.N }, () => helpers.randomInBounds());
  const history = [];

  let bestPos = [...agents[0]];
  let bestScore = helpers.evaluate(bestPos);

  for (let iteration = 1; iteration <= params.MaxFEs; iteration += 1) {
    for (let index = 0; index < agents.length; index += 1) {
      // 这里用一个简单的随机游走演示自定义算法输入输出契约。
      // 你可以把这里替换成 FATA / DBO / 自定义启发式逻辑。
      const nextPos = helpers.randomWalk(agents[index], 0.18);
      agents[index] = nextPos;

      const score = helpers.evaluate(nextPos);
      if (score < bestScore) {
        bestScore = score;
        bestPos = [...nextPos];
      }
    }

    history.push({
      iteration,
      positions: agents.map((agent) => [...agent]),
      currentBestScore: bestScore,
      ipValue: 1 - iteration / params.MaxFEs,
      globalBestPos: [...bestPos],
      metrics: {
        coolingRate: 1 - iteration / params.MaxFEs,
        meanDistanceToBest: helpers.meanDistance(agents, bestPos)
      }
    });
  }

  return {
    bestScore,
    bestPos,
    history
  };
}`;

export function getEditorContent(algorithmKey: AlgorithmKey, customCode: string) {
  if (algorithmKey !== "custom-js") {
    return BUILTIN_PREVIEWS[algorithmKey];
  }

  return customCode;
}
