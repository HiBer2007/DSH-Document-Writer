# AI 率检测：论文、机制与使用边界

> 结论先行：**“AI 率”是一个概率型风险分，不是“这篇文章有百分之几是 AI 写的”。**
> 现有检测器在改写、跨模型、跨领域、短文本和中文语境下都会误判。
> 本项目把 `aiRate` 当**代理指标**，不把它当判决；最终仍由三轴评审 + 独立子代理 + 用户确认决定。

---

## 1. 检测机制的五条路线

| 路线 | 代表工作 | 核心信号 | 主要弱点 |
| --- | --- | --- | --- |
| 统计零样本（ perplexity / burstiness ） | GLTR (2019) | 词的概率排名、熵、句长波动 | 短文本不稳；改写即可破坏；中文分词/语体影响大 |
| 概率曲率 | DetectGPT (2023)、Fast-DetectGPT (2024) | 机器文本位于模型对数概率的负曲率区域 | 需要白盒/代理模型；跨模型迁移有限 |
| 对比双模型 | Binoculars (2024) | 两个相近模型的困惑度比值 | 需要选对模型对；对强改写仍会掉分 |
| 监督分类器 | 商业检测器、GPTZero 类 | 在“人/机”数据上微调的特征 | 依赖训练集；跨领域/新模型泛化差；误报高 |
| 水印 | Kirchenbauer et al. (2023) | 生成时偏向“绿色词表”，统计检验 p 值 | 需要模型配合；改写/翻译/同义替换可去除；可被伪造 |
| 检索/风格/句级 | 检索式检测、SeqXGPT 等 | 与已知机器文本的相似度、句级特征 | 依赖语料；新模型/新领域失效 |

### 1.1 统计零样本：GLTR

GLTR 用词的概率排名、熵和句长等统计量做可视化，让人工判断“这段文字是否过于可预测”。
在人机实验中，带 GLTR 标注的人工检测率从 **54% 提升到 72%**（[arXiv:1906.04043](https://arxiv.org/abs/1906.04043)）。
它说明：**统计信号能辅助人，但不能替代人**。

### 1.2 概率曲率：DetectGPT / Fast-DetectGPT

DetectGPT 发现机器采样文本倾向于落在模型对数概率函数的**负曲率**区域，用“原文本概率 − 随机扰动后文本概率”的差值做零样本判断；在 GPT-NeoX 生成的假新闻上把最强零样本基线的 AUROC 从 **0.81 提到 0.95**（[arXiv:2301.11305](https://arxiv.org/abs/2301.11305)）。

Fast-DetectGPT 把“扰动”换成“采样”，提出**条件概率曲率**，相对 DetectGPT 提升约 **75%**，速度快 **340 倍**（[arXiv:2310.05130](https://arxiv.org/abs/2310.05130)）。

这类方法很强，但依赖**模型本身**：换模型、换语言、换采样参数，分数会漂移。

### 1.3 对比双模型：Binoculars

Binoculars 用两个相近的预训练模型做对比打分，不需要训练数据；在 **0.01% 假阳性率**下能检出 **90% 以上**的 ChatGPT 等模型生成文本（[arXiv:2401.12070](https://arxiv.org/abs/2401.12070)）。
它的关键不是“某个词”，而是**两个模型对同一文本的困惑度差异**。

### 1.4 水印

Kirchenbauer 等提出“绿色词表”水印：生成时轻推绿色词，检测时统计绿色词比例，给出可解释的 p 值；检测不需要模型 API 或参数（[arXiv:2301.10226](https://arxiv.org/abs/2301.10226)）。
但水印是**生成端配合**的方案；改写、翻译、同义替换、甚至伪造水印都能攻击它。

### 1.5 监督分类器与商业检测器

商业检测器通常融合统计特征、语义特征和分类器，给出一个“AIGC 风险指数”。
这个指数是**概率**，不是内容占比：报告写“15%”，意思是“整体被判为 AI 生成的概率”，不是“15% 的字是 AI 写的”（PaperPass 的算法说明也明确这一点，[链接](https://www.paperpass.cn/knowledge/23903.html)）。

---

## 2. 可靠性：为什么不能唯分数论

### 2.1 对抗改写能显著降低检出

《Can AI-Generated Text be Reliably Detected?》系统测试了递归改写（recursive paraphrasing）对水印、神经网络分类器、零样本分类器、检索式检测器的影响：**改写能显著降低检出率，而文本质量只轻微下降**；水印还可能被伪造，导致人类文本被误判为 AI（[arXiv:2303.11156](https://arxiv.org/abs/2303.11156)）。

这直接说明：**“把 AI 率刷下去”不等于“文本更像人”**；反过来，检测器低分也不等于安全。

### 2.2 跨模型、跨领域会失效

RAID 基准包含 **600 万+** 生成文本、**11 个模型、8 个领域、11 种对抗攻击、4 种解码策略**；评测发现现有检测器很容易被对抗攻击、采样策略、重复惩罚和未见过的模型骗过（[arXiv:2405.07940](https://arxiv.org/abs/2405.07940)）。

M4 基准覆盖多生成器、多领域、多语言；结论是检测器在**未见领域/未见模型**上泛化很差，常把机器文本判成人写（[arXiv:2305.14902](https://arxiv.org/abs/2305.14902)）。

### 2.3 数据集质量会抬高分数

《Are AI Detectors Good Enough?》指出：很多检测器在竞赛数据集上能到 99.9%，但**数据集本身的质量问题**会夸大指标；到了真实场景，性能明显下降（[arXiv:2410.14677](https://arxiv.org/abs/2410.14677)）。

### 2.4 中文语境

科技日报/央视网报道：高校多用知网、维普、万方的 AIGC 检测模块；原理包括困惑度、突发性等；但检测**做不到 100% 准确**，自己写的文字被误判、反复修改后 AI 率不降反升的情况并不少见。报道建议**以人工评议为主、AI 检测为辅**，建立透明可回溯的 AI 使用标注制度，而不是简单划“AI 率红线”（[链接](https://www.stdaily.com/web/gdxw/2026-06/25/content_536964.html)）。

中文的语意和表达方式更丰富，检测系统在判断人类语句时更容易产生歧义，这是误判的重要来源。

---

## 3. 对本项目的用法

1. **`aiRate` 只作代理分**：`scan` 的句长 CV、模板句、段落对称、标点、模糊归因只是风险信号；不追求某个商业检测器的分数。
2. **三轴一起看**：AI 率低但 AI 味/机器味高，仍然不算过；反过来，AI 率高但文本有真实细节、结构自然，也不应仅凭分数 reject。
3. **不把“降 AI 率”当目标**：目标是“像人写的、有信息、有上下文”；检测分数只是旁证。
4. **改写必须按句/段**：词表替换会割裂上下文，也会被评审判为机器味；词表只用于定位。
5. **中文要人工复核**：中文检测误判率高；评审子代理要读全文，不能只数词。
6. **保留人工确认**：最终由用户确认（U4/U5 等），检测报告只作参考。

---

## 4. 参考文献

- Gehrmann, Strobelt, Rush. *GLTR: Statistical Detection and Visualization of Generated Text.* ACL 2019. [arXiv:1906.04043](https://arxiv.org/abs/1906.04043)
- Mitchell et al. *DetectGPT: Zero-Shot Machine-Generated Text Detection using Probability Curvature.* ICML 2023. [arXiv:2301.11305](https://arxiv.org/abs/2301.11305)
- Bao et al. *Fast-DetectGPT: Efficient Zero-Shot Detection of Machine-Generated Text via Conditional Probability Curvature.* ICLR 2024. [arXiv:2310.05130](https://arxiv.org/abs/2310.05130)
- Hans et al. *Spotting LLMs With Binoculars: Zero-Shot Detection of Machine-Generated Text.* 2024. [arXiv:2401.12070](https://arxiv.org/abs/2401.12070)
- Kirchenbauer et al. *A Watermark for Large Language Models.* ICML 2023. [arXiv:2301.10226](https://arxiv.org/abs/2301.10226)
- Sadasivan et al. *Can AI-Generated Text be Reliably Detected?* TMLR. [arXiv:2303.11156](https://arxiv.org/abs/2303.11156)
- Dugan et al. *RAID: A Shared Benchmark for Robust Evaluation of Machine-Generated Text Detectors.* ACL 2024. [arXiv:2405.07940](https://arxiv.org/abs/2405.07940)
- Wang et al. *M4: Multi-generator, Multi-domain, and Multi-lingual Black-Box Machine-Generated Text Detection.* 2023. [arXiv:2305.14902](https://arxiv.org/abs/2305.14902)
- Fraser, Dawkins, Kiritchenko. *Detecting AI-Generated Text: Factors Influencing Detectability with Current Methods.* JAIR 2025. [arXiv:2406.15583](https://arxiv.org/abs/2406.15583)
- Gritsai et al. *Are AI Detectors Good Enough? A Survey on Quality of Datasets With Machine-Generated Texts.* AAAI 2025 PDLM. [arXiv:2410.14677](https://arxiv.org/abs/2410.14677)
- 央视网/科技日报：《“用AI查AI率”靠谱吗？毕业论文检测怎样更科学？》[链接](https://www.stdaily.com/web/gdxw/2026-06/25/content_536964.html)
- PaperPass：《AIGC检测率到底怎么算？》[链接](https://www.paperpass.cn/knowledge/23903.html)
