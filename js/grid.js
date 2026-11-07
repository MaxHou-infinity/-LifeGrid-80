/**
 * 网格绘制与真实命中。
 * 旧实现把画布 CSS 设成 width:100%，点击坐标却按内部像素直接除格子尺寸，
 * 窄窗口或浏览器缩放时高亮会落到指针左上方。这里统一用
 * 指针在画布盒中的位置 × (画布像素 / 显示尺寸)，鼠标、点击和触屏走同一函数。
 */
(function () {
    'use strict';

    const STATE_COLOR = {
        past: '#d9d2c5',
        outside: '#dde2e7',
        'future-excluded': '#c5d0db',
        unallocated: '#16859a',
        beyond: '#e8edf1'
    };

    function layoutFor(zoom, rowCount) {
        const cellSize = Math.max(8, Math.round(12 * zoom / 100));
        const margin = 2;
        return {
            cellSize: cellSize,
            margin: margin,
            stride: cellSize + margin,
            width: 52 * (cellSize + margin),
            height: Math.max(1, rowCount) * (cellSize + margin)
        };
    }

    function draw(canvas, gutter, plan, view) {
        const layout = layoutFor(view.zoom, plan && plan.rowCount ? plan.rowCount : 0);
        const context = canvas.getContext('2d');
        canvas.width = layout.width;
        canvas.height = Math.max(layout.height, 2);
        canvas.style.width = layout.width + 'px';
        canvas.style.height = canvas.height + 'px';
        context.clearRect(0, 0, canvas.width, canvas.height);
        gutter.innerHTML = '';
        if (!plan || !plan.ok) {
            return layout;
        }
        const byKey = {};
        plan.cells.forEach(function (cell) {
            byKey[cell.year + ':' + cell.week] = cell;
            paintCell(context, layout, cell, view);
        });
        for (let year = 0; year < plan.rowCount; year += 1) {
            const label = document.createElement('div');
            label.className = 'year-label';
            label.style.height = layout.stride + 'px';
            if (year % 10 === 0 || year === Math.floor(plan.budget.A) || year === Math.floor(plan.budget.B)) {
                label.textContent = year + '岁';
            }
            gutter.appendChild(label);
        }
        view.cellMap = byKey;
        return layout;
    }

    function paintCell(context, layout, cell, view) {
        const x = cell.week * layout.stride;
        const y = cell.year * layout.stride;
        cell.segments.forEach(function (segment) {
            const start = x + segment.startFraction * layout.cellSize;
            const width = Math.max(0, (segment.endFraction - segment.startFraction) * layout.cellSize);
            context.fillStyle = segment.kind === 'activity'
                ? ((view.colors && view.colors[segment.activityId]) || window.LifeModel.COLORS[0])
                : STATE_COLOR[segment.kind];
            context.fillRect(start, y, width, layout.cellSize);
        });
        if (view.hover && view.hover.row === cell.year && view.hover.col === cell.week) {
            context.strokeStyle = '#9a4d16';
            context.lineWidth = 2;
            context.strokeRect(x + 1, y + 1, layout.cellSize - 2, layout.cellSize - 2);
        }
    }

    function hitFromEvent(event, canvas, layout) {
        const point = event.changedTouches ? event.changedTouches[0] : event;
        const rect = canvas.getBoundingClientRect();
        return window.LifeModel.locatePointer({
            offsetX: point.clientX - rect.left,
            offsetY: point.clientY - rect.top,
            rectWidth: rect.width,
            rectHeight: rect.height,
            canvasWidth: canvas.width,
            canvasHeight: canvas.height,
            cellSize: layout.cellSize,
            margin: layout.margin
        });
    }

    function describeSegment(segment, activities) {
        if (segment.kind === 'outside') return '不纳入本次规划，约 ' + window.LifeModel.formatHours(segment.hours) + ' 小时';
        if (segment.kind === 'past') return '已过去';
        if (segment.kind === 'future-excluded') return '尚未纳入规划';
        if (segment.kind === 'unallocated') return '尚未分配，约 ' + window.LifeModel.formatHours(segment.hours) + ' 小时';
        if (segment.kind === 'beyond') return '超出预计长度';
        const activity = (activities || []).find(function (item) { return item.id === segment.activityId; });
        const name = activity && activity.name ? activity.name : '未命名活动';
        return name + '，这一小段约 ' + window.LifeModel.formatHours(segment.hours) + ' 小时';
    }

    window.LifeGrid = {
        layoutFor: layoutFor,
        draw: draw,
        hitFromEvent: hitFromEvent,
        describeSegment: describeSegment,
        STATE_COLOR: STATE_COLOR
    };
})();
