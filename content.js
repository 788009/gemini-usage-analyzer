// content.js - v1.4
(function () {
    // --- 配置常量区 (集中管理选择器) ---
    const SELECTORS = {
        // 滚动到底部时出现的标志元素
        endSign: 'div[jsname="jOfkMb"]',
        // 包含所有历史记录条目的主容器
        listContainer: 'div[jsname="i6CNtf"]',
        // 日期标题 (例如 "Today", "Yesterday")
        dateHeader: 'h2.rp10kf',
        // 具体的提问文本容器
        promptText: 'div[jsname="r4nke"]',
        // 时间戳元素 (例如 "10:30 AM")
        timestamp: '.H3Q9vf.XTnvW',
        // 单条记录的容器标签 (通常是 c-wiz)
        itemTag: 'c-wiz'
    };

    // 获取版本号 (优先从 manifest 读取)
    const getVersion = () => {
        try {
            return chrome.runtime.getManifest().version;
        } catch (e) {
            return "0.0.0"; // Fallback if tested outside extension context
        }
    };

    const APP_VERSION = getVersion();
    console.log(`Gemini Analyzer v${APP_VERSION} loaded.`);

    class AppUI {
        constructor() {
            this.state = {
                isScrolling: false,
                isDarkMode: false,
                data: [],
                dateRange: { start: null, end: null },
                charts: {}
            };
            
            this.detectSystemTheme();
            this.initControlPanel();
            this.applyTheme();

            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
                this.state.isDarkMode = e.matches;
                this.applyTheme();
                if (document.getElementById('gemini-analysis-panel')) {
                    this.generateReport(this.state.data);
                }
            });
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
                    <button id="btn-start" style="flex:1; padding:10px; border-radius:4px; border:none; cursor:pointer; font-weight:bold;">开始抓取</button>
                    <button id="btn-json" style="flex:1; padding:10px; border-radius:4px; border:none; cursor:pointer; font-weight:bold; display:none;">下载 JSON</button>
                </div>

                <div id="img-download-area" style="display:none; border-top:1px solid #ddd; padding-top:10px; margin-top:10px;">
                    <div style="font-size:12px; font-weight:bold; margin-bottom:5px;">导出图片选项:</div>
                    <label style="display:block; margin-bottom:3px; font-size:12px;"><input type="checkbox" value="box" checked> 每日发送量箱线图</label>
                    <label style="display:block; margin-bottom:3px; font-size:12px;"><input type="checkbox" value="day" checked> 每日趋势图</label>
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
                inputs: panel.querySelectorAll('input'),
                themeBtn: panel.querySelector('#btn-theme'),
                githubBtn: panel.querySelector('#btn-github'),
                startBtn: panel.querySelector('#btn-start'),
                jsonBtn: panel.querySelector('#btn-json'),
                imgArea: panel.querySelector('#img-download-area'),
                imgBtn: panel.querySelector('#btn-img-merge'),
                status: panel.querySelector('#status-msg')
            };

            const today = new Date();
            this.ui.inputs[1].value = today.toISOString().split('T')[0];

            this.ui.startBtn.onclick = () => this.startProcess();
            this.ui.jsonBtn.onclick = () => this.downloadJson();
            this.ui.themeBtn.onclick = () => this.toggleTheme();
            this.ui.imgBtn.onclick = () => this.downloadMergedImage();
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
            const colors = {
                bg: dark ? '#202124' : '#ffffff',
                text: dark ? '#e8eaed' : '#202124',
                subText: dark ? '#9aa0a6' : '#5f6368',
                border: dark ? '#5f6368' : '#ddd',
                btnPrimary: '#1a73e8',
                btnText: '#ffffff',
                inputBg: dark ? '#303134' : '#ffffff',
                inputText: dark ? '#e8eaed' : '#202124',
                areaBorder: dark ? '#5f6368' : '#ddd'
            };

            const p = this.ui.panel;
            p.style.background = colors.bg;
            p.style.borderColor = colors.border;
            p.style.color = colors.text;
            
            this.ui.title.style.color = colors.btnPrimary;
            this.ui.labels.forEach(l => l.style.color = colors.subText);
            this.ui.inputs.forEach(i => {
                i.style.background = colors.inputBg;
                i.style.color = colors.inputText;
                i.style.border = `1px solid ${colors.border}`;
            });
            this.ui.startBtn.style.background = colors.btnPrimary;
            this.ui.startBtn.style.color = colors.btnText;
            this.ui.jsonBtn.style.background = '#34a853';
            this.ui.jsonBtn.style.color = colors.btnText;
            
            this.ui.imgArea.style.borderTopColor = colors.areaBorder;
            this.ui.themeBtn.textContent = dark ? '🌞' : '🌓';
            
            const svgPath = this.ui.githubBtn.querySelector('path');
            if (svgPath) svgPath.style.fill = colors.text;
        }

        updateStatus(text, color) {
            this.ui.status.textContent = text;
            this.ui.status.style.color = color || (this.state.isDarkMode ? '#9aa0a6' : '#666');
        }

        startProcess() {
            if (this.state.isScrolling) return;

            const startVal = this.ui.inputs[0].value;
            const endVal = this.ui.inputs[1].value;

            this.state.dateRange.start = startVal ? new Date(startVal) : null;
            this.state.dateRange.end = endVal ? new Date(endVal) : null;
            
            const targetDateRaw = startVal ? startVal.replace(/-/g, '') : "20000101";

            this.state.isScrolling = true;
            this.ui.startBtn.disabled = true;
            this.ui.startBtn.style.opacity = '0.7';
            this.updateStatus("正在滚动页面...", "#e37400");

            this.runAutoScroll(targetDateRaw);
        }

        runAutoScroll(targetDateStr) {
            const scrollTimer = setInterval(() => {
                // 使用常量 SELECTORS.endSign
                const endSign = document.querySelector(SELECTORS.endSign);
                if (endSign && endSign.offsetParent !== null) {
                    this.finishScroll(scrollTimer, "已到达记录末端");
                    return;
                }

                // 使用常量 SELECTORS.dateHeader
                const dateHeaders = document.querySelectorAll(SELECTORS.dateHeader);
                if (dateHeaders.length > 0) {
                    let lastDateEl = null;
                    for (let i = dateHeaders.length - 1; i >= 0; i--) {
                        const el = dateHeaders[i].closest('[data-date]');
                        if (el) { lastDateEl = el; break; }
                    }

                    if (lastDateEl) {
                        const currentDateId = lastDateEl.getAttribute('data-date');
                        if (currentDateId && parseInt(currentDateId) <= parseInt(targetDateStr)) {
                            this.finishScroll(scrollTimer, `已到达设定日期: ${currentDateId}`);
                            return;
                        }
                    }
                }
                window.scrollTo(0, document.body.scrollHeight);
            }, 800);
        }

        finishScroll(timer, msg) {
            clearInterval(timer);
            this.state.isScrolling = false;
            this.updateStatus(msg + "，开始分析...", "#1a73e8");
            setTimeout(() => this.extractAndVisualize(), 1500);
        }

        extractAndVisualize() {
            // 使用常量 SELECTORS
            const container = document.querySelector(SELECTORS.listContainer)?.parentElement || document.body;
            const elements = container.children;
            let results = [];
            let currentDate = "";

            for (let el of elements) {
                // 使用常量 SELECTORS.dateHeader
                const dateHeader = el.querySelector(SELECTORS.dateHeader);
                if (dateHeader) {
                    const rawDate = el.getAttribute('data-date'); 
                    if (rawDate) {
                        currentDate = `${rawDate.substring(0, 4)}-${rawDate.substring(4, 6)}-${rawDate.substring(6, 8)}`;
                    } else {
                        currentDate = dateHeader.innerText.trim();
                    }
                    continue;
                }

                if (el.tagName.toLowerCase() === SELECTORS.itemTag.toLowerCase()) {
                    // 使用常量 SELECTORS.promptText, SELECTORS.timestamp
                    const promptEl = el.querySelector(SELECTORS.promptText);
                    const timeEl = el.querySelector(SELECTORS.timestamp); 
                    if (promptEl && timeEl) {
                        let promptText = promptEl.innerText.replace(/^Prompted\s+/, '').trim();
                        let timeText = timeEl.innerText.split('•')[0].trim();
                        results.push({ fullTime: `${currentDate} ${timeText}`, prompt: promptText });
                    }
                }
            }

            const { start, end } = this.state.dateRange;
            const validStart = start || new Date('2000-01-01');
            const validEnd = end ? new Date(end.getTime() + 86400000) : new Date('2099-12-31');

            const filteredData = results.filter(item => {
                const itemDate = new Date(item.fullTime.split(' ')[0]);
                return itemDate >= validStart && itemDate < validEnd;
            });

            this.state.data = filteredData;
            this.updateStatus(`提取完成: ${filteredData.length} 条`, "#34a853");
            
            this.ui.jsonBtn.style.display = 'block';
            this.ui.imgArea.style.display = 'block';
            this.ui.startBtn.disabled = false;
            this.ui.startBtn.style.opacity = '1';
            this.ui.startBtn.textContent = '重新开始';

            this.generateReport(filteredData);
        }

        generateReport(data) {
            if (!data || data.length === 0) {
                alert("指定范围内无数据。");
                return;
            }

            const dark = this.state.isDarkMode;
            const colors = {
                bg: dark ? '#202124' : '#ffffff',
                text: dark ? '#e8eaed' : '#202124',
                subText: dark ? '#9aa0a6' : '#5f6368',
                grid: dark ? '#3c4043' : '#e0e0e0',
                primary: '#1a73e8',
                accent: '#ea4335',
                bar: '#4285f4',
                boxFill: dark ? '#303134' : '#e8f0fe'
            };

            const dailyCountsMap = {};
            const hourlyCounts = new Array(24).fill(0);
            data.forEach(item => {
                const datePart = item.fullTime.split(' ')[0];
                dailyCountsMap[datePart] = (dailyCountsMap[datePart] || 0) + 1;
                const timeMatch = item.fullTime.match(/(\d+):(\d+)\s*(AM|PM)?/i);
                if (timeMatch) {
                    let hour = parseInt(timeMatch[1]);
                    const ampm = timeMatch[3] ? timeMatch[3].toUpperCase() : null;
                    if (ampm === 'PM' && hour !== 12) hour += 12;
                    if (ampm === 'AM' && hour === 12) hour = 0;
                    if (hour >= 0 && hour < 24) hourlyCounts[hour]++;
                }
            });
            const totalRequests = data.length;
            const dates = Object.keys(dailyCountsMap).sort();
            const dayValues = dates.map(d => dailyCountsMap[d]);
            const sortedValues = [...dayValues].sort((a, b) => a - b);
            const n = sortedValues.length;
            const min = sortedValues[0];
            const max = sortedValues[n - 1];
            const q1 = sortedValues[Math.floor(n * 0.25)];
            const median = sortedValues[Math.floor(n * 0.5)];
            const q3 = sortedValues[Math.floor(n * 0.75)];
            const avg = (dayValues.reduce((a, b) => a + b, 0) / n).toFixed(1);

            const oldPanel = document.getElementById('gemini-analysis-panel');
            if (oldPanel) oldPanel.remove();

            const container = document.createElement('div');
            container.id = 'gemini-analysis-panel';
            Object.assign(container.style, {
                position: 'fixed', top: '2%', left: '5%', zIndex: '100000',
                background: colors.bg, color: colors.text,
                padding: '30px', border: `1px solid ${colors.grid}`,
                boxShadow: '0 10px 25px rgba(0,0,0,0.5)', maxHeight: '95vh',
                overflowY: 'auto', width: '90%', borderRadius: '12px',
                fontFamily: 'Segoe UI, Roboto, sans-serif'
            });

            const header = document.createElement('div');
            header.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;';
            header.innerHTML = `<h2>Gemini 数据分析报告 (${data.length} 条)</h2>`;
            const closeBtn = document.createElement('button');
            closeBtn.textContent = '✕ 关闭';
            closeBtn.onclick = () => container.remove();
            Object.assign(closeBtn.style, { padding:'8px 16px', borderRadius:'4px', border:'none', cursor:'pointer', background: dark ? '#3c4043' : '#f1f3f4', color: colors.text });
            header.appendChild(closeBtn);
            container.appendChild(header);

            const createChartContainer = (label, height) => {
                const wrapper = document.createElement('div');
                wrapper.style.marginBottom = '30px';
                const p = document.createElement('div');
                p.textContent = label;
                p.style.cssText = `font-size:16px; font-weight:600; color:${colors.subText}; margin-bottom:10px;`;
                const canvas = document.createElement('canvas');
                canvas.width = Math.min(window.innerWidth * 0.85, 1200);
                canvas.height = height;
                canvas.style.width = '100%';
                canvas._chartTitle = label; 
                wrapper.appendChild(p);
                wrapper.appendChild(canvas);
                container.appendChild(wrapper);
                return canvas;
            };

            const boxCanvas = createChartContainer('每日发送量箱线图', 220);
            const dayCanvas = createChartContainer('每日请求量趋势', 350);
            const lineCanvas = createChartContainer('24小时活跃分布', 300);
            
            this.state.charts = { box: boxCanvas, day: dayCanvas, line: lineCanvas };
            document.body.appendChild(container);

            // 1. Box Plot
            (function drawBox() {
                const ctx = boxCanvas.getContext('2d');
                const padding = 80, w = boxCanvas.width - padding * 2, h = boxCanvas.height;
                const range = Math.max(max - min, 1);
                const scale = (val) => padding + ((val - min) / range) * w;
                const midY = h / 2;

                ctx.strokeStyle = colors.subText; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.moveTo(scale(min), midY); ctx.lineTo(scale(max), midY); ctx.stroke();
                
                const q1X = scale(q1), q3X = scale(q3);
                ctx.fillStyle = colors.boxFill; ctx.strokeStyle = colors.primary;
                ctx.fillRect(q1X, midY - 35, q3X - q1X, 70);
                ctx.strokeRect(q1X, midY - 35, q3X - q1X, 70);

                ctx.beginPath();
                [[min, 25], [max, 25], [median, 35], [q1, 35], [q3, 35]].forEach(([val, len]) => {
                    ctx.moveTo(scale(val), midY - len); ctx.lineTo(scale(val), midY + len);
                });
                ctx.stroke();

                const avgX = scale(parseFloat(avg));
                ctx.setLineDash([4, 2]); ctx.strokeStyle = colors.accent;
                ctx.beginPath(); ctx.moveTo(avgX, midY - 45); ctx.lineTo(avgX, midY + 45); ctx.stroke();
                ctx.setLineDash([]);

                ctx.font = 'bold 12px Arial'; ctx.textAlign = 'center';
                ctx.fillStyle = colors.primary;
                ctx.fillText(`Q1: ${q1}`, q1X, midY - 45);
                ctx.fillText(`Med: ${median}`, scale(median), midY - 55);
                ctx.fillText(`Q3: ${q3}`, q3X, midY - 45);
                ctx.fillStyle = colors.subText;
                ctx.fillText(`Min: ${min}`, scale(min), midY + 45);
                ctx.fillText(`Max: ${max}`, scale(max), midY + 45);
                ctx.fillStyle = colors.accent;
                ctx.fillText(`Avg: ${avg}`, avgX, midY + 65);
            })();

            // 2. Bar Chart
            (function drawBar() {
                const ctx = dayCanvas.getContext('2d');
                const maxVal = Math.max(...dayValues, 5);
                const paddingB = 80, paddingT = 40, paddingS = 60;
                const w = dayCanvas.width - paddingS * 2, h = dayCanvas.height - paddingT - paddingB;
                const spacing = w / dates.length, barW = Math.min(spacing * 0.8, 60);

                dayValues.forEach((v, i) => {
                    const bh = (v / maxVal) * h;
                    const x = paddingS + (i * spacing) + (spacing - barW)/2;
                    const y = dayCanvas.height - paddingB - bh;
                    
                    ctx.fillStyle = colors.bar; ctx.fillRect(x, y, barW, bh);
                    if (barW > 15) {
                        ctx.fillStyle = colors.text; ctx.textAlign = 'center'; ctx.font = 'bold 10px Arial'; 
                        ctx.fillText(v, x + barW/2, y - 5);
                    }
                    ctx.save();
                    ctx.translate(x + barW/2, dayCanvas.height - paddingB + 10); 
                    ctx.rotate(Math.PI / 2);
                    ctx.font = '10px Arial'; ctx.fillStyle = colors.subText; ctx.textAlign = 'left'; 
                    ctx.fillText(dates[i], 0, 4);
                    ctx.restore();
                });
            })();

            // 3. Line Chart
            (function drawLine() {
                const ctx = lineCanvas.getContext('2d');
                const maxV = Math.max(...hourlyCounts, 5);
                const p = 60, w = lineCanvas.width - p * 2, h = lineCanvas.height - p * 2;
                
                ctx.strokeStyle = colors.grid; ctx.beginPath();
                ctx.moveTo(p, p); ctx.lineTo(p, lineCanvas.height - p); ctx.lineTo(lineCanvas.width - p, lineCanvas.height - p);
                ctx.stroke();

                ctx.beginPath(); ctx.strokeStyle = colors.accent; ctx.lineWidth = 3;
                hourlyCounts.forEach((v, i) => {
                    const x = p + (i * (w / 23));
                    const y = lineCanvas.height - p - (v / maxV * h);
                    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                });
                ctx.stroke();

                hourlyCounts.forEach((v, i) => {
                    const x = p + (i * (w / 23));
                    const y = lineCanvas.height - p - (v / maxV * h);
                    if (v > 0) {
                        ctx.fillStyle = colors.accent; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
                        
                        const pct = totalRequests > 0 ? ((v / totalRequests) * 100).toFixed(1) + '%' : '';
                        const label = `${v} (${pct})`;

                        ctx.fillStyle = colors.text; ctx.textAlign = 'center'; ctx.font = 'bold 11px Arial'; 
                        ctx.fillText(label, x, y - 15);
                    }
                    if (i % 2 === 0 || i === 23) {
                        ctx.fillStyle = colors.subText; ctx.font = '11px Arial'; 
                        ctx.fillText(i + 'h', x, lineCanvas.height - p + 20);
                    }
                });
            })();
        }

        downloadMergedImage() {
            const checkboxes = this.ui.imgArea.querySelectorAll('input[type="checkbox"]:checked');
            if (checkboxes.length === 0) {
                alert("请至少选择一个图表");
                return;
            }

            const selectedKeys = Array.from(checkboxes).map(cb => cb.value);
            const canvasList = selectedKeys.map(key => this.state.charts[key]).filter(c => c);

            if (canvasList.length === 0) {
                alert("请先生成报告");
                return;
            }

            const padding = 40;
            const titleHeight = 50; 
            const mainHeaderHeight = 80; 
            const footerHeight = 40; 
            
            const width = Math.max(...canvasList.map(c => c.width));
            
            let totalHeight = mainHeaderHeight + footerHeight; 
            canvasList.forEach(c => {
                totalHeight += titleHeight + c.height + padding;
            });

            const mergeCanvas = document.createElement('canvas');
            mergeCanvas.width = width;
            mergeCanvas.height = totalHeight;
            const ctx = mergeCanvas.getContext('2d');

            const dark = this.state.isDarkMode;
            const bgColor = dark ? '#202124' : '#ffffff';
            const textColor = dark ? '#e8eaed' : '#202124';
            const subTextColor = dark ? '#9aa0a6' : '#5f6368';

            // 1. 背景
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, width, totalHeight);

            // 2. 大标题
            ctx.font = 'bold 36px "Google Sans", sans-serif';
            ctx.fillStyle = textColor;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText("Gemini 数据分析报告", width / 2, mainHeaderHeight / 2);

            // 3. 图表内容
            let currentY = mainHeaderHeight;
            canvasList.forEach(c => {
                ctx.textAlign = 'left';
                ctx.textBaseline = 'top';
                ctx.font = 'bold 24px Arial';
                ctx.fillStyle = textColor;
                ctx.fillText(c._chartTitle, 40, currentY + 10);
                
                ctx.drawImage(c, 0, currentY + titleHeight);

                currentY += titleHeight + c.height + padding;
            });

            // 4. 底部署名 (包含版本号)
            const footerY = totalHeight - footerHeight + 10;
            ctx.textAlign = 'center';
            ctx.font = '14px Arial';
            ctx.fillStyle = subTextColor;
            // 动态版本号
            ctx.fillText(`Created by 788009/gemini-usage-analyzer v${APP_VERSION}`, width / 2, footerY);

            const link = document.createElement('a');
            link.download = `gemini_report_${new Date().toISOString().slice(0,10)}.png`;
            link.href = mergeCanvas.toDataURL('image/png');
            link.click();
        }

        downloadJson() {
            if (this.state.data.length === 0) { alert("无数据"); return; }
            const dataStr = JSON.stringify(this.state.data, null, 2);
            const blob = new Blob([dataStr], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gemini_data_${this.state.dateRange.start?.toISOString().slice(0,10) || 'all'}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    setTimeout(() => { new AppUI(); }, 1000);
})();