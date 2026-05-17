// apps/customer/src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AppProviders } from '@rms/platform'
import App from './App'
import { initSentry } from './lib/sentry'
import { initEmbedPreviewShellClass, isAdminEmbedPreview } from './lib/embedPreview'
import { initNativeCustomerShellClass, isNativeCustomerApp } from './lib/nativeCustomerShell'
import { useSessionStore } from './store/sessionStore'
import './index.css'

void useSessionStore.persist.rehydrate()

initNativeCustomerShellClass()
initEmbedPreviewShellClass()
if (isNativeCustomerApp()) {
  void import('./native/native-shell.css')
}
if (isAdminEmbedPreview()) {
  void import('./styles/embed-preview.css')
}
initSentry()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppProviders>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </AppProviders>
  </React.StrictMode>
)
