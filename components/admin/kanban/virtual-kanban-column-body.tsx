"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";

/** Kanban card + gap-2; tune if card layout changes. */
export const KANBAN_VIRTUAL_CARD_ESTIMATE_PX = 132;
export const KANBAN_VIRTUAL_CARD_GAP_PX = 8;
/** Below this count, a plain map is cheaper than virtualizer setup. */
export const KANBAN_VIRTUALIZE_MIN_ITEMS = 12;

type Props<T> = {
  items: readonly T[];
  getItemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  estimateSize?: number;
  gap?: number;
  virtualizeMinItems?: number;
};

export function VirtualKanbanColumnBody<T>({
  items,
  getItemKey,
  renderItem,
  estimateSize = KANBAN_VIRTUAL_CARD_ESTIMATE_PX,
  gap = KANBAN_VIRTUAL_CARD_GAP_PX,
  virtualizeMinItems = KANBAN_VIRTUALIZE_MIN_ITEMS,
}: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowSize = estimateSize + gap;
  const useVirtual = items.length > virtualizeMinItems;

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowSize,
    overscan: 4,
    enabled: useVirtual,
  });

  if (!useVirtual) {
    return (
      <div className="flex min-h-[260px] flex-col gap-2 overflow-y-auto p-2">
        {items.map((item, index) => (
          <div key={getItemKey(item, index)}>{renderItem(item, index)}</div>
        ))}
      </div>
    );
  }

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollRef}
      className="min-h-[260px] max-h-[min(70vh,720px)] overflow-y-auto overflow-x-hidden p-2"
    >
      <div
        className="relative w-full"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualRow) => {
          const item = items[virtualRow.index];
          if (item == undefined) return null;
          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 top-0 w-full"
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderItem(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
