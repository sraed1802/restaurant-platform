export type LegalLanguage = 'en' | 'ar'

/** Official contact for privacy and data-deletion requests (Play / legal). */
export const PRIVACY_DELETION_EMAIL = 'maazymdoha@gmail.com'

export function privacyPolicySections(lang: LegalLanguage) {
  const en = lang === 'en'
  return {
    title: en ? 'Privacy Policy' : 'سياسة الخصوصية',
    updated: en ? 'Last updated: June 2026' : 'آخر تحديث: يونيو 2026',
    sections: [
      {
        heading: en ? 'Who we are' : 'من نحن',
        body: en
          ? 'Maazym operates this ordering service for our restaurant. This policy explains how we handle personal information when you use our website and mobile app.'
          : 'تدير Maazym خدمة الطلب هذه لمطعمنا. توضح هذه السياسة كيفية التعامل مع معلوماتك الشخصية عند استخدام موقعنا وتطبيقنا.',
      },
      {
        heading: en ? 'Information we collect' : 'المعلومات التي نجمعها',
        body: en
          ? 'We may collect: name, email address, mobile number, delivery addresses, order history, language preference, and sign-in identifiers managed by our authentication provider. Payment details are handled by our payment partners where applicable.'
          : 'قد نجمع: الاسم، البريد الإلكتروني، رقم الجوال، عناوين التوصيل، سجل الطلبات، تفضيل اللغة، ومعرّفات تسجيل الدخول عبر مزود المصادقة. تُعالج بيانات الدفع عبر شركاء الدفع عند الاقتضاء.',
      },
      {
        heading: en ? 'How we use your information' : 'كيف نستخدم معلوماتك',
        body: en
          ? 'We use your data to process orders, communicate about your order, improve our service, comply with law, and—only if you opt in—send marketing. We do not sell your personal information.'
          : 'نستخدم بياناتك لمعالجة الطلبات والتواصل بشأنها وتحسين الخدمة والامتثال للقانون، وإرسال التسويق فقط عند موافقتك. لا نبيع معلوماتك الشخصية.',
      },
      {
        heading: en ? 'Retention' : 'الاحتفاظ بالبيانات',
        body: en
          ? 'We keep order records as required for operations, tax, and dispute resolution. When you delete your account, we remove your profile and redact personal details from linked orders while keeping non-identifying order totals where required.'
          : 'نحتفظ بسجلات الطلبات للتشغيل والضرائب وتسوية النزاعات. عند حذف حسابك، نزيل ملفك الشخصي ونُخفّي التفاصيل الشخصية في الطلبات المرتبطة مع الإبقاء على المجاميع غير المعرّفة عند الحاجة.',
      },
      {
        heading: en ? 'Your rights' : 'حقوقك',
        body: en
          ? 'You may access, correct, or delete your profile from the app, or contact us to request deletion of name, email, mobile number, and addresses. See our Data Protection page for details.'
          : 'يمكنك الوصول إلى ملفك أو تصحيحه أو حذفه من التطبيق، أو التواصل معنا لطلب حذف الاسم والبريد والجوال والعناوين. راجع صفحة حماية البيانات للتفاصيل.',
      },
      {
        heading: en ? 'Contact' : 'التواصل',
        body: en
          ? 'For privacy questions or deletion requests, use the contact options on our Data Protection page.'
          : 'للأسئلة المتعلقة بالخصوصية أو طلبات الحذف، استخدم خيارات التواصل في صفحة حماية البيانات.',
      },
    ],
  }
}

export function dataProtectionSections(lang: LegalLanguage) {
  const en = lang === 'en'
  return {
    title: en ? 'Data Protection' : 'حماية البيانات',
    updated: en ? 'Last updated: June 2026' : 'آخر تحديث: يونيو 2026',
    contactEmail: PRIVACY_DELETION_EMAIL,
    sections: [
      {
        heading: en ? 'Your data rights' : 'حقوقك في البيانات',
        body: en
          ? 'You have the right to know what we hold about you, to correct inaccurate information, to withdraw marketing consent, and to request erasure of your personal data where applicable law allows.'
          : 'يحق لك معرفة ما نحتفظ به عنك، وتصحيح المعلومات غير الدقيقة، وسحب موافقة التسويق، وطلب محو بياناتك الشخصية حيث يسمح القانون.',
      },
      {
        heading: en ? 'Delete your account (app & website)' : 'حذف حسابك (الموقع والتطبيق)',
        body: en
          ? 'If you are signed in, open Your profile and use Delete my account. This permanently removes your profile, sign-in, addresses, and personal details we store. Order records may be kept in redacted form for legal and operational needs.'
          : 'إذا كنت مسجّل الدخول، افتح ملفك الشخصي واستخدم حذف حسابي. يزيل ذلك نهائياً ملفك وتسجيل الدخول والعناوين والتفاصيل الشخصية. قد تُحفظ الطلبات بشكل مُخفّى للاحتياجات التشغيلية والقانونية.',
        linkToProfile: true,
      },
      {
        heading: en ? 'Request deletion by email' : 'طلب الحذف عبر البريد',
        body: en
          ? 'You can also email us to delete your data without using the app. Include the email and mobile number you used with us so we can locate your record.'
          : 'يمكنك مراسلتنا لحذف بياناتك دون استخدام التطبيق. اذكر البريد ورقم الجوال المستخدمين معنا لتحديد سجلك.',
        mailtoSubject: en ? 'Request deletion of my personal data' : 'طلب حذف بياناتي الشخصية',
        mailtoBody: en
          ? 'Please delete all personal data you hold about me, including name, email, mobile number, and delivery addresses.%0D%0A%0D%0AEmail used with Maazym:%0D%0AMobile number:%0D%0AFull name (optional):'
          : 'يرجى حذف جميع البيانات الشخصية التي تحتفظون بها عني، بما في ذلك الاسم والبريد والجوال وعناوين التوصيل.%0D%0A%0D%0Aالبريد المستخدم مع Maazym:%0D%0Aرقم الجوال:%0D%0Aالاسم (اختياري):',
      },
      {
        heading: en ? 'Security' : 'الأمان',
        body: en
          ? 'We use industry-standard hosting and access controls. No method of transmission over the internet is 100% secure; we work to protect your data proportionate to the risk.'
          : 'نستخدم استضافة وضوابط وصول معيارية. لا توجد طريقة نقل عبر الإنترنت آمنة تماماً؛ نعمل على حماية بياناتك بما يتناسب مع المخاطر.',
      },
    ],
  }
}
