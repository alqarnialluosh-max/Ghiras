-- Salla product for "باقة كل المواد" (salla.sa/ghirasedu, product p326502731).
-- Only fills empty values, so anything the owner already set from the dashboard is kept.
UPDATE plans
   SET salla_url = COALESCE(NULLIF(salla_url, ''),
         'https://salla.sa/ghirasedu/%D8%A8%D8%A7%D9%82%D8%A9-%D8%A7%D9%84%D8%B4%D8%A7%D9%85%D9%84-%D9%83%D9%84-%D8%A7%D9%84%D9%85%D9%88%D8%A7%D8%AF-%D8%B4%D9%87%D8%B1-%D9%83%D8%A7%D9%85%D9%84/p326502731'),
       salla_product_id = COALESCE(NULLIF(salla_product_id, ''), '326502731')
 WHERE code = 'ALL_SUBJECTS';
