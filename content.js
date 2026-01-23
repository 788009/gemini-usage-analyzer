// content.js - v2.5 (Regex Fix & Data Persistence)
(function () {
    // --- 1. 注入拦截器 (CSP 安全版) ---
    const injectScript = () => {
        try {
            const script = document.createElement('script');
            script.src = chrome.runtime.getURL('inject.js');
            script.onload = function() { this.remove(); };
            (document.head || document.documentElement).appendChild(script);
        } catch (e) {
            console.error("Inject failed:", e);
        }
    };
    injectScript();

    // --- 配置常量区 ---
    const SELECTORS = {
        endSign: 'div[jsname="jOfkMb"]',
        listContainer: 'div[jsname="i6CNtf"]',
        dateHeader: 'h2.rp10kf',
        timestamp: '.H3Q9vf.XTnvW',
        itemTag: 'c-wiz',
        deleteBtn: 'button[aria-label^="Delete activity item"]',
        visiblePrompt: '.QTGV3c' 
    };

    const manifestData = chrome.runtime.getManifest();
    const APP_VERSION = manifestData.version;
    console.log(`Gemini Analyzer v${APP_VERSION} loaded.`);

    // --- 工具函数：解析器 ---
    const parseGeminiData = (content) => {
        if (!content || content.length < 100) return [];
        const results = [];
        
        // --- 核心修复 ---
        // 原正则: ...],null,\[... (强制要求前一个元素是数组)
        // 新正则: ...,null,\[...  (兼容前一个元素是数组 ] 或 null)
        // 同时也兼容了 script 中的未转义引号 (?:\\"|")
        const pattern = /(\d{16}).*?,null,\[(?:\\"|")(.*?)(?:\\"|"),(?:true|1),(?:\\"|")Prompted/gs;
        
        let match;
        while ((match = pattern.exec(content)) !== null) {
            try {
                const timestampMicro = parseInt(match[1]);
                let rawPrompt = match[2];
                // 解码 Unicode 和 转义符
                let decoded = rawPrompt.replace(/\\u([0-9a-fA-F]{4})/g, (_, grp) => String.fromCharCode(parseInt(grp, 16)));
                decoded = decoded.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
                const doc = new DOMParser().parseFromString(decoded, "text/html");
                decoded = doc.documentElement.textContent;
                decoded = decoded.replace(/\u202f/g, ' ');
                results.push({ ts: timestampMicro / 1000, prompt: decoded });
            } catch (e) {
                // 忽略解析错误的单条
            }
        }
        return results;
    };

    // --- UI 类 ---
    class AppUI {
        constructor() {
            this.state = {
                isScrolling: false,
                isDarkMode: false,
                data: [],
                dateRange: { start: null, end: null },
                charts: {},
                // 关键修改：使用持久化的数据池，不再随 Start/Stop 清空
                dataPool: [], 
                forceStop: false
            };
            
            this.detectSystemTheme();
            this.initControlPanel();
            this.applyTheme();
            this.setupMessageListener();

            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                this.state.isDarkMode = e.matches;
                this.applyTheme();
                if (document.getElementById('gemini-analysis-panel')) {
                    this.generateReport(this.state.data);
                }
            });
        }

        setupMessageListener() {
            window.addEventListener('message', (event) => {
                if (event.data && event.data.type === 'GEMINI_INTERCEPTOR_DATA') {
                    // 实时解析网络数据并存入池子
                    const newItems = parseGeminiData(event.data.payload);
                    if (newItems.length > 0) {
                        this.addDataToPool(newItems);
                        if(this.state.isScrolling) {
                            this.updateStatus(`滚动中... (已捕获 ${this.state.dataPool.length} 条记录)`, "#e37400");
                        }
                    }
                }
            });
        }

        // 统一的数据添加方法，包含去重
        addDataToPool(newItems) {
            const existingTs = new Set(this.state.dataPool.map(i => i.ts));
            let addedCount = 0;
            newItems.forEach(item => {
                if (!existingTs.has(item.ts)) {
                    this.state.dataPool.push(item);
                    existingTs.add(item.ts);
                    addedCount++;
                }
            });
            return addedCount;
        }

        detectSystemTheme() {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                this.state.isDarkMode = true;
            }
        }

        initControlPanel() {
            const panel = document.createElement('div');
            panel.id = 'gemini-control-panel';
            Object.assign(panel.style, {
                position: 'fixed', top: '100px', right: '20px', zIndex: '9999',
                padding: '20px', borderRadius: '12px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)', border: '1px solid',
                fontFamily: '"Google Sans", Roboto, sans-serif', width: '280px',
                transition: 'all 0.3s ease', fontSize: '14px'
            });

            const githubIcon = `<svg viewBox="0 0 16 16" width="20" height="20" style="display:block;"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path></svg>`;

            panel.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
                    <h3 style="margin:0; font-size:16px;">Gemini 数据分析</h3>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <a href="https://github.com/788009/gemini-usage-analyzer" target="_blank" id="btn-github" style="text-decoration:none; opacity:0.7; transition:opacity 0.2s;" title="访问 GitHub 仓库">${githubIcon}</a>
                        <button id="btn-theme" style="background:none; border:none; cursor:pointer; font-size:18px; padding:0;" title="切换模式">🌓</button>
                    </div>
                </div>
                
                <div style="margin-bottom: 10px;">
                    <label style="display:block; font-size:12px; margin-bottom:4px;">开始日期 (留空则滚动到底):</label>
                    <input type="date" id="date-start" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc;">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display:block; font-size:12px; margin-bottom:4px;">结束日期 (截止统计):</label>
                    <input type="date" id="date-end" style="width:100%; padding:6px; border-radius:4px; border:1px solid #ccc;">
                </div>

                <div style="display:flex; gap:10px; margin-bottom: 10px;">
                    <button id="btn-start" style="flex:2; padding:10px; border-radius:4px; border:none; cursor:pointer; font-weight:bold;">开始抓取</button>
                    <button id="btn-import" style="flex:1; padding:10px; border-radius:4px; border:1px solid; cursor:pointer; font-weight:bold;">导入JSON</button>
                    <input type="file" id="inp-import" style="display:none;" accept=".json">
                </div>
                
                <div id="download-area" style="display:none; margin-bottom:10px;">
                    <div style="display:flex; gap:5px;">
                        <select id="sel-download-type" style="flex:2; padding:8px; border-radius:4px; border:1px solid #ccc; font-size:12px;">
                            <option value="json_full">JSON: 时间 + 提问 (完整)</option>
                            <option value="json_time">JSON: 仅时间</option>
                            <option value="json_prompt">JSON: 仅提问</option>
                            <option value="txt_line_full">TXT: 时间 | 提问 (单行)</option>
                            <option value="txt_line_prompt">TXT: 仅提问 (单行)</option>
                            <option value="txt_block">TXT: 提问 (---分隔, 原文)</option>
                        </select>
                        <button id="btn-download-data" style="flex:1; padding:8px; border-radius:4px; border:none; cursor:pointer; font-weight:bold; background:#34a853; color:white;">导出</button>
                    </div>
                </div>

                <div id="img-download-area" style="display:none; border-top:1px solid #ddd; padding-top:10px; margin-top:10px;">
                    <div style="font-size:12px; font-weight:bold; margin-bottom:5px;">导出图片选项:</div>
                    <label style="display:block; margin-bottom:3px; font-size:12px;"><input type="checkbox" value="box" checked> 每日发送量箱线图</label>
                    <label style="display:block; margin-bottom:3px; font-size:12px;"><input type="checkbox" value="day" checked> 每日请求量统计</label>
                    <label style="display:block; margin-bottom:8px; font-size:12px;"><input type="checkbox" value="line" checked> 24小时分布图</label>
                    <button id="btn-img-merge" style="width:100%; padding:8px; border-radius:4px; border:none; cursor:pointer; font-weight:bold; background:#fbbc04; color:#202124;">下载合并图片</button>
                </div>

                <div id="status-msg" style="margin-top:10px; font-size:12px; min-height:1.5em; color:#666;">等待操作...</div>
            `;

            document.body.appendChild(panel);
            this.ui = {
                panel: panel,
                title: panel.querySelector('h3'),
                labels: panel.querySelectorAll('label'),
                inputs: panel.querySelectorAll('input:not([type="file"])'),
                themeBtn: panel.querySelector('#btn-theme'),
                githubBtn: panel.querySelector('#btn-github'),
                startBtn: panel.querySelector('#btn-start'),
                importBtn: panel.querySelector('#btn-import'),
                importInput: panel.querySelector('#inp-import'),
                downloadArea: panel.querySelector('#download-area'),
                downloadType: panel.querySelector('#sel-download-type'),
                downloadBtn: panel.querySelector('#btn-download-data'),
                imgArea: panel.querySelector('#img-download-area'),
                imgBtn: panel.querySelector('#btn-img-merge'),
                status: panel.querySelector('#status-msg')
            };

            const today = new Date();
            this.ui.inputs[1].value = today.toISOString().split('T')[0];

            this.ui.startBtn.onclick = () => this.startProcess();
            this.ui.downloadBtn.onclick = () => this.handleDataDownload();
            this.ui.themeBtn.onclick = () => this.toggleTheme();
            this.ui.imgBtn.onclick = () => this.downloadMergedImage();
            this.ui.importBtn.onclick = () => this.ui.importInput.click();
            this.ui.importInput.onchange = (e) => this.handleFileImport(e);
        }

        toggleTheme() {
            this.state.isDarkMode = !this.state.isDarkMode;
            this.applyTheme();
            if (document.getElementById('gemini-analysis-panel')) {
                this.generateReport(this.state.data);
            }
        }

        applyTheme() {
            const dark = this.state.isDarkMode;
            const colors = { bg: dark ? '#202124' : '#ffffff', text: dark ? '#e8eaed' : '#202124', subText: dark ? '#9aa0a6' : '#5f6368', border: dark ? '#5f6368' : '#ddd', inputBg: dark ? '#303134' : '#ffffff', inputText: dark ? '#e8eaed' : '#202124', btnPrimary: '#1a73e8', btnText: '#ffffff' };
            const p = this.ui.panel; p.style.background = colors.bg; p.style.color = colors.text; p.style.borderColor = colors.border;
            this.ui.title.style.color = colors.btnPrimary;
            this.ui.labels.forEach(l => l.style.color = colors.subText);
            this.ui.inputs.forEach(i => { i.style.background = colors.inputBg; i.style.color = colors.inputText; i.style.border = `1px solid ${colors.border}`; });
            this.ui.downloadType.style.background = colors.inputBg; this.ui.downloadType.style.color = colors.inputText; this.ui.downloadType.style.border = `1px solid ${colors.border}`;
            this.ui.startBtn.style.background = colors.btnPrimary; this.ui.startBtn.style.color = colors.btnText;
            this.ui.importBtn.style.background = colors.inputBg; this.ui.importBtn.style.color = colors.inputText; this.ui.importBtn.style.border = `1px solid ${colors.border}`;
            this.ui.themeBtn.textContent = dark ? '🌞' : '🌓';
            const svgPath = this.ui.githubBtn.querySelector('path'); if (svgPath) svgPath.style.fill = colors.text;
        }

        updateStatus(text, color) {
            this.ui.status.textContent = text;
            this.ui.status.style.color = color || (this.state.isDarkMode ? '#9aa0a6' : '#666');
        }

        handleFileImport(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const importedData = JSON.parse(e.target.result);
                    if (!Array.isArray(importedData)) throw new Error("JSON 格式错误");
                    this.state.data = importedData;
                    // 导入时也同步到 dataPool，防止后续抓取覆盖
                    this.addDataToPool(importedData);
                    this.updateStatus(`导入成功: ${importedData.length} 条数据`, "#34a853");
                    this.ui.downloadArea.style.display = 'block';
                    this.ui.imgArea.style.display = 'block';
                    this.generateReport(importedData);
                } catch (err) { alert("导入失败: " + err.message); }
            };
            reader.readAsText(file);
        }

        startProcess() {
            if (this.state.isScrolling && !this.state.forceStop) {
                this.state.forceStop = true;
                this.ui.startBtn.textContent = "正在停止...";
                return;
            }
            const startVal = this.ui.inputs[0].value;
            const endVal = this.ui.inputs[1].value;
            this.state.dateRange.start = startVal ? new Date(startVal) : null;
            this.state.dateRange.end = endVal ? new Date(endVal) : null;
            
            // 修正：不再清空 dataPool，实现增量抓取
            // this.state.dataPool = []; // REMOVED
            
            this.state.forceStop = false;
            const targetDateRaw = startVal ? startVal.replace(/-/g, '') : "20000101";
            this.state.isScrolling = true;
            this.ui.startBtn.textContent = "停止滚动"; 
            this.ui.startBtn.style.background = "#ea4335"; 
            this.updateStatus(`正在滚动... (当前池中: ${this.state.dataPool.length} 条)`, "#e37400");
            this.runAutoScroll(targetDateRaw);
        }

        runAutoScroll(targetDateStr) {
            const scrollTimer = setInterval(() => {
                if (this.state.forceStop) {
                    this.finishScroll(scrollTimer, "用户停止");
                    return;
                }
                const endSign = document.querySelector(SELECTORS.endSign);
                if (endSign && endSign.offsetParent !== null) {
                    this.finishScroll(scrollTimer, "已到达记录末端");
                    return;
                }
                const items = document.querySelectorAll(`${SELECTORS.itemTag}[data-date]`);
                if (items.length > 0) {
                    const lastItem = items[items.length - 1];
                    const currentDateId = lastItem.getAttribute('data-date');
                    if (currentDateId && parseInt(currentDateId) < parseInt(targetDateStr)) {
                         this.finishScroll(scrollTimer, `已到达设定日期: ${currentDateId}`);
                         return;
                    }
                }
                window.scrollTo(0, document.body.scrollHeight);
            }, 800);
        }

        finishScroll(timer, msg) {
            clearInterval(timer);
            this.state.isScrolling = false;
            this.ui.startBtn.textContent = "重新开始";
            this.ui.startBtn.style.background = "#1a73e8";
            this.updateStatus(msg + "，开始分析...", "#1a73e8");
            setTimeout(() => this.extractAndVisualize(), 1500);
        }

        extractAndVisualize() {
            const container = document.querySelector(SELECTORS.listContainer)?.parentElement || document.body;
            let finalData = [];
            let methodUsed = "";

            const hasDeleteButtons = !!container.querySelector(SELECTORS.deleteBtn);

            // 1. 扫描页面 Script 标签 (暴力匹配)
            // 这里将初始加载的数据也放入池子，和 XHR 数据合并
            const scriptTags = document.querySelectorAll('script');
            scriptTags.forEach(script => {
                const items = parseGeminiData(script.innerHTML);
                if (items.length > 0) this.addDataToPool(items);
            });
            
            // 2. 从 dataPool 生成最终数据
            if (this.state.dataPool.length > 0) {
                // 排序：时间倒序
                this.state.dataPool.sort((a, b) => b.ts - a.ts);
                
                // 转换为显示格式
                for (let item of this.state.dataPool) {
                    const dateObj = new Date(item.ts);
                    const datePart = dateObj.toLocaleDateString('en-CA');
                    const timePart = dateObj.toLocaleTimeString('en-US', { hour12: false });
                    finalData.push({ fullTime: `${datePart} ${timePart}`, prompt: item.prompt });
                }
                methodUsed = "策略B: 网络拦截/脚本分析 (完整)";
            }
            
            // 3. Fallback: 如果池子依然为空（极少见），尝试 DOM
            if (finalData.length === 0 && hasDeleteButtons) {
                methodUsed = "策略A: DOM解析 (完整)";
                finalData = this.strategyDomWithDeleteBtn(container);
            } else if (finalData.length === 0) {
                methodUsed = "策略C: 可见文本 (不完整)";
                finalData = this.strategyVisibleDom(container);
                alert("【警告】\n无法获取后台完整数据。\n将降级使用页面可见文本统计，内容将被截断。");
            }

            // 日期过滤
            const { start, end } = this.state.dateRange;
            const validStart = start || new Date('2000-01-01');
            const validEnd = end ? new Date(end.getTime() + 86400000) : new Date('2099-12-31');
            const filteredData = finalData.filter(item => {
                const itemDate = new Date(item.fullTime.split(' ')[0]);
                return !isNaN(itemDate.getTime()) && itemDate >= validStart && itemDate < validEnd;
            });

            this.state.data = filteredData;
            if (filteredData.length === 0) {
                 this.updateStatus(`未找到数据 [${methodUsed}]`, "red");
                 return;
            }

            this.updateStatus(`提取完成: ${filteredData.length} 条 [${methodUsed}]`, "#34a853");
            this.ui.downloadArea.style.display = 'block';
            this.ui.imgArea.style.display = 'block';
            this.generateReport(filteredData);
        }

        // 策略A和C (DOM) - 保持不变
        strategyDomWithDeleteBtn(container) {
            const results = [];
            const elements = container.children;
            let headerDate = "";
            for (let el of elements) {
                const dateHeader = el.querySelector(SELECTORS.dateHeader);
                if (dateHeader) headerDate = dateHeader.innerText.trim();
                if (el.tagName.toLowerCase() === SELECTORS.itemTag.toLowerCase()) {
                    let itemDateStr = "";
                    const rawDateAttr = el.getAttribute('data-date');
                    if (rawDateAttr && rawDateAttr.length === 8) itemDateStr = `${rawDateAttr.substring(0, 4)}-${rawDateAttr.substring(4, 6)}-${rawDateAttr.substring(6, 8)}`;
                    else itemDateStr = headerDate;
                    const timeEl = el.querySelector(SELECTORS.timestamp);
                    const deleteBtn = el.querySelector(SELECTORS.deleteBtn);
                    if (timeEl && deleteBtn && itemDateStr) {
                        let timeText = timeEl.innerText.replace(/\u202f/g, ' ').split('•')[0].trim();
                        let promptText = "";
                        const ariaLabel = deleteBtn.getAttribute('aria-label');
                        if (ariaLabel) promptText = ariaLabel.replace(/^Delete activity item\s*/, '').replace(/\u202f/g, ' ').trim();
                        if (promptText) results.push({ fullTime: `${itemDateStr} ${timeText}`, prompt: promptText });
                    }
                }
            }
            return results;
        }

        strategyVisibleDom(container) {
            const results = [];
            const elements = container.children;
            let headerDate = "";
            for (let el of elements) {
                const dateHeader = el.querySelector(SELECTORS.dateHeader);
                if (dateHeader) headerDate = dateHeader.innerText.trim();
                if (el.tagName.toLowerCase() === SELECTORS.itemTag.toLowerCase()) {
                    let itemDateStr = "";
                    const rawDateAttr = el.getAttribute('data-date');
                    if (rawDateAttr && rawDateAttr.length === 8) itemDateStr = `${rawDateAttr.substring(0, 4)}-${rawDateAttr.substring(4, 6)}-${rawDateAttr.substring(6, 8)}`;
                    else itemDateStr = headerDate;
                    const timeEl = el.querySelector(SELECTORS.timestamp);
                    const promptEl = el.querySelector(SELECTORS.visiblePrompt);
                    if (timeEl && promptEl && itemDateStr) {
                        let timeText = timeEl.innerText.replace(/\u202f/g, ' ').split('•')[0].trim();
                        let promptText = promptEl.innerText.replace(/^Prompted\s*/, '').trim();
                        if (promptText) results.push({ fullTime: `${itemDateStr} ${timeText}`, prompt: promptText });
                    }
                }
            }
            return results;
        }

        generateReport(data) {
            if (!data || data.length === 0) return;
            const dark = this.state.isDarkMode;
            const colors = { bg: dark ? '#202124' : '#ffffff', text: dark ? '#e8eaed' : '#202124', subText: dark ? '#9aa0a6' : '#5f6368', grid: dark ? '#3c4043' : '#e0e0e0', primary: '#1a73e8', accent: '#ea4335', bar: '#4285f4', boxFill: dark ? '#303134' : '#e8f0fe' };

            const dailyCountsMap = {}; const hourlyCounts = new Array(24).fill(0);
            data.forEach(item => {
                const datePart = item.fullTime.split(' ')[0]; dailyCountsMap[datePart] = (dailyCountsMap[datePart] || 0) + 1;
                const timeMatch = item.fullTime.match(/(\d+):(\d+)(?::(\d+))?\s*(AM|PM)?/i);
                if (timeMatch) {
                    let hour = parseInt(timeMatch[1]); const ampm = timeMatch[4] ? timeMatch[4].toUpperCase() : null;
                    if (ampm === 'PM' && hour !== 12) hour += 12; if (ampm === 'AM' && hour === 12) hour = 0;
                    if (hour >= 0 && hour < 24) hourlyCounts[hour]++;
                }
            });
            const dates = Object.keys(dailyCountsMap).sort(); const dayValues = dates.map(d => dailyCountsMap[d]);

            const oldPanel = document.getElementById('gemini-analysis-panel'); if (oldPanel) oldPanel.remove();
            const container = document.createElement('div'); container.id = 'gemini-analysis-panel';
            Object.assign(container.style, { position: 'fixed', top: '2%', left: '5%', zIndex: '100000', background: colors.bg, color: colors.text, padding: '30px', border: `1px solid ${colors.grid}`, boxShadow: '0 10px 25px rgba(0,0,0,0.5)', maxHeight: '95vh', overflowY: 'auto', width: '90%', borderRadius: '12px', fontFamily: 'Segoe UI, Roboto, sans-serif' });
            
            const header = document.createElement('div'); header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;';
            header.innerHTML = `<h2>Gemini 数据分析报告 (${data.length} 条)</h2>`;
            const closeBtn = document.createElement('button'); closeBtn.textContent = '✕ 关闭'; closeBtn.onclick = () => container.remove();
            Object.assign(closeBtn.style, { padding:'8px 16px', borderRadius:'4px', border:'none', cursor:'pointer', background: this.state.isDarkMode ? '#3c4043' : '#f1f3f4', color: colors.text });
            header.appendChild(closeBtn); container.appendChild(header);

            const createChartContainer = (label, height) => {
                const wrapper = document.createElement('div'); wrapper.style.marginBottom = '30px';
                const p = document.createElement('div'); p.textContent = label; p.style.cssText = `font-size:16px; font-weight:600; color:${colors.subText}; margin-bottom:10px;`;
                const canvas = document.createElement('canvas'); canvas.width = Math.min(window.innerWidth * 0.85, 1200); canvas.height = height; canvas.style.width = '100%'; canvas._chartTitle = label; 
                wrapper.appendChild(p); wrapper.appendChild(canvas); container.appendChild(wrapper); return canvas;
            };

            const boxCanvas = createChartContainer('每日发送量箱线图', 220);
            const dayCanvas = createChartContainer('每日请求量统计', 350); 
            const lineCanvas = createChartContainer('24小时活跃分布', 300);
            this.state.charts = { box: boxCanvas, day: dayCanvas, line: lineCanvas };
            document.body.appendChild(container);

            this.drawFullCharts(boxCanvas, dayCanvas, lineCanvas, dayValues, dates, hourlyCounts, colors, data.length);
        }

        drawFullCharts(boxCanvas, dayCanvas, lineCanvas, dayValues, dates, hourlyCounts, colors, totalRequests) {
             const sortedValues = [...dayValues].sort((a, b) => a - b);
             const n = sortedValues.length;
             const min = sortedValues[0]; const max = sortedValues[n - 1];
             const q1 = sortedValues[Math.floor(n * 0.25)]; const median = sortedValues[Math.floor(n * 0.5)]; const q3 = sortedValues[Math.floor(n * 0.75)];
             const avg = (dayValues.reduce((a, b) => a + b, 0) / n).toFixed(1);

             const ctxBox = boxCanvas.getContext('2d');
             const padding = 80, w = boxCanvas.width - padding * 2, h = boxCanvas.height;
             const range = Math.max(max - min, 1);
             const scale = (val) => padding + ((val - min) / range) * w;
             const midY = h / 2;
             ctxBox.strokeStyle = colors.subText; ctxBox.lineWidth = 2;
             ctxBox.beginPath(); ctxBox.moveTo(scale(min), midY); ctxBox.lineTo(scale(max), midY); ctxBox.stroke();
             const q1X = scale(q1), q3X = scale(q3);
             ctxBox.fillStyle = colors.boxFill; ctxBox.strokeStyle = colors.primary;
             ctxBox.fillRect(q1X, midY - 35, q3X - q1X, 70); ctxBox.strokeRect(q1X, midY - 35, q3X - q1X, 70);
             ctxBox.beginPath(); [[min, 25], [max, 25], [median, 35], [q1, 35], [q3, 35]].forEach(([val, len]) => { ctxBox.moveTo(scale(val), midY - len); ctxBox.lineTo(scale(val), midY + len); }); ctxBox.stroke();
             const avgX = scale(parseFloat(avg)); ctxBox.setLineDash([4, 2]); ctxBox.strokeStyle = colors.accent; ctxBox.beginPath(); ctxBox.moveTo(avgX, midY - 45); ctxBox.lineTo(avgX, midY + 45); ctxBox.stroke(); ctxBox.setLineDash([]);
             ctxBox.font = 'bold 12px Arial'; ctxBox.textAlign = 'center'; ctxBox.fillStyle = colors.primary; ctxBox.fillText(`Q1: ${q1}`, q1X, midY - 45); ctxBox.fillText(`Med: ${median}`, scale(median), midY - 55); ctxBox.fillText(`Q3: ${q3}`, q3X, midY - 45); ctxBox.fillStyle = colors.subText; ctxBox.fillText(`Min: ${min}`, scale(min), midY + 45); ctxBox.fillText(`Max: ${max}`, scale(max), midY + 45); ctxBox.fillStyle = colors.accent; ctxBox.fillText(`Avg: ${avg}`, avgX, midY + 65);

             const ctxBar = dayCanvas.getContext('2d');
             const maxVal = Math.max(...dayValues, 5);
             const paddingB = 80, paddingT = 40, paddingS = 60;
             const wBar = dayCanvas.width - paddingS * 2, hBar = dayCanvas.height - paddingT - paddingB;
             const spacing = wBar / dates.length, barW = Math.min(spacing * 0.8, 60);
             dayValues.forEach((v, i) => {
                 const bh = (v / maxVal) * hBar;
                 const x = paddingS + (i * spacing) + (spacing - barW)/2;
                 const y = dayCanvas.height - paddingB - bh;
                 ctxBar.fillStyle = colors.bar; ctxBar.fillRect(x, y, barW, bh);
                 ctxBar.fillStyle = colors.text; ctxBar.textAlign = 'center'; ctxBar.font = 'bold 10px Arial'; ctxBar.fillText(v, x + barW/2, y - 5);
                 ctxBar.save(); ctxBar.translate(x + barW/2, dayCanvas.height - paddingB + 10); ctxBar.rotate(Math.PI / 2); ctxBar.font = '10px Arial'; ctxBar.fillStyle = colors.subText; ctxBar.textAlign = 'left'; ctxBar.fillText(dates[i], 0, 4); ctxBar.restore();
             });

             const ctxLine = lineCanvas.getContext('2d');
             const maxV = Math.max(...hourlyCounts, 5);
             const p = 60, wLine = lineCanvas.width - p * 2, hLine = lineCanvas.height - p * 2;
             ctxLine.strokeStyle = colors.grid; ctxLine.beginPath(); ctxLine.moveTo(p, p); ctxLine.lineTo(p, lineCanvas.height - p); ctxLine.lineTo(lineCanvas.width - p, lineCanvas.height - p); ctxLine.stroke();
             ctxLine.beginPath(); ctxLine.strokeStyle = colors.accent; ctxLine.lineWidth = 3;
             hourlyCounts.forEach((v, i) => { const x = p + (i * (wLine / 23)); const y = lineCanvas.height - p - (v / maxV * hLine); i === 0 ? ctxLine.moveTo(x, y) : ctxLine.lineTo(x, y); }); ctxLine.stroke();
             hourlyCounts.forEach((v, i) => {
                 const x = p + (i * (wLine / 23)); const y = lineCanvas.height - p - (v / maxV * hLine);
                 if (v > 0) {
                     ctxLine.fillStyle = colors.accent; ctxLine.beginPath(); ctxLine.arc(x, y, 4, 0, Math.PI * 2); ctxLine.fill();
                     const pct = totalRequests > 0 ? ((v / totalRequests) * 100).toFixed(1) + '%' : '';
                     ctxLine.fillStyle = colors.text; ctxLine.textAlign = 'center'; ctxLine.font = 'bold 11px Arial'; ctxLine.fillText(`${v} (${pct})`, x, y - 15);
                 }
                 if (i % 2 === 0 || i === 23) { ctxLine.fillStyle = colors.subText; ctxLine.font = '11px Arial'; ctxLine.fillText(i + 'h', x, lineCanvas.height - p + 20); }
             });
        }

        downloadMergedImage() {
            const checkboxes = this.ui.imgArea.querySelectorAll('input[type="checkbox"]:checked');
            if (checkboxes.length === 0) { alert("请至少选择一个图表"); return; }
            const selectedKeys = Array.from(checkboxes).map(cb => cb.value);
            const canvasList = selectedKeys.map(key => this.state.charts[key]).filter(c => c);
            if (canvasList.length === 0) { alert("请先生成报告"); return; }
            const padding = 40, titleHeight = 50, mainHeaderHeight = 80, footerHeight = 40;
            const width = Math.max(...canvasList.map(c => c.width));
            let totalHeight = mainHeaderHeight + footerHeight;
            canvasList.forEach(c => { totalHeight += titleHeight + c.height + padding; });
            const mergeCanvas = document.createElement('canvas'); mergeCanvas.width = width; mergeCanvas.height = totalHeight;
            const ctx = mergeCanvas.getContext('2d');
            const dark = this.state.isDarkMode;
            const colors = { bg: dark ? '#202124' : '#ffffff', text: dark ? '#e8eaed' : '#202124', subText: dark ? '#9aa0a6' : '#5f6368' };
            ctx.fillStyle = colors.bg; ctx.fillRect(0, 0, width, totalHeight);
            ctx.font = 'bold 36px "Google Sans", sans-serif'; ctx.fillStyle = colors.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText("Gemini 数据分析报告", width / 2, mainHeaderHeight / 2);
            let currentY = mainHeaderHeight;
            canvasList.forEach(c => {
                ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.font = 'bold 24px Arial'; ctx.fillStyle = colors.text;
                ctx.fillText(c._chartTitle, 40, currentY + 10);
                ctx.drawImage(c, 0, currentY + titleHeight);
                currentY += titleHeight + c.height + padding;
            });
            const footerY = totalHeight - footerHeight + 10;
            ctx.textAlign = 'center'; ctx.font = '14px Arial'; ctx.fillStyle = colors.subText;
            ctx.fillText(`Created by 788009/gemini-usage-analyzer v${APP_VERSION}`, width / 2, footerY);
            const link = document.createElement('a'); link.download = `gemini_report_${new Date().toISOString().slice(0,10)}.png`;
            link.href = mergeCanvas.toDataURL('image/png'); link.click();
        }

        handleDataDownload() {
            if (this.state.data.length === 0) { alert("无数据"); return; }
            const type = this.ui.downloadType.value;
            let content = "", mimeType = "text/plain", extension = "txt";
            const escapeNewLine = (str) => str.replace(/\n/g, '\\n');
            switch (type) {
                case 'json_full': content = JSON.stringify(this.state.data, null, 2); mimeType = "application/json"; extension = "json"; break;
                case 'json_time': content = JSON.stringify(this.state.data.map(d => ({fullTime: d.fullTime})), null, 2); mimeType = "application/json"; extension = "json"; break;
                case 'json_prompt': content = JSON.stringify(this.state.data.map(d => ({prompt: d.prompt})), null, 2); mimeType = "application/json"; extension = "json"; break;
                case 'txt_line_full': content = this.state.data.map(d => `${d.fullTime} | ${escapeNewLine(d.prompt)}`).join('\n'); break;
                case 'txt_line_prompt': content = this.state.data.map(d => escapeNewLine(d.prompt)).join('\n'); break;
                case 'txt_block': content = this.state.data.map(d => `--- ${d.fullTime} ---\n${d.prompt}`).join('\n\n'); break;
            }
            const blob = new Blob([content], { type: mimeType }); const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = `gemini_${type}_${this.state.dateRange.start?.toISOString().slice(0,10) || 'all'}.${extension}`;
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        }
    }

    setTimeout(() => { new AppUI(); }, 1500);
})();