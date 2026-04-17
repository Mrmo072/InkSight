import React, { useState, useRef, useCallback, useEffect } from 'react';
import { toFixed } from '@plait/core';
import './size-slider.scss';
import classNames from 'classnames';
import { throttle } from 'lodash';

interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  disabled?: boolean;
  title?: string;
  onChange?: (value: number) => void;
  beforeStart?: () => void;
  afterEnd?: () => void;
}

export const SizeSlider: React.FC<SliderProps> = ({
  min = 0,
  max = 100,
  step = 1,
  defaultValue = 100,
  disabled = false,
  title,
  onChange,
  beforeStart,
  afterEnd,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [value, setValue] = useState(defaultValue);
  const thumbPercentageRef = useRef(0);
  const sliderRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sliderRef.current && thumbRef.current) {
      const sliderRect = sliderRef.current.getBoundingClientRect();
      const thumbRect = thumbRef.current.getBoundingClientRect();
      thumbPercentageRef.current = toFixed(
        (thumbRect.width / 2 / sliderRect.width) * 100
      );
    }
  }, [thumbRef, sliderRef]);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  const handleSliderChange = useCallback(
    throttle(
      (event: React.MouseEvent<HTMLDivElement> | MouseEvent) => {
        if (sliderRef.current && thumbRef.current) {
          const sliderRect = sliderRef.current.getBoundingClientRect();
          const x = event.clientX - sliderRect.left;
          let percentage = Math.min(Math.max(x / sliderRect.width, 0), 1);
          if (percentage >= (100 - thumbPercentageRef.current) / 100) {
            percentage = 1;
          } else if (percentage <= thumbPercentageRef.current / 100) {
            percentage = 0;
          }
          const newValue =
            Math.round((percentage * (max - min)) / step) * step + min;
          setValue(newValue);
          onChange && onChange(newValue);
        }
      },
      50,
      { leading: true, trailing: true }
    ),
    [min, max, step, onChange]
  );

  const handlePointerDown = useCallback(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setIsDragging(true);
      handleSliderChange(e);
    };
    const handleMouseUp = () => {
      document.removeEventListener('pointermove', handleMouseMove);
      document.removeEventListener('pointerup', handleMouseUp);
      afterEnd && afterEnd();
      setTimeout(() => {
        setIsDragging(false);
      }, 0);
    };

    document.addEventListener('pointermove', handleMouseMove);
    document.addEventListener('pointerup', handleMouseUp);
  }, [handleSliderChange]);

  const updateValue = useCallback(
    (nextValue: number) => {
      const clampedValue = Math.min(max, Math.max(min, nextValue));
      setValue(clampedValue);
      onChange && onChange(clampedValue);
    },
    [max, min, onChange]
  );

  let percentage = ((value - min) / (max - min)) * 100;
  if (percentage >= 100 - thumbPercentageRef.current) {
    percentage = 100 - thumbPercentageRef.current;
  }
  if (percentage <= thumbPercentageRef.current) {
    percentage = thumbPercentageRef.current;
  }

  return (
    <div
      data-tooltip
      title={title}
      className={classNames('slider-container', { disabled: disabled })}
    >
      <div
        ref={sliderRef}
        className="slider-track"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={title || String(value)}
        onClick={(event) => {
          if (disabled || isDragging) {
            return;
          }
          handleSliderChange(event);
        }}
        onPointerDown={(event) => {
          event.preventDefault();
          if (disabled) {
            return;
          }
          beforeStart && beforeStart();
          handlePointerDown();
        }}
        onKeyDown={(event) => {
          if (disabled) {
            return;
          }

          const isHandledKey =
            event.key === 'ArrowLeft' ||
            event.key === 'ArrowDown' ||
            event.key === 'ArrowRight' ||
            event.key === 'ArrowUp' ||
            event.key === 'Home' ||
            event.key === 'End';

          if (!isHandledKey) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          let nextValue = value;

          if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
            nextValue = value - step;
          }
          if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
            nextValue = value + step;
          }
          if (event.key === 'Home') {
            nextValue = min;
          }
          if (event.key === 'End') {
            nextValue = max;
          }

          if (nextValue !== value) {
            updateValue(nextValue);
          }
        }}
      >
        <div
          className="slider-range"
          style={{
            width: `${percentage}%`,
          }}
        />
        <div
          ref={thumbRef}
          className="slider-thumb"
          style={{
            left: `${percentage}%`,
          }}
        />
      </div>
    </div>
  );
};
