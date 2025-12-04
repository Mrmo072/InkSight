import { Dialog, DialogContent } from '../dialog/dialog';
import { useDrawnix } from '../../hooks/use-drawnix';
import './clean-confirm.scss';
import { useBoard } from '@plait-board/react-board';
import { useI18n } from '../../i18n';

export const CleanConfirm = ({
  container,
}: {
  container: HTMLElement | null;
}) => {
  const { appState, setAppState } = useDrawnix();
  const { t } = useI18n();
  const board = useBoard();
  return (
    <Dialog
      open={appState.openCleanConfirm}
      onOpenChange={(open) => {
        setAppState({ ...appState, openCleanConfirm: open });
      }}
    >
      <DialogContent className="clean-confirm" container={container}>
        <h2 className="clean-confirm__title">{t('cleanConfirm.title')}</h2>
        <p className="clean-confirm__description">
          {t('cleanConfirm.description')}
        </p>
        <div className="clean-confirm__actions">
          <button
            className="clean-confirm__button clean-confirm__button--cancel"
            onClick={() => {
              setAppState({ ...appState, openCleanConfirm: false });
            }}
          >
            {t('cleanConfirm.cancel')}
          </button>
          <button
            className="clean-confirm__button clean-confirm__button--ok"
            autoFocus
            onClick={() => {
              // Delete board nodes (this operation is in undo history)
              board.deleteFragment(board.children);

              // Clear PDF highlight overlays (DOM only, not data)
              // This is necessary because highlights are rendered based on data,
              // but when nodes are deleted, the sync mechanism will mark cards as deleted
              // and eventually clean up the data. We just need to clean the DOM immediately.
              if ((window as any).inksight?.pdfReader?.clearAllHighlights) {
                console.log('[CleanBoard] Clearing PDF highlight overlays');
                (window as any).inksight.pdfReader.clearAllHighlights();
              }

              // NOTE: We do NOT call cardSystem.clearAll() or highlightManager.clearAll()
              // because those operations are not in the undo history.
              // The existing sync mechanism (node removal -> card soft-delete -> highlight removal)
              // will handle cleanup, and preserve data for undo/redo.

              setAppState({ ...appState, openCleanConfirm: false });
            }}
          >
            {t('cleanConfirm.ok')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
