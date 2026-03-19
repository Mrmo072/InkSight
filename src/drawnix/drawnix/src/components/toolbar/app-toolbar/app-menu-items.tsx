import {
  ExportImageIcon,
  GithubIcon,
  OpenFileIcon,
  SaveFileIcon,
  TrashIcon,
  TextIcon,
} from '../../icons';
import { useBoard, useListRender } from '@plait-board/react-board';
import {
  getSelectedElements,
} from '@plait/core';
import { MindElement } from '@plait/mind';
import MenuItem from '../../menu/menu-item';
import MenuItemLink from '../../menu/menu-item-link';
import { saveAsImage, saveAsSvg } from '../../../utils/image';
import { useDrawnix } from '../../../hooks/use-drawnix';
import { useI18n } from '../../../i18n';
import Menu from '../../menu/menu';
import { useContext } from 'react';
import { MenuContentPropsContext } from '../../menu/common';
import { EVENT } from '../../../constants';
import { getShortcutKey } from '../../../utils/common';
import { saveCurrentProject, openProjectFile } from '../../../../../../inksight-file/inksight-project-actions.js';

export const SaveToFile = () => {
  const board = useBoard();
  return (
    <MenuItem
      data-testid="save-button"
      onSelect={() => {
        void saveCurrentProject(board);
      }}
      icon={SaveFileIcon}
      aria-label="Save Project Folder"
      shortcut={getShortcutKey('CtrlOrCmd+S')}
    >Save Project Folder</MenuItem>
  );
};
SaveToFile.displayName = 'SaveToFile';

export const OpenFile = () => {
  const board = useBoard();
  const listRender = useListRender();
  return (
    <MenuItem
      data-testid="open-button"
      onSelect={() => {
        void openProjectFile(board, listRender);
      }}
      icon={OpenFileIcon}
      aria-label="Open Project Folder"
    >Open Project Folder</MenuItem>
  );
};
OpenFile.displayName = 'OpenFile';

export const SaveAsImage = () => {
  const board = useBoard();
  const menuContentProps = useContext(MenuContentPropsContext);
  const { t } = useI18n();
  return (
    <MenuItem
      icon={ExportImageIcon}
      data-testid="image-export-button"
      onSelect={() => {
        saveAsImage(board, true);
      }}
      submenu={
        <Menu onSelect={(event) => {
          const itemSelectEvent = new CustomEvent(EVENT.MENU_ITEM_SELECT, {
            bubbles: true,
            cancelable: true,
          });
          menuContentProps.onSelect?.(itemSelectEvent);
        }}>
          <MenuItem
            onSelect={() => {
              saveAsImage(board, true);
            }}
            aria-label={t('menu.exportImage.png')}
          >
            {t('menu.exportImage.png')}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              saveAsImage(board, false);
            }}
            aria-label={t('menu.exportImage.jpg')}
          >
            {t('menu.exportImage.jpg')}
          </MenuItem>
          <MenuItem
            onSelect={() => {
              saveAsSvg(board);
            }}
            aria-label="SVG"
          >
            SVG
          </MenuItem>
        </Menu>
      }
      shortcut={getShortcutKey('CtrlOrCmd+Shift+E')}
      aria-label={t('menu.exportImage')}
    >
      {t('menu.exportImage')}
    </MenuItem>
  );
};
SaveAsImage.displayName = 'SaveAsImage';

export const ExportSelectedText = () => {
  const board = useBoard();
  const { t } = useI18n();

  return (
    <MenuItem
      icon={TextIcon}
      data-testid="export-text-button"
      onSelect={() => {
        const selectedElements = getSelectedElements(board);
        if (selectedElements.length === 0) {
          alert('No elements selected. Please select some nodes first.');
          return;
        }

        const texts: string[] = [];
        selectedElements.forEach(element => {
          let text = '';
          if (MindElement.isMindElement(board, element)) {
            // Mind map node
            text = (element.data?.topic?.children?.[0] as any)?.text || '';
          } else if ((element as any).text && (element as any).text.children) {
            // Geometry or other shape with text
            text = (element as any).text.children[0]?.text || '';
          }

          if (text) {
            texts.push(text);
          }
        });

        if (texts.length === 0) {
          alert('Selected elements contain no text.');
          return;
        }

        const blob = new Blob([texts.join('\n')], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'exported_text.txt';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      }}
      aria-label={t('menu.exportSelectedText')}
    >
      {t('menu.exportSelectedText')}
    </MenuItem>
  );
};
ExportSelectedText.displayName = 'ExportSelectedText';

export const CleanBoard = () => {
  const { appState, setAppState } = useDrawnix();
  const { t } = useI18n();
  return (
    <MenuItem
      icon={TrashIcon}
      data-testid="reset-button"
      onSelect={() => {
        setAppState({
          ...appState,
          openCleanConfirm: true,
        });
      }}
      shortcut={getShortcutKey('CtrlOrCmd+Backspace')}
      aria-label={t('menu.cleanBoard')}
    >
      {t('menu.cleanBoard')}
    </MenuItem>
  );
};
CleanBoard.displayName = 'CleanBoard';

export const Socials = () => {
  return (
    <MenuItemLink
      icon={GithubIcon}
      href="https://github.com/Mrmo072/InkSight"
      aria-label="GitHub"
    >
      GitHub
    </MenuItemLink>
  );
};
Socials.displayName = 'Socials';
