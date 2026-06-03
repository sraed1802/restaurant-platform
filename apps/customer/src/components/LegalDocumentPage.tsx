import { Link } from 'react-router-dom'
import { useSessionStore } from '../store/sessionStore'

type Section = {
  heading: string
  body: string
  linkToProfile?: boolean
  mailtoSubject?: string
  mailtoBody?: string
}

type Props = {
  title: string
  updated: string
  sections: Section[]
  contactEmail?: string
}

export function LegalDocumentPage({ title, updated, sections, contactEmail }: Props) {
  const language = useSessionStore((s) => s.language)
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)

  return (
    <div className="legal-page">
      <article className="legal-card">
        <h1 className="legal-title">{title}</h1>
        <p className="legal-updated">{updated}</p>

        {sections.map((section) => (
          <section key={section.heading} className="legal-section">
            <h2 className="legal-heading">{section.heading}</h2>
            <p className="legal-body">{section.body}</p>
            {section.linkToProfile ? (
              <p className="legal-actions">
                <Link to="/profile" className="legal-link">
                  {t('Go to your profile', 'انتقل إلى ملفك الشخصي')}
                </Link>
              </p>
            ) : null}
            {section.mailtoSubject && contactEmail ? (
              <p className="legal-actions">
                <a
                  href={`mailto:${encodeURIComponent(contactEmail)}?subject=${encodeURIComponent(section.mailtoSubject)}&body=${section.mailtoBody ?? ''}`}
                  className="legal-link"
                >
                  {contactEmail}
                </a>
              </p>
            ) : null}
          </section>
        ))}

        <nav className="legal-nav" aria-label={t('Legal pages', 'صفحات قانونية')}>
          <Link to="/privacy">{t('Privacy Policy', 'سياسة الخصوصية')}</Link>
          <Link to="/data-protection">{t('Data Protection', 'حماية البيانات')}</Link>
          <Link to="/menu">{t('Back to menu', 'العودة إلى القائمة')}</Link>
        </nav>
      </article>

      <style>{`
        .legal-page { min-height: 50vh; padding: 1.5rem 1rem 3rem; }
        .legal-card { max-width: 720px; margin: 0 auto; background: var(--surface-elevated); border: 1px solid var(--border-strong); border-radius: var(--radius-lg); padding: 1.5rem 1.35rem; }
        .legal-title { font-family: var(--font-display); font-weight: 400; margin: 0 0 0.35rem; color: var(--ink); font-size: 1.65rem; }
        .legal-updated { margin: 0 0 1.25rem; font-size: 0.82rem; color: var(--ink-muted); }
        .legal-section { margin-bottom: 1.15rem; }
        .legal-heading { margin: 0 0 0.4rem; font-size: 1.05rem; color: var(--ink); }
        .legal-body { margin: 0; line-height: 1.6; color: var(--ink-muted); font-size: 0.92rem; }
        .legal-actions { margin: 0.65rem 0 0; }
        .legal-link { color: var(--gold-dark, #8a6d3b); font-weight: 600; word-break: break-all; }
        .legal-nav { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid var(--border); font-size: 0.88rem; }
        .legal-nav a { color: var(--ink-muted); text-decoration: underline; }
      `}</style>
    </div>
  )
}
