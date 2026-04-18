ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS delivery_type_code text,
  ADD COLUMN IF NOT EXISTS signer_name text,
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS age_confirmed boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS fedex_status_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  category_label text NOT NULL,
  affects_service_score boolean DEFAULT false,
  requires_warning boolean DEFAULT false,
  is_pickup_code boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fedex_status_codes_code_idx
ON fedex_status_codes(code);

INSERT INTO fedex_status_codes (code, description, category, category_label, affects_service_score) VALUES
('011', 'Non Res. Recipient Closed on Sat.', '1', 'Delivery Not Attempted', false),
('012', 'Package Sorted to Wrong Route', '1', 'Delivery Not Attempted', false),
('015', 'Holding Package', '1', 'Delivery Not Attempted', false),
('016', 'Package on Manifest, Not on Van', '1', 'Delivery Not Attempted', false),
('017', 'Misdelivered Package Picked Up', '1', 'Delivery Not Attempted', false),
('027', 'Package Not Delivered - No Attempt', '1', 'Delivery Not Attempted', false),
('079', 'Enroute Package Transfer', '1', 'Delivery Not Attempted', false),
('081', 'Contractor Refused Package', '1', 'Delivery Not Attempted', false),
('082', 'Local Weather Delay', '1', 'Delivery Not Attempted', false),
('083', 'Delivery Restrict / Local Holiday', '1', 'Delivery Not Attempted', false),
('095', 'Intra-FedEx Transfer', '1', 'Delivery Not Attempted', false),
('100', 'Customer Request - No Attempt Made', '1', 'Delivery Not Attempted', false)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  category_label = EXCLUDED.category_label,
  affects_service_score = EXCLUDED.affects_service_score,
  requires_warning = EXCLUDED.requires_warning,
  is_pickup_code = EXCLUDED.is_pickup_code;

INSERT INTO fedex_status_codes (code, description, category, category_label, affects_service_score, requires_warning) VALUES
('001', 'Customer Security Delay', '2', 'Delivery Attempted, Not Completed', true, false),
('002', 'Incorrect Recipient Address', '2', 'Delivery Attempted, Not Completed', true, true),
('003', 'Unable to Locate - Recipient Address', '2', 'Delivery Attempted, Not Completed', true, false),
('004', 'Non-Residential Recipient Not In', '2', 'Delivery Attempted, Not Completed', true, false),
('006', 'Package Refused by Recipient', '2', 'Delivery Attempted, Not Completed', true, false),
('007', 'Res. Recipient Not In, Unable to Indir/DrRel', '2', 'Delivery Attempted, Not Completed', true, false),
('010', 'Inspection Required', '2', 'Delivery Attempted, Not Completed', true, false),
('030', 'Retail Refusal / O.S.A.', '2', 'Delivery Attempted, Not Completed', true, false),
('034', 'Inventory / Request Future Delivery', '2', 'Delivery Attempted, Not Completed', true, false),
('250', 'Unable to Hold at Location', '2', 'Delivery Attempted, Not Completed', true, false)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  category_label = EXCLUDED.category_label,
  affects_service_score = EXCLUDED.affects_service_score,
  requires_warning = EXCLUDED.requires_warning,
  is_pickup_code = EXCLUDED.is_pickup_code;

INSERT INTO fedex_status_codes (code, description, category, category_label, affects_service_score) VALUES
('009', 'Delivery to a Business', '3', 'Delivery Completed', false),
('013', 'Residential Delivery with Signature', '3', 'Delivery Completed', false),
('014', 'Residence Driver Release', '3', 'Delivery Completed', false),
('018', 'Misdelivered Package Delivered to Correct Recipient', '3', 'Delivery Completed', false),
('019', 'Indirect Delivery', '3', 'Delivery Completed', false),
('021', 'Business Driver Release', '3', 'Delivery Completed', false),
('025', 'Tendered to US Postal Service', '3', 'Delivery Completed', false),
('026', 'RTS Package - Delivered to Shipper', '3', 'Delivery Completed', false),
('028', 'Tendered to Connecting Line Carrier', '3', 'Delivery Completed', false),
('029', 'Call Tag Package Pickup', '3', 'Delivery Completed', false)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  category_label = EXCLUDED.category_label,
  affects_service_score = EXCLUDED.affects_service_score,
  requires_warning = EXCLUDED.requires_warning,
  is_pickup_code = EXCLUDED.is_pickup_code;

INSERT INTO fedex_status_codes (code, description, category, category_label, is_pickup_code) VALUES
('P01', 'Missed Pickup - DNA', 'P1', 'Pickup Not Attempted', true),
('P14', 'Weather', 'P1', 'Pickup Not Attempted', true),
('P16', 'Holiday / Contingency / Local Event', 'P1', 'Pickup Not Attempted', true),
('P17', 'Hazmat', 'P1', 'Pickup Not Attempted', true),
('P24', 'Pickup Cancelled - No Attempt Made', 'P1', 'Pickup Not Attempted', true),
('P25', 'Wrong Address - Pickup Not Made', 'P1', 'Pickup Not Attempted', true)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  category_label = EXCLUDED.category_label,
  affects_service_score = EXCLUDED.affects_service_score,
  requires_warning = EXCLUDED.requires_warning,
  is_pickup_code = EXCLUDED.is_pickup_code;

INSERT INTO fedex_status_codes (code, description, category, category_label, is_pickup_code) VALUES
('P10', 'Pickup Not Ready', 'P2', 'Pickup Attempted, Not Completed', true),
('P11', 'Closed - Attempted, No Packages', 'P2', 'Pickup Attempted, Not Completed', true),
('P15', 'Residential Pickup, Not Home', 'P2', 'Pickup Attempted, Not Completed', true),
('P21', 'Express Pickup - Cancel', 'P2', 'Pickup Attempted, Not Completed', true),
('P26', 'Pickup Not Scanned', 'P2', 'Pickup Attempted, Not Completed', true)
ON CONFLICT (code) DO UPDATE SET
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  category_label = EXCLUDED.category_label,
  affects_service_score = EXCLUDED.affects_service_score,
  requires_warning = EXCLUDED.requires_warning,
  is_pickup_code = EXCLUDED.is_pickup_code;
