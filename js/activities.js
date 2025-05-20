/**
 * 活动管理模块
 */

// 活动列表
let activities = [];

// 当前选中的活动ID（编辑时使用）
let selectedActivityId = null;

// DOM元素
const activityModal = document.getElementById('activity-modal');
const activityForm = document.getElementById('activity-form');
const activityIdInput = document.getElementById('activity-id');
const activityNameInput = document.getElementById('activity-name');
const timeAmountInput = document.getElementById('time-amount');
const durationYearsInput = document.getElementById('duration-years');
const modalTitle = document.getElementById('modal-title');
const saveActivityBtn = document.getElementById('save-activity');
const deleteActivityBtn = document.getElementById('delete-activity');
const colorPicker = document.querySelector('.color-picker');
const activitiesList = document.querySelector('.activities-list');
const addActivityBtn = document.getElementById('add-activity');
const closeModalBtn = document.querySelector('.close-modal');
const cancelActivityBtn = document.getElementById('cancel-activity');

/**
 * 初始化活动模块
 */
function initActivities() {
    // 强制隐藏活动模态框，防止自动弹出
    activityModal.style.display = 'none';
    // 从本地存储加载活动
    activities = Storage.getActivities();
    
    // 重置周分配计数器
    if (typeof resetAssignedWeeksCount === 'function') {
        resetAssignedWeeksCount();
    }
    
    // 生成颜色选择器
    generateColorPicker();
    
    // 渲染活动列表
    renderActivitiesList();
    
    // 绑定事件监听器
    bindActivityEvents();
}

/**
 * 生成颜色选择器
 */
function generateColorPicker() {
    colorPicker.innerHTML = '';
    
    COLORS.forEach(color => {
        const colorOption = document.createElement('div');
        colorOption.className = 'color-option';
        colorOption.style.backgroundColor = color;
        colorOption.dataset.color = color;
        
        colorOption.addEventListener('click', () => {
            // 移除其他颜色的选中状态
            document.querySelectorAll('.color-option').forEach(option => {
                option.classList.remove('selected');
            });
            
            // 添加当前颜色的选中状态
            colorOption.classList.add('selected');
        });
        
        colorPicker.appendChild(colorOption);
    });
}

/**
 * 渲染活动列表
 */
function renderActivitiesList() {
    // 清空活动列表
    activitiesList.innerHTML = '';
    
    if (activities.length === 0) {
        // 如果没有活动，显示提示信息
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'empty-list';
        emptyMessage.textContent = '还没有添加任何活动，点击"添加新活动"按钮开始规划。';
        activitiesList.appendChild(emptyMessage);
        return;
    }
    
    // 渲染每个活动
    activities.forEach(activity => {
        const activityItem = document.createElement('div');
        activityItem.className = 'activity-item';
        activityItem.dataset.id = activity.id;
        
        const colorIndicator = document.createElement('div');
        colorIndicator.className = 'activity-color';
        colorIndicator.style.backgroundColor = activity.color;
        
        const activityDetails = document.createElement('div');
        activityDetails.className = 'activity-details';
        
        const activityTitle = document.createElement('div');
        activityTitle.className = 'activity-title';
        activityTitle.textContent = activity.name;
        
        const activityTime = document.createElement('div');
        activityTime.className = 'activity-time';
        activityTime.textContent = `${formatTime(activity.timeAmount)} ${formatFrequency(activity.frequency)} · 持续${activity.durationYears}年 · ${calculateActivityTotalWeeks(activity)}周`;
        
        activityDetails.appendChild(activityTitle);
        activityDetails.appendChild(activityTime);
        
        const activityActions = document.createElement('div');
        activityActions.className = 'activity-actions';
        
        const editButton = document.createElement('button');
        editButton.className = 'edit-activity';
        editButton.innerHTML = '<i class="fas fa-pencil-alt"></i>';
        editButton.addEventListener('click', () => openEditActivityModal(activity.id));
        
        activityActions.appendChild(editButton);
        
        activityItem.appendChild(colorIndicator);
        activityItem.appendChild(activityDetails);
        activityItem.appendChild(activityActions);
        
        activitiesList.appendChild(activityItem);
    });
    
    // 更新图例
    updateLegend();
}

/**
 * 更新活动图例
 */
function updateLegend() {
    const legendItems = document.getElementById('legend-items');
    
    // 保留空白图例
    const emptyLegend = legendItems.querySelector('.legend-empty');
    legendItems.innerHTML = '';
    if (emptyLegend) {
        legendItems.appendChild(emptyLegend);
    }
    
    // 复制活动数组并按总周数排序（从多到少）
    const sortedActivities = [...activities].sort((a, b) => {
        return calculateActivityTotalWeeks(b) - calculateActivityTotalWeeks(a);
    });

    // 添加每个活动的图例
    sortedActivities.forEach(activity => {
        const legendItem = document.createElement('div');
        legendItem.className = 'legend-item';
        
        const colorBox = document.createElement('span');
        colorBox.className = 'color-box';
        colorBox.style.backgroundColor = activity.color;
        
        const activityName = document.createElement('span');
        activityName.className = 'activity-name';
        const totalWeeks = calculateActivityTotalWeeks(activity);
        activityName.textContent = `${activity.name} (${totalWeeks}周)`;
        
        legendItem.appendChild(colorBox);
        legendItem.appendChild(activityName);
        
        legendItems.appendChild(legendItem);
    });
}

/**
 * 打开添加活动模态框
 */
function openAddActivityModal() {
    // 重置表单
    activityForm.reset();
    activityIdInput.value = '';
    selectedActivityId = null;
    
    // 设置标题和按钮文本
    modalTitle.textContent = '添加新活动';
    saveActivityBtn.textContent = '确认添加';
    
    // 隐藏删除按钮
    deleteActivityBtn.style.display = 'none';
    
    // 随机选择一个颜色
    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    document.querySelectorAll('.color-option').forEach(option => {
        if (option.dataset.color === randomColor) {
            option.click();
        }
    });
    
    // 显示模态框
    activityModal.style.display = 'flex';
}

/**
 * 打开编辑活动模态框
 * @param {string} activityId - 活动ID
 */
function openEditActivityModal(activityId) {
    // 查找活动
    const activity = activities.find(a => a.id === activityId);
    if (!activity) return;
    
    // 设置表单值
    activityIdInput.value = activity.id;
    activityNameInput.value = activity.name;
    timeAmountInput.value = activity.timeAmount;
    durationYearsInput.value = activity.durationYears;
    
    // 设置频率
    document.querySelector(`input[name="frequency"][value="${activity.frequency}"]`).checked = true;
    
    // 设置颜色
    document.querySelectorAll('.color-option').forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.color === activity.color) {
            option.classList.add('selected');
        }
    });
    
    // 设置标题和按钮文本
    modalTitle.textContent = '编辑活动';
    saveActivityBtn.textContent = '保存修改';
    
    // 显示删除按钮
    deleteActivityBtn.style.display = 'block';
    
    // 保存当前选中的活动ID
    selectedActivityId = activity.id;
    
    // 显示模态框
    activityModal.style.display = 'flex';
}

/**
 * 关闭活动模态框
 */
function closeActivityModal() {
    activityModal.style.display = 'none';
}

/**
 * 保存活动
 */
function saveActivity() {
    // 获取表单数据
    const name = activityNameInput.value.trim();
    const timeAmount = parseFloat(timeAmountInput.value);
    const frequency = document.querySelector('input[name="frequency"]:checked').value;
    const durationYears = parseInt(durationYearsInput.value);
    const selectedColor = document.querySelector('.color-option.selected');
    
    // 验证数据
    if (!name) {
        alert('请输入活动名称');
        return;
    }
    
    if (isNaN(timeAmount) || timeAmount < 0.1 || timeAmount > 8736) {
        alert('请输入有效的时间（0.1-8736小时）');
        return;
    }
    
    if (isNaN(durationYears) || durationYears < 1 || durationYears > MAX_AGE) {
        alert(`请输入有效的持续年数（1-${MAX_AGE}年）`);
        return;
    }
    
    if (!selectedColor) {
        alert('请选择颜色');
        return;
    }
    
    const color = selectedColor.dataset.color;
    
    // 创建活动对象
    const activity = {
        id: selectedActivityId || generateId(),
        name,
        timeAmount,
        frequency,
        durationYears,
        color
    };
    
    // 计算该活动占用的时间
    const totalWeeks = calculateActivityTotalWeeks(activity);
    const totalWeeksInLife = MAX_AGE * WEEKS_IN_YEAR;
    
    // 如果活动占用的时间太多，提示用户
    if (totalWeeks > totalWeeksInLife * 0.8) {
        if (!confirm(`此活动将占用你人生的${Math.round(totalWeeks / totalWeeksInLife * 100)}%的时间，确定要继续吗？`)) {
            return;
        }
    }
    
    // 如果是编辑现有活动
    if (selectedActivityId) {
        // 找到并更新活动
        const index = activities.findIndex(a => a.id === selectedActivityId);
        if (index !== -1) {
            activities[index] = activity;
        }
    } else {
        // 添加新活动
        activities.push(activity);
    }
    
    // 保存到本地存储
    Storage.saveActivities(activities);
    
    // 关闭模态框
    closeActivityModal();
    
    // 重置分配的周数计数器
    resetAssignedWeeksCount();
    
    // 重新渲染活动列表和网格
    renderActivitiesList();
    refreshGrid();
}

/**
 * 计算活动总周数
 * @param {Object} activity - 活动对象
 * @returns {number} - 活动总周数
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
 * 删除活动
 */
function deleteActivity() {
    if (!selectedActivityId) return;
    
    if (confirm('确定要删除此活动吗？')) {
        // 从数组中移除活动
        activities = activities.filter(a => a.id !== selectedActivityId);
        
        // 保存到本地存储
        Storage.saveActivities(activities);
        
        // 重置分配的周数计数器
        resetAssignedWeeksCount();
        
        // 关闭模态框
        closeActivityModal();
        
        // 更新UI
        renderActivitiesList();
        refreshGrid();
    }
}

/**
 * 绑定活动相关的事件监听器
 */
function bindActivityEvents() {
    // 添加活动按钮
    addActivityBtn.addEventListener('click', openAddActivityModal);
    
    // 关闭模态框
    closeModalBtn.addEventListener('click', closeActivityModal);
    cancelActivityBtn.addEventListener('click', closeActivityModal);
    
    // 点击模态框外部关闭
    activityModal.addEventListener('click', (e) => {
        if (e.target === activityModal) {
            closeActivityModal();
        }
    });
    
    // 保存活动
    activityForm.addEventListener('submit', (e) => {
        e.preventDefault();
        saveActivity();
    });
    
    // 删除活动
    deleteActivityBtn.addEventListener('click', deleteActivity);
}

// 导出函数和变量
window.activities = activities;
window.initActivities = initActivities;
window.renderActivitiesList = renderActivitiesList;
window.updateLegend = updateLegend;
window.calculateActivityTotalWeeks = calculateActivityTotalWeeks;