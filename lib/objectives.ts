import type { ObjectiveFunctionName } from "@/lib/types";

export const OBJECTIVE_OPTIONS: Array<{
  label: string;
  value: ObjectiveFunctionName;
}> = [
  { label: "Sphere", value: "sphere" },
  { label: "Rastrigin", value: "rastrigin" },
  { label: "Ackley", value: "ackley" }
];

export function evaluateObjective(
  objective: ObjectiveFunctionName,
  position: [number, number]
): number {
  const [x, y] = position;

  switch (objective) {
    case "sphere":
      return x * x + y * y;
    case "rastrigin":
      return 20 + (x * x - 10 * Math.cos(2 * Math.PI * x)) + (y * y - 10 * Math.cos(2 * Math.PI * y));
    case "ackley": {
      const squaredMean = 0.5 * (x * x + y * y);
      const cosineMean = 0.5 * (Math.cos(2 * Math.PI * x) + Math.cos(2 * Math.PI * y));

      return -20 * Math.exp(-0.2 * Math.sqrt(squaredMean)) - Math.exp(cosineMean) + 20 + Math.E;
    }
    default:
      return x * x + y * y;
  }
}

export function getKnownGlobalOptimum(
  objective: ObjectiveFunctionName
): [number, number] {
  switch (objective) {
    case "sphere":
    case "rastrigin":
    case "ackley":
    default:
      return [0, 0];
  }
}

export function buildObjectiveGrid({
  objective,
  lb,
  ub,
  steps = 60
}: {
  objective: ObjectiveFunctionName;
  lb: [number, number];
  ub: [number, number];
  steps?: number;
}) {
  const xs = Array.from({ length: steps }, (_, index) => {
    const ratio = index / (steps - 1);
    return lb[0] + ratio * (ub[0] - lb[0]);
  });

  const ys = Array.from({ length: steps }, (_, index) => {
    const ratio = index / (steps - 1);
    return lb[1] + ratio * (ub[1] - lb[1]);
  });

  const z = ys.map((y) => xs.map((x) => evaluateObjective(objective, [x, y])));

  return { xs, ys, z };
}
