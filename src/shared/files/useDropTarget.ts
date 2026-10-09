import { useState, type DragEvent } from 'react';

export interface UseDropTargetOptions {
  /** Ignore drags and drops (e.g. while busy). */
  disabled?: boolean;
  /** Called with the dropped files (possibly several; the caller decides what to do). */
  onDropFiles: (files: File[]) => void;
}

/**
 * Makes an element accept files dragged from the desktop. Spread `handlers`
 * onto the element; `dragging` is true while a file is held over it, for
 * highlighting. Only drags that carry files react (dragging text or a link
 * past it does nothing).
 */
export function useDropTarget({ disabled = false, onDropFiles }: UseDropTargetOptions) {
  const [dragging, setDragging] = useState(false);

  const carriesFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

  const handlers = {
    onDragEnter(event: DragEvent) {
      if (disabled || !carriesFiles(event)) return;
      event.preventDefault();
      setDragging(true);
    },
    onDragOver(event: DragEvent) {
      if (disabled || !carriesFiles(event)) return;
      event.preventDefault(); // required, or the browser refuses the drop
    },
    onDragLeave(event: DragEvent) {
      // Moving over a child element also fires "leave"; only react when really leaving.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop(event: DragEvent) {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      if (!disabled) onDropFiles(Array.from(event.dataTransfer.files));
    },
  };

  return { dragging, handlers };
}
