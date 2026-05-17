-- ============================================================
-- Create Storage Buckets
-- ============================================================

-- Create restaurant bucket for logos and images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'restaurant',
  'restaurant',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Create menu bucket for product images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'menu',
  'menu',
  true,
  5242880, -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for restaurant bucket
CREATE POLICY "Anyone can view restaurant images" ON storage.objects
FOR SELECT USING (bucket_id = 'restaurant');

CREATE POLICY "Authenticated users can upload restaurant images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'restaurant' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update their restaurant images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'restaurant' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can delete their restaurant images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'restaurant' AND 
  auth.role() = 'authenticated'
);

-- Create RLS policies for menu bucket
CREATE POLICY "Anyone can view menu images" ON storage.objects
FOR SELECT USING (bucket_id = 'menu');

CREATE POLICY "Authenticated users can upload menu images" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'menu' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update their menu images" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'menu' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can delete their menu images" ON storage.objects
FOR DELETE USING (
  bucket_id = 'menu' AND 
  auth.role() = 'authenticated'
);
