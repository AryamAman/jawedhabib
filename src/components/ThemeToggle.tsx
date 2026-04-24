import { MoonStar, SunMedium } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="theme-toggle"
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {isDark ? <SunMedium className="h-4 w-4" strokeWidth={1.8} /> : <MoonStar className="h-4 w-4" strokeWidth={1.8} />}
    </button>
  );
}
