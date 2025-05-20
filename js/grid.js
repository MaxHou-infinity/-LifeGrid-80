/**
 * 网格渲染模块
 */

// 网格相关常量
const CELL_SIZE = 22; // 格子的默认大小（像素，适当增大以提升可见性）
const CELL_MARGIN = 2; // 格子间距（像素，适当增大）
const GRID_HEIGHT = MAX_AGE; // 网格高度（年数）
const GRID_WIDTH = WEEKS_IN_YEAR; // 网格宽度（周数）

// 缩放相关变量
let zoomLevel = 100; // 初始缩放级别（百分比）

// DOM元素
const canvas = document.getElementById('life-grid');
const ctx = canvas.getContext('2d');
const zoomInBtn = document.getElementById('zoom-in');
const zoomOutBtn = document.getElementById('zoom-out');
const zoomLevelDisplay = document.getElementById('zoom-level');

// 高亮相关变量
let highlightedActivity = null;
let hoveredCell = null;

/**
 * 初始化网格
 */
function initGrid() {
    // 从本地存储加载缩放级别
    zoomLevel = Storage.getZoomLevel();
    
    // 更新UI显示
    zoomLevelDisplay.textContent = `${zoomLevel}%`;
    
    // 绑定事件
    bindGridEvents();
    
    // 初次渲染网格
    renderGrid();
}

/**
 * 绑定网格相关事件
 */
function bindGridEvents() {
    // 缩放按钮事件
    zoomInBtn.addEventListener('click', () => {
        if (zoomLevel < 200) {
            zoomLevel += 25;
            zoomLevelDisplay.textContent = `${zoomLevel}%`;
            Storage.saveZoomLevel(zoomLevel);
            renderGrid();
        }
    });
    
    zoomOutBtn.addEventListener('click', () => {
        if (zoomLevel > 25) {
            zoomLevel -= 25;
            zoomLevelDisplay.textContent = `${zoomLevel}%`;
            Storage.saveZoomLevel(zoomLevel);
            renderGrid();
        }
    });
    
    // 鼠标悬停和移出事件
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseout', () => {
        hoveredCell = null;
        highlightedActivity = null;
        renderGrid();
    });
    
    // 点击事件
    canvas.addEventListener('click', handleCanvasClick);
}

/**
 * 处理画布上的鼠标移动
 * @param {MouseEvent} e - 鼠标事件
 */
function handleMouseMove(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // 计算当前悬停的格子
    const cellSize = CELL_SIZE * (zoomLevel / 100);
    const cellWithMargin = cellSize + CELL_MARGIN;
    
    const col = Math.floor(x / cellWithMargin); // 第几周
    const row = Math.floor(y / cellWithMargin); // 第几年
    
    // 检查边界
    if (col >= 0 && col < GRID_WIDTH && row >= 0 && row < GRID_HEIGHT) {
        const previousHoveredCell = hoveredCell;
        hoveredCell = { row, col };
        
        // 查找该格子对应的活动
        const activityAtCell = findActivityAtCell(row, col);
        
        // 如果悬停的格子或活动发生变化，重新渲染
        if (
            !previousHoveredCell || 
            previousHoveredCell.row !== row || 
            previousHoveredCell.col !== col ||
            highlightedActivity !== activityAtCell
        ) {
            highlightedActivity = activityAtCell;
            renderGrid();
        }
    }
}

/**
 * 处理画布上的点击事件
 * @param {MouseEvent} e - 鼠标事件
 */
function handleCanvasClick(e) {
    if (hoveredCell && highlightedActivity) {
        // 如果点击的格子有活动，打开编辑活动模态框
        openEditActivityModal(highlightedActivity.id);
    }
}

/**
 * 计算活动在指定年份应该填充的周数
 * @param {Object} activity - 活动对象
 * @param {number} year - 年份
 * @returns {number[]} - 应该填充的周数索引数组
 */
function calculateActivityWeeksForYear(activity, year) {
    // 使用utils.js中的函数来计算周数
    return window.getDisplayWeeksForActivityInYear(activity, year);
}

/**
 * 重置活动周分配计数器
 */
function resetAssignedWeeksCount() {
    assignedWeeksCount = {};
    activities.forEach(activity => {
        assignedWeeksCount[activity.id] = 0;
    });
}

/**
 * 查找指定格子对应的活动
 * @param {number} row - 行号（年份）
 * @param {number} col - 列号（周数）
 * @returns {Object|null} - 对应的活动对象，如果没有则返回null
 */
function findActivityAtCell(row, col) {
    // 按添加顺序排序活动
    const sortedActivities = [...activities].sort((a, b) => a.id - b.id);
    
    // 计算格子的全局索引
    const cellIndex = row * WEEKS_IN_YEAR + col;
    
    // 遍历活动，查找包含该格子的活动
    let totalWeeksUsed = 0;
    for (const activity of sortedActivities) {
        // 计算活动的总周数
        const activityWeeks = calculateActivityTotalWeeks(activity);
        
        // 如果格子在当前活动的范围内，返回该活动
        if (cellIndex >= totalWeeksUsed && cellIndex < totalWeeksUsed + activityWeeks) {
            return activity;
        }
        
        // 更新已使用的总周数
        totalWeeksUsed += activityWeeks;
    }
    
    return null;
}

/**
 * 渲染网格
 */
function renderGrid() {
    // 重置活动周分配计数器
    resetAssignedWeeksCount();
    
    // 计算格子大小（考虑缩放）
    const cellSize = CELL_SIZE * (zoomLevel / 100);
    const cellWithMargin = cellSize + CELL_MARGIN;
    
    // 设置画布尺寸
    const canvasWidth = GRID_WIDTH * cellWithMargin;
    const canvasHeight = GRID_HEIGHT * cellWithMargin;
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    // 清除画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 绘制网格底色（未分配时间）
    ctx.fillStyle = '#f5f5f5';
    for (let row = 0; row < GRID_HEIGHT; row++) {
        for (let col = 0; col < GRID_WIDTH; col++) {
            const x = col * cellWithMargin;
            const y = row * cellWithMargin;
            ctx.fillRect(x, y, cellSize, cellSize);
        }
    }
    
    // 按添加顺序排序活动
    const sortedActivities = [...activities].sort((a, b) => a.id - b.id);
    
    // 计算每个活动的总周数
    let totalWeeksUsed = 0;
    const activityWeeks = sortedActivities.map(activity => {
        const weeks = calculateActivityTotalWeeks(activity);
        const startWeek = totalWeeksUsed;
        totalWeeksUsed += weeks;
        return { activity, weeks, startWeek };
    });
    
    // 渲染每个活动
    activityWeeks.forEach(({ activity, weeks, startWeek }) => {
        // 填充对应的格子
        for (let i = 0; i < weeks; i++) {
            const globalIndex = startWeek + i;
            const row = Math.floor(globalIndex / WEEKS_IN_YEAR);
            const col = globalIndex % WEEKS_IN_YEAR;
            
            // 如果超出网格范围，停止填充
            if (row >= GRID_HEIGHT) {
                break;
            }
            
            const x = col * cellWithMargin;
            const y = row * cellWithMargin;
            
            // 检查是否为高亮活动
            if (highlightedActivity && activity.id === highlightedActivity.id) {
                ctx.fillStyle = activity.color;
                ctx.globalAlpha = 1;
            } else if (highlightedActivity) {
                // 如果有其他高亮活动，则降低此活动的不透明度
                ctx.fillStyle = activity.color;
                ctx.globalAlpha = 0.3;
            } else {
                ctx.fillStyle = activity.color;
                ctx.globalAlpha = 1;
            }
            
            // 绘制活动格子
            ctx.fillRect(x, y, cellSize, cellSize);
            ctx.globalAlpha = 1;
        }
    });
    
    // 绘制悬停高亮
    if (hoveredCell) {
        const { row, col } = hoveredCell;
        const x = col * cellWithMargin;
        const y = row * cellWithMargin;
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, cellSize, cellSize);
    }
}

/**
 * 刷新网格（由外部模块调用）
 */
function refreshGrid() {
    renderGrid();
}

// 导出函数
window.initGrid = initGrid;
window.refreshGrid = refreshGrid;