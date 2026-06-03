import { LegalDocumentPage } from '../components/LegalDocumentPage'
import { dataProtectionSections } from '../content/legalCopy'
import { useSessionStore } from '../store/sessionStore'

export default function DataProtectionPage() {
  const language = useSessionStore((s) => s.language)
  const lang = language === 'ar' ? 'ar' : 'en'
  const doc = dataProtectionSections(lang)

  return (
    <LegalDocumentPage
      title={doc.title}
      updated={doc.updated}
      sections={doc.sections}
      contactEmail={doc.contactEmail}
    />
  )
}
