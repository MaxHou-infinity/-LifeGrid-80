/**
 * 导出功能模块
 */

// DOM元素
const exportBtn = document.getElementById('export-btn');
const exportFormatRadios = document.querySelectorAll('input[name="export-format"]');
const exportRangeRadios = document.querySelectorAll('input[name="export-range"]');
const customRangeDiv = document.querySelector('.custom-range');
const rangeStartInput = document.getElementById('range-start');
const rangeEndInput = document.getElementById('range-end');
const includeLegendCheckbox = document.getElementById('include-legend');
const includeQuoteCheckbox = document.getElementById('include-quote');

// 导出相关常量
const QUOTES = [
    "生命中最重要的不是你做了什么，而是你如何分配自己的时间。",
    "时间从不等待任何人，请明智地投资你的每一分钟。",
    "我们不只是消费时间，我们在决定如何度过生命。",
    "时间是唯一无法赚回的资源，你现在的选择将决定你的一生。",
    "让你的这一程足够精彩与有意义，我们拭目以待。",
    "改变生活不需要很多时间，只需要做出决定的那一刻。",
    "生命的价值在于你每天所做的选择，而不是你计划要做的事情。",
    "每一天都是生命赐予的礼物，珍惜每一刻。"
];

/**
 * 初始化导出功能
 */
function initExport() {
    // 绑定事件
    bindExportEvents();
}

/**
 * 绑定导出相关事件
 */
function bindExportEvents() {
    // 自定义范围选项显示/隐藏
    exportRangeRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.value === 'custom') {
                customRangeDiv.style.display = 'block';
            } else {
                customRangeDiv.style.display = 'none';
            }
        });
    });
    
    // 范围输入验证
    rangeStartInput.addEventListener('change', validateRangeInputs);
    rangeEndInput.addEventListener('change', validateRangeInputs);
    
    // 导出按钮点击事件
    exportBtn.addEventListener('click', handleExport);
}

/**
 * 验证范围输入
 */
function validateRangeInputs() {
    let start = parseInt(rangeStartInput.value);
    let end = parseInt(rangeEndInput.value);
    
    // 验证范围
    if (isNaN(start) || start < 1) {
        start = 1;
    } else if (start > MAX_AGE) {
        start = MAX_AGE;
    }
    
    if (isNaN(end) || end < 1) {
        end = 1;
    } else if (end > MAX_AGE) {
        end = MAX_AGE;
    }
    
    // 确保开始不大于结束
    if (start > end) {
        end = start;
    }
    
    // 更新输入值
    rangeStartInput.value = start;
    rangeEndInput.value = end;
}

/**
 * 处理导出操作
 */
function handleExport() {
    // 获取导出格式
    let format = 'png';
    exportFormatRadios.forEach(radio => {
        if (radio.checked) {
            format = radio.value;
        }
    });
    
    // 获取导出范围
    let exportRange = 'full';
    exportRangeRadios.forEach(radio => {
        if (radio.checked) {
            exportRange = radio.value;
        }
    });
    
    // 获取自定义范围
    let startYear = 1;
    let endYear = MAX_AGE;
    
    if (exportRange === 'custom') {
        validateRangeInputs();
        startYear = parseInt(rangeStartInput.value);
        endYear = parseInt(rangeEndInput.value);
    }
    
    // 获取附加选项
    const includeLegend = includeLegendCheckbox.checked;
    const includeQuote = includeQuoteCheckbox.checked;
    
    // 执行导出
    exportLifeGrid(format, startYear, endYear, includeLegend, includeQuote);
}

/**
 * 导出生命网格
 * @param {string} format - 导出格式（png/jpg/pdf）
 * @param {number} startYear - 开始年份
 * @param {number} endYear - 结束年份
 * @param {boolean} includeLegend - 是否包含图例
 * @param {boolean} includeQuote - 是否包含激励语
 */
function exportLifeGrid(format, startYear, endYear, includeLegend, includeQuote) {
    // 显示加载状态
    exportBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 正在生成...';
    exportBtn.disabled = true;
    
    // 为确保导出的视觉效果一致，临时固定缩放级别为100%
    const originalZoomLevel = zoomLevel;
    zoomLevel = 100;
    
    // 延迟执行以确保UI状态更新
    setTimeout(() => {
        // 创建导出容器
        const exportContainer = document.createElement('div');
        exportContainer.className = 'export-container';
        exportContainer.style.position = 'absolute';
        exportContainer.style.left = '-9999px';
        exportContainer.style.background = 'white';
        exportContainer.style.padding = '40px';
        exportContainer.style.boxSizing = 'border-box';
        exportContainer.style.width = '1200px';
        exportContainer.style.fontFamily = "'Noto Sans SC', 'Helvetica Neue', Arial, sans-serif";
        document.body.appendChild(exportContainer);
        
        // 添加标题
        const title = document.createElement('h1');
        title.textContent = '我的人生时间分配';
        title.style.textAlign = 'center';
        title.style.marginBottom = '15px';
        title.style.color = '#212529';
        title.style.fontWeight = '700';
        title.style.fontSize = '2.5rem';
        title.style.letterSpacing = '-0.5px';
        exportContainer.appendChild(title);
        
        // 添加副标题（显示选择的年份范围）
        const subtitle = document.createElement('p');
        subtitle.textContent = `第${startYear}年至第${endYear}年`;
        subtitle.style.textAlign = 'center';
        subtitle.style.marginBottom = '30px';
        subtitle.style.color = '#6c757d';
        subtitle.style.fontSize = '1.1rem';
        subtitle.style.fontWeight = '300';
        exportContainer.appendChild(subtitle);
        
        // 复制网格
        const gridClone = document.createElement('div');
        gridClone.style.display = 'flex';
        gridClone.style.marginBottom = '30px';
        exportContainer.appendChild(gridClone);
        
        // 复制年份标签
        const yearsClone = document.createElement('div');
        yearsClone.style.width = '50px';
        yearsClone.style.marginRight = '15px';
        yearsClone.style.flexShrink = '0';
        
        // 为选定的年份范围创建标签
        for (let i = startYear - 1; i < endYear; i++) {
            const yearLabel = document.createElement('div');
            yearLabel.style.height = `${CELL_SIZE + CELL_MARGIN}px`;
            yearLabel.style.display = 'flex';
            yearLabel.style.alignItems = 'center';
            yearLabel.style.justifyContent = 'flex-end';
            yearLabel.style.paddingRight = '8px';
            yearLabel.style.fontSize = '12px';
            yearLabel.style.color = '#6c757d';
            yearLabel.style.fontWeight = '400';
            yearLabel.textContent = `${i + 1}`;
            yearsClone.appendChild(yearLabel);
        }
        
        gridClone.appendChild(yearsClone);
        
        // 创建新画布
        const canvasClone = document.createElement('canvas');
        const cellSize = CELL_SIZE; // 导出时使用固定尺寸
        const cellWithMargin = cellSize + CELL_MARGIN;
        
        // 计算画布尺寸
        canvasClone.width = GRID_WIDTH * cellWithMargin;
        canvasClone.height = (endYear - startYear + 1) * cellWithMargin;
        
        const ctxClone = canvasClone.getContext('2d');
        
        // 临时调整主画布大小以捕获完整网格
        const originalWidth = canvas.width;
        const originalHeight = canvas.height;
        canvas.width = GRID_WIDTH * cellWithMargin;
        canvas.height = GRID_HEIGHT * cellWithMargin;
        
        // 重新渲染完整网格
        renderGrid();
        
        // 复制特定范围的网格内容
        const imageData = ctx.getImageData(
            0, 
            (startYear - 1) * cellWithMargin, 
            GRID_WIDTH * cellWithMargin, 
            (endYear - startYear + 1) * cellWithMargin
        );
        
        // 将图像数据应用到导出画布
        ctxClone.putImageData(imageData, 0, 0);
        
        // 添加画布到导出容器
        const canvasWrapper = document.createElement('div');
        canvasWrapper.style.overflow = 'hidden';
        canvasWrapper.style.border = '1px solid #e9ecef';
        canvasWrapper.style.borderRadius = '6px';
        canvasWrapper.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.08)';
        canvasWrapper.appendChild(canvasClone);
        gridClone.appendChild(canvasWrapper);
        
        // 添加图例
        if (includeLegend) {
            const legendClone = document.createElement('div');
            legendClone.style.display = 'flex';
            legendClone.style.flexWrap = 'wrap';
            legendClone.style.justifyContent = 'center';
            legendClone.style.padding = '20px';
            legendClone.style.gap = '20px';
            legendClone.style.borderTop = '1px solid #e9ecef';
            legendClone.style.marginTop = '30px';
            
            // 按占用时间从多到少排序活动
            const sortedActivities = [...activities].sort((a, b) => {
                return calculateActivityTotalWeeks(b) - calculateActivityTotalWeeks(a);
            });
            
            // 添加图例项
            sortedActivities.forEach(activity => {
                const legendItem = document.createElement('div');
                legendItem.style.display = 'flex';
                legendItem.style.alignItems = 'center';
                legendItem.style.marginRight = '25px';
                
                const colorBox = document.createElement('span');
                colorBox.style.width = '16px';
                colorBox.style.height = '16px';
                colorBox.style.backgroundColor = activity.color;
                colorBox.style.marginRight = '10px';
                colorBox.style.display = 'inline-block';
                colorBox.style.borderRadius = '4px';
                
                const activityText = document.createElement('span');
                const totalWeeks = calculateActivityTotalWeeks(activity);
                activityText.textContent = `${activity.name} (${totalWeeks}周)`;
                activityText.style.fontSize = '14px';
                activityText.style.fontWeight = '400';
                activityText.style.color = '#212529';
                
                legendItem.appendChild(colorBox);
                legendItem.appendChild(activityText);
                legendClone.appendChild(legendItem);
            });
            
            // 添加未分配时间图例
            const emptyLegend = document.createElement('div');
            emptyLegend.style.display = 'flex';
            emptyLegend.style.alignItems = 'center';
            
            const emptyBox = document.createElement('span');
            emptyBox.style.width = '16px';
            emptyBox.style.height = '16px';
            emptyBox.style.backgroundColor = '#f8f9fa';
            emptyBox.style.border = '1px solid #e9ecef';
            emptyBox.style.marginRight = '10px';
            emptyBox.style.display = 'inline-block';
            emptyBox.style.borderRadius = '4px';
            
            const emptyText = document.createElement('span');
            emptyText.textContent = '未分配时间';
            emptyText.style.fontSize = '14px';
            emptyText.style.fontWeight = '400';
            emptyText.style.color = '#212529';
            
            emptyLegend.appendChild(emptyBox);
            emptyLegend.appendChild(emptyText);
            legendClone.appendChild(emptyLegend);
            
            exportContainer.appendChild(legendClone);
        }
        
        // 添加激励语
        if (includeQuote) {
            const quoteDiv = document.createElement('div');
            quoteDiv.style.textAlign = 'center';
            quoteDiv.style.fontStyle = 'italic';
            quoteDiv.style.margin = '30px 0';
            quoteDiv.style.color = '#6c757d';
            quoteDiv.style.fontSize = '1.1rem';
            quoteDiv.style.fontWeight = '300';
            quoteDiv.style.lineHeight = '1.8';
            
            // 随机选择一条激励语
            const randomQuote = QUOTES[Math.floor(Math.random() * QUOTES.length)];
            quoteDiv.textContent = `"${randomQuote}"`;
            
            exportContainer.appendChild(quoteDiv);
        }
        
        // 添加页脚
        const footer = document.createElement('div');
        footer.style.textAlign = 'center';
        footer.style.fontSize = '14px';
        footer.style.color = '#6c757d';
        footer.style.marginTop = '30px';
        footer.style.fontWeight = '300';
        footer.textContent = 'Generated by MaxHou - Life Calculator';
        
        exportContainer.appendChild(footer);
        
        // 使用html2canvas将导出容器转换为图像
        html2canvas(exportContainer, {
            scale: 2, // 提高导出图像质量
            logging: false,
            useCORS: true,
            backgroundColor: '#ffffff'
        }).then(canvas => {
            // 移除导出容器
            document.body.removeChild(exportContainer);
            
            // 根据格式进行不同的处理
            if (format === 'pdf') {
                // PDF导出
                const { jsPDF } = window.jspdf;
                
                // 计算PDF尺寸
                const imgWidth = canvas.width;
                const imgHeight = canvas.height;
                const ratio = imgWidth / imgHeight;
                
                // 确定PDF方向和尺寸
                let orientation, pdfWidth, pdfHeight;
                if (ratio > 1) {
                    orientation = 'landscape';
                    pdfWidth = 297; // A4 landscape width in mm
                    pdfHeight = pdfWidth / ratio;
                    if (pdfHeight > 210) { // If height exceeds A4 landscape height
                        pdfHeight = 210;
                        pdfWidth = pdfHeight * ratio;
                    }
                } else {
                    orientation = 'portrait';
                    pdfHeight = 297; // A4 portrait height in mm
                    pdfWidth = pdfHeight * ratio;
                    if (pdfWidth > 210) { // If width exceeds A4 portrait width
                        pdfWidth = 210;
                        pdfHeight = pdfWidth / ratio;
                    }
                }
                
                const pdf = new jsPDF(orientation, 'mm', [pdfWidth, pdfHeight]);
                
                // 添加图像到PDF
                pdf.addImage(
                    canvas.toDataURL('image/png'), 
                    'PNG', 
                    0, 
                    0, 
                    pdfWidth, 
                    pdfHeight
                );
                
                // 保存PDF
                pdf.save(`life_calculator_${new Date().toISOString().slice(0, 10)}.pdf`);
            } else {
                // PNG或JPG导出
                const imageType = format === 'jpg' ? 'image/jpeg' : 'image/png';
                const dataUrl = canvas.toDataURL(imageType, 0.95); // 提高图像质量
                
                // 创建下载链接
                const link = document.createElement('a');
                link.href = dataUrl;
                link.download = `life_calculator_${new Date().toISOString().slice(0, 10)}.${format}`;
                link.click();
            }
            
            // 恢复原始画布大小
            canvas.width = originalWidth;
            canvas.height = originalHeight;
            zoomLevel = originalZoomLevel;
            
            // 恢复按钮状态
            exportBtn.innerHTML = '<i class="fas fa-download"></i> 导出';
            exportBtn.disabled = false;
            
            // 重新渲染原始网格
            renderGrid();
        }).catch(error => {
            console.error('导出失败:', error);
            alert('导出失败，请稍后再试。');
            
            // 恢复原始画布大小
            canvas.width = originalWidth;
            canvas.height = originalHeight;
            zoomLevel = originalZoomLevel;
            
            // 恢复按钮状态
            exportBtn.innerHTML = '<i class="fas fa-download"></i> 导出';
            exportBtn.disabled = false;
            
            // 重新渲染原始网格
            renderGrid();
        });
    }, 100);
}

// 导出函数
window.initExport = initExport; 