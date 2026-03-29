# 启发式优化算法动态可视化平台

一个基于 Next.js App Router、Tailwind CSS 和 Plotly.js 的 Web 平台示例，用于展示 `PSO`、`DBO`、`FATA-Lite` 与自定义启发式算法在二维搜索空间中的寻优过程。

## 已实现功能

- 内置 `PSO / DBO / FATA-Lite` 后端 API：一次性返回完整历史轨迹数据
- 支持 `自定义 JS` 模板执行：按 `runAlgorithm(context)` 契约运行
- 2D 搜索空间动态回放：目标函数等高线 + 当前种群散点 + 选中个体轨迹线
- 适应度收敛曲线图
- 参数动态变化图：自动读取每一代的 `metrics` 字段并支持切换指标
- 播放控制：开始计算、播放、暂停、重置
- 逐帧控制：上一帧、下一帧、循环播放
- 自定义播放速度：支持 `1ms` 到 `5000ms`、精确 `ms/frame` 输入、`FPS` 输入和预设速度按钮
- 观察点过滤：支持只跟踪指定 `Agent`
- 结果导出：支持导出完整历史 JSON

## 项目结构

```text
app/
  api/run-algorithm/route.ts
  layout.tsx
  page.tsx
components/
  Visualization.tsx
lib/
  algorithm-templates.ts
  objectives.ts
  types.ts
```

## 安装依赖

```bash
npm install
```

核心依赖如下：

- `next`
- `react`
- `react-dom`
- `tailwindcss`
- `postcss`
- `autoprefixer`
- `typescript`
- `plotly.js-dist-min`
- `react-plotly.js`

## 启动开发环境

```bash
npm run dev
```

默认访问地址：

```text
http://localhost:3000
```

## 类型检查

```bash
npm run check
```

## API 请求示例

`POST /api/run-algorithm`

```json
{
  "algorithmKey": "dbo",
  "params": {
    "N": 20,
    "MaxFEs": 100,
    "dim": 2,
    "lb": [-5.12, -5.12],
    "ub": [5.12, 5.12],
    "objective": "rastrigin"
  }
}
```

支持的 `algorithmKey`：

- `pso`
- `dbo`
- `fata-lite`
- `custom-js`

响应结构中的单代数据现在支持：

```json
{
  "iteration": 1,
  "positions": [[1.2, -0.4], [0.3, 2.1]],
  "currentBestScore": 5.13,
  "ipValue": 0.9,
  "globalBestPos": [0.3, -0.2],
  "metrics": {
    "dangerFactor": 0.9,
    "meanStep": 0.42
  }
}
```

## 自定义算法说明

如果你切换到“自定义 JS”，需要在编辑器中提供：

```js
function runAlgorithm(context) {
  const { params, helpers } = context;
  return { bestScore, bestPos, history };
}
```

当前模板仅适用于本地演示或可信环境。若未来要接入公网用户上传代码，建议改为代码沙箱、队列 Worker 或独立 Python 服务。
