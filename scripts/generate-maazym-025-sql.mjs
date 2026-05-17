/**
 * One-off generator: writes supabase/migrations/025_maazym_menu_catalog.sql
 * Source: Maazym menu spreadsheet (categories + items + prices).
 */
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const out = join(__dirname, '..', 'supabase', 'migrations', '025_maazym_menu_catalog.sql')

const esc = (s) => String(s).replace(/'/g, "''")
const sqlJson = (value) => `'${esc(JSON.stringify(value))}'::jsonb`

const GLUTEN_HEAVY_CATEGORIES = new Set([
  'Pizza',
  'Pasta',
  'Mediterranean Specialties',
  'Fatayer',
  'Bakery & Desserts',
  'Breakfast',
  'Ramadan',
])

function inferDietaryTags(categoryEn, item) {
  const text = `${item.en} ${item.descEn}`.toLowerCase()
  const tags = new Set()

  const hasShellfish = /\bshrimp|prawn|lobster|crab|scallop|mussel|oyster|shellfish\b/.test(text)
  const hasFishOrMeat = /\bchicken|beef|meat|pepperoni|tuna|turkey|ham|bacon|fish\b/.test(text)
  const hasDairy = /\bmozzarella|parmesan|burrata|cheese|cream|bechamel|béchamel|alfredo|milk|latte|cappuccino|ice cream|mascarpone|labneh|butter|yogurt|yoghurt|chocolate\b/.test(
    text
  )
  const hasEgg = /\begg|eggs\b/.test(text)
  const hasHoney = /\bhoney\b/.test(text)
  const hasNuts = /\bnut|nuts|almond|hazelnut|pistachio|walnut|cashew|granola|baklawa\b/.test(text)

  const isVegetarian = !hasShellfish && !hasFishOrMeat
  const isVegan = isVegetarian && !hasDairy && !hasEgg && !hasHoney

  let isGlutenFree = false
  if (
    categoryEn === 'Soups' &&
    !/\bvermicelli|bread|breaded|roll|wrapper|tortilla\b/.test(text)
  ) {
    isGlutenFree = true
  } else if (categoryEn === 'Salads' && !/\bcroutons\b/.test(text)) {
    isGlutenFree = true
  } else if (
    categoryEn === 'Coffee & Hot Drinks' ||
    categoryEn === 'Tea & Specialty Hot Beverages' ||
    categoryEn === 'Iced Coffees' ||
    categoryEn === 'Cold Drinks' ||
    categoryEn === 'Shisha'
  ) {
    isGlutenFree = true
  } else if (categoryEn === 'Sparkling & Still Water' && !/\bbarley|barbican\b/.test(text)) {
    isGlutenFree = true
  } else if (
    !GLUTEN_HEAVY_CATEGORIES.has(categoryEn) &&
    !/\bcroutons|bread|breaded|roll|wrapper|tortilla|baguette|croissant|muffin|cookie|pancake|crepe|granola|pizza|pasta|lasagna\b/.test(
      text
    )
  ) {
    isGlutenFree = true
  }

  if (isVegetarian) tags.add('vegetarian')
  if (isVegan) tags.add('vegan')
  if (isGlutenFree) tags.add('gluten-free')
  if (hasNuts) tags.add('nuts')
  if (hasShellfish) tags.add('shellfish')

  return [...tags]
}

/** @type {{ en: string; ar: string; descEn?: string; order: number; items: { en: string; ar: string; descEn: string; descAr: string; price: number; prep?: number }[] }[]} */
const catalog = [
  {
    en: 'Starters',
    ar: 'المقبلات',
    order: 1,
    items: [
      { en: 'Mozzarella Sticks (10)', ar: 'أصابع موزاريلا (10)', descEn: 'Fried mozzarella sticks, breaded, served with marinara sauce.', descAr: 'أصابع موزاريلا مقلية ومغطاة مع صلصة مارينارا.', price: 10 },
      { en: 'Chicken Wings (12)', ar: 'أجنحة دجاج (12)', descEn: 'Crispy chicken wings, seasoned; spicy on request.', descAr: 'أجنحة دجاج مقرمشة بنكهات مميزة؛ حار عند الطلب.', price: 12 },
      { en: 'Spring Rolls / Brik (15)', ar: 'سبرنغ رول / بريك (15)', descEn: 'Spring roll or Tunisian brik with vegetables or chicken, fried until crispy.', descAr: 'سبرنغ رول أو بريك تونسي بالخضار أو الدجاج مقلي ومقرمش.', price: 15 },
      { en: 'French Fries (12)', ar: 'بطاطس مقلية (12)', descEn: 'Golden crispy French fries.', descAr: 'بطاطس مقلية ذهبية ومقرمشة.', price: 12 },
      { en: 'Potato Wedges (12)', ar: 'أصابع بطاطس (12)', descEn: 'Seasoned potato wedges, baked or fried.', descAr: 'أصابع بطاطس متبلة، مخبوزة أو مقلية.', price: 12 },
    ],
  },
  {
    en: 'Soups',
    ar: 'الشوربات',
    order: 2,
    items: [
      { en: 'Lentil Soup (15)', ar: 'شوربة عدس (15)', descEn: 'Creamy lentil soup with vegetables and spices.', descAr: 'شوربة عدس كريمية مع خضار وتوابل.', price: 15 },
      { en: 'Tunisian Soup (15)', ar: 'شوربة تونسية (15)', descEn: 'Traditional Tunisian soup with meat or chicken, vermicelli, chickpeas, and spices.', descAr: 'شوربة تونسية تقليدية بلحم أو دجاج وشعيرية وحمص وتوابل.', price: 15 },
      { en: 'Chicken Vegetable Soup (15)', ar: 'شوربة دجاج وخضار (15)', descEn: 'Chicken soup with fresh vegetables.', descAr: 'شوربة دجاج مع خضار طازجة.', price: 15 },
    ],
  },
  {
    en: 'Salads',
    ar: 'السلطات',
    order: 3,
    items: [
      { en: 'Caesar Salad (22)', ar: 'سلطة سيزر (22)', descEn: 'Lettuce, grilled chicken, parmesan, croutons, Caesar dressing.', descAr: 'خس ودجاج مشوي وبارميزان وخبز محمص وصلصة سيزر.', price: 22 },
      { en: 'Greek Salad (22)', ar: 'سلطة يونانية (22)', descEn: 'Cucumbers, bell peppers, tomatoes, olive oil, and basil.', descAr: 'خيار وفلفل وطماطم وزيت زيتون وريحان.', price: 22 },
      { en: 'Caprese Salad (25)', ar: 'سلطة كابريزي (25)', descEn: 'Fresh tomatoes, mozzarella, basil, and olive oil.', descAr: 'طماطم طازجة وموزاريلا وريحان وزيت زيتون.', price: 25 },
      { en: 'Niçoise Salad (25)', ar: 'سلطة نيسواز (25)', descEn: 'Tuna, potatoes, green beans, eggs, olives, and lettuce.', descAr: 'تونة وبطاطس وفاصوليا خضراء وبيض وزيتون وخس.', price: 25 },
    ],
  },
  {
    en: 'Pizza',
    ar: 'البيتزا',
    order: 4,
    items: [
      { en: 'Margherita (25)', ar: 'مارغريتا (25)', descEn: 'Tomato sauce, mozzarella, fresh basil.', descAr: 'صلصة طماطم وموزاريلا وريحان طازج.', price: 25 },
      { en: 'Pepperoni (30)', ar: 'بيبروني (30)', descEn: 'Mozzarella and pepperoni.', descAr: 'موزاريلا وبيبروني.', price: 30 },
      { en: 'Vegetarian (30)', ar: 'نباتية (30)', descEn: 'Tomato sauce, mozzarella, mushrooms, olives, onion.', descAr: 'صلصة طماطم وموزاريلا وفطر وزيتون وبصل.', price: 30 },
      { en: 'Chicken Ranch (30)', ar: 'دجاج رانش (30)', descEn: 'Chicken pizza with ranch sauce, mozzarella, and fresh vegetables.', descAr: 'بيتزا دجاج بصلصة رانش وموزاريلا وخضار طازجة.', price: 30 },
      { en: 'Chicken Pesto (30)', ar: 'دجاج بيستو (30)', descEn: 'Chicken pizza with pesto sauce, mozzarella, and herbs.', descAr: 'بيتزا دجاج بصلصة البيستو وموزاريلا وأعشاب.', price: 30 },
      { en: 'Burrata (40)', ar: 'بوراتا (40)', descEn: 'Creamy burrata, fresh tomatoes, and basil.', descAr: 'بوراتا كريمية وطماطم طازجة وريحان.', price: 40 },
      { en: 'Tuna & Cipolla (30)', ar: 'تونة وبصل (30)', descEn: 'Mozzarella, tuna, onion, rich tomato sauce.', descAr: 'موزاريلا وتونة وبصل وصلصة طماطم غنية.', price: 30 },
      { en: 'Quattro Formaggi (40)', ar: 'أربعة أجبان (40)', descEn: 'Four-cheese pizza.', descAr: 'بيتزا بأربعة أنواع جبن.', price: 40 },
      { en: 'Regina (30)', ar: 'ريجينا (30)', descEn: 'Mozzarella, mushrooms, turkey.', descAr: 'موزاريلا وفطر وديك رومي.', price: 30 },
      { en: 'Four Seasons (32)', ar: 'أربعة فصول (32)', descEn: 'Four sections: vegetables, mushrooms, meat, tuna.', descAr: 'أربع قطاعات: خضار وفطر ولحم وتونة.', price: 32 },
      { en: 'Hot Waves (38)', ar: 'هوت ويفز (38)', descEn: 'Spicy pizza with cheese blend, hot sauce, and fresh vegetables.', descAr: 'بيتزا حارة بمزيج أجبان وصلصة حارة وخضار طازجة.', price: 38 },
    ],
  },
  {
    en: 'Pasta',
    ar: 'المعكرونة',
    order: 5,
    items: [
      { en: 'Lasagna Bolognese (25)', ar: 'لازانيا بولونيز (25)', descEn: 'Lasagna with beef, Bolognese sauce, and béchamel.', descAr: 'لازانيا بلحم بقري وصلصة بولونيز وبشاميل.', price: 25 },
      { en: 'Lasagna Chicken & Vegetable (25)', ar: 'لازانيا دجاج وخضار (25)', descEn: 'Lasagna with chicken and vegetables in a creamy sauce.', descAr: 'لازانيا بدجاج وخضار بصلصة كريمية.', price: 25 },
      { en: 'Smoked Ham Lasagna (25)', ar: 'لازانيا لحم مدخن (25)', descEn: 'Lasagna with smoked meat and béchamel.', descAr: 'لازانيا بلحم مدخن وبشاميل.', price: 25 },
      { en: 'Puttanesca (25)', ar: 'بوتانيسكا (25)', descEn: 'Pasta with tomato sauce, olives, capers, and garlic.', descAr: 'معكرونة بصلصة طماطم وزيتون وكبر وثوم.', price: 25 },
      { en: 'Penne Arrabbiata (25)', ar: 'بيني أرابياتا (25)', descEn: 'Spicy pasta with tomato sauce.', descAr: 'معكرونة حارة بصلصة طماطم.', price: 25 },
      { en: 'Chicken Alfredo (25)', ar: 'دجاج ألفريدو (25)', descEn: 'Pasta with creamy Alfredo sauce and chicken.', descAr: 'معكرونة بصلصة ألفريدو كريمية ودجاج.', price: 25 },
      { en: 'Bolognese (30)', ar: 'بولونيز (30)', descEn: 'Pasta with beef and tomato sauce.', descAr: 'معكرونة بلحم بقري وصلصة طماطم.', price: 30 },
    ],
  },
  {
    en: 'Mediterranean Specialties',
    ar: 'أطباق متوسطية مميزة',
    order: 6,
    items: [
      { en: 'Makloub Maazym (25)', ar: 'مقلوب مازيم (25)', descEn: 'Tunisian upside-down sandwich with meat or chicken, cheese, and vegetables.', descAr: 'مقلوب تونسي بلحم أو دجاج وجبن وخضار.', price: 25 },
      { en: 'Baguette Farcie Maazym (25)', ar: 'باغيت فارسي مازيم (25)', descEn: 'Baguette stuffed with tuna or chicken, vegetables, and sauces.', descAr: 'باغيت محشو بتونة أو دجاج وخضار وصلصات.', price: 25 },
      { en: 'French Tacos Chicken (25)', ar: 'فرنش تاكوس دجاج (25)', descEn: 'Tortilla wrap with chicken, potatoes, cheese, and sauce.', descAr: 'تورتيلا بدجاج وبطاطس وجبن وصلصة.', price: 25 },
      { en: 'French Tacos Beef (25)', ar: 'فرنش تاكوس لحم (25)', descEn: 'Tortilla wrap with beef, potatoes, cheese, and sauce.', descAr: 'تورتيلا بلحم وبطاطس وجبن وصلصة.', price: 25 },
      { en: 'Cornet Maazym (25)', ar: 'كورني مازيم (25)', descEn: 'Cone bread stuffed with chicken or meat and cheese.', descAr: 'خبز مخروطي محشو بدجاج أو لحم وجبن.', price: 25 },
      { en: 'Panuzzo Maazym (25)', ar: 'بانوتسو مازيم (25)', descEn: 'Italian bread stuffed with meat or chicken and cheese.', descAr: 'خبز إيطالي محشو بلحم أو دجاج وجبن.', price: 25 },
      { en: 'Libanais Maazym (25)', ar: 'لبناني مازيم (25)', descEn: 'Lebanese bread stuffed with spiced chicken.', descAr: 'خبز لبناني محشو بدجاج بالتوابل المميزة.', price: 25 },
      { en: 'Smoked Sandwich (28)', ar: 'ساندويتش مدخن (28)', descEn: 'Smoked sandwich with cheese, bacon, and ham.', descAr: 'ساندويتش مدخن بالجبن والبيكون واللانشون.', price: 28 },
    ],
  },
  {
    en: 'Fatayer',
    ar: 'الفطائر',
    order: 7,
    items: [
      { en: 'Mankoush Cheese (12)', ar: 'منقوشة جبن (12)', descEn: 'Cheese mankoush.', descAr: 'منقوشة بالجبن.', price: 12 },
      { en: 'Mankoush Zaatar (14)', ar: 'منقوشة زعتر (14)', descEn: 'Thyme mankoush with olive oil.', descAr: 'منقوشة زعتر بزيت الزيتون.', price: 14 },
      { en: 'Mankoush Spinach (15)', ar: 'منقوشة سبانخ (15)', descEn: 'Seasoned spinach mankoush.', descAr: 'منقوشة سبانخ متبلة.', price: 15 },
      { en: 'Mankoush Cheese & Spinach (18)', ar: 'منقوشة جبن وسبانخ (18)', descEn: 'Cheese and spinach mankoush.', descAr: 'منقوشة جبن وسبانخ.', price: 18 },
      { en: 'Mankoush Meat (18)', ar: 'منقوشة لحم (18)', descEn: 'Seasoned meat mankoush.', descAr: 'منقوشة لحم متبلة.', price: 18 },
    ],
  },
  {
    en: 'Bakery & Desserts',
    ar: 'مخبوزات وحلويات',
    order: 8,
    items: [
      { en: 'Croissant (10)', ar: 'كرواسون (10)', descEn: 'Butter croissant.', descAr: 'كرواسون بالزبدة.', price: 10 },
      { en: 'Muffin (10)', ar: 'مافن (10)', descEn: 'Muffins in various flavors.', descAr: 'مافن بنكهات متنوعة.', price: 10 },
      { en: 'Cookie (10)', ar: 'كوكيز (10)', descEn: 'Baked cookies.', descAr: 'كوكيز مخبوزة.', price: 10 },
      { en: 'Millefeuille (18)', ar: 'ميلفي (18)', descEn: 'Millefeuille with cream layers.', descAr: 'ميلفي بطبقات كريمة.', price: 18 },
      { en: 'Cheesecake (20)', ar: 'تشيز كيك (20)', descEn: 'Creamy cheesecake.', descAr: 'تشيز كيك كريمي.', price: 20 },
      { en: 'Ice Cream (15)', ar: 'آيس كريم (15)', descEn: 'Ice cream in various flavors.', descAr: 'آيس كريم بنكهات متنوعة.', price: 15 },
      { en: 'Pancakes (18)', ar: 'بان كيك (18)', descEn: 'Pancakes with honey or chocolate.', descAr: 'بان كيك مع عسل أو شوكولاتة.', price: 18 },
      { en: 'Panna Cotta (18)', ar: 'بانا كوتا (18)', descEn: 'Italian panna cotta.', descAr: 'بانا كوتا إيطالية.', price: 18 },
      { en: 'San Sebastian (20)', ar: 'سان سيباستيان (20)', descEn: 'Burnt San Sebastian cheesecake.', descAr: 'تشيز كيك سان سيباستيان المحروق.', price: 20 },
      { en: 'Crepes (18)', ar: 'كريب (18)', descEn: 'Sweet crepes with assorted fillings.', descAr: 'كريب حلو بحشوات متنوعة.', price: 18 },
      { en: 'Fruit Salad (18)', ar: 'سلطة فواكه (18)', descEn: 'Fresh fruit salad.', descAr: 'سلطة فواكه طازجة.', price: 18 },
      { en: 'Granola (20)', ar: 'جرانولا (20)', descEn: 'Granola with yogurt, honey, and fruits.', descAr: 'جرانولا مع زبادي وعسل وفواكه.', price: 20 },
    ],
  },
  {
    en: 'Breakfast',
    ar: 'الإفطار',
    order: 9,
    items: [
      { en: 'Maazym Breakfast (50)', ar: 'إفطار مازيم (50)', descEn: 'Granola with coffee and mascarpone.', descAr: 'جرانولا مع قهوة ومسكاربوني.', price: 50 },
      { en: 'Mediterranean Breakfast (50)', ar: 'إفطار متوسطي (50)', descEn: 'Cheese, olives, eggs, and bread.', descAr: 'جبن وزيتون وبيض وخبز.', price: 50 },
      { en: 'Arabic Breakfast (50)', ar: 'إفطار عربي (50)', descEn: 'Fava beans, hummus, labneh, and cheese.', descAr: 'فول وحمص ولبنة وجبن.', price: 50 },
      { en: 'Kids Breakfast (25)', ar: 'إفطار أطفال (25)', descEn: 'Eggs, cheese, and juice.', descAr: 'بيض وجبن وعصير.', price: 25 },
      { en: 'American Breakfast (50)', ar: 'إفطار أمريكي (50)', descEn: 'Soup, main dish, and drink.', descAr: 'شوربة وطبق رئيسي ومشروب.', price: 50 },
    ],
  },
  {
    en: 'Ramadan',
    ar: 'رمضان',
    order: 10,
    items: [
      { en: 'Ramadan Suhour Combo (20)', ar: 'وجبة سحور رمضان (20)', descEn: 'Suhour meal with light dishes and a drink.', descAr: 'وجبة سحور مع أطباق خفيفة ومشروب.', price: 20 },
    ],
  },
  {
    en: 'Coffee & Hot Drinks',
    ar: 'قهوة ومشروبات ساخنة',
    order: 11,
    items: [
      { en: 'Espresso (12)', ar: 'إسبريسو (12)', descEn: 'Espresso — 177 ml.', descAr: 'إسبريسو — ١٧٧ مل.', price: 12 },
      { en: 'Double Espresso (16)', ar: 'دبل إسبريسو (16)', descEn: 'Double espresso — 177 ml.', descAr: 'دبل إسبريسو — ١٧٧ مل.', price: 16 },
      { en: 'Special Espresso (18)', ar: 'إسبريسو خاص (18)', descEn: 'Espresso with sweetened condensed milk — 177 ml.', descAr: 'إسبريسو مع حليب مركز محلى — ١٧٧ مل.', price: 18 },
      { en: 'Espresso Macchiato (15)', ar: 'إسبريسو ماكياتو (15)', descEn: 'Espresso with a dollop of milk foam — 177 ml.', descAr: 'إسبريسو مع رغوة حليب — ١٧٧ مل.', price: 15 },
      { en: 'Americano (15)', ar: 'أمريكانو (15)', descEn: 'Americano from espresso and hot water — 237 ml.', descAr: 'أمريكانو من إسبريسو وماء ساخن — ٢٣٧ مل.', price: 15 },
      { en: 'Flat White (18)', ar: 'فلات وايت (18)', descEn: 'Espresso with steamed milk and light foam — 237 ml.', descAr: 'إسبريسو مع حليب مبخر ورغوة خفيفة — ٢٣٧ مل.', price: 18 },
      { en: 'Cappuccino (18)', ar: 'كابتشينو (18)', descEn: 'Espresso with milk and thick foam — 237 ml.', descAr: 'إسبريسو مع حليب ورغوة كثيفة — ٢٣٧ مل.', price: 18 },
      { en: 'Latte (18)', ar: 'لاتيه (18)', descEn: 'Espresso with steamed milk — 237 ml.', descAr: 'إسبريسو مع حليب مبخر — ٢٣٧ مل.', price: 18 },
      { en: 'Matcha Latte (20)', ar: 'ماتشا لاتيه (20)', descEn: 'Matcha with milk — 237 ml.', descAr: 'ماتشا مع حليب — ٢٣٧ مل.', price: 20 },
      { en: 'Spanish Latte (20)', ar: 'سبانيش لاتيه (20)', descEn: 'Espresso with sweetened condensed milk — 237 ml.', descAr: 'إسبريسو مع حليب مركز محلى — ٢٣٧ مل.', price: 20 },
      { en: 'Mocha Latte (20)', ar: 'موكا لاتيه (20)', descEn: 'Espresso with hot chocolate and steamed milk — 237 ml.', descAr: 'إسبريسو مع شوكولاتة ساخنة وحليب مبخر — ٢٣٧ مل.', price: 20 },
      { en: 'Hot Chocolate (18)', ar: 'شوكولاتة ساخنة (18)', descEn: 'Hot chocolate with milk — 237 ml.', descAr: 'شوكولاتة ساخنة مع حليب — ٢٣٧ مل.', price: 18 },
      { en: 'Cortado (18)', ar: 'كورتادو (18)', descEn: 'Small coffee with milk.', descAr: 'قهوة صغيرة مع حليب.', price: 18 },
      { en: 'Turkish Coffee (14)', ar: 'قهوة تركية (14)', descEn: 'Traditional Turkish coffee — finely ground — 177 ml.', descAr: 'قهوة تركية تقليدية مطحونة ناعماً — ١٧٧ مل.', price: 14 },
    ],
  },
  {
    en: 'Tea & Specialty Hot Beverages',
    ar: 'شاي ومشروبات ساخنة مميزة',
    order: 12,
    items: [
      { en: 'Tunisian Mint Tea (10)', ar: 'شاي تونسي بالنعناع (10)', descEn: 'Green mint tea — 237 ml.', descAr: 'شاي أخضر بالنعناع — ٢٣٧ مل.', price: 10 },
      { en: 'Tunisian Mint Tea with Almonds & Hazelnut (15)', ar: 'شاي تونسي بالنعناع مع لوز وبندق (15)', descEn: 'Mint tea with almonds or hazelnuts — 237 ml.', descAr: 'شاي بالنعناع مع لوز أو بندق — ٢٣٧ مل.', price: 15 },
      { en: 'Moroccan Mint Tea (12)', ar: 'شاي مغربي بالنعناع (12)', descEn: 'Moroccan mint tea — 237 ml.', descAr: 'شاي مغربي بالنعناع — ٢٣٧ مل.', price: 12 },
      { en: 'Tea Selection (10)', ar: 'تشكيلة شاي (10)', descEn: 'Tea with assorted flavors — 237 ml.', descAr: 'شاي بنكهات متنوعة — ٢٣٧ مل.', price: 10 },
      { en: 'Maazym Baklawa Tea (18)', ar: 'شاي بقلاوة مازيم (18)', descEn: 'Baklawa-flavored tea — 237 ml.', descAr: 'شاي بنكهة البقلاوة — ٢٣٧ مل.', price: 18 },
    ],
  },
  {
    en: 'Iced Coffees',
    ar: 'قهوة مثلجة',
    order: 13,
    items: [
      { en: 'Iced V60 (20)', ar: 'آيس في٦٠ (20)', descEn: 'Iced V60 coffee — 473 ml.', descAr: 'قهوة في٦٠ مثلجة — ٤٧٣ مل.', price: 20 },
      { en: 'Iced Americano (20)', ar: 'آيس أمريكانو (20)', descEn: 'Iced Americano — 473 ml.', descAr: 'أمريكانو مثلج — ٤٧٣ مل.', price: 20 },
      { en: 'Iced Latte (20)', ar: 'آيس لاتيه (20)', descEn: 'Iced latte — 473 ml.', descAr: 'لاتيه مثلج — ٤٧٣ مل.', price: 20 },
      { en: 'Iced Spanish Latte (20)', ar: 'آيس سبانيش لاتيه (20)', descEn: 'Iced Spanish latte — 473 ml.', descAr: 'سبانيش لاتيه مثلج — ٤٧٣ مل.', price: 20 },
      { en: 'Iced Mocha Latte (20)', ar: 'آيس موكا لاتيه (20)', descEn: 'Iced mocha latte — 473 ml.', descAr: 'موكا لاتيه مثلج — ٤٧٣ مل.', price: 20 },
      { en: 'Iced Matcha Latte (20)', ar: 'آيس ماتشا لاتيه (20)', descEn: 'Iced matcha latte — 473 ml.', descAr: 'ماتشا لاتيه مثلج — ٤٧٣ مل.', price: 20 },
      { en: 'Affogato (25)', ar: 'أفوجاتو (25)', descEn: 'Ice cream with hot espresso.', descAr: 'آيس كريم مع إسبريسو ساخن.', price: 25 },
      { en: 'Extra Shot (5)', ar: 'إضافة شوت (5)', descEn: 'Add an extra espresso shot.', descAr: 'إضافة شوت إسبريسو.', price: 5 },
      { en: 'Maazym Customized Drink (25)', ar: 'مشروب مازيم حسب الطلب (25)', descEn: 'Special drink made to customer request — 473 ml.', descAr: 'مشروب خاص حسب طلب الزبون — ٤٧٣ مل.', price: 25 },
    ],
  },
  {
    en: 'Cold Drinks',
    ar: 'مشروبات باردة',
    order: 14,
    items: [
      { en: 'Classic Mojito (20)', ar: 'موهيتو كلاسيك (20)', descEn: 'Lemon, mint, sugar, and soda — 473 ml.', descAr: 'ليمون ونعنع وسكر وصودا — ٤٧٣ مل.', price: 20 },
      { en: 'Strawberry Mojito (22)', ar: 'موهيتو فراولة (22)', descEn: 'Strawberries, mint, lemon, and soda — 473 ml.', descAr: 'فراولة ونعنع وليمون وصودا — ٤٧٣ مل.', price: 22 },
      { en: 'Blueberry Mojito (22)', ar: 'موهيتو توت أزرق (22)', descEn: 'Blueberries, mint, lemon, and soda — 473 ml.', descAr: 'توت أزرق ونعنع وليمون وصودا — ٤٧٣ مل.', price: 22 },
      { en: 'Passion Fruit Mojito (22)', ar: 'موهيتو ماراكوجا (22)', descEn: 'Passion fruit, mint, lemon, and soda — 473 ml.', descAr: 'ماراكوجا ونعنع وليمون وصودا — ٤٧٣ مل.', price: 22 },
      { en: 'Tunisian Lemonade (15)', ar: 'ليمونادة تونسية (15)', descEn: 'Fresh lemon juice with mint and sugar — 473 ml.', descAr: 'عصير ليمون طازج مع نعنع وسكر — ٤٧٣ مل.', price: 15 },
      { en: 'Fresh Juice Maazym (18)', ar: 'عصير طازج مازيم (18)', descEn: 'Fresh seasonal fruit juice — 473 ml.', descAr: 'عصير فواكه طازج موسمي — ٤٧٣ مل.', price: 18 },
      { en: 'Vanilla Milkshake (20)', ar: 'ميلك شيك فانيليا (20)', descEn: 'Vanilla milkshake — 473 ml.', descAr: 'ميلك شيك فانيليا — ٤٧٣ مل.', price: 20 },
      { en: 'Chocolate Milkshake (20)', ar: 'ميلك شيك شوكولاتة (20)', descEn: 'Chocolate milkshake — 473 ml.', descAr: 'ميلك شيك شوكولاتة — ٤٧٣ مل.', price: 20 },
      { en: 'Strawberry Milkshake (20)', ar: 'ميلك شيك فراولة (20)', descEn: 'Strawberry milkshake — 473 ml.', descAr: 'ميلك شيك فراولة — ٤٧٣ مل.', price: 20 },
      { en: 'Mango Milkshake (20)', ar: 'ميلك شيك مانجو (20)', descEn: 'Mango milkshake — 473 ml.', descAr: 'ميلك شيك مانجو — ٤٧٣ مل.', price: 20 },
      { en: 'Pineapple Milkshake (20)', ar: 'ميلك شيك أناناس (20)', descEn: 'Pineapple milkshake — 473 ml.', descAr: 'ميلك شيك أناناس — ٤٧٣ مل.', price: 20 },
      { en: 'Piña Colada (22)', ar: 'بينيا كولادا (22)', descEn: 'Pineapple and coconut milk — 473 ml.', descAr: 'أناناس وحليب جوز الهند — ٤٧٣ مل.', price: 22 },
      { en: 'Tropical Sunset (22)', ar: 'غروب استوائي (22)', descEn: 'Orange, pineapple, and pomegranate juices — 473 ml.', descAr: 'برتقال وأناناس ورمان — ٤٧٣ مل.', price: 22 },
      { en: 'Juazym Maazym (25)', ar: 'جوازيم مازيم (25)', descEn: 'Fresh mixed fruit cocktail — 473 ml.', descAr: 'كوكتيل فواكه طازج — ٤٧٣ مل.', price: 25 },
      { en: 'Smoothie Maazym (25)', ar: 'سموذي مازيم (25)', descEn: 'Fruit smoothie with ice — 473 ml.', descAr: 'سموذي فواكه مع ثلج — ٤٧٣ مل.', price: 25 },
    ],
  },
  {
    en: 'Sparkling & Still Water',
    ar: 'مياه معدنية وفوارة',
    order: 15,
    items: [
      { en: 'Small Water (5)', ar: 'ماء صغير (5)', descEn: 'Mineral water — small.', descAr: 'ماء معدني — حجم صغير.', price: 5 },
      { en: 'Large Water (8)', ar: 'ماء كبير (8)', descEn: 'Mineral water — large.', descAr: 'ماء معدني — حجم كبير.', price: 8 },
      { en: 'Red Bull (18)', ar: 'ريد بول (18)', descEn: 'Energy drink — 250 ml.', descAr: 'مشروب طاقة — ٢٥٠ مل.', price: 18 },
      { en: 'Sparkling Water Small (8)', ar: 'ماء فوار صغير (8)', descEn: 'Sparkling water — 330 ml.', descAr: 'ماء فوار — ٣٣٠ مل.', price: 8 },
      { en: 'Sparkling Water Large (12)', ar: 'ماء فوار كبير (12)', descEn: 'Sparkling water — 750 ml.', descAr: 'ماء فوار — ٧٥٠ مل.', price: 12 },
      { en: 'Barbican (10)', ar: 'بربيكان (10)', descEn: 'Malt drink — 330 ml.', descAr: 'مشروب شعير — ٣٣٠ مل.', price: 10 },
    ],
  },
  {
    en: 'Shisha',
    ar: 'الشيشة',
    order: 16,
    items: [
      { en: 'Shisha with Different Flavors (65)', ar: 'شيشة بنكهات متعددة (65)', descEn: 'Shisha with multiple flavors — customer choice.', descAr: 'شيشة بعدة نكهات — حسب اختيار الزبون.', price: 65 },
      { en: 'Salloum Shisha (30)', ar: 'شيشة سلوم (30)', descEn: 'Traditional Salloum shisha.', descAr: 'شيشة سلوم تقليدية.', price: 30 },
      { en: 'Changing Head (Salloum) (15)', ar: 'تبديل رأس سلوم (15)', descEn: 'Replace Salloum tobacco head.', descAr: 'استبدال رأس تبغ سلوم.', price: 15 },
      { en: 'Zaghloul Shisha (30)', ar: 'شيشة زغلول (30)', descEn: 'Traditional Zaghloul shisha.', descAr: 'شيشة زغلول تقليدية.', price: 30 },
      { en: 'Changing Head (Zaghloul) (15)', ar: 'تبديل رأس زغلول (15)', descEn: 'Replace Zaghloul head.', descAr: 'استبدال رأس زغلول.', price: 15 },
      { en: 'Shisha Maazym (65)', ar: 'شيشة مازيم (65)', descEn: 'Special shisha with unique flavors.', descAr: 'شيشة مميزة بنكهات خاصة.', price: 65 },
      { en: 'Changing Head (30)', ar: 'تبديل رأس شيشة (30)', descEn: 'Replace shisha head.', descAr: 'استبدال رأس الشيشة.', price: 30 },
    ],
  },
]

let sql = `-- Maazym full menu catalog (from spreadsheet). Replaces all categories & products.
-- Preserves past orders: order_items.product_id nulled (line snapshots remain in product_snapshot).
-- Run: supabase db reset (dev) OR supabase migration up (prod) — review before prod.

BEGIN;

-- 1) Detach order lines from products so we can delete catalog rows
ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL;
UPDATE order_items SET product_id = NULL;

-- 2) Clear dependent catalog / promos / modifiers
DELETE FROM order_item_modifiers;
DELETE FROM promotion_products;
DELETE FROM promotion_categories;
DELETE FROM product_modifier_groups;
DELETE FROM combo_rules;
DELETE FROM products;
DELETE FROM categories;
DELETE FROM modifier_options;
DELETE FROM modifier_groups;

-- 3) Categories
INSERT INTO categories (name_en, name_ar, description_en, description_ar, display_order, is_active)
VALUES
`

sql += catalog
  .map(
    (c) =>
      `  ('${esc(c.en)}', '${esc(c.ar)}', '${esc(`Maazym — ${c.en}`)}', '${esc(`مازيم — ${c.ar}`)}', ${c.order}, true)`
  )
  .join(',\n')

sql += `;\n\n`

for (const c of catalog) {
  const vals = c.items
    .map((it, idx) => {
      const prep = it.prep ?? 10
      const tags = inferDietaryTags(c.en, it)
      return `  ('${esc(it.en)}', '${esc(it.ar)}', '${esc(it.descEn)}', '${esc(it.descAr)}', ${it.price.toFixed(3)}, TRUE, FALSE, ${prep}, NULL::integer, ${sqlJson(tags)}, ${idx + 1})`
    })
    .join(',\n')

  sql += `INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
${vals}
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = '${esc(c.en)}';\n\n`
}

sql += `ALTER TABLE order_items
  ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

COMMIT;
`

writeFileSync(out, sql, 'utf8')
console.log('Wrote', out)
