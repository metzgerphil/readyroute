ALTER TABLE fedex_status_codes
  ADD COLUMN IF NOT EXISTS is_exception_code boolean DEFAULT false;

UPDATE fedex_status_codes
SET is_exception_code = true
WHERE code IN (
  '001',
  '002',
  '003',
  '004',
  '006',
  '007',
  '010',
  '011',
  '012',
  '015',
  '016',
  '017',
  '027',
  '030',
  '034',
  '079',
  '081',
  '082',
  '083',
  '095',
  '100',
  '250',
  'P01',
  'P10',
  'P11',
  'P14',
  'P15',
  'P16',
  'P17',
  'P21',
  'P24',
  'P25',
  'P26'
);

UPDATE fedex_status_codes
SET is_exception_code = false
WHERE code IN ('009', '013', '014', '018', '019', '021', '025', '026', '028', '029');
