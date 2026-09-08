import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphViewController } from '../graph-view/graph-view.js';
import { graphNodesStore } from '../graph-view/graph-nodes-store.js';
import { aiConfigManager } from '../../core/ai-config-manager.js';

function pointer(target, type, x = 10, y = 10) {
    target.dispatchEvent(new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y
    }));
}

function setupNode(overrides = {}) {
    const controller = new GraphViewController();
    const selectionPill = document.createElement('button');
    document.body.appendChild(selectionPill);
    controller.selectionPill = selectionPill;
    controller.rawTree = { id: 'card-root' };
    controller.parentByNodeId = new Map([['node-1', 'card-root']]);
    const treeNode = {
        id: 'node-1',
        tag: '完整的用户问题标题',
        question: '这是完整的用户问题吗？',
        titleCustomized: false,
        text: '这是 AI 回答',
        color: '#a855f7',
        kind: 'ai',
        children: [],
        ...overrides
    };
    controller.nodeById = new Map([['node-1', treeNode]]);
    controller.nodes = [{ ...treeNode, x: 100, y: 100, targetX: 100, targetY: 100 }];
    controller.simulation = {
        force: vi.fn().mockReturnThis(),
        alpha: vi.fn().mockReturnThis(),
        alphaTarget: vi.fn().mockReturnThis(),
        restart: vi.fn().mockReturnThis()
    };
    graphNodesStore.upsert({
        id: treeNode.id,
        parentId: 'card-root',
        rootCardId: 'card-root',
        kind: treeNode.kind,
        title: treeNode.tag,
        question: treeNode.question,
        content: treeNode.text
    });
    const bubble = controller.createBubble(controller.nodes[0]);
    document.body.appendChild(bubble);
    return { controller, bubble, treeNode };
}

describe('graph bubble interactions', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        localStorage.setItem('inksight:locale', 'zh-CN');
        aiConfigManager.init();
        graphNodesStore.clear();
    });

    it('selects without moving or pulsing the graph viewport', () => {
        const { controller, bubble } = setupNode();
        controller.transform = { x: 24, y: 36, scale: 1.2 };

        pointer(bubble.querySelector('.graph-bubble__body'), 'pointerdown');
        pointer(window, 'pointerup');

        expect(controller.selectedNodeId).toBe('node-1');
        expect(bubble.classList.contains('graph-bubble--selected')).toBe(true);
        expect(controller.transform).toEqual({ x: 24, y: 36, scale: 1.2 });
        expect(bubble.classList.contains('graph-bubble--targeted-self')).toBe(false);
    });

    it('drags an unselected bubble from its content without selecting it', () => {
        const { controller, bubble } = setupNode();
        const body = bubble.querySelector('.graph-bubble__body');

        pointer(body, 'pointerdown', 10, 10);
        pointer(window, 'pointermove', 30, 35);
        expect(bubble.classList.contains('graph-bubble--dragging')).toBe(true);
        pointer(window, 'pointerup', 30, 35);

        expect(controller.selectedNodeId).toBeNull();
        expect(controller.nodes[0]).toMatchObject({
            x: 120,
            y: 125,
            targetX: 120,
            targetY: 125,
            fx: null,
            fy: null
        });
        expect(controller.simulation.alphaTarget).toHaveBeenCalledWith(0);
    });

    it('expands an unselected bubble after its selecting double click', () => {
        const { controller, bubble } = setupNode();
        const body = bubble.querySelector('.graph-bubble__body');

        pointer(body, 'pointerdown');
        pointer(window, 'pointerup');
        pointer(body, 'dblclick');

        expect(controller.selectedNodeId).toBe('node-1');
        expect(bubble.classList.contains('graph-bubble--expanded')).toBe(true);
        expect(bubble.getAttribute('aria-expanded')).toBe('true');
    });

    it('shows the full truncated title after the hover delay', () => {
        vi.useFakeTimers();
        try {
            const { bubble } = setupNode();
            const title = bubble.querySelector('.graph-bubble__tag-title');
            const tooltip = bubble.querySelector('.graph-bubble__title-tooltip');
            Object.defineProperties(title, {
                scrollWidth: { configurable: true, value: 280 },
                clientWidth: { configurable: true, value: 120 }
            });

            pointer(bubble, 'pointerenter');
            vi.advanceTimersByTime(649);
            expect(tooltip.hidden).toBe(true);
            vi.advanceTimersByTime(1);

            expect(tooltip.hidden).toBe(false);
            expect(tooltip.textContent).toBe('完整的用户问题标题');
        } finally {
            vi.useRealTimers();
        }
    });

    it('shows separate title, question, and answer regions when expanded', () => {
        const { controller, bubble } = setupNode();
        controller.setSelectedNode('node-1');
        controller.setBubbleExpanded('node-1', true);

        expect(bubble.querySelector('.graph-bubble__title-input').value).toBe('完整的用户问题标题');
        expect(bubble.querySelector('.graph-bubble__question-input').value).toBe('这是完整的用户问题吗？');
        expect(bubble.querySelector('.graph-bubble__answer-content').textContent).toContain('这是 AI 回答');
        expect(bubble.querySelector('.graph-bubble__question-input').disabled).toBe(false);
    });

    it('uses the stored full question for earlier AI turns instead of a custom title', () => {
        const controller = new GraphViewController();
        controller.nodeById = new Map([
            ['ai-1', { id: 'ai-1', kind: 'ai', tag: '短标题', question: '需要发送给 AI 的完整问题', text: '回答' }]
        ]);
        controller.parentByNodeId = new Map([['ai-1', null]]);

        expect(controller.buildConversation('ai-1', '继续提问')).toEqual([
            { role: 'user', content: '需要发送给 AI 的完整问题' },
            { role: 'assistant', content: '回答' },
            { role: 'user', content: '继续提问' }
        ]);
    });

    it('keeps the previous answer when regeneration fails', async () => {
        aiConfigManager.set({ apiKey: 'test-key' });
        const { controller, bubble, treeNode } = setupNode();
        controller.setSelectedNode('node-1');
        controller.setBubbleExpanded('node-1', true);
        bubble.querySelector('.graph-bubble__question-input').value = '修改后的完整问题';
        controller.chatStream = vi.fn().mockRejectedValue(new Error('network failed'));

        await controller.regenerateNode('node-1');

        expect(treeNode.text).toBe('这是 AI 回答');
        expect(bubble.querySelector('.graph-bubble__answer-content').textContent).toContain('这是 AI 回答');
        expect(graphNodesStore.get('node-1').question).toBe('修改后的完整问题');
    });

    it('replaces the answer only after successful regeneration', async () => {
        aiConfigManager.set({ apiKey: 'test-key' });
        const { controller, bubble } = setupNode({ kind: 'manual', question: '' });
        controller.setSelectedNode('node-1');
        controller.setBubbleExpanded('node-1', true);
        bubble.querySelector('.graph-bubble__question-input').value = '用于生成的新问题';
        controller.chatStream = vi.fn().mockImplementation(async (_config, request) => {
            request.onDelta('新回答', '新回答');
            return '新回答';
        });

        await controller.regenerateNode('node-1');

        expect(graphNodesStore.get('node-1')).toMatchObject({
            kind: 'ai',
            question: '用于生成的新问题',
            content: '新回答'
        });
        expect(bubble.dataset.kind).toBe('ai');
        expect(bubble.querySelector('.graph-bubble__answer-content').textContent).toContain('新回答');
    });
});
