// apps/admin/src/components/ColorPicker.tsx
import { useState } from 'react'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (color: string) => void
  placeholder?: string
}

export default function ColorPicker({ label, value, onChange, placeholder = '#000000' }: ColorPickerProps) {
  const [inputValue, setInputValue] = useState(value || placeholder)

  const handleColorChange = (color: string) => {
    setInputValue(color)
    onChange(color)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value
    if (/^#[0-9A-Fa-f]{6}$/.test(newColor) || newColor === '') {
      handleColorChange(newColor)
    }
    setInputValue(newColor)
  }

  return (
    <div className="color-picker">
      <label className="color-label">{label}</label>
      <div className="color-input-group">
        <input
          type="color"
          value={value || placeholder}
          onChange={(e) => handleColorChange(e.target.value)}
          className="color-input"
        />
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder={placeholder}
          className="color-text-input"
          maxLength={7}
        />
        <div 
          className="color-preview"
          style={{ backgroundColor: value || placeholder }}
        />
      </div>
      
      <style>{`
        .color-picker {
          margin-bottom: 1rem;
        }
        
        .color-label {
          display: block;
          font-size: 0.6rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--text-muted);
          margin-bottom: 0.35rem;
        }
        
        .color-input-group {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .color-input {
          width: 40px;
          height: 40px;
          border: 2px solid var(--border);
          border-radius: var(--radius-sm);
          cursor: pointer;
          background: none;
        }
        
        .color-input::-webkit-color-swatch-wrapper {
          padding: 0;
        }
        
        .color-input::-webkit-color-swatch {
          border: none;
          border-radius: var(--radius-sm);
        }
        
        .color-text-input {
          flex: 1;
          padding: 0.5rem;
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          font-family: monospace;
          font-size: 0.875rem;
          text-transform: uppercase;
        }
        
        .color-text-input:focus {
          outline: none;
          border-color: var(--primary);
        }
        
        .color-preview {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-sm);
          border: 2px solid var(--border);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  )
}
