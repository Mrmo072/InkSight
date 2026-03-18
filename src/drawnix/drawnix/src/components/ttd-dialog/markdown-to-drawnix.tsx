import { useState, useEffect, useDeferredValue, useRef } from 'react';
import './mermaid-to-drawnix.scss';
import './ttd-dialog.scss';
import { TTDDialogPanels } from './ttd-dialog-panels';
import { TTDDialogPanel } from './ttd-dialog-panel';
import { TTDDialogInput } from './ttd-dialog-input';
import { TTDDialogOutput } from './ttd-dialog-output';
import { TTDDialogSubmitShortcut } from './ttd-dialog-submit-shortcut';
import { useDrawnix } from '../../hooks/use-drawnix';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import {
  getViewportOrigination,
  PlaitBoard,
  PlaitElement,
  WritableClipboardOperationType,
} from '@plait/core';
import { MindElement } from '@plait/mind';
import { createLogger } from '../../../../../core/logger.js';

const logger = createLogger('MarkdownToDrawnix');

export interface MarkdownToDrawnixLibProps {
  loaded: boolean;
  api: Promise<{
    parseMarkdownToDrawnix: (
      definition: string,
      mainTopic?: string
    ) => MindElement;
  }>;
}

const MarkdownToDrawnix = () => {
  const { appState, setAppState } = useDrawnix();
  const { t, language } = useI18n();
  const markdownLibPromiseRef = useRef<MarkdownToDrawnixLibProps['api'] | null>(null);
  const [markdownToDrawnixLib, setMarkdownToDrawnixLib] =
    useState<MarkdownToDrawnixLibProps>({
      loaded: false,
      api: Promise.resolve({
        parseMarkdownToDrawnix: (definition: string, mainTopic?: string) =>
          null as any as MindElement,
      }),
    });
  const [text, setText] = useState(() => t('markdown.example'));
  const [value, setValue] = useState<PlaitElement[]>(() => []);
  const deferredText = useDeferredValue(text.trim());
  const [error, setError] = useState<Error | null>(null);
  const [previewRequested, setPreviewRequested] = useState(false);
  const board = useBoard();

  const ensureMarkdownLibLoaded = async () => {
    if (!markdownLibPromiseRef.current) {
      markdownLibPromiseRef.current = import('@plait-board/markdown-to-drawnix');
      setMarkdownToDrawnixLib((current) => ({ ...current, api: markdownLibPromiseRef.current }));
    }

    try {
      const module = await markdownLibPromiseRef.current;
      setMarkdownToDrawnixLib({
        loaded: true,
        api: Promise.resolve(module),
      });
      return module;
    } catch (err) {
      logger.error('Failed to load markdown conversion library', err);
      setError(new Error(t('dialog.error.loadMermaid')));
      throw err;
    }
  };
   
  // Update markdown example when language changes
  useEffect(() => {
    setText(t('markdown.example'));
  }, [language]);

  useEffect(() => {
    const convertMarkdown = async () => {
      if (!previewRequested || !deferredText) {
        if (!deferredText) {
          setValue([]);
          setError(null);
        }
        return;
      }

      try {
        const api = await ensureMarkdownLibLoaded();
        let ret;
        try {
          ret = await api.parseMarkdownToDrawnix(deferredText);
        } catch (err: any) {
          ret = await api.parseMarkdownToDrawnix(
            deferredText.replace(/"/g, "'")
          );
        }
        const mind = ret;
        mind.points = [[0, 0]];
        if (mind) {
          setValue([mind]);
          setError(null);
        }
      } catch (err: any) {
        setError(err);
      }
    };
    void convertMarkdown();
  }, [deferredText, previewRequested]);

  const requestPreview = () => {
    if (!previewRequested) {
      setPreviewRequested(true);
      return false;
    }
    return true;
  };

  const insertToBoard = () => {
    if (!value.length) {
      return;
    }
    const boardContainerRect =
      PlaitBoard.getBoardContainer(board).getBoundingClientRect();
    const focusPoint = [
      boardContainerRect.width / 4,
      boardContainerRect.height / 2 - 20,
    ];
    const zoom = board.viewport.zoom;
    const origination = getViewportOrigination(board);
    const focusX = origination![0] + focusPoint[0] / zoom;
    const focusY = origination![1] + focusPoint[1] / zoom;
    const elements = value;
    board.insertFragment(
      {
        elements: JSON.parse(JSON.stringify(elements)),
      },
      [focusX, focusY],
      WritableClipboardOperationType.paste
    );
    setAppState({ ...appState, openDialogType: null });
  };

  return (
    <>
      <div className="ttd-dialog-desc">
        {t('dialog.markdown.description')}
      </div>
      <TTDDialogPanels>
        <TTDDialogPanel label={t('dialog.markdown.syntax')}>
          <TTDDialogInput
            input={text}
            placeholder={t('dialog.markdown.placeholder')}
            onChange={(event) => setText(event.target.value)}
            onKeyboardSubmit={() => {
              if (!requestPreview()) {
                return;
              }
              insertToBoard();
            }}
          />
        </TTDDialogPanel>
        <TTDDialogPanel
          label={t('dialog.markdown.preview')}
          panelAction={{
            action: () => {
              if (!requestPreview()) {
                return;
              }
              insertToBoard();
            },
            label: t('dialog.markdown.insert'),
          }}
          renderSubmitShortcut={() => <TTDDialogSubmitShortcut />}
        >
          <TTDDialogOutput
            value={value}
            loaded={markdownToDrawnixLib.loaded}
            error={error}
          />
        </TTDDialogPanel>
      </TTDDialogPanels>
    </>
  );
};
export default MarkdownToDrawnix;
