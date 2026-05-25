// src/tabs/tabsReducer.ts
import type { Tab, TabsState } from './types';

export type TabsAction =
  | { type: 'add'; tab: Tab }
  | { type: 'setActive'; uid: string }
  | { type: 'closeTab'; uid: string }
  | { type: 'updatePrimarySessionId'; sessionId: string }
  | { type: 'resetForProject' };

export const initialState: TabsState = { tabs: [], activeUid: null };

export function tabsReducer(state: TabsState, action: TabsAction): TabsState {
  switch (action.type) {
    case 'add':
      return {
        tabs: [...state.tabs, action.tab],
        activeUid: action.tab.uid,
      };

    case 'setActive': {
      const exists = state.tabs.some((t) => t.uid === action.uid);
      return exists ? { ...state, activeUid: action.uid } : state;
    }

    case 'closeTab': {
      const idx = state.tabs.findIndex((t) => t.uid === action.uid);
      if (idx < 0 || state.tabs[idx].isPrimary) return state;
      const tabs = state.tabs.filter((_, i) => i !== idx);
      let activeUid = state.activeUid;
      if (state.activeUid === action.uid) {
        // Activate left neighbour; falls back to tabs[0] (which is the
        // primary, since primary is always at index 0) if we closed the
        // tab immediately after primary.
        activeUid = tabs[Math.max(0, idx - 1)].uid;
      }
      return { tabs, activeUid };
    }

    case 'updatePrimarySessionId': {
      const idx = state.tabs.findIndex((t) => t.isPrimary);
      if (idx < 0) return state;
      const tabs = [...state.tabs];
      tabs[idx] = { ...tabs[idx], sessionId: action.sessionId };
      return { ...state, tabs };
    }

    case 'resetForProject':
      return { tabs: [], activeUid: null };
  }
}
