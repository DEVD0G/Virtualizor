import { createContext, ReactNode, useContext, useState } from 'react';

export type UiMode = 'professional' | 'assisted';

const STORAGE_KEY = 'vcp_ui_mode';

interface UiModeContextValue {
  mode: UiMode;
  setMode: (m: UiMode) => void;
  isAssisted: boolean;
}

const UiModeContext = createContext<UiModeContextValue>({
  mode: 'professional',
  setMode: () => {},
  isAssisted: false,
});

export function UiModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UiMode>(
    () => (localStorage.getItem(STORAGE_KEY) as UiMode | null) ?? 'professional',
  );

  const setMode = (m: UiMode) => {
    setModeState(m);
    localStorage.setItem(STORAGE_KEY, m);
  };

  return (
    <UiModeContext.Provider value={{ mode, setMode, isAssisted: mode === 'assisted' }}>
      {children}
    </UiModeContext.Provider>
  );
}

export const useUiMode = () => useContext(UiModeContext);
