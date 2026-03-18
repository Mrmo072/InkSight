import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PlaitBoard } from '@plait/core';
import { setTextFontSize } from '../../../transforms/property';

export type PopupFontSizeControlProps = {
  board: PlaitBoard;
  currentFontSize?: number;
  title: string;
};

const DEFAULT_FONT_SIZE = 14;
const MIN_FONT_SIZE = 8;
const MAX_FONT_SIZE = 78;

export const PopupFontSizeControl: React.FC<PopupFontSizeControlProps> = ({
  board,
  currentFontSize,
  title,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedCurrent = useMemo(() => {
    return Number.isFinite(currentFontSize as number) &&
      (currentFontSize as number) > 0
      ? Math.round(currentFontSize as number)
      : DEFAULT_FONT_SIZE;
  }, [currentFontSize]);
  const [draft, setDraft] = useState<string>(String(normalizedCurrent));

  useEffect(() => {
    setDraft(String(normalizedCurrent));
  }, [normalizedCurrent]);

  const apply = (value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next)) {
      setDraft(String(normalizedCurrent));
      return;
    }
    const clamped = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(next)));
    const nextValue = String(clamped);
    setDraft(nextValue);
    setTextFontSize(board, clamped);
  };

  const stepBy = (delta: number) => {
    const base = Number.isFinite(Number(draft)) ? Number(draft) : normalizedCurrent;
    apply(String(base + delta));
    inputRef.current?.focus();
  };

  return (
    <div
      className="popup-font-size"
      title={title}
      aria-label={title}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerUp={(event) => {
        event.stopPropagation();
      }}
    >
      <input
        ref={inputRef}
        className="popup-font-size__input"
        type="number"
        inputMode="numeric"
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        step={1}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
        onBlur={(event) => {
          apply(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            apply(draft);
          }
        }}
      />
      <div className="popup-font-size__stepper" aria-hidden="true">
        <button
          type="button"
          className="popup-font-size__button"
          onClick={() => {
            stepBy(1);
          }}
        >
          +
        </button>
        <button
          type="button"
          className="popup-font-size__button"
          onClick={() => {
            stepBy(-1);
          }}
        >
          -
        </button>
      </div>
    </div>
  );
};
