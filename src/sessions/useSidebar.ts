import { useState } from 'react';
import { loadSidebarWidth } from './sidebarWidth';
import { useSidebarResize } from './useSidebarResize';

export interface UseSidebar {
  open: boolean;
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
  width: number;
  onHandleMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
}

/**
 * All right-sidebar UI state in one place: open/closed (toggled by Ctrl+B at the
 * ProjectArea level) and the drag-resizable width (persisted to localStorage).
 */
export function useSidebar(): UseSidebar {
  const [open, setOpen] = useState(true);
  const [width, setWidth] = useState(loadSidebarWidth());
  const { onHandleMouseDown } = useSidebarResize(width, setWidth);
  return { open, setOpen, width, onHandleMouseDown };
}
