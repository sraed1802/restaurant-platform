import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion'
import { isAdminEmbedPreview } from '../../lib/embedPreview'
import { isAndroidCustomerApp } from '../../lib/nativeCustomerShell'
import { storageImageUrl } from '../../lib/storageImage'

type Settings = {
  hero_title_en: string | null
  hero_title_ar: string | null
  hero_subtitle_en: string | null
  hero_subtitle_ar: string | null
  hero_image_url: string | null
  restaurant_name_en: string
  restaurant_name_ar: string
  restaurant_tagline_en: string
  restaurant_tagline_ar: string
}

type Props = {
  settings: Settings
  language: string
}

export function MenuHero({ settings, language }: Props) {
  const reduceMotion = useReducedMotion()
  const embedPreview = isAdminEmbedPreview()
  const staticHero = reduceMotion || embedPreview
  const nativeAndroid = isAndroidCustomerApp()
  const heroRef = useRef<HTMLElement | null>(null)
  const { scrollYProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  })
  const t = (en: string, ar: string) => (language === 'ar' ? ar : en)
  const title = settings.hero_title_en
    ? t(settings.hero_title_en, settings.hero_title_ar ?? settings.hero_title_en)
    : t(settings.restaurant_name_en, settings.restaurant_name_ar)
  const subtitle = settings.hero_subtitle_en
    ? t(settings.hero_subtitle_en, settings.hero_subtitle_ar ?? settings.hero_subtitle_en)
    : t(settings.restaurant_tagline_en, settings.restaurant_tagline_ar)
  /** Direct transforms only (no scroll-linked springs): springs + WebView scroll jitter caused visible hero flashing on Android. */
  const backdropY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, -56])
  const backdropScale = useTransform(scrollYProgress, [0, 1], reduceMotion ? [1.04, 1.04] : [1.06, 1.18])
  const copyY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, 26])
  const copyOpacity = useTransform(scrollYProgress, [0, 0.8, 1], reduceMotion ? [1, 1, 1] : [1, 0.94, 0.88])
  const visualY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, 52])
  const visualRotate = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, -1.6])
  const visualScale = useTransform(scrollYProgress, [0, 1], reduceMotion ? [1.02, 1.02] : [1.02, 1.08])
  const imageY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, 28])
  const imageScale = useTransform(scrollYProgress, [0, 1], reduceMotion ? [1.06, 1.06] : [1.04, 1.16])
  const orbAY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, -38])
  const orbBY = useTransform(scrollYProgress, [0, 1], reduceMotion ? [0, 0] : [0, 22])
  const sheenX = useTransform(scrollYProgress, [0, 1], reduceMotion ? ['-10%', '-10%'] : ['-6%', '16%'])

  const heroImagePrimary = storageImageUrl(settings.hero_image_url, 'hero')
  const heroImageRaw = settings.hero_image_url?.trim() || null
  const [heroImageSrc, setHeroImageSrc] = useState(heroImagePrimary)

  useEffect(() => {
    setHeroImageSrc(heroImagePrimary)
  }, [heroImagePrimary])

  function onHeroImageError() {
    if (heroImageRaw && heroImageSrc !== heroImageRaw) {
      setHeroImageSrc(heroImageRaw)
    }
  }

  return (
    <section
      ref={heroRef}
      className={`menu-hero${nativeAndroid ? ' menu-hero--native-android' : ''}`}
    >
      {heroImageSrc ? (
        <motion.div
          className="menu-hero-backdrop"
          style={staticHero ? undefined : { y: backdropY, scale: backdropScale }}
          aria-hidden
        >
          <img
            src={heroImageSrc}
            alt=""
            className="menu-hero-backdrop-img"
            decoding="async"
            onError={onHeroImageError}
          />
        </motion.div>
      ) : null}
      <motion.div
        className="menu-hero-atmosphere menu-hero-atmosphere-a"
        style={staticHero ? undefined : { y: orbAY }}
        aria-hidden
      />
      <motion.div
        className="menu-hero-atmosphere menu-hero-atmosphere-b"
        style={staticHero ? undefined : { y: orbBY }}
        aria-hidden
      />
      <div className="menu-hero-veil" aria-hidden />
      <div className="menu-hero-overlay" aria-hidden />
      <div className="menu-hero-texture" aria-hidden />

      <div className="menu-hero-grid">
        <motion.div
          className="menu-hero-copy"
          style={staticHero ? undefined : { y: copyY, opacity: copyOpacity }}
          initial={staticHero ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: staticHero ? 0 : 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="typ-overline menu-hero-eyebrow">{language === 'ar' ? 'قائمة اليوم' : "Today's menu"}</p>
          <h1 className="menu-hero-title typ-display">{title}</h1>
          <p className="menu-hero-sub">{subtitle}</p>
          <div className="menu-hero-divider" aria-hidden />
        </motion.div>

        <motion.div
          className="menu-hero-visual-shell"
          initial={staticHero ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            duration: staticHero ? 0 : 0.4,
            ease: [0.22, 1, 0.36, 1],
            delay: staticHero ? 0 : 0.05,
          }}
        >
          <motion.div
            className="menu-hero-visual-orb menu-hero-visual-orb-top"
            style={staticHero ? undefined : { y: orbAY }}
            aria-hidden
          />
          <motion.div
            className="menu-hero-visual-orb menu-hero-visual-orb-bottom"
            style={staticHero ? undefined : { y: orbBY }}
            aria-hidden
          />
          <motion.div
            className="menu-hero-visual"
            style={staticHero ? undefined : { y: visualY, rotate: visualRotate, scale: visualScale }}
          >
            {heroImageSrc ? (
              <motion.img
                src={heroImageSrc}
                alt={
                  language === 'ar'
                    ? `${title} - صورة رئيسية للقائمة`
                    : `${title} - featured menu imagery`
                }
                className="menu-hero-img"
                loading="eager"
                fetchPriority="high"
                decoding="async"
                onError={onHeroImageError}
                style={staticHero ? undefined : { y: imageY, scale: imageScale }}
              />
            ) : (
              <motion.div className="menu-hero-placeholder" aria-hidden />
            )}
            <motion.div
              className="menu-hero-visual-sheen"
              style={staticHero ? undefined : { x: sheenX }}
              aria-hidden
            />
            <div className="menu-hero-visual-vignette" aria-hidden />
          </motion.div>
        </motion.div>
      </div>

      <style>{`
        .menu-hero {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          margin: 0 -1.5rem 1.75rem;
          padding: 2.4rem 1.5rem 2rem;
          border-bottom: 3px solid var(--gold);
          border-radius: 0 0 32px 32px;
          background:
            radial-gradient(circle at top left, rgba(184, 151, 90, 0.24), transparent 34%),
            linear-gradient(155deg, rgba(28, 21, 16, 0.9) 0%, rgba(52, 37, 24, 0.82) 48%, rgba(22, 16, 11, 0.94) 100%);
          box-shadow: 0 24px 60px rgba(14, 14, 14, 0.14);
        }
        .menu-hero-backdrop,
        .menu-hero-overlay,
        .menu-hero-veil,
        .menu-hero-texture,
        .menu-hero-atmosphere {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .menu-hero-backdrop {
          opacity: 0.28;
          z-index: 0;
        }
        .menu-hero-backdrop-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          filter: saturate(1.08) blur(2px);
          transform: scale(1.08);
        }
        .menu-hero-atmosphere {
          inset: auto;
          border-radius: 999px;
          filter: blur(48px);
          z-index: 1;
          opacity: 0.42;
        }
        .menu-hero-atmosphere-a {
          top: -2rem;
          inset-inline-start: -3rem;
          width: 220px;
          height: 220px;
          background: rgba(226, 179, 89, 0.3);
          animation: heroFloatOne 18s ease-in-out infinite;
        }
        .menu-hero-atmosphere-b {
          right: 8%;
          bottom: 8%;
          width: 260px;
          height: 260px;
          background: rgba(168, 85, 247, 0.14);
          animation: heroFloatTwo 22s ease-in-out infinite;
        }
        .menu-hero-veil {
          z-index: 1;
          background:
            radial-gradient(circle at 20% 22%, rgba(255, 221, 173, 0.1), transparent 20%),
            radial-gradient(circle at 78% 26%, rgba(255, 244, 218, 0.08), transparent 18%);
          mix-blend-mode: screen;
        }
        .menu-hero-overlay {
          z-index: 1;
          background:
            linear-gradient(90deg, rgba(18, 13, 10, 0.86) 0%, rgba(18, 13, 10, 0.52) 42%, rgba(18, 13, 10, 0.7) 100%),
            radial-gradient(circle at 80% 18%, rgba(202, 138, 4, 0.18), transparent 22%);
        }
        .menu-hero-texture {
          z-index: 1;
          opacity: 0.08;
          background-image:
            linear-gradient(135deg, rgba(255,255,255,0.7) 0%, transparent 22%),
            repeating-linear-gradient(
              90deg,
              transparent 0,
              transparent 3px,
              rgba(255,255,255,0.22) 3px,
              rgba(255,255,255,0.22) 4px
            );
          mix-blend-mode: soft-light;
        }
        .menu-hero-grid {
          position: relative;
          z-index: 2;
          display: grid;
          gap: 1.5rem;
          align-items: center;
          max-width: var(--container-wide);
          margin: 0 auto;
        }
        @media (min-width: 768px) {
          .menu-hero-grid {
            grid-template-columns: 1fr 1fr;
            gap: 2rem;
          }
        }
        .menu-hero-eyebrow {
          margin-bottom: 0.75rem;
          color: rgba(255, 243, 214, 0.88);
        }
        .menu-hero-title {
          margin-bottom: 0.75rem;
          color: #fffaf0;
          text-shadow: 0 14px 34px rgba(0, 0, 0, 0.28);
        }
        .menu-hero-sub {
          font-size: var(--text-body-lg);
          color: rgba(255, 247, 234, 0.82);
          max-width: 36rem;
          line-height: 1.55;
        }
        .menu-hero-divider {
          width: min(160px, 38%);
          height: 1px;
          margin-top: 1.35rem;
          background:
            linear-gradient(90deg, rgba(244, 211, 122, 0.9), rgba(244, 211, 122, 0.26), transparent);
        }
        .menu-hero-visual-shell {
          position: relative;
          min-height: 100%;
        }
        .menu-hero-visual {
          position: relative;
          border-radius: var(--radius-lg);
          overflow: hidden;
          aspect-ratio: 21 / 12;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(255, 233, 183, 0.16);
          border: 1px solid rgba(255, 233, 183, 0.16);
          background: rgba(255, 248, 234, 0.1);
          transition: box-shadow var(--transition), transform var(--transition);
          transform-origin: center center;
        }
        @media (hover: hover) {
          .menu-hero-visual:hover {
            box-shadow: 0 36px 72px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 233, 183, 0.22);
            transform: translateY(-2px);
          }
        }
        .menu-hero-visual-orb {
          position: absolute;
          border-radius: 999px;
          filter: blur(34px);
          opacity: 0.44;
          pointer-events: none;
        }
        .menu-hero-visual-orb-top {
          top: -1rem;
          inset-inline-end: 0.5rem;
          width: 150px;
          height: 150px;
          background: rgba(242, 204, 113, 0.34);
        }
        .menu-hero-visual-orb-bottom {
          bottom: 0.5rem;
          inset-inline-start: -0.25rem;
          width: 170px;
          height: 170px;
          background: rgba(220, 38, 38, 0.2);
        }
        .menu-hero-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .menu-hero-visual-sheen {
          position: absolute;
          inset: -18% auto -18% -10%;
          width: 44%;
          background: linear-gradient(
            90deg,
            rgba(255,255,255,0) 0%,
            rgba(255,255,255,0.06) 26%,
            rgba(255,243,214,0.22) 50%,
            rgba(255,255,255,0.08) 72%,
            rgba(255,255,255,0) 100%
          );
          transform: skewX(-14deg);
          mix-blend-mode: screen;
          opacity: 0.68;
          animation: heroSheen 10s ease-in-out infinite;
        }
        .menu-hero-visual-vignette {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(circle at 18% 16%, rgba(255, 236, 194, 0.16), transparent 24%),
            linear-gradient(180deg, rgba(9, 7, 6, 0.06), rgba(9, 7, 6, 0.24));
        }
        .menu-hero-placeholder {
          width: 100%;
          height: 100%;
          background:
            radial-gradient(circle at top right, rgba(242, 204, 113, 0.22), transparent 32%),
            linear-gradient(135deg, rgba(93, 64, 34, 0.92), rgba(36, 25, 18, 0.96));
          min-height: 140px;
        }
        .menu-hero--native-android .menu-hero-backdrop-img,
        .menu-hero--native-android .menu-hero-img {
          -webkit-backface-visibility: hidden;
          backface-visibility: hidden;
          transform: translateZ(0);
        }
        @media (max-width: 640px) {
          .menu-hero {
            margin-inline: -1rem;
            padding: 1.6rem 1rem 1.5rem;
            border-radius: 0 0 24px 24px;
          }
          .menu-hero-atmosphere-a {
            width: 160px;
            height: 160px;
            left: -2rem;
          }
          .menu-hero-atmosphere-b {
            width: 180px;
            height: 180px;
            right: -1.5rem;
            bottom: 4%;
          }
        }
        @keyframes heroFloatOne {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(18px, -10px, 0) scale(1.08); }
        }
        @keyframes heroFloatTwo {
          0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
          50% { transform: translate3d(-14px, 16px, 0) scale(1.06); }
        }
        @keyframes heroSheen {
          0%, 100% { opacity: 0.28; }
          50% { opacity: 0.72; }
        }
        @media (prefers-reduced-motion: reduce) {
          .menu-hero *,
          .menu-hero {
            animation: none !important;
            transition: none !important;
            scroll-behavior: auto !important;
          }
        }
      `}</style>
    </section>
  )
}
