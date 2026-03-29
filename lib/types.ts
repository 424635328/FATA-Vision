export type AlgorithmKey = "pso" | "dbo" | "fata-lite" | "custom-js";

export type ObjectiveFunctionName = "sphere" | "rastrigin" | "ackley";

export interface AlgorithmParams {
  N: number;
  MaxFEs: number;
  dim: 2;
  lb: [number, number];
  ub: [number, number];
  objective: ObjectiveFunctionName;
}

export interface HistoryFrame {
  iteration: number;
  positions: [number, number][];
  currentBestScore: number;
  ipValue?: number;
  globalBestPos: [number, number];
  meanVelocity?: number;
  metrics?: Record<string, number>;
}

export interface AlgorithmResponse {
  bestScore: number;
  bestPos: [number, number];
  history: HistoryFrame[];
}

export interface RunAlgorithmRequest {
  algorithmKey: AlgorithmKey;
  algorithmCode?: string;
  params: AlgorithmParams;
}
