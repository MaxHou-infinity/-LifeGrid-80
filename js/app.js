/**
 * 人生计算器主应用
 */

// 等待DOM加载完成
document.addEventListener('DOMContentLoaded', () => {
    // 检查浏览器兼容性
    checkBrowserCompatibility();
    
    // 初始化各模块
    initActivities();
    initGrid();
    initExport();
    
    // 显示使用提示
    showWelcomeTip();
});

/**
 * 检查浏览器兼容性
 */
function checkBrowserCompatibility() {
    // 检查LocalStorage
    if (!window.localStorage) {
        showError('您的浏览器不支持本地存储功能，无法保存数据。请使用现代浏览器访问。');
        return;
    }
    
    // 检查Canvas
    if (!document.createElement('canvas').getContext) {
        showError('您的浏览器不支持Canvas功能，无法显示网格。请使用现代浏览器访问。');
        return;
    }
    
    // 检查jsPDF
    if (typeof window.jspdf === 'undefined') {
        console.warn('未检测到jsPDF库，PDF导出功能可能不可用。');
    }
    
    // 检查html2canvas
    if (typeof html2canvas === 'undefined') {
        console.warn('未检测到html2canvas库，导出功能可能不可用。');
    }
}

/**
 * 显示错误信息
 * @param {string} message - 错误信息
 */
function showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.backgroundColor = '#f8d7da';
    errorDiv.style.color = '#721c24';
    errorDiv.style.padding = '15px';
    errorDiv.style.margin = '20px 0';
    errorDiv.style.borderRadius = '4px';
    errorDiv.style.textAlign = 'center';
    errorDiv.textContent = message;
    
    document.querySelector('main').prepend(errorDiv);
}

/**
 * 显示欢迎提示
 */
function showWelcomeTip() {
    // 检查是否是首次访问
    try {
        if (!localStorage.getItem('lifeCalculator_visited')) {
            // 创建提示框
            const tipContainer = document.createElement('div');
            tipContainer.className = 'welcome-tip';
            tipContainer.style.position = 'fixed';
            tipContainer.style.bottom = '20px';
            tipContainer.style.right = '20px';
            tipContainer.style.maxWidth = '300px';
            tipContainer.style.backgroundColor = 'white';
            tipContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
            tipContainer.style.borderRadius = '8px';
            tipContainer.style.padding = '20px';
            tipContainer.style.zIndex = '1000';
            
            // 提示内容
            const tipContent = document.createElement('div');
            tipContent.innerHTML = `
                <h3 style="margin-top:0;">欢迎使用人生计算器!</h3>
                <p>点击<strong>"添加新活动"</strong>按钮开始规划您的生活时间分配。</p>
                <p>您的数据仅存储在本地浏览器中，不会上传到任何服务器。</p>
            `;
            
            // 关闭按钮
            const closeButton = document.createElement('button');
            closeButton.textContent = '我知道了';
            closeButton.style.backgroundColor = 'var(--primary-color)';
            closeButton.style.color = 'white';
            closeButton.style.border = 'none';
            closeButton.style.padding = '8px 15px';
            closeButton.style.borderRadius = '4px';
            closeButton.style.cursor = 'pointer';
            closeButton.style.display = 'block';
            closeButton.style.margin = '10px 0 0 auto';
            
            closeButton.addEventListener('click', () => {
                document.body.removeChild(tipContainer);
                // 标记已访问
                try {
                    localStorage.setItem('lifeCalculator_visited', 'true');
                } catch (e) {
                    console.error('Error saving visited status to localStorage:', e);
                }
            });
            
            tipContainer.appendChild(tipContent);
            tipContainer.appendChild(closeButton);
            document.body.appendChild(tipContainer);
        }
    } catch (e) {
        console.error('Error reading visited status from localStorage:', e);
        // 即使读取失败，也允许应用继续运行，只是可能重复显示欢迎提示
    }
}

/**
 * 示例活动数据
 * 可用于预填充或示例展示
 */
const EXAMPLE_ACTIVITIES = [
    {
        id: 'example1',
        name: '睡眠',
        timeAmount: 480, // 8小时
        frequency: 'daily',
        startYear: 1,
        endYear: 80,
        color: '#3498db'
    },
    {
        id: 'example2',
        name: '工作',
        timeAmount: 480, // 8小时
        frequency: 'daily',
        startYear: 22,
        endYear: 60,
        color: '#e74c3c'
    },
    {
        id: 'example3',
        name: '学习',
        timeAmount: 360, // 6小时
        frequency: 'daily',
        startYear: 6,
        endYear: 22,
        color: '#2ecc71'
    },
    {
        id: 'example4',
        name: '家庭时间',
        timeAmount: 120, // 2小时
        frequency: 'daily',
        startYear: 25,
        endYear: 80,
        color: '#f1c40f'
    }
];

/**
 * 加载示例数据
 * 此功能可通过按钮或菜单触发
 */
function loadExampleData() {
    if (confirm('这将替换您当前的所有数据，确定继续吗？')) {
        activities = [...EXAMPLE_ACTIVITIES];
        Storage.saveActivities(activities);
        renderActivitiesList();
        refreshGrid();
    }
}

// 导出全局函数
window.loadExampleData = loadExampleData;