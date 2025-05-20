/**
 * 人生计算器工具函数
 */

// 常量定义
const WEEKS_IN_YEAR = 52;
const MAX_AGE = 80;
const HOURS_IN_WEEK = 168; // 7天 * 24小时

// 预定义的颜色数组（30种颜色）
const COLORS = [
    // 棕色系列
    '#582F0E', '#7F4F24', '#936639', '#A68A64', '#B6AD90',
    '#C2C5AA', '#A4AC86', '#656D4A', '#414833', '#333D29',
    
    // 明亮色系列
    '#F94144', '#F3722C', '#F8961E', '#F9844A', '#F9C74F',
    '#90BE6D', '#43AA8B', '#4D908E', '#577590', '#277DA1',
    
    // 深色系列
    '#001219', '#005F73', '#0A9396', '#94D2BD', '#E9D8A6',
    '#EE9B00', '#CA6702', '#BB3E03', '#AE2012', '#9B2226'
];

/**
 * 生成唯一ID
 * @returns {string} 唯一ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

/**
 * 将小时数转换为可读格式
 * @param {number} hours - 小时数
 * @returns {string} 格式化后的时间字符串
 */
function formatTime(hours) {
    if (hours < 24) {
        return `${hours.toFixed(1)}小时`;
    } else {
        const days = Math.floor(hours / 24);
        const remainingHours = hours % 24;
        return remainingHours > 0 ? `${days}天${remainingHours.toFixed(1)}小时` : `${days}天`;
    }
}

/**
 * 格式化频率显示
 * @param {string} frequency - 频率类型（daily, weekly, monthly, yearly）
 * @returns {string} 格式化后的频率字符串
 */
function formatFrequency(frequency) {
    switch (frequency) {
        case 'daily':
            return '每天';
        case 'weekly':
            return '每周';
        case 'monthly':
            return '每月';
        case 'yearly':
            return '每年';
        default:
            return '未知';
    }
}

/**
 * 计算活动在一年中的周数
 * @param {string} frequency - 频率类型
 * @returns {number} 活动在一年中的周数
 */
function getWeeksPerYear(frequency) {
    switch (frequency) {
        case 'daily':
            return 52; // 每天活动，按52周计
        case 'weekly':
            return 52;
        case 'monthly':
            return 12;
        case 'yearly':
            return 1;
        default:
            return 0;
    }
}

/**
 * 计算活动占用的总周数
 * @param {Object} activity - 活动对象
 * @returns {number} 活动占用的总周数
 */
function calculateActivityTotalWeeks(activity) {
    // 计算活动的总时间（小时）
    let totalHours = 0;
    switch (activity.frequency) {
        case 'daily':
            // 每天的时间 * 7天 * 52周 * 年数
            totalHours = activity.timeAmount * 7 * 52 * activity.durationYears;
            break;
        case 'weekly':
            // 每周的时间 * 52周 * 年数
            totalHours = activity.timeAmount * 52 * activity.durationYears;
            break;
        case 'monthly':
            // 每月的时间 * 12月 * 年数
            totalHours = activity.timeAmount * 12 * activity.durationYears;
            break;
        case 'yearly':
            // 每年的时间 * 年数
            totalHours = activity.timeAmount * activity.durationYears;
            break;
    }
    
    // 计算实际占用的周数（总时间除以每周时间）
    // HOURS_IN_WEEK = 168 (7天 * 24小时)
    const totalWeeks = Math.floor(totalHours / HOURS_IN_WEEK);
    
    // 确保不超过总周数
    const maxWeeks = MAX_AGE * WEEKS_IN_YEAR;
    return Math.min(totalWeeks, maxWeeks);
}

/**
 * 计算活动占用的总时间比例
 * @param {Object} activity - 活动对象
 * @returns {number} 活动占用的总时间比例（百分比）
 */
function calculateActivityPercentage(activity) {
    const totalWeeksInLife = MAX_AGE * WEEKS_IN_YEAR;
    const activityWeeks = calculateActivityTotalWeeks(activity);
    return (activityWeeks / totalWeeksInLife) * 100;
}

/**
 * 为活动分配显示周，基于其总占用时间
 * 这个函数会管理所有活动占据的总周数，并根据活动设置的频率和时间分配相应数量的格子
 */
let assignedWeeksCount = {}; // 用于跟踪已经分配给各个活动的周数

/**
 * 重置已分配周数计数器
 * 每次活动列表变更时需要调用
 */
function resetAssignedWeeksCount() {
    assignedWeeksCount = {};
    activities.forEach(activity => {
        assignedWeeksCount[activity.id] = 0;
    });
}

/**
 * 计算活动在特定年份实际显示的周索引
 * @param {Object} activity - 活动对象 
 * @param {number} yearIndex - 年份索引（从0开始）
 * @returns {Array} 周索引数组 (0-51)
 */
function getDisplayWeeksForActivityInYear(activity, yearIndex) {
    // 计算这个活动应该占用的总周数
    const totalWeeksToDisplay = calculateActivityTotalWeeks(activity);
    
    // 如果活动总周数为0，返回空数组
    if (totalWeeksToDisplay <= 0) {
        return [];
    }
    
    // 初始化assignedWeeksCount对象（如果还没有）
    if (!assignedWeeksCount[activity.id]) {
        assignedWeeksCount[activity.id] = 0;
    }
    
    // 计算该活动还需要分配的周数
    const weeksRemaining = totalWeeksToDisplay - assignedWeeksCount[activity.id];
    
    // 如果没有剩余周数需要分配，返回空数组
    if (weeksRemaining <= 0) {
        return [];
    }
    
    // 确定本年度应分配的周数（不超过剩余需分配数和一年的总周数）
    const weeksToAssignThisYear = Math.min(weeksRemaining, WEEKS_IN_YEAR);
    
    // 计算当前活动在所有活动中的索引
    const sortedActivities = [...activities].sort((a, b) => a.id - b.id);
    const activityIndex = sortedActivities.findIndex(a => a.id === activity.id);
    
    // 计算之前所有活动已经占用的总周数
    let totalWeeksUsed = 0;
    for (let i = 0; i < activityIndex; i++) {
        const prevActivity = sortedActivities[i];
        totalWeeksUsed += calculateActivityTotalWeeks(prevActivity);
    }
    
    // 计算当前活动已经分配的周数
    const currentActivityAssignedWeeks = assignedWeeksCount[activity.id];
    
    // 计算当前活动应该从哪一周开始填充
    const startWeek = (totalWeeksUsed + currentActivityAssignedWeeks) % WEEKS_IN_YEAR;
    
    // 创建周索引数组
    const weekIndices = [];
    for (let i = 0; i < weeksToAssignThisYear; i++) {
        const weekIndex = (startWeek + i) % WEEKS_IN_YEAR;
        weekIndices.push(weekIndex);
    }
    
    // 更新已分配的周数
    assignedWeeksCount[activity.id] += weekIndices.length;
    
    return weekIndices;
}

/**
 * 本地存储相关函数
 */
const Storage = {
    /**
     * 保存活动列表到本地存储
     * @param {Array} activities - 活动列表
     */
    saveActivities: function(activities) {
        try {
            localStorage.setItem('lifeCalculator_activities', JSON.stringify(activities));
        } catch (e) {
            console.error('Error saving activities to localStorage:', e);
            // 可以考虑在这里给用户一个提示，例如存储空间已满
            alert('保存活动时出错，可能是本地存储空间已满。');
        }
    },

    /**
     * 从本地存储获取活动列表
     * @returns {Array} 活动列表
     */
    getActivities: function() {
        try {
            const activitiesJson = localStorage.getItem('lifeCalculator_activities');
            return activitiesJson ? JSON.parse(activitiesJson) : [];
        } catch (e) {
            console.error('Error parsing activities from localStorage:', e);
            return []; // 解析失败时返回空数组
        }
    },

    /**
     * 保存缩放级别到本地存储
     * @param {number} zoomLevel - 缩放级别
     */
    saveZoomLevel: function(zoomLevel) {
        try {
            localStorage.setItem('lifeCalculator_zoomLevel', zoomLevel);
        } catch (e) {
            console.error('Error saving zoom level to localStorage:', e);
        }
    },

    /**
     * 从本地存储获取缩放级别
     * @returns {number} 缩放级别
     */
    getZoomLevel: function() {
        try {
            const zoomLevel = localStorage.getItem('lifeCalculator_zoomLevel');
            return zoomLevel ? parseInt(zoomLevel) : 100;
        } catch (e) {
            console.error('Error parsing zoom level from localStorage:', e);
            return 100;
        }
    },

    /**
     * 保存当前年龄到本地存储
     * @param {number} currentAge - 当前年龄
     */
    saveCurrentAge: function(currentAge) {
        try {
            localStorage.setItem('lifeCalculator_currentAge', currentAge);
        } catch (e) {
            console.error('Error saving current age to localStorage:', e);
        }
    },

    /**
     * 从本地存储获取当前年龄
     * @returns {number} 当前年龄
     */
    getCurrentAge: function() {
        try {
            const currentAge = localStorage.getItem('lifeCalculator_currentAge');
            return currentAge ? parseInt(currentAge) : 0;
        } catch (e) {
            console.error('Error parsing current age from localStorage:', e);
            return 0;
        }
    }
};

// 导出函数到全局作用域
window.calculateActivityTotalWeeks = calculateActivityTotalWeeks;
window.formatTime = formatTime;
window.formatFrequency = formatFrequency;
window.generateId = generateId;
window.getWeeksPerYear = getWeeksPerYear;
window.calculateActivityPercentage = calculateActivityPercentage;
window.resetAssignedWeeksCount = resetAssignedWeeksCount;
window.getDisplayWeeksForActivityInYear = getDisplayWeeksForActivityInYear;
window.Storage = Storage;
window.COLORS = COLORS;
window.WEEKS_IN_YEAR = WEEKS_IN_YEAR;
window.MAX_AGE = MAX_AGE;
window.HOURS_IN_WEEK = HOURS_IN_WEEK;