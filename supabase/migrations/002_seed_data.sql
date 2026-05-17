-- ============================================================
-- RMS Platform - Development Seed Data (UUID-corrected)
-- Run after 001_initial_schema.sql
-- ============================================================

-- ── Categories ──────────────────────────────────────────────
INSERT INTO categories (id, name_en, name_ar, description_en, description_ar, display_order, is_active) VALUES
  ('3f90b235-8ddf-0630-fe34-9c5da2cee2b7', 'Starters',       'المقبلات',            'Begin your journey with our curated selection',        'ابدأ رحلتك مع تشكيلتنا المنتقاة',         1, true),
  ('00abe41e-fd2f-4650-a050-9b3ab0196edb',    'Main Courses',   'الأطباق الرئيسية',    'Signature dishes prepared with the finest ingredients', 'أطباق مميزة محضرة بأجود المكونات',         2, true),
  ('111c994b-e568-c726-7b4f-c1d0d9f0d7f2',   'From the Grill', 'من الشواية',          'Premium cuts, expertly grilled to perfection',         'قطع فاخرة مشوية باحتراف',                  3, true),
  ('0701bf11-2d01-adc5-fcaa-746d8843ebb8',  'Seafood',        'المأكولات البحرية',   'Fresh catch of the day from Gulf waters',              'أطايب البحر الطازجة من مياه الخليج',        4, true),
  ('e627d3af-25f8-e56f-168c-3e1bad8b900c',    'Sides',          'الأطباق الجانبية',    'Perfect accompaniments to your main course',           'إضافات رائعة لطبقك الرئيسي',               5, true),
  ('a482e6c7-2ec1-5be5-a5bb-555f4b19f9f7', 'Desserts',       'الحلويات',            'Sweet endings to a perfect experience',                'ختام حلو لتجربة مثالية',                    6, true),
  ('191fcf9e-acaf-0e49-8fb8-f1972224c200',   'Beverages',      'المشروبات',           'Refreshing drinks and premium selections',             'مشروبات منعشة وخيارات فاخرة',               7, true);

-- ── Products ─────────────────────────────────────────────────
INSERT INTO products (id, category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, display_order) VALUES
  -- Starters
  ('857bd7d9-3681-780a-1dcd-a8959c5e4e2f', '3f90b235-8ddf-0630-fe34-9c5da2cee2b7', 'Wagyu Beef Carpaccio',        'كاربتشيو لحم واغيو',      'Paper-thin slices of A5 wagyu with truffle oil and parmesan',     'شرائح رفيعة من واغيو A5 مع زيت الكمأ والبارميزان',            88.00, true, true,  10, 320, 1),
  ('f34b21e6-2274-5c1f-b168-3d38b11131af', '3f90b235-8ddf-0630-fe34-9c5da2cee2b7', 'Burrata & Heirloom Tomatoes', 'بوراتا وطماطم تراثية',    'Creamy burrata with heirloom tomatoes, basil oil, sea salt',      'بوراتا كريمية مع طماطم تراثية وزيت الريحان وملح البحر',        65.00, true, false, 8,  280, 2),
  ('ad504b14-f116-c40c-96d3-3b72305dbd90', '3f90b235-8ddf-0630-fe34-9c5da2cee2b7', 'Lobster Bisque',              'شوربة جراد البحر',        'Velvety bisque with Gulf lobster, cognac cream, chives',          'شوربة مخملية بجراد البحر الخليجي وكريمة الكونياك',             72.00, true, true,  15, 340, 3),
  -- Mains
  ('2110b3aa-d7f2-92f1-4b10-ec56ddad1f83', '00abe41e-fd2f-4650-a050-9b3ab0196edb',    'Slow-Braised Short Rib',      'ضلوع قصيرة مطهوة ببطء',  '72-hour braised prime short rib with truffle mash',               'ضلوع لحم ممتازة مطهوة 72 ساعة مع بيوريه الكمأ',               185.00, true, true,  45, 680, 1),
  ('a5d0aa26-00cf-bb2a-5268-ee9f43cf432f', '00abe41e-fd2f-4650-a050-9b3ab0196edb',    'Moroccan Lamb Tagine',        'طاجن لحم الخروف المغربي', 'Slow-cooked lamb shoulder with preserved lemon, olives, herbs',   'كتف خروف مطهوة ببطء مع الليمون المحفوظ والزيتون والأعشاب',   165.00, true, false, 40, 620, 2),
  ('ef23906b-656f-9cb1-3ed6-28a03d421e5c', '00abe41e-fd2f-4650-a050-9b3ab0196edb',    'Saffron Risotto',             'ريزوتو الزعفران',         'Carnaroli rice with premium saffron, aged parmesan, lemon zest', 'أرز كارنارولي مع زعفران فاخر وبارميزان معتق وقشر الليمون',    125.00, true, false, 30, 520, 3),
  -- Grills
  ('09b075b4-8c49-efb5-ae6b-1aff62eac48a', '111c994b-e568-c726-7b4f-c1d0d9f0d7f2',   'USDA Prime Ribeye 400g',      'ريب آي أمريكي 400 جم',   'USDA Prime 400g ribeye, aged 30 days, served with bone marrow',  'ريب آي 400 جم معتق 30 يومًا مع نخاع العظم',                   320.00, true, true,  25, 780, 1),
  ('50ae9d22-3f64-647d-2dac-7285b378d9e8', '111c994b-e568-c726-7b4f-c1d0d9f0d7f2',   'Australian Wagyu Striploin',  'سترلوين واغيو أسترالي',  'MB7+ Australian wagyu, 300g, with truffle butter',               'واغيو أسترالي MB7+ وزن 300 جم مع زبدة الكمأ',                 290.00, true, true,  22, 720, 2),
  ('3e997ad2-dc6c-a59c-8671-13ccf2819ebf', '111c994b-e568-c726-7b4f-c1d0d9f0d7f2',   'Grilled Hammour',             'هامور مشوي',              'Whole grilled Gulf hammour with herbs, lemon butter, capers',    'هامور خليجي كامل مشوي بالأعشاب وزبدة الليمون والكبر',         155.00, true, false, 20, 480, 3),
  -- Seafood
  ('088182b4-b021-775c-aab7-9caaacb98f65', '0701bf11-2d01-adc5-fcaa-746d8843ebb8',  'Butter-Poached Lobster',      'جراد بحر مسلوق بالزبدة', 'Half Maine lobster poached in herb butter, served with bisque',  'نصف جراد بحر مسلوق في زبدة الأعشاب مع البيسك',               245.00, true, true,  30, 560, 1),
  ('21a67941-88b2-20a0-a3a2-b3eddf8e51db', '0701bf11-2d01-adc5-fcaa-746d8843ebb8',  'Seafood Platter for Two',     'طبق مأكولات بحرية للاثنين','Lobster, king prawns, scallops, oysters, grilled branzino',      'جراد بحر وروبيان ملكي واسكالوب ومحار وبرانزينو مشوي',         480.00, true, false, 35, 820, 2),
  -- Sides
  ('609160ac-8a48-82ad-d45e-960732270f49', 'e627d3af-25f8-e56f-168c-3e1bad8b900c',    'Truffle Parmesan Fries',      'بطاطس بالكمأ والبارميزان','Hand-cut fries with truffle oil, parmesan, fresh herbs',         'بطاطس مقطعة يدويًا بزيت الكمأ والبارميزان والأعشاب الطازجة',  42.00, true, false, 12, 320, 1),
  ('1f0b817b-b152-adfa-9c48-232597714c40', 'e627d3af-25f8-e56f-168c-3e1bad8b900c',    'Creamed Spinach',             'سبانخ كريمية',            'Slow-wilted baby spinach in cream, nutmeg, parmesan',            'سبانخ صغيرة مذبولة ببطء في الكريمة وجوزة الطيب والبارميزان',  38.00, true, false, 10, 210, 2),
  ('f30c5290-479a-3db5-b746-410fca09926d', 'e627d3af-25f8-e56f-168c-3e1bad8b900c',    'Roasted Bone Marrow',         'نخاع عظم محمص',           'Roasted veal bone marrow with sourdough, gremolata',             'نخاع عظم العجل المحمص مع خبز العجين المخمر والجريمولاتا',      55.00, true, true,  15, 380, 3),
  -- Desserts
  ('0fde3652-cb1f-d770-32e5-b6ff675e4600', 'a482e6c7-2ec1-5be5-a5bb-555f4b19f9f7', 'Valrhona Chocolate Fondant',  'كيك الشوكولاتة الداكنة', 'Warm Valrhona 70% fondant with vanilla bean ice cream',          'كيك فالرونا 70% دافئ مع آيس كريم حبة الفانيليا',              68.00, true, true,  14, 480, 1),
  ('b04ea862-01c0-44a5-09bf-1007bd5feff0', 'a482e6c7-2ec1-5be5-a5bb-555f4b19f9f7', 'Omani Halwa Cheesecake',      'تشيز كيك حلوى عُمانية',  'Fusion cheesecake with traditional Omani halwa base, rosewater', 'تشيز كيك مع قاعدة الحلوى العُمانية وماء الورد',               58.00, true, false, 10, 420, 2),
  ('f8f75eab-ee77-af88-0531-84b88f1e5ffc', 'a482e6c7-2ec1-5be5-a5bb-555f4b19f9f7', 'Saffron Crème Brûlée',        'كريم بروليه الزعفران',    'Classic crème brûlée infused with premium Iranian saffron',      'كريم بروليه كلاسيكي منقوع بزعفران إيراني فاخر',               55.00, true, false, 12, 380, 3),
  -- Beverages
  ('07d21816-e18d-8510-dee0-6d003818c772', '191fcf9e-acaf-0e49-8fb8-f1972224c200',   'Fresh Jallab',                'جلاب طازج',               'Traditional grape, rose water, pomegranate, pine nuts, ice',    'عنب تقليدي وماء ورد ورمان وصنوبر وثلج',                       28.00, true, false, 5,  180, 1),
  ('b4b134e8-489e-5d7a-28c1-c493dfa5c0a4', '191fcf9e-acaf-0e49-8fb8-f1972224c200',   'Sparkling Lemonade',          'ليمونادة فوارة',           'Fresh-squeezed lemon, sparkling water, mint, cane sugar',        'ليمون طازج ومياه فوارة ونعنع وسكر القصب',                     25.00, true, false, 5,  120, 2),
  ('e5a60024-4911-7373-e4d2-440993672137', '191fcf9e-acaf-0e49-8fb8-f1972224c200',   'Arabic Qahwa',                'قهوة عربية',               'Traditional Arabic coffee with cardamom, saffron, dates',        'قهوة عربية تقليدية بالهيل والزعفران والتمر',                   22.00, true, true,  5,  45,  3);

-- ── Modifier Groups ──────────────────────────────────────────
INSERT INTO modifier_groups (id, name_en, name_ar, selection_type, min_selections, max_selections, is_required, display_order) VALUES
  ('7c5412fc-29e9-0115-893e-92840eae5671', 'Steak Doneness',   'درجة استواء اللحم', 'single',   1, 1, true,  1),
  ('086cb703-93ad-68b1-db27-dba7759003cc',    'Sauce Selection',  'اختيار الصوص',       'single',   0, 1, false, 2),
  ('38efe842-e3ca-91f6-3fa0-8c0052ae16c7',    'Add a Side',       'إضافة طبق جانبي',   'multiple', 0, 2, false, 3),
  ('d6b90bd6-6783-ade7-bc59-7d2cba1bacc0',   'Extras & Add-ons', 'إضافات',             'multiple', 0, 3, false, 4);

-- ── Modifier Options ─────────────────────────────────────────
INSERT INTO modifier_options (id, group_id, name_en, name_ar, price_delta, is_default, is_available, display_order) VALUES
  -- Doneness
  ('d98161f4-f6a9-97d7-3346-6c5433843f62',       '7c5412fc-29e9-0115-893e-92840eae5671', 'Rare',           'نادر',         0,     false, true, 1),
  ('3fd6a466-ac3f-3c9d-38ae-2c1f38111e91',   '7c5412fc-29e9-0115-893e-92840eae5671', 'Medium Rare',    'متوسط النضج',  0,     true,  true, 2),
  ('f169fb15-dc4c-6a48-8c33-f925bc25c733',     '7c5412fc-29e9-0115-893e-92840eae5671', 'Medium',         'متوسط',        0,     false, true, 3),
  ('6d6d746b-8695-9f18-08f1-484f1af56192',   '7c5412fc-29e9-0115-893e-92840eae5671', 'Medium Well',    'فوق المتوسط',  0,     false, true, 4),
  ('6bf24c7f-16e2-8337-791e-b14ce07cbaa2',       '7c5412fc-29e9-0115-893e-92840eae5671', 'Well Done',      'مطهو جيداً',   0,     false, true, 5),
  -- Sauces
  ('84db64a6-4de1-0df6-18c4-79ed67747332',  '086cb703-93ad-68b1-db27-dba7759003cc',    'Béarnaise',      'صوص بيرنيز',   0,     false, true, 1),
  ('10a37b60-102e-971f-e76a-4e0031b047d7', '086cb703-93ad-68b1-db27-dba7759003cc',    'Peppercorn',     'صوص الفلفل',   0,     false, true, 2),
  ('843f216f-2aa2-b8a8-965a-7407a6608aa0','086cb703-93ad-68b1-db27-dba7759003cc',    'Chimichurri',    'تشيميتشوري',   0,     false, true, 3),
  ('c03db3bb-dafe-c431-3344-d49d7c30edc8','086cb703-93ad-68b1-db27-dba7759003cc',    'Truffle Butter', 'زبدة الكمأ',   18.00, false, true, 4),
  -- Side add-ons
  ('a2bd3d08-d58e-de65-1341-c5618f29cf40','38efe842-e3ca-91f6-3fa0-8c0052ae16c7',    'Truffle Fries',  'بطاطس بالكمأ', 42.00, false, true, 1),
  ('4ed2be5b-9510-eb9d-9032-52faf3ad339c', '38efe842-e3ca-91f6-3fa0-8c0052ae16c7',    'Creamed Spinach','سبانخ كريمية', 38.00, false, true, 2),
  ('99903098-9160-5a50-f754-2dbc56d65faa','38efe842-e3ca-91f6-3fa0-8c0052ae16c7',    'Green Salad',    'سلطة خضراء',   30.00, false, true, 3),
  -- Extras
  ('869af10c-87cd-5ac7-f6e4-1db897d4e384',  'd6b90bd6-6783-ade7-bc59-7d2cba1bacc0',   'Fried Egg',      'بيضة مقلية',   15.00, false, true, 1),
  ('88fad011-f553-a3fc-f057-9374231783cc',  'd6b90bd6-6783-ade7-bc59-7d2cba1bacc0',   'Foie Gras',      'فوا جرا',      85.00, false, true, 2),
  ('f4fdd867-8765-93c6-7727-1799efb16e01','d6b90bd6-6783-ade7-bc59-7d2cba1bacc0',   'Grilled Prawn',  'روبيان مشوي',  55.00, false, true, 3);

-- ── Link modifier groups to steak products ───────────────────
INSERT INTO product_modifier_groups (product_id, group_id, display_order) VALUES
  ('09b075b4-8c49-efb5-ae6b-1aff62eac48a', '7c5412fc-29e9-0115-893e-92840eae5671', 1),
  ('09b075b4-8c49-efb5-ae6b-1aff62eac48a', '086cb703-93ad-68b1-db27-dba7759003cc',    2),
  ('09b075b4-8c49-efb5-ae6b-1aff62eac48a', '38efe842-e3ca-91f6-3fa0-8c0052ae16c7',    3),
  ('09b075b4-8c49-efb5-ae6b-1aff62eac48a', 'd6b90bd6-6783-ade7-bc59-7d2cba1bacc0',   4),
  ('50ae9d22-3f64-647d-2dac-7285b378d9e8', '7c5412fc-29e9-0115-893e-92840eae5671', 1),
  ('50ae9d22-3f64-647d-2dac-7285b378d9e8', '086cb703-93ad-68b1-db27-dba7759003cc',    2),
  ('50ae9d22-3f64-647d-2dac-7285b378d9e8', '38efe842-e3ca-91f6-3fa0-8c0052ae16c7',    3),
  ('50ae9d22-3f64-647d-2dac-7285b378d9e8', 'd6b90bd6-6783-ade7-bc59-7d2cba1bacc0',   4);

-- ── Combo Rules ──────────────────────────────────────────────
INSERT INTO combo_rules (name_en, name_ar, description_en, description_ar, trigger_product_ids, reward_product_ids, discount_value, discount_type, is_active, priority) VALUES
  (
    'Steak & Dessert Combo',
    'كومبو اللحم والحلوى',
    'Order any steak and get 20% off any dessert',
    'اطلب أي لحم واحصل على خصم 20% على أي حلوى',
    ARRAY['09b075b4-8c49-efb5-ae6b-1aff62eac48a', '50ae9d22-3f64-647d-2dac-7285b378d9e8']::uuid[],
    ARRAY['0fde3652-cb1f-d770-32e5-b6ff675e4600', 'b04ea862-01c0-44a5-09bf-1007bd5feff0', 'f8f75eab-ee77-af88-0531-84b88f1e5ffc']::uuid[],
    20, 'percentage', true, 10
  ),
  (
    'Seafood Feast',
    'وليمة المأكولات البحرية',
    'Lobster Bisque starter + Butter-Poached Lobster — save QAR 30',
    'شوربة جراد البحر + جراد البحر بالزبدة — وفر 30 ريال',
    ARRAY['ad504b14-f116-c40c-96d3-3b72305dbd90']::uuid[],
    ARRAY['088182b4-b021-775c-aab7-9caaacb98f65']::uuid[],
    30, 'fixed', true, 20
  );

-- ── Promotions ────────────────────────────────────────────────
INSERT INTO promotions (code, name_en, name_ar, type, discount_value, discount_type, min_order_value, usage_limit, ai_rank_score, is_active) VALUES
  ('WELCOME20', 'Welcome Offer',       'عرض الترحيب',  'code', 20, 'percentage',    100, 500, 0.90, true),
  ('FREESHIP',  'Free Delivery',       'توصيل مجاني',  'code',  5, 'free_delivery',  80, null, 0.75, true),
  ('VIP50',     'VIP Member Discount', 'خصم عضو VIP',  'code', 50, 'fixed',          300,  100, 0.85, true);

INSERT INTO promotions (name_en, name_ar, type, discount_value, discount_type, min_order_value, ai_rank_score, is_active) VALUES
  ('Weekend Special', 'عرض نهاية الأسبوع', 'automatic', 15, 'percentage', 150, 0.70, false),
  ('Lunchtime Deal',  'عرض وقت الغداء',    'automatic', 10, 'fixed',       80,  0.65, false);

-- ── Drivers (sample) ─────────────────────────────────────────
INSERT INTO drivers (name, phone_e164, vehicle_type, status, is_active) VALUES
  ('Ahmad Al-Rashidi',  '+97433112233', 'motorcycle', 'available', true),
  ('Mohammed Al-Farsi', '+97433445566', 'motorcycle', 'available', true),
  ('Khalid Nasser',     '+97433778899', 'car',        'offline',   true),
  ('Yousef Ibrahim',    '+97433221100', 'motorcycle', 'available', true),
  ('Saad Al-Kuwari',    '+97433334455', 'motorcycle', 'offline',   true);
