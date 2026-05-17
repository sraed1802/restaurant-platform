interface SettingsTabItem {
  id: string
  label: string
  description?: string
}

interface SettingsTabNavProps {
  tabs: SettingsTabItem[]
  activeTab: string
  onChange: (tabId: string) => void
}

export default function SettingsTabNav({ tabs, activeTab, onChange }: SettingsTabNavProps) {
  return (
    <div className="settings-tab-nav" role="tablist" aria-label="Settings sections">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`settings-tab-button ${isActive ? 'active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            <span className="settings-tab-label">{tab.label}</span>
            {tab.description && <span className="settings-tab-description">{tab.description}</span>}
          </button>
        )
      })}
    </div>
  )
}
