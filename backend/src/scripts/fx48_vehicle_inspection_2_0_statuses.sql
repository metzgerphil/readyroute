alter table public.vehicle_inspections
  drop constraint if exists vehicle_inspections_status_check,
  add constraint vehicle_inspections_status_check
    check (status in (
      'submitted',
      'needs_review',
      'safe_to_operate',
      'safe_with_maintenance_reported',
      'manager_review_required',
      'urgent_manager_review',
      'reviewed'
    ));

