import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { THEME_STORAGE_KEY, applyTheme, resolveThemePreference, type ThemeMode } from '../lib/theme';

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    if (typeof document !== 'undefined') {
      const documentTheme = document.documentElement.dataset.theme;
      if (documentTheme === 'light' || documentTheme === 'dark') {
        return documentTheme;
      }
    }

    return resolveThemePreference();
  });

  const setTheme = (nextTheme: ThemeMode) => {
    setThemeState(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    setTheme,
    toggleTheme: () => setTheme(theme === 'light' ? 'dark' : 'light'),
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider');
  }

  return context;
}
