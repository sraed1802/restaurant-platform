import { LegalDocumentPage } from '../components/LegalDocumentPage'
import { privacyPolicySections } from '../content/legalCopy'
import { useSessionStore } from '../store/sessionStore'

export default function PrivacyPolicyPage() {
  const language = useSessionStore((s) => s.language)
  const lang = language === 'ar' ? 'ar' : 'en'
  const doc = privacyPolicySections(lang)

  return <LegalDocumentPage title={doc.title} updated={doc.updated} sections={doc.sections} />
}
