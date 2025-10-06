-- Import rates from Replit to Railway
-- Run this in Railway's PostgreSQL query console

INSERT INTO rates (id, city, state, flat_rate, lumper_charge, extra_stop_charge, is_active, created_at, updated_at) VALUES
('a50a5c62-e34d-4cfc-9bb3-79c7c7011037', 'Arkansas City', 'KS', 1350.00, 0.00, 50.00, true, '2025-08-21 03:46:55.643745', '2025-08-21 03:46:55.643745'),
('f6de5a70-d432-449e-b1b7-5300721f439d', 'Big Spring', 'TX', 1400.00, 0.00, 50.00, true, '2025-09-05 08:36:03.624001', '2025-09-05 08:36:03.624001'),
('e53447d5-e6d3-4433-a199-6a4e534e013c', 'DALLAS', 'TX', 0.00, 0.00, 50.00, true, '2025-09-05 06:03:14.977246', '2025-09-05 06:03:14.977246'),
('af15abd8-affb-47f9-a7f7-e2962a299c1c', 'Dubuque', 'IA', 2750.00, 0.00, 50.00, true, '2025-08-21 03:30:14.568057', '2025-08-21 03:30:14.568057'),
('e5902143-4c14-4185-b898-ded34f3ab761', 'Dubuque/Plano Teturns', 'TX', 2750.00, 0.00, 50.00, true, '2025-08-22 05:35:51.34876', '2025-08-22 05:35:51.34876'),
('8fdc284e-8a6c-471a-8b4e-8336e8b07c7f', 'FAYETTEVILLE', 'AR', 1200.00, 0.00, 50.00, true, '2025-09-05 08:40:47.500776', '2025-09-05 08:40:47.500776'),
('e773eae8-b709-4dc8-a2d6-1858d4231f2d', 'Fort Smith', 'AR', 1200.00, 0.00, 50.00, true, '2025-08-21 03:43:59.931299', '2025-08-21 03:43:59.931299'),
('1f0580ad-43ad-4ec5-9c8c-5e3f8933aaa1', 'Garland', 'TX', 800.00, 0.00, 50.00, true, '2025-09-09 19:49:02.71474', '2025-09-09 19:49:02.71474'),
('3df310ad-14a7-4897-a51e-3c1fc14044b9', 'Lancaster', 'TX', 3000.00, 0.00, 50.00, true, '2025-08-22 05:36:24.961722', '2025-08-22 05:36:24.961722'),
('6a389070-bb24-44c4-a86e-179962d97887', 'Moore', 'Ok', 1400.00, 0.00, 50.00, true, '2025-09-02 15:09:03.958367', '2025-09-02 15:09:03.958367'),
('68ced315-7a51-4896-86bc-dd7edb6ba5f9', 'Oklahoma City', 'Ok', 1400.00, 0.00, 50.00, true, '2025-08-24 01:36:55.953217', '2025-08-24 01:36:55.953217'),
('2eef97ff-ee36-4965-819a-8e61e36601c4', 'OKLAHOMA CITY', 'OK', 1400.00, 0.00, 50.00, true, '2025-08-24 20:47:04.180298', '2025-08-24 20:47:04.180298'),
('30d8edce-fbbf-4733-bc9e-2af081514056', 'Plano', 'TX', 0.00, 0.00, 50.00, true, '2025-09-05 21:03:18.515974', '2025-09-05 21:03:18.515974'),
('c1391e8d-f9ab-47c1-983a-e7db0780d6b1', 'PUEBLO', 'CO', 3000.00, 0.00, 50.00, true, '2025-09-20 22:12:16.852664', '2025-09-20 22:12:16.852664'),
('2cc2c704-a402-4438-8c51-d2aca7404adf', 'SAN ANTON', 'TX', 1400.00, 0.00, 50.00, true, '2025-09-21 05:03:49.026607', '2025-09-21 05:03:49.026607'),
('1fef4767-3179-4e5a-9e96-7490c5559867', 'San Antonio', 'TX', 950.00, 0.00, 50.00, true, '2025-08-21 03:45:09.191707', '2025-08-21 03:45:09.191707'),
('85cca4d3-115e-410e-8afd-75eb3174e9a7', 'Shiner', 'Tx', 1200.00, 0.00, 50.00, true, '2025-08-22 05:33:20.845187', '2025-08-22 05:33:20.845187')
ON CONFLICT (id) DO UPDATE SET
  city = EXCLUDED.city,
  state = EXCLUDED.state,
  flat_rate = EXCLUDED.flat_rate,
  lumper_charge = EXCLUDED.lumper_charge,
  extra_stop_charge = EXCLUDED.extra_stop_charge,
  is_active = EXCLUDED.is_active,
  updated_at = EXCLUDED.updated_at;

-- Verify import
SELECT COUNT(*) as total_rates FROM rates;
SELECT city, state, flat_rate FROM rates ORDER BY city;
