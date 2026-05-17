// apps/customer/src/components/ThemeToggle.tsx
import { useThemeStore } from '../store/themeStore'

export default function ThemeToggle() {
  const { theme, effectiveTheme, toggleTheme } = useThemeStore()

  const getIcon = () => {
    switch (theme) {
      case 'light': return '☀️'
      case 'dark': return '🌙'
      case 'system': return effectiveTheme === 'dark' ? '🌙' : '☀️'
      default: return '☀️'
    }
  }

  const getLabel = () => {
    switch (theme) {
      case 'light': return 'Light'
      case 'dark': return 'Dark'
      case 'system': return 'System'
      default: return 'System'
    }
  }

  return (
    <button
      onClick={toggleTheme}
      className="theme-toggle"
      title={`Theme: ${getLabel()}`}
    >
      <span className="theme-icon">{getIcon()}</span>
    </button>
  )
}

const style = document.createElement('style')
style.textContent = `
  .theme-toggle {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--surface);
    border: 2px solid var(--border);
    box-shadow: var(--shadow-md);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
    z-index: 1000;
  }

  .theme-toggle:hover {
    transform: translateY(-2px);
    box-shadow: var(--shadow-lg);
    border-color: var(--gold);
  }

  .theme-icon {
    font-size: 1.2rem;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
  }

  @media (max-width: 768px) {
    .theme-toggle {
      bottom: 1rem;
      right: 1rem;
      width: 44px;
      height: 44px;
    }
  }
`
document.head.appendChild(style)
