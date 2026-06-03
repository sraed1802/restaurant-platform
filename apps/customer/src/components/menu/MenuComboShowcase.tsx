import { motion, useReducedMotion } from 'framer-motion'
import { StorageImage } from '../StorageImage'
import type { ComboPromotion } from '../../../types'
import { canAutoBuildCombo } from '../../services/comboPromotions'

type Props = {
  combos: ComboPromotion[]
  language: string
  formatPrice: (price: number) => string
  isOrderable: boolean
  unavailableLabel: string
  onAddCombo: (combo: ComboPromotion) => void
}

function comboLabel(combo: ComboPromotion, language: string) {
  const hasDrink = (combo.items ?? []).some(
    (item) => item.item_role === 'drink' || item.item_role === 'optional_drink'
  )

  if (hasDrink) {
    return language === 'ar' ? 'وجبة مع مشروب' : 'Meal + drink'
  }

  return language === 'ar' ? 'وجبة كومبو' : 'Combo meal'
}

function roleLabel(role: string, language: string) {
  const labels: Record<string, { en: string; ar: string }> = {
    main: { en: 'Main', ar: 'طبق رئيسي' },
    side: { en: 'Side', ar: 'طبق جانبي' },
    drink: { en: 'Drink', ar: 'مشروب' },
    dessert: { en: 'Dessert', ar: 'تحلية' },
    optional_drink: { en: 'Drink option', ar: 'خيار مشروب' },
  }

  const resolved = labels[role] ?? { en: 'Included item', ar: 'عنصر ضمن العرض' }
  return language === 'ar' ? resolved.ar : resolved.en
}

export function MenuComboShowcase({
  combos,
  language,
  formatPrice,
  isOrderable,
  unavailableLabel,
  onAddCombo,
}: Props) {
  const reduceMotion = useReducedMotion()
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)

  if (combos.length === 0) return null

  return (
    <section
      id="combo-showcase"
      className="combo-showcase"
      aria-labelledby="combo-showcase-title"
    >
      <div className="combo-showcase-shell">
        <div className="combo-showcase-copy">
          <p className="combo-kicker">{t('Chef-built bundles', 'باقات مصممة من الشيف')}</p>
          <h2 id="combo-showcase-title" className="combo-title">
            {t('Signature combos worth starring at', 'كومبوهات مميزة تستحق الواجهة')}
          </h2>
          <p className="combo-subtitle">
            {t(
              'Fixed bundle pricing with elevated presentation, clear savings, and one-tap cart building.',
              'تسعير ثابت للباقات مع عرض فاخر وتوفير واضح وإضافة سريعة إلى السلة.'
            )}
          </p>
        </div>
      </div>

      <div className="combo-card-grid">
        {combos.map((combo, index) => {
          const savings = Math.max(0, combo.original_price - combo.promo_price)
          const buildable = canAutoBuildCombo(combo)
          return (
            <motion.article
              key={combo.id}
              className="combo-card"
              initial={reduceMotion ? false : { opacity: 0, y: 14 }}
              whileHover={
                reduceMotion
                  ? undefined
                  : { y: -5, rotateX: 3, rotateY: index % 2 === 0 ? -4 : 4 }
              }
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: reduceMotion ? 0 : 0.42,
                delay: reduceMotion ? 0 : index * 0.06,
                ease: [0.22, 1, 0.36, 1],
              }}
              style={{
                ['--combo-accent' as string]: combo.accent_color ?? '#B8975A',
                ['--combo-secondary' as string]: combo.secondary_color ?? '#6D28D9',
              }}
            >
              <div className="combo-card-glow" />
              <div className="combo-card-media">
                {combo.image_url ? (
                  <StorageImage
                    src={combo.image_url}
                    preset="offer"
                    alt={language === 'ar' ? combo.name_ar : combo.name_en}
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="combo-card-placeholder">
                    <span>{comboLabel(combo, language)}</span>
                  </div>
                )}
              </div>

              <div className="combo-card-body">
                <div className="combo-card-topline">
                  <span className="combo-pill">
                    {combo.badge_text_en
                      ? t(combo.badge_text_en, combo.badge_text_ar ?? combo.badge_text_en)
                      : comboLabel(combo, language)}
                  </span>
                  <span className="combo-savings">
                    {t('Save', 'وفّر')} {formatPrice(savings)}
                  </span>
                </div>

                <h3 className="combo-card-title">
                  {language === 'ar' ? combo.name_ar : combo.name_en}
                </h3>
                <p className="combo-card-headline">
                  {t(
                    combo.headline_en ?? combo.description_en ?? 'A fixed-price bundle built for high-conversion ordering.',
                    combo.headline_ar ??
                      combo.description_ar ??
                      'عرض ثابت السعر مصمم لتجربة طلب أسرع وأكثر جاذبية.'
                  )}
                </p>

                <div className="combo-price-row">
                  <span className="combo-price-current">{formatPrice(combo.promo_price)}</span>
                  <span className="combo-price-original">{formatPrice(combo.original_price)}</span>
                </div>

                <ul className="combo-item-list">
                  {(combo.items ?? []).map((item) => (
                    <li key={item.id} className="combo-item-chip">
                      <span className="combo-item-role">{roleLabel(item.item_role, language)}</span>
                      <span className="combo-item-name">
                        {item.quantity}x{' '}
                        {item.product
                          ? language === 'ar'
                            ? item.product.name_ar
                            : item.product.name_en
                          : t('Menu item', 'عنصر من القائمة')}
                      </span>
                    </li>
                  ))}
                </ul>

                <button
                  type="button"
                  className="combo-add-btn"
                  disabled={!buildable || !isOrderable}
                  onClick={() => onAddCombo(combo)}
                >
                  {!isOrderable
                    ? unavailableLabel
                    : buildable
                    ? t('Add combo to cart', 'أضف الكومبو إلى السلة')
                    : t('Requires item selection', 'يتطلب اختيار العناصر')}
                </button>
              </div>
            </motion.article>
          )
        })}
      </div>

      <style>{`
        .combo-showcase {
          max-width: var(--container-wide);
          margin: 0 auto 1.75rem;
          padding: 0 0 0.5rem;
        }
        .combo-showcase-shell {
          margin-bottom: 1.15rem;
        }
        .combo-showcase-copy {
          max-width: 36rem;
        }
        .combo-kicker {
          font-size: 0.72rem;
          text-transform: uppercase;
          letter-spacing: 0.16em;
          color: var(--gold-dark);
          font-weight: 700;
          margin-bottom: 0.6rem;
        }
        .combo-title {
          font-family: var(--font-display);
          font-size: clamp(2rem, 3vw, 3rem);
          line-height: 1.04;
          color: var(--ink);
          margin-bottom: 0.75rem;
        }
        .combo-subtitle {
          color: var(--ink-soft);
          font-size: 1rem;
          line-height: 1.65;
          max-width: 34rem;
        }
        .combo-card-grid {
          display: grid;
          gap: 1rem;
        }
        @media (min-width: 820px) {
          .combo-card-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        .combo-card {
          position: relative;
          overflow: hidden;
          border-radius: 28px;
          border: 1px solid var(--border);
          background:
            linear-gradient(160deg, var(--surface), var(--surface-elevated)),
            radial-gradient(circle at top left, color-mix(in srgb, var(--combo-accent) 18%, transparent), transparent 50%);
          box-shadow: var(--elev-2);
          transform-style: preserve-3d;
        }
        .combo-card-glow {
          position: absolute;
          inset: -20% auto auto -10%;
          width: 180px;
          height: 180px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--combo-secondary) 24%, transparent);
          filter: blur(44px);
          opacity: 0.45;
          pointer-events: none;
        }
        .combo-card-media {
          position: relative;
          aspect-ratio: 16 / 10;
          overflow: hidden;
          background: linear-gradient(
            140deg,
            color-mix(in srgb, var(--surface) 92%, var(--combo-accent) 8%),
            color-mix(in srgb, var(--surface-elevated) 88%, var(--combo-secondary) 12%)
          );
        }
        .combo-card-media img,
        .combo-card-media .storage-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .combo-card-placeholder {
          width: 100%;
          height: 100%;
          display: grid;
          place-items: center;
          color: var(--ink-soft);
          font-family: var(--font-display);
          font-size: 1.05rem;
        }
        .combo-card-body {
          position: relative;
          padding: 1rem 1rem 1.15rem;
        }
        .combo-card-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          margin-bottom: 0.7rem;
        }
        .combo-pill,
        .combo-savings {
          display: inline-flex;
          align-items: center;
          border-radius: 999px;
          padding: 0.32rem 0.72rem;
          font-size: 0.72rem;
          font-weight: 700;
        }
        .combo-pill {
          background: color-mix(in srgb, var(--combo-accent) 18%, var(--surface-elevated));
          color: var(--ink);
          border: 1px solid color-mix(in srgb, var(--combo-accent) 24%, var(--border));
        }
        .combo-savings {
          color: color-mix(in srgb, var(--combo-secondary) 72%, var(--ink));
          background: color-mix(in srgb, var(--combo-secondary) 14%, var(--surface-elevated));
          border: 1px solid color-mix(in srgb, var(--combo-secondary) 22%, var(--border));
        }
        .combo-card-title {
          font-family: var(--font-display);
          font-size: 1.28rem;
          color: var(--ink);
          margin-bottom: 0.45rem;
        }
        .combo-card-headline {
          color: var(--ink-soft);
          font-size: 0.92rem;
          line-height: 1.55;
          min-height: 2.9rem;
        }
        .combo-price-row {
          display: flex;
          align-items: baseline;
          gap: 0.7rem;
          margin: 0.9rem 0 0.85rem;
        }
        .combo-price-current {
          font-size: 1.5rem;
          font-weight: 800;
          color: var(--ink);
        }
        .combo-price-original {
          font-size: 0.9rem;
          color: var(--ink-muted);
          text-decoration: line-through;
        }
        .combo-item-list {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-bottom: 1rem;
        }
        .combo-item-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.38rem;
          padding: 0.45rem 0.62rem;
          border-radius: 999px;
          background: var(--surface-elevated);
          border: 1px solid var(--border);
          font-size: 0.75rem;
          color: var(--ink-soft);
        }
        .combo-item-role {
          color: var(--gold-dark);
          font-weight: 700;
        }
        .combo-add-btn {
          width: 100%;
          padding: 0.88rem 1rem;
          border-radius: 14px;
          font-size: 0.92rem;
          font-weight: 700;
          color: white;
          background: linear-gradient(135deg, var(--combo-accent), var(--combo-secondary));
          box-shadow: 0 14px 28px color-mix(in srgb, var(--combo-secondary) 28%, transparent);
        }
        .combo-add-btn:disabled {
          cursor: not-allowed;
          opacity: 0.55;
          box-shadow: none;
        }
        [data-theme='dark'] .combo-card {
          border-color: color-mix(in srgb, var(--combo-accent) 20%, var(--border));
          box-shadow:
            0 18px 42px rgba(0, 0, 0, 0.42),
            0 0 0 1px color-mix(in srgb, var(--combo-accent) 10%, transparent);
        }
        [data-theme='dark'] .combo-card-media {
          background: linear-gradient(
            140deg,
            color-mix(in srgb, var(--surface) 84%, var(--combo-accent) 16%),
            color-mix(in srgb, var(--surface-elevated) 80%, var(--combo-secondary) 20%)
          );
        }
        [data-theme='dark'] .combo-card-placeholder {
          color: var(--ink);
        }
        [data-theme='dark'] .combo-item-chip {
          background: color-mix(in srgb, var(--surface-elevated) 92%, var(--combo-accent) 8%);
        }
        @media (prefers-reduced-motion: reduce) {
          .combo-card,
          .combo-showcase *,
          .combo-visual {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>
    </section>
  )
}
