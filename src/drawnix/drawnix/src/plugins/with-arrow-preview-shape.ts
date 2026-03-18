import {
  BoardTransforms,
  PlaitBoard,
  PlaitElement,
  PlaitPlugin,
  PlaitPointerType,
  PRESS_AND_MOVE_BUFFER,
  RectangleClient,
  Transforms,
  addSelectedElement,
  clearSelectedElement,
  createG,
  distanceBetweenPointAndPoint,
  temporaryDisableSelection,
  toActivePoint,
  toHostPoint,
  toScreenPointFromActivePoint,
  toViewBoxPoint,
  rotateAntiPointsByElement,
  rotatePointsByElement,
} from '@plait/core';
import {
  ArrowLineShape,
  PlaitDrawElement,
  WithArrowLineAutoCompletePluginKey,
  getAutoCompletePoints,
  getHitIndexOfAutoCompletePoint,
  getSelectedDrawElements,
  handleArrowLineCreating,
} from '@plait/draw';

function getPreferredArrowShape(board: PlaitBoard) {
  if (Object.values(ArrowLineShape).includes(board.pointer as ArrowLineShape)) {
    return board.pointer as ArrowLineShape;
  }

  const storedShape = localStorage.getItem('drawnix-arrow-shape');
  if (storedShape && Object.values(ArrowLineShape).includes(storedShape as ArrowLineShape)) {
    return storedShape as ArrowLineShape;
  }

  return ArrowLineShape.curve;
}

export const withArrowPreviewShape: PlaitPlugin = (board: PlaitBoard) => {
  const { pointerDown, pointerMove, globalPointerUp, touchMove } = board;
  let autoCompletePoint: [number, number] | null = null;
  let lineShapeG: SVGGElement | null = null;
  let sourceElement: PlaitElement | null = null;
  let temporaryElement: any = null;
  let previewShape: ArrowLineShape = ArrowLineShape.curve;

  board.pointerDown = (event) => {
    const selectedElements = getSelectedDrawElements(board);
    const targetElement = selectedElements.length === 1 ? selectedElements[0] : null;
    const activePoint = toActivePoint(board, event.x, event.y);

    if (!PlaitBoard.isReadonly(board) && targetElement && PlaitDrawElement.isShapeElement(targetElement)) {
      const points = getAutoCompletePoints(board, targetElement, true);
      const rotatedActivePoint =
        rotateAntiPointsByElement(board, activePoint, targetElement, true) || activePoint;
      const index = getHitIndexOfAutoCompletePoint(rotatedActivePoint, points);
      const hitPoint = points[index];

      if (hitPoint) {
        temporaryDisableSelection(board);
        const screenPoint = toScreenPointFromActivePoint(board, hitPoint);
        autoCompletePoint = toViewBoxPoint(board, toHostPoint(board, screenPoint[0], screenPoint[1]));
        sourceElement = targetElement;
        previewShape = getPreferredArrowShape(board);
        BoardTransforms.updatePointerType(board, previewShape);
        return;
      }
    }

    pointerDown(event);
  };

  board.touchMove = (event) => {
    if (autoCompletePoint && sourceElement) {
      event.preventDefault();
      return;
    }

    touchMove(event);
  };

  board.pointerMove = (event) => {
    lineShapeG?.remove();
    lineShapeG = createG();
    const movingPoint = toViewBoxPoint(board, toHostPoint(board, event.x, event.y));

    if (autoCompletePoint && sourceElement) {
      const rotatedMovingPoint =
        rotateAntiPointsByElement(board, movingPoint, sourceElement) || movingPoint;
      const distance = distanceBetweenPointAndPoint(
        ...rotatedMovingPoint,
        ...autoCompletePoint
      );

      if (distance > PRESS_AND_MOVE_BUFFER * 2) {
        const rectangle = RectangleClient.getRectangleByPoints(sourceElement.points);
        let sourcePoint = autoCompletePoint;
        if (rectangle) {
          const centerX = rectangle.x + rectangle.width / 2;
          const centerY = rectangle.y + rectangle.height / 2;
          const deltaX = sourcePoint[0] - centerX;
          const deltaY = sourcePoint[1] - centerY;
          if (Math.abs(deltaX) > Math.abs(deltaY)) {
            sourcePoint = [deltaX >= 0 ? rectangle.x + rectangle.width : rectangle.x, sourcePoint[1]];
          } else {
            sourcePoint = [sourcePoint[0], deltaY >= 0 ? rectangle.y + rectangle.height : rectangle.y];
          }
        }

        const rotatedSourcePoint = rotatePointsByElement(sourcePoint, sourceElement) || sourcePoint;
        temporaryElement = handleArrowLineCreating(
          board,
          previewShape,
          rotatedSourcePoint,
          movingPoint,
          sourceElement,
          lineShapeG
        );
        Transforms.addSelectionWithTemporaryElements(board, []);
      }

      return;
    }

    pointerMove(event);
  };

  board.globalPointerUp = (event) => {
    const handledAutoComplete = Boolean(autoCompletePoint || temporaryElement);

    if (temporaryElement) {
      Transforms.insertNode(board, temporaryElement, [board.children.length]);
      clearSelectedElement(board);
      addSelectedElement(board, temporaryElement);
      const afterComplete = board.getPluginOptions(WithArrowLineAutoCompletePluginKey)?.afterComplete;
      afterComplete?.(temporaryElement);
    }

    if (autoCompletePoint) {
      BoardTransforms.updatePointerType(board, PlaitPointerType.selection);
      autoCompletePoint = null;
    }

    lineShapeG?.remove();
    lineShapeG = null;
    sourceElement = null;
    temporaryElement = null;

    if (handledAutoComplete) {
      return;
    }

    globalPointerUp(event);
  };

  return board;
};
