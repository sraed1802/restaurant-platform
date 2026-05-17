-- Maazym full menu catalog (from spreadsheet). Replaces all categories & products.
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
  ('Starters', 'المقبلات', 'Maazym — Starters', 'مازيم — المقبلات', 1, true),
  ('Soups', 'الشوربات', 'Maazym — Soups', 'مازيم — الشوربات', 2, true),
  ('Salads', 'السلطات', 'Maazym — Salads', 'مازيم — السلطات', 3, true),
  ('Pizza', 'البيتزا', 'Maazym — Pizza', 'مازيم — البيتزا', 4, true),
  ('Pasta', 'المعكرونة', 'Maazym — Pasta', 'مازيم — المعكرونة', 5, true),
  ('Mediterranean Specialties', 'أطباق متوسطية مميزة', 'Maazym — Mediterranean Specialties', 'مازيم — أطباق متوسطية مميزة', 6, true),
  ('Fatayer', 'الفطائر', 'Maazym — Fatayer', 'مازيم — الفطائر', 7, true),
  ('Bakery & Desserts', 'مخبوزات وحلويات', 'Maazym — Bakery & Desserts', 'مازيم — مخبوزات وحلويات', 8, true),
  ('Breakfast', 'الإفطار', 'Maazym — Breakfast', 'مازيم — الإفطار', 9, true),
  ('Ramadan', 'رمضان', 'Maazym — Ramadan', 'مازيم — رمضان', 10, true),
  ('Coffee & Hot Drinks', 'قهوة ومشروبات ساخنة', 'Maazym — Coffee & Hot Drinks', 'مازيم — قهوة ومشروبات ساخنة', 11, true),
  ('Tea & Specialty Hot Beverages', 'شاي ومشروبات ساخنة مميزة', 'Maazym — Tea & Specialty Hot Beverages', 'مازيم — شاي ومشروبات ساخنة مميزة', 12, true),
  ('Iced Coffees', 'قهوة مثلجة', 'Maazym — Iced Coffees', 'مازيم — قهوة مثلجة', 13, true),
  ('Cold Drinks', 'مشروبات باردة', 'Maazym — Cold Drinks', 'مازيم — مشروبات باردة', 14, true),
  ('Sparkling & Still Water', 'مياه معدنية وفوارة', 'Maazym — Sparkling & Still Water', 'مازيم — مياه معدنية وفوارة', 15, true),
  ('Shisha', 'الشيشة', 'Maazym — Shisha', 'مازيم — الشيشة', 16, true);

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Mozzarella Sticks (10)', 'أصابع موزاريلا (10)', 'Fried mozzarella sticks, breaded, served with marinara sauce.', 'أصابع موزاريلا مقلية ومغطاة مع صلصة مارينارا.', 10.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 1),
  ('Chicken Wings (12)', 'أجنحة دجاج (12)', 'Crispy chicken wings, seasoned; spicy on request.', 'أجنحة دجاج مقرمشة بنكهات مميزة؛ حار عند الطلب.', 12.000, TRUE, FALSE, 10, NULL::integer, '["gluten-free"]'::jsonb, 2),
  ('Spring Rolls / Brik (15)', 'سبرنغ رول / بريك (15)', 'Spring roll or Tunisian brik with vegetables or chicken, fried until crispy.', 'سبرنغ رول أو بريك تونسي بالخضار أو الدجاج مقلي ومقرمش.', 15.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 3),
  ('French Fries (12)', 'بطاطس مقلية (12)', 'Golden crispy French fries.', 'بطاطس مقلية ذهبية ومقرمشة.', 12.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 4),
  ('Potato Wedges (12)', 'أصابع بطاطس (12)', 'Seasoned potato wedges, baked or fried.', 'أصابع بطاطس متبلة، مخبوزة أو مقلية.', 12.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 5)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Starters';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Lentil Soup (15)', 'شوربة عدس (15)', 'Creamy lentil soup with vegetables and spices.', 'شوربة عدس كريمية مع خضار وتوابل.', 15.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 1),
  ('Tunisian Soup (15)', 'شوربة تونسية (15)', 'Traditional Tunisian soup with meat or chicken, vermicelli, chickpeas, and spices.', 'شوربة تونسية تقليدية بلحم أو دجاج وشعيرية وحمص وتوابل.', 15.000, TRUE, FALSE, 10, NULL::integer, '["gluten-free"]'::jsonb, 2),
  ('Chicken Vegetable Soup (15)', 'شوربة دجاج وخضار (15)', 'Chicken soup with fresh vegetables.', 'شوربة دجاج مع خضار طازجة.', 15.000, TRUE, FALSE, 10, NULL::integer, '["gluten-free"]'::jsonb, 3)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Soups';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Caesar Salad (22)', 'سلطة سيزر (22)', 'Lettuce, grilled chicken, parmesan, croutons, Caesar dressing.', 'خس ودجاج مشوي وبارميزان وخبز محمص وصلصة سيزر.', 22.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 1),
  ('Greek Salad (22)', 'سلطة يونانية (22)', 'Cucumbers, bell peppers, tomatoes, olive oil, and basil.', 'خيار وفلفل وطماطم وزيت زيتون وريحان.', 22.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 2),
  ('Caprese Salad (25)', 'سلطة كابريزي (25)', 'Fresh tomatoes, mozzarella, basil, and olive oil.', 'طماطم طازجة وموزاريلا وريحان وزيت زيتون.', 25.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 3),
  ('Niçoise Salad (25)', 'سلطة نيسواز (25)', 'Tuna, potatoes, green beans, eggs, olives, and lettuce.', 'تونة وبطاطس وفاصوليا خضراء وبيض وزيتون وخس.', 25.000, TRUE, FALSE, 10, NULL::integer, '["gluten-free"]'::jsonb, 4)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Salads';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Margherita (25)', 'مارغريتا (25)', 'Tomato sauce, mozzarella, fresh basil.', 'صلصة طماطم وموزاريلا وريحان طازج.', 25.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 1),
  ('Pepperoni (30)', 'بيبروني (30)', 'Mozzarella and pepperoni.', 'موزاريلا وبيبروني.', 30.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 2),
  ('Vegetarian (30)', 'نباتية (30)', 'Tomato sauce, mozzarella, mushrooms, olives, onion.', 'صلصة طماطم وموزاريلا وفطر وزيتون وبصل.', 30.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 3),
  ('Chicken Ranch (30)', 'دجاج رانش (30)', 'Chicken pizza with ranch sauce, mozzarella, and fresh vegetables.', 'بيتزا دجاج بصلصة رانش وموزاريلا وخضار طازجة.', 30.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 4),
  ('Chicken Pesto (30)', 'دجاج بيستو (30)', 'Chicken pizza with pesto sauce, mozzarella, and herbs.', 'بيتزا دجاج بصلصة البيستو وموزاريلا وأعشاب.', 30.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 5),
  ('Burrata (40)', 'بوراتا (40)', 'Creamy burrata, fresh tomatoes, and basil.', 'بوراتا كريمية وطماطم طازجة وريحان.', 40.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 6),
  ('Tuna & Cipolla (30)', 'تونة وبصل (30)', 'Mozzarella, tuna, onion, rich tomato sauce.', 'موزاريلا وتونة وبصل وصلصة طماطم غنية.', 30.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 7),
  ('Quattro Formaggi (40)', 'أربعة أجبان (40)', 'Four-cheese pizza.', 'بيتزا بأربعة أنواع جبن.', 40.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 8),
  ('Regina (30)', 'ريجينا (30)', 'Mozzarella, mushrooms, turkey.', 'موزاريلا وفطر وديك رومي.', 30.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 9),
  ('Four Seasons (32)', 'أربعة فصول (32)', 'Four sections: vegetables, mushrooms, meat, tuna.', 'أربع قطاعات: خضار وفطر ولحم وتونة.', 32.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 10),
  ('Hot Waves (38)', 'هوت ويفز (38)', 'Spicy pizza with cheese blend, hot sauce, and fresh vegetables.', 'بيتزا حارة بمزيج أجبان وصلصة حارة وخضار طازجة.', 38.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 11)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Pizza';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Lasagna Bolognese (25)', 'لازانيا بولونيز (25)', 'Lasagna with beef, Bolognese sauce, and béchamel.', 'لازانيا بلحم بقري وصلصة بولونيز وبشاميل.', 25.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 1),
  ('Lasagna Chicken & Vegetable (25)', 'لازانيا دجاج وخضار (25)', 'Lasagna with chicken and vegetables in a creamy sauce.', 'لازانيا بدجاج وخضار بصلصة كريمية.', 25.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 2),
  ('Smoked Ham Lasagna (25)', 'لازانيا لحم مدخن (25)', 'Lasagna with smoked meat and béchamel.', 'لازانيا بلحم مدخن وبشاميل.', 25.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 3),
  ('Puttanesca (25)', 'بوتانيسكا (25)', 'Pasta with tomato sauce, olives, capers, and garlic.', 'معكرونة بصلصة طماطم وزيتون وكبر وثوم.', 25.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan"]'::jsonb, 4),
  ('Penne Arrabbiata (25)', 'بيني أرابياتا (25)', 'Spicy pasta with tomato sauce.', 'معكرونة حارة بصلصة طماطم.', 25.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan"]'::jsonb, 5),
  ('Chicken Alfredo (25)', 'دجاج ألفريدو (25)', 'Pasta with creamy Alfredo sauce and chicken.', 'معكرونة بصلصة ألفريدو كريمية ودجاج.', 25.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 6),
  ('Bolognese (30)', 'بولونيز (30)', 'Pasta with beef and tomato sauce.', 'معكرونة بلحم بقري وصلصة طماطم.', 30.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 7)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Pasta';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Makloub Maazym (25)', 'مقلوب مازيم (25)', 'Tunisian upside-down sandwich with meat or chicken, cheese, and vegetables.', 'مقلوب تونسي بلحم أو دجاج وجبن وخضار.', 25.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 1),
  ('Baguette Farcie Maazym (25)', 'باغيت فارسي مازيم (25)', 'Baguette stuffed with tuna or chicken, vegetables, and sauces.', 'باغيت محشو بتونة أو دجاج وخضار وصلصات.', 25.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 2),
  ('French Tacos Chicken (25)', 'فرنش تاكوس دجاج (25)', 'Tortilla wrap with chicken, potatoes, cheese, and sauce.', 'تورتيلا بدجاج وبطاطس وجبن وصلصة.', 25.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 3),
  ('French Tacos Beef (25)', 'فرنش تاكوس لحم (25)', 'Tortilla wrap with beef, potatoes, cheese, and sauce.', 'تورتيلا بلحم وبطاطس وجبن وصلصة.', 25.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 4),
  ('Cornet Maazym (25)', 'كورني مازيم (25)', 'Cone bread stuffed with chicken or meat and cheese.', 'خبز مخروطي محشو بدجاج أو لحم وجبن.', 25.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 5),
  ('Panuzzo Maazym (25)', 'بانوتسو مازيم (25)', 'Italian bread stuffed with meat or chicken and cheese.', 'خبز إيطالي محشو بلحم أو دجاج وجبن.', 25.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 6),
  ('Libanais Maazym (25)', 'لبناني مازيم (25)', 'Lebanese bread stuffed with spiced chicken.', 'خبز لبناني محشو بدجاج بالتوابل المميزة.', 25.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 7),
  ('Smoked Sandwich (28)', 'ساندويتش مدخن (28)', 'Smoked sandwich with cheese, bacon, and ham.', 'ساندويتش مدخن بالجبن والبيكون واللانشون.', 28.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 8)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Mediterranean Specialties';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Mankoush Cheese (12)', 'منقوشة جبن (12)', 'Cheese mankoush.', 'منقوشة بالجبن.', 12.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 1),
  ('Mankoush Zaatar (14)', 'منقوشة زعتر (14)', 'Thyme mankoush with olive oil.', 'منقوشة زعتر بزيت الزيتون.', 14.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan"]'::jsonb, 2),
  ('Mankoush Spinach (15)', 'منقوشة سبانخ (15)', 'Seasoned spinach mankoush.', 'منقوشة سبانخ متبلة.', 15.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan"]'::jsonb, 3),
  ('Mankoush Cheese & Spinach (18)', 'منقوشة جبن وسبانخ (18)', 'Cheese and spinach mankoush.', 'منقوشة جبن وسبانخ.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 4),
  ('Mankoush Meat (18)', 'منقوشة لحم (18)', 'Seasoned meat mankoush.', 'منقوشة لحم متبلة.', 18.000, TRUE, FALSE, 10, NULL::integer, '[]'::jsonb, 5)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Fatayer';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Croissant (10)', 'كرواسون (10)', 'Butter croissant.', 'كرواسون بالزبدة.', 10.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 1),
  ('Muffin (10)', 'مافن (10)', 'Muffins in various flavors.', 'مافن بنكهات متنوعة.', 10.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan"]'::jsonb, 2),
  ('Cookie (10)', 'كوكيز (10)', 'Baked cookies.', 'كوكيز مخبوزة.', 10.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan"]'::jsonb, 3),
  ('Millefeuille (18)', 'ميلفي (18)', 'Millefeuille with cream layers.', 'ميلفي بطبقات كريمة.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 4),
  ('Cheesecake (20)', 'تشيز كيك (20)', 'Creamy cheesecake.', 'تشيز كيك كريمي.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 5),
  ('Ice Cream (15)', 'آيس كريم (15)', 'Ice cream in various flavors.', 'آيس كريم بنكهات متنوعة.', 15.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 6),
  ('Pancakes (18)', 'بان كيك (18)', 'Pancakes with honey or chocolate.', 'بان كيك مع عسل أو شوكولاتة.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 7),
  ('Panna Cotta (18)', 'بانا كوتا (18)', 'Italian panna cotta.', 'بانا كوتا إيطالية.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan"]'::jsonb, 8),
  ('San Sebastian (20)', 'سان سيباستيان (20)', 'Burnt San Sebastian cheesecake.', 'تشيز كيك سان سيباستيان المحروق.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 9),
  ('Crepes (18)', 'كريب (18)', 'Sweet crepes with assorted fillings.', 'كريب حلو بحشوات متنوعة.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan"]'::jsonb, 10),
  ('Fruit Salad (18)', 'سلطة فواكه (18)', 'Fresh fruit salad.', 'سلطة فواكه طازجة.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan"]'::jsonb, 11),
  ('Granola (20)', 'جرانولا (20)', 'Granola with yogurt, honey, and fruits.', 'جرانولا مع زبادي وعسل وفواكه.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","nuts"]'::jsonb, 12)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Bakery & Desserts';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Maazym Breakfast (50)', 'إفطار مازيم (50)', 'Granola with coffee and mascarpone.', 'جرانولا مع قهوة ومسكاربوني.', 50.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","nuts"]'::jsonb, 1),
  ('Mediterranean Breakfast (50)', 'إفطار متوسطي (50)', 'Cheese, olives, eggs, and bread.', 'جبن وزيتون وبيض وخبز.', 50.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 2),
  ('Arabic Breakfast (50)', 'إفطار عربي (50)', 'Fava beans, hummus, labneh, and cheese.', 'فول وحمص ولبنة وجبن.', 50.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 3),
  ('Kids Breakfast (25)', 'إفطار أطفال (25)', 'Eggs, cheese, and juice.', 'بيض وجبن وعصير.', 25.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian"]'::jsonb, 4),
  ('American Breakfast (50)', 'إفطار أمريكي (50)', 'Soup, main dish, and drink.', 'شوربة وطبق رئيسي ومشروب.', 50.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan"]'::jsonb, 5)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Breakfast';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Ramadan Suhour Combo (20)', 'وجبة سحور رمضان (20)', 'Suhour meal with light dishes and a drink.', 'وجبة سحور مع أطباق خفيفة ومشروب.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan"]'::jsonb, 1)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Ramadan';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Espresso (12)', 'إسبريسو (12)', 'Espresso — 177 ml.', 'إسبريسو — ١٧٧ مل.', 12.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 1),
  ('Double Espresso (16)', 'دبل إسبريسو (16)', 'Double espresso — 177 ml.', 'دبل إسبريسو — ١٧٧ مل.', 16.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 2),
  ('Special Espresso (18)', 'إسبريسو خاص (18)', 'Espresso with sweetened condensed milk — 177 ml.', 'إسبريسو مع حليب مركز محلى — ١٧٧ مل.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 3),
  ('Espresso Macchiato (15)', 'إسبريسو ماكياتو (15)', 'Espresso with a dollop of milk foam — 177 ml.', 'إسبريسو مع رغوة حليب — ١٧٧ مل.', 15.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 4),
  ('Americano (15)', 'أمريكانو (15)', 'Americano from espresso and hot water — 237 ml.', 'أمريكانو من إسبريسو وماء ساخن — ٢٣٧ مل.', 15.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 5),
  ('Flat White (18)', 'فلات وايت (18)', 'Espresso with steamed milk and light foam — 237 ml.', 'إسبريسو مع حليب مبخر ورغوة خفيفة — ٢٣٧ مل.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 6),
  ('Cappuccino (18)', 'كابتشينو (18)', 'Espresso with milk and thick foam — 237 ml.', 'إسبريسو مع حليب ورغوة كثيفة — ٢٣٧ مل.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 7),
  ('Latte (18)', 'لاتيه (18)', 'Espresso with steamed milk — 237 ml.', 'إسبريسو مع حليب مبخر — ٢٣٧ مل.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 8),
  ('Matcha Latte (20)', 'ماتشا لاتيه (20)', 'Matcha with milk — 237 ml.', 'ماتشا مع حليب — ٢٣٧ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 9),
  ('Spanish Latte (20)', 'سبانيش لاتيه (20)', 'Espresso with sweetened condensed milk — 237 ml.', 'إسبريسو مع حليب مركز محلى — ٢٣٧ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 10),
  ('Mocha Latte (20)', 'موكا لاتيه (20)', 'Espresso with hot chocolate and steamed milk — 237 ml.', 'إسبريسو مع شوكولاتة ساخنة وحليب مبخر — ٢٣٧ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 11),
  ('Hot Chocolate (18)', 'شوكولاتة ساخنة (18)', 'Hot chocolate with milk — 237 ml.', 'شوكولاتة ساخنة مع حليب — ٢٣٧ مل.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 12),
  ('Cortado (18)', 'كورتادو (18)', 'Small coffee with milk.', 'قهوة صغيرة مع حليب.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 13),
  ('Turkish Coffee (14)', 'قهوة تركية (14)', 'Traditional Turkish coffee — finely ground — 177 ml.', 'قهوة تركية تقليدية مطحونة ناعماً — ١٧٧ مل.', 14.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 14)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Coffee & Hot Drinks';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Tunisian Mint Tea (10)', 'شاي تونسي بالنعناع (10)', 'Green mint tea — 237 ml.', 'شاي أخضر بالنعناع — ٢٣٧ مل.', 10.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 1),
  ('Tunisian Mint Tea with Almonds & Hazelnut (15)', 'شاي تونسي بالنعناع مع لوز وبندق (15)', 'Mint tea with almonds or hazelnuts — 237 ml.', 'شاي بالنعناع مع لوز أو بندق — ٢٣٧ مل.', 15.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free","nuts"]'::jsonb, 2),
  ('Moroccan Mint Tea (12)', 'شاي مغربي بالنعناع (12)', 'Moroccan mint tea — 237 ml.', 'شاي مغربي بالنعناع — ٢٣٧ مل.', 12.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 3),
  ('Tea Selection (10)', 'تشكيلة شاي (10)', 'Tea with assorted flavors — 237 ml.', 'شاي بنكهات متنوعة — ٢٣٧ مل.', 10.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 4),
  ('Maazym Baklawa Tea (18)', 'شاي بقلاوة مازيم (18)', 'Baklawa-flavored tea — 237 ml.', 'شاي بنكهة البقلاوة — ٢٣٧ مل.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free","nuts"]'::jsonb, 5)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Tea & Specialty Hot Beverages';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Iced V60 (20)', 'آيس في٦٠ (20)', 'Iced V60 coffee — 473 ml.', 'قهوة في٦٠ مثلجة — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 1),
  ('Iced Americano (20)', 'آيس أمريكانو (20)', 'Iced Americano — 473 ml.', 'أمريكانو مثلج — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 2),
  ('Iced Latte (20)', 'آيس لاتيه (20)', 'Iced latte — 473 ml.', 'لاتيه مثلج — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 3),
  ('Iced Spanish Latte (20)', 'آيس سبانيش لاتيه (20)', 'Iced Spanish latte — 473 ml.', 'سبانيش لاتيه مثلج — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 4),
  ('Iced Mocha Latte (20)', 'آيس موكا لاتيه (20)', 'Iced mocha latte — 473 ml.', 'موكا لاتيه مثلج — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 5),
  ('Iced Matcha Latte (20)', 'آيس ماتشا لاتيه (20)', 'Iced matcha latte — 473 ml.', 'ماتشا لاتيه مثلج — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 6),
  ('Affogato (25)', 'أفوجاتو (25)', 'Ice cream with hot espresso.', 'آيس كريم مع إسبريسو ساخن.', 25.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 7),
  ('Extra Shot (5)', 'إضافة شوت (5)', 'Add an extra espresso shot.', 'إضافة شوت إسبريسو.', 5.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 8),
  ('Maazym Customized Drink (25)', 'مشروب مازيم حسب الطلب (25)', 'Special drink made to customer request — 473 ml.', 'مشروب خاص حسب طلب الزبون — ٤٧٣ مل.', 25.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 9)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Iced Coffees';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Classic Mojito (20)', 'موهيتو كلاسيك (20)', 'Lemon, mint, sugar, and soda — 473 ml.', 'ليمون ونعنع وسكر وصودا — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 1),
  ('Strawberry Mojito (22)', 'موهيتو فراولة (22)', 'Strawberries, mint, lemon, and soda — 473 ml.', 'فراولة ونعنع وليمون وصودا — ٤٧٣ مل.', 22.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 2),
  ('Blueberry Mojito (22)', 'موهيتو توت أزرق (22)', 'Blueberries, mint, lemon, and soda — 473 ml.', 'توت أزرق ونعنع وليمون وصودا — ٤٧٣ مل.', 22.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 3),
  ('Passion Fruit Mojito (22)', 'موهيتو ماراكوجا (22)', 'Passion fruit, mint, lemon, and soda — 473 ml.', 'ماراكوجا ونعنع وليمون وصودا — ٤٧٣ مل.', 22.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 4),
  ('Tunisian Lemonade (15)', 'ليمونادة تونسية (15)', 'Fresh lemon juice with mint and sugar — 473 ml.', 'عصير ليمون طازج مع نعنع وسكر — ٤٧٣ مل.', 15.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 5),
  ('Fresh Juice Maazym (18)', 'عصير طازج مازيم (18)', 'Fresh seasonal fruit juice — 473 ml.', 'عصير فواكه طازج موسمي — ٤٧٣ مل.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 6),
  ('Vanilla Milkshake (20)', 'ميلك شيك فانيليا (20)', 'Vanilla milkshake — 473 ml.', 'ميلك شيك فانيليا — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 7),
  ('Chocolate Milkshake (20)', 'ميلك شيك شوكولاتة (20)', 'Chocolate milkshake — 473 ml.', 'ميلك شيك شوكولاتة — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 8),
  ('Strawberry Milkshake (20)', 'ميلك شيك فراولة (20)', 'Strawberry milkshake — 473 ml.', 'ميلك شيك فراولة — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 9),
  ('Mango Milkshake (20)', 'ميلك شيك مانجو (20)', 'Mango milkshake — 473 ml.', 'ميلك شيك مانجو — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 10),
  ('Pineapple Milkshake (20)', 'ميلك شيك أناناس (20)', 'Pineapple milkshake — 473 ml.', 'ميلك شيك أناناس — ٤٧٣ مل.', 20.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 11),
  ('Piña Colada (22)', 'بينيا كولادا (22)', 'Pineapple and coconut milk — 473 ml.', 'أناناس وحليب جوز الهند — ٤٧٣ مل.', 22.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","gluten-free"]'::jsonb, 12),
  ('Tropical Sunset (22)', 'غروب استوائي (22)', 'Orange, pineapple, and pomegranate juices — 473 ml.', 'برتقال وأناناس ورمان — ٤٧٣ مل.', 22.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 13),
  ('Juazym Maazym (25)', 'جوازيم مازيم (25)', 'Fresh mixed fruit cocktail — 473 ml.', 'كوكتيل فواكه طازج — ٤٧٣ مل.', 25.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 14),
  ('Smoothie Maazym (25)', 'سموذي مازيم (25)', 'Fruit smoothie with ice — 473 ml.', 'سموذي فواكه مع ثلج — ٤٧٣ مل.', 25.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 15)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Cold Drinks';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Small Water (5)', 'ماء صغير (5)', 'Mineral water — small.', 'ماء معدني — حجم صغير.', 5.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 1),
  ('Large Water (8)', 'ماء كبير (8)', 'Mineral water — large.', 'ماء معدني — حجم كبير.', 8.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 2),
  ('Red Bull (18)', 'ريد بول (18)', 'Energy drink — 250 ml.', 'مشروب طاقة — ٢٥٠ مل.', 18.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 3),
  ('Sparkling Water Small (8)', 'ماء فوار صغير (8)', 'Sparkling water — 330 ml.', 'ماء فوار — ٣٣٠ مل.', 8.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 4),
  ('Sparkling Water Large (12)', 'ماء فوار كبير (12)', 'Sparkling water — 750 ml.', 'ماء فوار — ٧٥٠ مل.', 12.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 5),
  ('Barbican (10)', 'بربيكان (10)', 'Malt drink — 330 ml.', 'مشروب شعير — ٣٣٠ مل.', 10.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 6)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Sparkling & Still Water';

INSERT INTO products (category_id, name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
SELECT cat.id, v.name_en, v.name_ar, v.description_en, v.description_ar, v.base_price, v.is_available, v.is_featured, v.prep_time_minutes, v.calories, v.tags, v.display_order
FROM categories cat
CROSS JOIN (VALUES
  ('Shisha with Different Flavors (65)', 'شيشة بنكهات متعددة (65)', 'Shisha with multiple flavors — customer choice.', 'شيشة بعدة نكهات — حسب اختيار الزبون.', 65.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 1),
  ('Salloum Shisha (30)', 'شيشة سلوم (30)', 'Traditional Salloum shisha.', 'شيشة سلوم تقليدية.', 30.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 2),
  ('Changing Head (Salloum) (15)', 'تبديل رأس سلوم (15)', 'Replace Salloum tobacco head.', 'استبدال رأس تبغ سلوم.', 15.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 3),
  ('Zaghloul Shisha (30)', 'شيشة زغلول (30)', 'Traditional Zaghloul shisha.', 'شيشة زغلول تقليدية.', 30.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 4),
  ('Changing Head (Zaghloul) (15)', 'تبديل رأس زغلول (15)', 'Replace Zaghloul head.', 'استبدال رأس زغلول.', 15.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 5),
  ('Shisha Maazym (65)', 'شيشة مازيم (65)', 'Special shisha with unique flavors.', 'شيشة مميزة بنكهات خاصة.', 65.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 6),
  ('Changing Head (30)', 'تبديل رأس شيشة (30)', 'Replace shisha head.', 'استبدال رأس الشيشة.', 30.000, TRUE, FALSE, 10, NULL::integer, '["vegetarian","vegan","gluten-free"]'::jsonb, 7)
) AS v(name_en, name_ar, description_en, description_ar, base_price, is_available, is_featured, prep_time_minutes, calories, tags, display_order)
WHERE cat.name_en = 'Shisha';

ALTER TABLE order_items
  ADD CONSTRAINT order_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

COMMIT;
