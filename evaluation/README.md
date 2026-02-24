# LinkDKU 匹配算法评估框架

独立评估脚本，**不修改** `src/` 原有代码；仅读取 `data/` 数据并调用现有 `runMatching`，在本地计算指标并导出结果。

## 运行方式

```bash
npm run evaluate
```

- 若 `data/survey_responses.json` 不足 2 条，会自动执行 `npm run seed:fake` 生成假数据后再评估。

## 输出目录 `evaluation/output/`

| 文件 | 用途 |
|------|------|
| `report.txt` | 文本报告：相似度分布、匹配质量、多样性、覆盖率、算法 vs 随机、权重实验摘要及建议 |
| `report.html` | 带图表的 HTML 报告（相似度直方图、算法 vs 随机、权重实验、多样性），用浏览器打开查看 |
| `similarity_distribution.json` | 全用户对相似度统计与直方图，供绘图 |
| `network_graph.json` | 节点（学生 + 专业/年级/语言）、边（匹配对 + 权重），可供 networkx/matplotlib 等可视化 |
| `match_quality_comparison.json` | 算法 vs 随机对比 + 多组权重实验的得分与覆盖率，供对比图 |

## 指标说明

- **相似度分布**：所有用户对的相似度均值、中位数、标准差、最值及直方图，用于判断区分度。
- **匹配质量**：当前算法匹配对的平均分及分数分布。
- **多样性**：跨专业/跨年级/共同语言/跨文化匹配比例（DKU 特色）。
- **覆盖率**：被匹配用户数、未匹配用户数及覆盖率百分比。
- **算法 vs 随机**：算法匹配平均分 vs 多次随机配对平均分及相对提升百分比。
- **权重实验**：默认权重与若干自定义权重配置下的平均分、匹配数、覆盖率对比。

## 自定义权重实验

在 `evaluation/evaluate.js` 的 `runWeightExperiments()` 中修改 `configs` 数组即可增加或调整权重配置，例如：

```js
{ name: 'custom', weights: { interests: 0.4, socialStyle: 0.3, openness: 0.2, background: 0.1 } }
```

权重实验使用 `evaluation/experiment.js` 中的可配置权重匹配逻辑，与 `src/matching.js` 算法一致，仅权重可调。
