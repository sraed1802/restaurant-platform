import { LegalDocumentPage } from '../components/LegalDocumentPage'
import { dataProtectionSections } from '../content/legalCopy'
import { useRestaurantSettings } from '../hooks/useRestaurantSettings'
import { useSessionStore } from '../store/sessionStore'

export default function DataProtectionPage() {
  const language = useSessionStore((s) => s.language)
  const { settings } = useRestaurantSettings()
  const lang = language === 'ar' ? 'ar' : 'en'
  const doc = dataProtectionSections(lang, settings.contact_email)

  return (
    <LegalDocumentPage
      title={doc.title}
      updated={doc.updated}
      sections={doc.sections}
      contactEmail={doc.contactEmail}
    />
  )
}
