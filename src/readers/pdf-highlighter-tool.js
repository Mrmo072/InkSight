/**
 * PDFHighlighterTool - 荧光笔涂抹工具
 * 用于在PDF上绘制固定高度的荧光笔标记
 */

export class PDFHighlighterTool {
    constructor(options = {}) {
        this.container = options.container;
        this.pages = options.pages || [];
        this.fileId = null;
        this.height = 16; // 默认高度
        this.color = 'rgba(255, 226, 52, 0.6)';
        this.isActive = false; // 是否激活荧光笔模式

        // 绘制状态
        this.isDrawing = false;
        this.currentPage = null;
        this.currentSVG = null;
        this.pathPoints = [];
        this.svgGroup = null;

        // 回调
        this.onHighlightCreated = options.onHighlightCreated || (() => { });
        this.onHighlightClick = options.onHighlightClick || null;
    }

    setFileId(fileId) {
        this.fileId = fileId;
    }

    setIsActive(active) {
        this.isActive = active;
    }

    setHeight(height) {
        this.height = height;
    }

    setColor(color) {
        this.color = color;
    }

    /**
     * 为指定页面设置绘制监听器
     */
    setupListeners(pageWrapper, pageNum) {
        pageWrapper.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // 左键
                this.handleMouseDown(e, pageWrapper, pageNum);
            }
        });

        pageWrapper.addEventListener('mousemove', (e) => {
            if (this.isDrawing) {
                this.handleMouseMove(e, pageWrapper);
            }
        });

        pageWrapper.addEventListener('mouseup', (e) => {
            if (this.isDrawing) {
                this.handleMouseUp(e, pageWrapper, pageNum);
            }
        });

        pageWrapper.addEventListener('mouseleave', (e) => {
            if (this.isDrawing) {
                this.handleMouseUp(e, pageWrapper, pageNum);
            }
        });
    }

    /**
     * 开始绘制
     */
    handleMouseDown(e, pageWrapper, pageNum) {
        if (!this.isActive) return; // 只有在激活时才绘制

        e.preventDefault(); // Prevent default browser behavior (text selection, drag, etc.)

        this.isDrawing = true;
        this.currentPage = pageNum;
        this.pathPoints = [];

        // 创建SVG容器
        this.currentSVG = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        this.currentSVG.style.position = 'absolute';
        this.currentSVG.style.top = '0';
        this.currentSVG.style.left = '0';
        this.currentSVG.style.width = '100%';
        this.currentSVG.style.height = '100%';
        this.currentSVG.style.pointerEvents = 'none';
        this.currentSVG.style.zIndex = '5';
        this.currentSVG.classList.add('highlighter-svg');

        // 创建SVG组
        this.svgGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.currentSVG.appendChild(this.svgGroup);
        pageWrapper.appendChild(this.currentSVG);

        // 添加第一个点
        const rect = pageWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        this.startY = y;
        this.startX = x;
        this.pathPoints.push({ x, y });
    }

    /**
     * 处理鼠标移动：限制为水平直线绘制
     */
    handleMouseMove(e, pageWrapper) {
        if (!this.isDrawing) return;

        const rect = pageWrapper.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // 更新当前点，强制Y坐标与起始点相同（水平直线）
        const currentX = x;
        const currentY = this.startY;

        // 更新路径点：只保留起点和终点即可
        if (this.pathPoints.length > 1) {
            this.pathPoints.pop(); // 移除上一个临时终点
        }
        this.pathPoints.push({ x: currentX, y: currentY });

        // 重新绘制SVG
        this.drawPath();
    }

    drawPath() {
        if (!this.svgGroup || this.pathPoints.length < 2) return;

        // 清除旧内容
        while (this.svgGroup.firstChild) {
            this.svgGroup.removeChild(this.svgGroup.firstChild);
        }

        const startX = this.pathPoints[0].x;
        const endX = this.pathPoints[this.pathPoints.length - 1].x;
        const y = this.pathPoints[0].y;

        const width = endX - startX;
        const height = this.height;

        // 绘制矩形
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', width > 0 ? startX : endX);
        rect.setAttribute('y', y - height / 2);
        rect.setAttribute('width', Math.abs(width));
        rect.setAttribute('height', height);
        rect.setAttribute('fill', this.color);
        rect.setAttribute('rx', '2'); // 圆角
        rect.setAttribute('ry', '2');
        rect.setAttribute('opacity', '0.4'); // 颜色本身已有透明度，这里强制设置SVG元素透明度

        this.svgGroup.appendChild(rect);
    }

    /**
     * 结束绘制
     */
    async handleMouseUp(e, pageWrapper, pageNum) {
        if (!this.isDrawing) return;
        this.isDrawing = false;

        if (this.pathPoints.length < 2) {
            if (this.currentSVG) this.currentSVG.remove();
            return;
        }

        // 计算边界框
        const bounds = this.calculateBounds();

        // 确保宽度足够
        if (bounds.width < 5) {
            if (this.currentSVG) this.currentSVG.remove();
            return;
        }

        // 创建highlight数据
        if (window.inksight && window.inksight.highlightManager) {
            const highlight = window.inksight.highlightManager.createHighlight(
                '[标注重点]', // 默认文本
                {
                    page: pageNum,
                    type: 'highlighter', // 保持类型以便特殊处理
                    path: this.pathPoints, // 保存路径（虽然现在是直线）
                    height: this.height,
                    bounds: bounds
                },
                this.fileId,
                'highlighter', // Keep type as highlighter for correct color memory mapping
                this.color // Pass color
            );

            // 设置SVG ID用于颜色更新
            if (this.currentSVG) {
                this.currentSVG.dataset.highlightSvgId = highlight.id;
            }

            // 添加可点击hitbox
            this.createHitbox(pageWrapper, bounds, highlight.id);
        }

        this.onHighlightCreated();
    }

    /**
     * 计算路径的边界框
     */
    calculateBounds() {
        if (this.pathPoints.length < 2) return { left: 0, top: 0, width: 0, height: 0 };

        const startX = this.pathPoints[0].x;
        const endX = this.pathPoints[this.pathPoints.length - 1].x;
        const y = this.pathPoints[0].y;

        return {
            left: Math.min(startX, endX),
            top: y - this.height / 2,
            width: Math.abs(endX - startX),
            height: this.height
        };
    }

    /**
     * 创建可点击的hitbox
     */
    createHitbox(pageWrapper, bounds, highlightId) {
        const hitbox = document.createElement('div');
        hitbox.className = 'highlighter-hitbox';
        hitbox.style.position = 'absolute';
        hitbox.style.left = `${bounds.left}px`;
        hitbox.style.top = `${bounds.top}px`;
        hitbox.style.width = `${bounds.width}px`;
        hitbox.style.height = `${bounds.height}px`;
        hitbox.style.cursor = 'pointer';
        hitbox.style.pointerEvents = 'auto';
        hitbox.style.backgroundColor = 'transparent';
        hitbox.style.zIndex = '100';
        hitbox.dataset.highlightId = highlightId;

        pageWrapper.appendChild(hitbox);

        // 等待card创建后绑定点击事件
        setTimeout(() => {
            if (window.inksight && window.inksight.cardSystem) {
                const card = Array.from(window.inksight.cardSystem.cards.values())
                    .find(c => c.highlightId === highlightId);

                if (card) {
                    hitbox.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // 触发工具栏显示
                        if (this.onHighlightClick) {
                            this.onHighlightClick(e, highlightId, card.id);
                        }

                        // 触发Mind Map定位
                        window.dispatchEvent(new CustomEvent('highlight-selected', {
                            detail: { cardId: card.id }
                        }));
                    });
                }
            }
        }, 100);

        return hitbox;
    }

    /**
     * 移除指定highlight的所有元素
     */
    removeHighlight(highlightId) {
        // 移除SVG
        const svgs = this.container.querySelectorAll(`svg[data-highlight-svg-id="${highlightId}"]`);
        svgs.forEach(svg => svg.remove());

        // 移除hitbox
        const hitboxes = this.container.querySelectorAll(`.highlighter-hitbox[data-highlight-id="${highlightId}"]`);
        hitboxes.forEach(hb => hb.remove());
    }
}
