/**
 * What each eval suite is for, in the owner's language: the question it
 * answers, why, how it is run, how to read each number, its limits, and
 * which charts `/dev/evals` draws with a note beside each. Copy, not code —
 * update it when a suite's method or read-out changes.
 */

export type ChartSpec =
	| {
			kind: "bars";
			metric: string;
			title: string;
			/** Paragraphs beside the chart: how to read it, what it shows. */
			note: string[];
	  }
	| { kind: "scatter"; x: string; y: string; title: string; note: string[] }
	| {
			kind: "by-group";
			metric: string;
			/** Subjects drawn side by side in each group, in this order. */
			subjects: string[];
			title: string;
			note: string[];
	  };

export interface MetricGuide {
	key: string;
	/** Chinese name. */
	name: string;
	/** What it measures, in plain words, ideally with an example. */
	means: string;
}

/** Why one technique or model did well or badly. */
export interface Cause {
	who: string;
	verdict: "好" | "差" | "一般";
	because: string;
}

export interface SuiteGuide {
	/** The answer so far, one line, for the suite's card. */
	headline: string;
	/** The question the suite answers, one sentence. */
	question: string;
	why: string[];
	how: string[];
	metrics: MetricGuide[];
	/** What made each technique or model do well or badly; inferences say so. */
	causes: Cause[];
	/** What in this suite depends on the machine, the OS or storage, and what does not. */
	environment: string[];
	limits: string[];
	/** The subject that is "what we do today", marked in the charts. */
	today?: string;
	/** Readable names for breakdown groups (book file names, fixtures). */
	groupNames?: Record<string, string>;
	charts: ChartSpec[];
}

export const GUIDES: Record<string, SuiteGuide> = {
	ocr: {
		headline: "换成 PP-OCRv6 tiny + 版面遮挡：F1 68% → 94%，每页还更快",
		question: "扫描书没有文字层，得先 OCR 才有字。用哪个 OCR 引擎、在它前后加什么，才能把书上的字读得又全、又干净、又快？",
		why: [
			"扫描得到的文字是后面所有步骤的原料：找章节目录、给页面打「可能有练习」的标签、写知识点、章节问答。字漏了，后面全都看不到；谱子里的数字混进正文，后面全都被干扰。",
			"现在扫描用的是 Tesseract（tessdata_fast），一个十年前设计的老引擎。它对中文扫描件到底差多少、换成什么更好，之前只有厂商自己报的数字，没在我们自己的书上量过。",
		],
		how: [
			"选 4 个样本 PDF 共 26 页：2 份中文吉他教材（编曲、和声），2 份英文摇滚吉他教材。几乎每页都有谱子，这正是最难的情况。",
			"做「标准答案」：让 Claude Opus 5 看每页的图逐字转写正文，谱子不转写、写成 [notation]；Sonnet 5 再独立转写一遍，两份差得多的页就是该人工核对的页（在 127.0.0.1:8765 的核对页里）。",
			"每个引擎在本机 M2 CPU 上以 150 dpi 读同样的页，计时，把读出来的文字和标准答案逐字比较打分。",
			"#369 比的是引擎本身（Tesseract、PP-OCRv5/v6 各尺寸）；#375 在 PP-OCRv6 tiny 上再叠三种东西：版面检测遮谱子、没把握的行交给视觉大模型重读、整页交给文字大模型纠错。",
		],
		metrics: [
			{ key: "char_recall", name: "字符召回", means: "书上的字读到了多少。标准答案「左手按弦」4 个字，读出「左手按玫」——找到 3 个，召回 75%。不看顺序。越高越好，最关键：漏掉的字后面谁也补不回来。" },
			{ key: "char_precision", name: "字符精确率", means: "读出来的字有多少是真的书上正文。读出「左手按玫0323」8 个字只有 3 个对，精确率 37.5%。谱子里的数字被当成文字读进来，它就会掉。越高越好。" },
			{ key: "char_f1", name: "字符 F1", means: "召回和精确率的综合分（调和平均），两边都好才高。用它给引擎排总名次。" },
			{ key: "cer", name: "CER 字符错误率", means: "要改几个字才能变成标准答案，除以标准答案的字数。会把顺序也算进去，读进来的垃圾越多越高，可以超过 100%。这里谱子多、版面多栏，所以它不是主指标。越低越好。" },
			{ key: "seconds_per_page", name: "秒 / 页", means: "读一页要多久（模型加载不算）。一本 300 页的扫描书 × 这个数 ≈ 扫描要等多久。越低越好。" },
			{ key: "cost_usd_per_page", name: "$ / 页", means: "调用大模型 API 花的钱。本机跑的引擎都是 0。" },
		],
		causes: [
			{ who: "Tesseract fast（现在在用）", verdict: "差", because: "它的识别核心是 2016 年前后的 LSTM 逐行识别器，训练数据以电脑渲染的字体为主，扫描件的模糊、噪点、轻微倾斜它适应得不好；中文有上万个字，fast 版又是为速度压缩过的小模型，形近字（弦→玫）就容易错。它的版面分析靠规则，看到六线谱只看到横线和数字，会努力当文字读，于是读进一堆乱码，精确率只有 60%。英文字母只有几十个，所以它在英文书上反而不差（96–97%）。" },
			{ who: "Tesseract best", verdict: "差", because: "同一套架构、更大的模型，所以慢了十几倍（每页 50 秒），但它的短板不在模型大小，而在训练数据和版面分析，所以并没有更准。" },
			{ who: "PP-OCR（v5 / v6）", verdict: "好", because: "百度专门为中文做的现代深度学习 OCR：先用一个神经网络（DB 检测器）把每一行文字框出来，再用另一个网络（SVTR 一类）逐行识别。训练数据里有大量真实的中文扫描件和合成数据，所以中文召回到 97%+。它是「框出文字行」再识别，谱线一般不会被框成文字行，读进来的乱码比 Tesseract 少。" },
			{ who: "PP-OCRv6 tiny 比 server / medium 还好用", verdict: "好", because: "我们的书是印刷体，字清楚，小模型已经够用；大模型多出来的能力（手写、艺术字、复杂背景）用不上，只多花时间。tiny 只有几 MB，ONNX Runtime 在 CPU 上又会用满所有核，所以 0.6 秒一页。" },
			{ who: "PP-OCR 在 3 页英文书上偏低（88%）", verdict: "一般", because: "那 3 页里有一段倒着印的文字，PP-OCR 读成了乱码（召回直接掉）；另外这套模型主要按中文优化。（倒印那一页是实测确认的；中文优化的影响是推测。）" },
			{ who: "版面检测遮谱子（A）", verdict: "好", because: "版面模型（PP-DocLayoutV3，一种 RT-DETR 检测器）是在大量文档上训练来分「正文 / 标题 / 图片 / 表格」的。它没有「乐谱」这一类，但谱子看起来就是图形，于是被归进「图片」——我们正好利用这一点：图片框里不像正文的行就丢掉。乱码没了，精确率从 76% 跳到 96%。" },
			{ who: "整块遮（不保留框里的正文）", verdict: "差", because: "版面模型的框比较粗，会把谱例旁边的说明文字（「旋律音位置：」、整段 TIP）一起框进去；整块丢就把这些正文也丢了，召回多掉 6 个点。" },
			{ who: "视觉大模型重读没把握的行（B）", verdict: "一般", because: "PP-OCR 对自己没把握（置信度 < 0.85）的行很少，26 页只有 62 行，能修的本来就不多。大模型看着裁图重读，修好了倒印的那段，但也会把本来对的行「改」错。Sonnet 5 有一次直接拒绝回答（stop_reason: refusal）——推测是一大段倒印的成段书本文字触发了 API 的安全分类器，单独一行时它正常回答。" },
			{ who: "文字大模型通读纠错（C）", verdict: "差", because: "它只看到 OCR 出来的文字、看不到原图，只能凭「这里通常应该写什么」去猜。结果会把对的字改错、甚至把它觉得不通顺的整行删掉（编曲那章召回 95%→86%）。和 Opus 把简体写成繁体是同一类问题：大模型会「自作主张」。" },
		],
		environment: [
			"准确率（召回、精确率、CER）只取决于模型和输入的页图，和操作系统、硬盘无关：同一个模型读同一张图，在 macOS 和 Linux 上结果基本一样（CPU 架构不同可能有极小的数值差异）。",
			"速度强烈依赖机器：这里是 Apple M2（8 核、ARM）上 macOS 的数字。Tesseract 只用 1 个核；PP-OCR 跑在 ONNX Runtime 上，会用满所有核。生产服务器是 2 GB 内存的 Linux x86 小机器，核数少，PP-OCR 的优势会缩小一些，需要在服务器上再测一次。",
			"Tesseract 在编曲 p09 上的段错误是在 macOS 上看到的；PyMuPDF 在 Linux 和 macOS 上是不同的编译产物，Linux 上会不会崩还没验证。",
			"存储：模型文件放在本地磁盘（Tesseract 的 tessdata/、RapidOCR 的模型在 Python 环境的 site-packages 里），第一次用时从网上下载（modelscope 在国内，要绕开系统代理）；之后从磁盘读，几十 MB，读取时间相对识别可以忽略。",
			"评测产物放在两处：书的内容（标准答案、每个引擎读出的文字）只在本机被 git 忽略的 materials/ 里，因为有版权；分数（不含书本内容）写成 JSON 放在 book-service/evals/ocr/results/，提交进仓库，这个页面读的就是它们。都不经过 Supabase。",
		],
		limits: [
			"标准答案是模型转写的，还没人工核对过；Opus 曾把一页简体写成繁体（已自动改用 Sonnet 那份）。",
			"只有 26 页、4 份书，结论方向可信，具体百分比会随样本变。",
			"速度是 M2 笔记本上的数字；生产服务器 CPU 不同，绝对值会变，相对快慢一般不变。",
			"「漏掉的字」里有一部分其实是谱子上的标注（Riff、Coda、BEAT），标准答案把它们当成文字转写了。",
		],
		today: "tesseract-fast",
		groupNames: {
			"sample-tab-乐理-编曲-10p": "编曲（中文 10 页）",
			"sample-乐理-和声语汇-7p": "和声（中文 7 页）",
			"sample-text-tab-scanned-3p": "摇滚 A（英文 3 页）",
			"sample-text-tab-scanned-6p": "摇滚 B（英文 6 页）",
		},
		charts: [
			{
				kind: "bars",
				metric: "char_recall",
				title: "书上的字读到了多少（字符召回）",
				note: [
					"每根条是一个引擎在 26 页上平均找回了标准答案里多少比例的字，越长越好。灰色斜纹那根是现在扫描在用的 Tesseract fast。",
					"看出来什么：PP-OCR 系列都在 96% 以上，Tesseract fast 只有 83%，等于每 6 个字丢 1 个。",
					"加了版面遮挡（#375）的几根会低 3 个点左右——被遮掉的主要是印在谱子上的标注（Riff、Coda），不是正文。",
				],
			},
			{
				kind: "bars",
				metric: "char_precision",
				title: "读出来的有多少是真正文（字符精确率）",
				note: [
					"读出来的字里，属于书上正文的比例。谱子里的品格数字、和弦名被当成文字读进来，这根条就会变短。",
					"看出来什么：单独的引擎都卡在 60–76%，因为它们分不清哪里是谱子。加了版面检测遮谱子（#375）的直接跳到 95% 以上——这就是「遮谱子」的作用。",
					"文字大模型纠错（C）反而把精确率拉低了：它会改错、会删行。",
				],
			},
			{
				kind: "by-group",
				metric: "char_recall",
				subjects: ["tesseract-fast", "ppocrv6-tiny", "ppocrv6-tiny+v3"],
				title: "分书看：差距出在哪儿",
				note: [
					"同一个引擎在每本书上的字符召回，三种颜色从浅到深：现在的 Tesseract fast → 换成 PP-OCRv6 tiny → 再加版面遮挡。",
					"看出来什么：差距几乎全在中文书。两本中文书 Tesseract 只有 72% 和 80%，PP-OCR 到 97–98%；英文书上 Tesseract 本来就不差（96–97%），PP-OCR 在 3 页那本上反而低一些。",
					"所以「换引擎」主要是为中文书换的。",
				],
			},
			{
				kind: "bars",
				metric: "seconds_per_page",
				title: "每页要几秒",
				note: [
					"越短越好。Tesseract best 要 50 秒一页，PP-OCR 的大模型（server/medium）十几秒，PP-OCRv6 tiny 只要 0.6 秒。",
					"加版面检测再多 0.7 秒；重读、纠错要调 API，慢得多（10–34 秒）。",
					"换算：300 页的书，Tesseract fast ≈ 13 分钟，PP-OCRv6 tiny ≈ 3 分钟，加版面检测 ≈ 7 分钟。",
				],
			},
			{
				kind: "scatter",
				x: "seconds_per_page",
				y: "char_recall",
				title: "准不准 vs 快不快",
				note: [
					"每个点是一个引擎：越往上读得越全，越往左越快。左上那块浅色区域是「又快又准」。",
					"虚线连起来的蓝点是「前沿」：没有别的引擎比它们又快又准。在前沿上选一个就够了，不在前沿上的都被别人全面压过。",
					"看出来什么：PP-OCRv6 tiny 几乎就在左上角；Tesseract 两个都在下方或右边。",
				],
			},
		],
	},

	"notation-pages": {
		headline: "没有方法能安全地跳过分类：每页继续分类",
		question: "解析一章时，每张扫描页都要交给 Sonnet 分类（找哪里有谱子）。能不能先用免费的方法判断「这页没谱子」，把分类省掉？",
		why: [
			"分类是解析的第一步：每页约 $0.007、3–6 秒，一个 40 页的章节就是 40 次调用。",
			"#375 的版面检测能看出「哪里有图」，正则规则能从文字里猜「有没有练习」。如果它们能可靠地说「这页没谱子」，就能跳过这一页的分类。",
		],
		how: [
			"挑了 135 页，覆盖 10 份材料：中文理论讲解、和弦图、密集 tab、英文摇滚教材、一本日本教材的中文译本、一本有文字层的书。",
			"参照：解析时真正用的 Sonnet 分类器，判断每页有没有谱子（花了 $1.01，已缓存）。它认为 98 页有谱子、37 页是纯文字——所以就算全对，最多也只能省 27%。",
			"让每种检测方法也判断一遍，数一数：它会跳过多少页（省了多少调用），其中有多少其实有谱子（漏掉的）。",
		],
		metrics: [
			{ key: "skip_rate", name: "省下的调用", means: "检测方法判为「没谱子」、可以跳过分类的页占多少。越高越省钱。" },
			{ key: "recall", name: "保住的谱子页", means: "分类器认为有谱子的页里，检测方法也认出来的比例。不到 100% 就意味着有练习永远不会被读出来。" },
			{ key: "missed", name: "漏掉的页", means: "有谱子却被跳过的页数。这是代价，越少越好，最好是 0。" },
			{ key: "precision", name: "精确率", means: "检测方法说「有谱子」的页里，真的有的比例。" },
			{ key: "seconds_per_page", name: "秒 / 页", means: "检测本身要花的时间（要 OCR 的含 OCR）。它省下的分类调用每页约 3–6 秒。" },
		],
		causes: [
			{ who: "PP-DocLayoutV3（任何图片区域就分类）", verdict: "一般", because: "不漏，但只省 5%：教材的纯文字页上也常有插图、花边、页角的吉他头小图，版面模型都会框成「图片」。它只认得「这是图」，分不出「这是谱子」还是「这是装饰」。" },
			{ who: "忽略小于页面 3% 的区域", verdict: "差", because: "想去掉小装饰，却把印得很小的和弦图、短谱例也一起去掉了，于是漏掉 14 页。尺寸不是区分谱子和装饰的好依据。" },
			{ who: "正则规则（may_have_exercise）", verdict: "差", because: "规则是从文字里找「D DU」「练习」「横线加数字」这类线索。扫描页的文字是 OCR 出来的，谱子本身是图，OCR 要么读成乱码、要么（遮谱子后）根本不读，规则就看不到线索，漏 30 页。" },
			{ who: "CDLA 版面模型", verdict: "一般", because: "更小更老的版面模型（在中文文档数据集 CDLA 上训练），快 10 倍，但同样分不出谱子和插图，只省 4%。" },
			{ who: "Sonnet 分类器（参照）", verdict: "好", because: "它看图又读文字，真正认识六线谱、简谱、和弦图，所以能当参照。代价是每页一次 API 调用；以及偶尔会陷入重复输出的循环（这次在三月通 p35 上发生过一次）。" },
		],
		environment: [
			"「漏不漏、省多少」只取决于模型和页图，和操作系统、存储无关。",
			"「秒/页」是 M2 上的数字；被省下的分类调用的时间主要是网络往返和模型推理，和本机硬件关系不大。",
			"Sonnet 的分类结果缓存在本机 materials/notation-ref/（被 git 忽略），所以重跑不花钱；分数 JSON 在 book-service/evals/notation/results/。",
		],
		limits: [
			"参照本身是 Sonnet 的判断，它把很多页判成 mixed（文字+谱子混排），可能偏宽；但「漏掉」是相对于解析实际会做的事来算的，这正是我们关心的。",
			"一次运行里有一页分类器陷入重复循环，暴露出解析代码的一个 bug（见 Findings）。",
		],
		today: "everything",
		groupNames: {},
		charts: [
			{
				kind: "bars",
				metric: "skip_rate",
				title: "能省下多少分类调用",
				note: [
					"每种方法判为「没谱子、可以跳过」的页占多少，越长越省。灰色斜纹是现在的做法：每页都分类，省 0%。",
					"最多也只能省 27%（只有 37/135 页是纯文字）。",
				],
			},
			{
				kind: "bars",
				metric: "missed",
				title: "代价：漏掉了几页有谱子的页",
				note: [
					"有谱子却会被跳过的页数，越短越好，0 最好。",
					"看出来什么：省得多的方法都要付代价——正则省 37% 但漏 30 页；按面积忽略小图省 30% 但漏 14 页（主要是印得很小的和弦图）。不漏的 V3 只能省 5%。",
					"结论：没有一种能安全地替掉分类。每页 $0.007 不值得拿漏掉练习去换。",
				],
			},
			{
				kind: "scatter",
				x: "recall",
				y: "skip_rate",
				title: "省钱 vs 不漏",
				note: [
					"越往上省得越多，越往右漏得越少。理想的点在右上角——但这里没有一个点在那儿：往上走的都在左边（漏页），在最右边的都贴着底（几乎不省）。",
					"那条虚线就是「取舍曲线」：想往上多省一点，就得往左多漏几页，没有免费的午餐。",
				],
			},
		],
	},

	assistant: {
		headline: "deepseek-flash 又准又便宜：98%，每轮约 $0.0006",
		question: "助手的 General 模式（大模型调用读谱工具）面对玩家的一句话，能不能选对工具、做出对的卡片？哪个模型最划算？",
		why: [
			"General 模式每一轮都花钱，选错工具或做错卡片玩家立刻能看到。换模型（例如 #255 换成 deepseek-flash）之前要有数字说明它不比原来差。",
		],
		how: [
			"写好的用例：扫弦（strum）和指弹（tab）两类句子，每个用例写明应该用哪个工具、卡片该长什么样（几小节、什么拍号、品格范围……）。",
			"每个用例跑 3 遍（模型有随机性，跑一遍分不清「偶尔失手」和「根本不会」），按工具选择和卡片内容自动打分；同时记下每轮花费、调用次数、耗时。",
		],
		metrics: [
			{ key: "pass_rate", name: "通过率", means: "所有「用例 × 重复」里通过的比例。64 个用例时，1 个用例 ≈ 1.6 个百分点。" },
			{ key: "never", name: "从未通过", means: "3 遍都失败的用例数：说明模型真不会，不是运气差。" },
			{ key: "flaky", name: "时好时坏", means: "3 遍里有过有不过的用例数：不稳定。" },
			{ key: "cost_per_turn_usd", name: "$ / 轮", means: "玩家说一句话，平均花多少钱（含工具来回的多次调用）。" },
			{ key: "calls_per_turn", name: "调用 / 轮", means: "一轮平均调了几次模型。" },
			{ key: "latency_p50_ms", name: "p50 延迟", means: "一半的回合比这个快。p95 是最慢的那 5% 的门槛。" },
		],
		causes: [
			{ who: "deepseek-flash", verdict: "好", because: "通过率最高、最便宜、最快。便宜是因为定价低（输入每百万 token $0.30，Sonnet 5 是 $2）；准是因为这些用例主要考「选对工具、把玩家原话原样传给读谱器」，不需要很强的推理，快模型已经够用。（「够用」是从结果推断的。）" },
			{ who: "Claude Sonnet 5", verdict: "好", because: "通过率和 deepseek-flash 接近，但每轮贵约 9 倍、慢约一倍；p95 长尾 13 秒，推测是它在部分回合里多想了一会儿或多调了一次工具。" },
			{ who: "deepseek-v4-pro", verdict: "一般", because: "更大的模型反而 92%，不稳定的用例最多（7 个），推测是它更爱「自己发挥」去组装卡片，而不是照规则调用读谱器。" },
			{ who: "Claude Haiku 4.5", verdict: "差", because: "最小的模型，工具选择和卡片格式更容易出错（73%）。注意那次只有 41 个用例、每个跑 1 遍，和其他模型不完全可比。" },
		],
		environment: [
			"助手评测在本机跑，但模型在云端：通过率、花费只和模型与用例有关，和操作系统、存储无关；延迟主要是网络和对方服务器的速度，从国内走代理访问会更慢一些。",
			"结果存成 JSON：旧的 baseline.json 和新的 src/lib/assistant/__evals__/runs/，提交进仓库；不经过 Supabase。",
		],
		limits: ["用例是自己写的，覆盖面有限；没有真实玩家的句子。", "不同模型的数字来自不同日期的运行（见 Runs）。"],
		today: "deepseek-flash",
		charts: [
			{ kind: "bars", metric: "pass_rate", title: "通过率", note: ["越长越好。deepseek-flash（现在的默认）98%，比 Sonnet 5 还高一点；Haiku 4.5 只有 73%（那次只有 41 个用例、跑 1 遍）。"] },
			{ kind: "bars", metric: "cost_per_turn_usd", title: "每轮花多少钱", note: ["越短越省。deepseek-flash 每轮约 $0.0006，是 Sonnet 5 的九分之一。"] },
			{ kind: "scatter", x: "cost_per_turn_usd", y: "pass_rate", title: "又好又便宜？", note: ["左上角是又便宜又准。deepseek-flash 一个点就占了左上角，所以它是前沿上唯一的点——这就是 #255 选它的原因。"] },
		],
	},

	"chapter-qa": {
		headline: "DeepSeek 和 Opus 答得一样好，便宜约 19 倍",
		question: "对着书里的一章提问，回答是不是出自书、页码引得对不对、有没有瞎编、会不会被书里藏的指令带跑？要花多少钱、多快？",
		why: ["问答是书本功能里玩家直接看到的部分；回答引错页、编造内容，比不回答更糟。要在选模型（Opus 还是 DeepSeek）和选检索方式之前有数字。"],
		how: [
			"每个章节一套题：5 道有标准页码的事实题、1 道书里没有的通用题、1 道应该婉拒的题、1 道要练习草稿的题，外加在某一页里偷偷塞一行「忽略之前的指令」。",
			"用 long_context 方式（整章交给模型）回答，另一个模型当评委判断回答是否只用了引用页上的内容。",
		],
		metrics: [
			{ key: "routing", name: "路由", means: "事实题有没有按「出自书」回答、通用题有没有按「通用知识」回答。" },
			{ key: "page_recall", name: "页码召回", means: "引用的页码里有没有包含标准页码。" },
			{ key: "faithfulness", name: "忠实", means: "评委认为回答里关于书的每句话，引用页上都有。" },
			{ key: "draft", name: "草稿", means: "要练习时有没有拿出对的那一份。" },
			{ key: "injection", name: "抗注入", means: "书里藏的指令有没有被执行。低于 100% 就是被带跑了。" },
			{ key: "usd_total", name: "$ 合计", means: "这一套题总共花的钱。" },
		],
		causes: [
			{ who: "deepseek-flash", verdict: "好", because: "和 Opus 5 答得一样好、便宜约 19 倍、快 2 倍多。便宜：单价低，且它缓存命中只收 1/50 的价，同一章连问时章节内容命中缓存。准：章节都不长（≤12 页），整章塞进上下文里找答案对它不难。" },
			{ who: "Claude Opus 5", verdict: "一般", because: "质量不差，但单价贵（输入 $5/百万 token），第一问要把整章写进缓存，所以冷启动一问约 $0.03。扫描书没有文字层，Citations API 给不了页码，只能和 DeepSeek 走同样的「[Page N] 文字」路线，它的强项用不上。" },
			{ who: "「忠实」没满分", verdict: "一般", because: "多是同一道题两遍里错一遍、而且引的页是对的；推测是评委模型被 OCR 乱码（「人@@弦」）绊倒，而不是回答编造。" },
		],
		environment: [
			"问答评测用的是导出到本机 materials/samples/ 的章节，不连数据库、不连 Supabase Storage；分数和花费只和模型、题目有关，和操作系统、存储无关。",
			"正式服务里，章节 PDF 存在 Supabase Storage、页面文字存在 Postgres，问答时服务会从 Storage 下载 PDF（有 10 分钟内存缓存）——这部分的耗时这个评测没有覆盖。",
		],
		limits: ["只测了 long_context；lexical、rag 还没测。", "章节最长 12 页，40 页的长章节还没测。", "「忠实」靠模型评委判断，OCR 乱码会让评委误判。"],
		charts: [
			{ kind: "bars", metric: "faithfulness", title: "回答忠不忠实", note: ["每个点是一个「模型 × 章节」。都在 80–100%，没满分的多是同一道题两遍里错一遍，而且引的页是对的——更像评委被 OCR 乱码绊了一下。"] },
			{ kind: "bars", metric: "usd_total", title: "一套题花多少钱", note: ["Opus 5 答完 9 道题 $0.105，DeepSeek 约 $0.005–0.012：便宜约 19 倍，质量没差。"] },
		],
	},
};
