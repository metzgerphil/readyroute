create table if not exists public.safety_focuses (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  source text,
  bullets text[] not null default '{}'::text[],
  takeaway text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_safety_focuses_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists safety_focuses_set_updated_at on public.safety_focuses;
create trigger safety_focuses_set_updated_at
before update on public.safety_focuses
for each row
execute function public.set_safety_focuses_updated_at();

insert into public.safety_focuses (slug, title, source, bullets, takeaway, sort_order, is_active)
values
  (
    'pretrip',
    'Pre-trip finds problems before the road does',
    'Driver Safety Guidebook: Pre-trip Inspection',
    array[
      'Complete a pre-trip for every vehicle you drive that day, not just the first truck you touch.',
      'Verify the basics before rolling: reflective triangles, fire extinguisher, required documents, and spare fuses.',
      'Check tires, leaks, lights, mirrors, brakes, and windshield while the truck is still parked.'
    ],
    'Skipped inspections lead to missed defects, fines, and unsafe breakdowns later in the day.',
    10,
    true
  ),
  (
    'loading',
    'Load the truck so your next stop is safer and faster',
    'Driver Safety Guidebook: Loading Safety',
    array[
      'Keep aisleways clear and as much freight on the shelves as possible to reduce trip hazards.',
      'Pull the next few stops toward the rear so you are not climbing through boxes at every delivery.',
      'Check weight labels before lifting and keep the load close while lifting with your legs, not your back.'
    ],
    'Good loading prevents falls, damaged packages, and avoidable lifting injuries.',
    20,
    true
  ),
  (
    'weather',
    'Rain and slick roads demand more space, not more confidence',
    'Driver Safety Guidebook: Rain, Cold Weather, and Hydroplaning',
    array[
      'The first 10 minutes of rain are especially slick because oil and water mix on the roadway.',
      'Slow down, increase following distance, and treat standing water as a hydroplaning risk.',
      'Never use cruise control in wet, snowy, or icy conditions.'
    ],
    'Traction disappears before most drivers realize it, so adjust early.',
    30,
    true
  ),
  (
    'following-distance',
    'Build a real following gap before you need it',
    'Driver Safety Guidebook: Spatial Awareness',
    array[
      'Below 40 mph, leave at least 1 second for every 10 feet of vehicle length.',
      'Above 40 mph, add one extra second to that gap.',
      'Use a fixed roadside object to count your spacing instead of guessing by feel.'
    ],
    'Stopping distance grows fast. A short lapse in space can erase your time to react.',
    40,
    true
  ),
  (
    'seatbelt-distraction',
    'Seatbelt on, distractions off, before the truck moves',
    'Driver Safety Guidebook: Seatbelt Safety and Distracted Driving',
    array[
      'Seatbelts are required for the driver and passengers.',
      'Phones, route sheets, eating, radio adjustments, and daydreaming all count as distracted driving.',
      'If you need to read, type, search, or sort something, do it while stopped.'
    ],
    'Distraction delays perception and decision-making, which is where preventable crashes start.',
    50,
    true
  ),
  (
    'backing',
    'Avoid backing when you can. Slow it down when you cannot.',
    'Driver Safety Guidebook: Backing and Parking Safety',
    array[
      'If curb parking or a pull-through option exists, use it instead of backing into avoidable risk.',
      'Before backing, do a visual sweep, turn on hazard lights, and scan mirrors and blind spots continuously.',
      'If the path, clearance, or pedestrians are uncertain, stop and reevaluate before moving another foot.'
    ],
    'Most backing crashes come from unseen obstacles or poor technique, both of which are preventable.',
    60,
    true
  ),
  (
    'clearance',
    'Roof damage usually starts with one bad clearance guess',
    'Driver Safety Guidebook: Overhead Clearance',
    array[
      'Know your vehicle height before the route starts.',
      'If it looks close, get out and walk the clearance instead of trying to save a few steps.',
      'Avoid overhangs and pass-throughs when the maneuver risk is higher than the convenience.'
    ],
    'Overhead strikes are frequent, expensive, and usually avoidable.',
    70,
    true
  ),
  (
    'security',
    'Secure the truck and stay alert to the scene around it',
    'Driver Safety Guidebook: Driver Communication, Road Rage, and Vehicle Security',
    array[
      'Lock the vehicle when doors are not in use and never leave it running unattended.',
      'Park in a visible area, survey the people and activity around you, and move if the situation feels unsafe.',
      'If another driver escalates, do not engage. Let them go, maintain your lane, and call 911 if danger continues.'
    ],
    'Safety drops fast when frustration or convenience starts making decisions for you.',
    80,
    true
  ),
  (
    'company-vehicle-basics',
    'Company vehicles are for authorized route work only',
    'Employee Safety and Operation Handbook: Company Vehicles and Driver Safety',
    array[
      'Operate only vehicles you are authorized to drive.',
      'No side trips, personal use, unauthorized riders, or hitchhikers.',
      'Wear your seat belt whenever the vehicle is moving and follow traffic signs and laws.'
    ],
    'A route vehicle is work equipment. Keep every mile tied to the route and every passenger authorized.',
    90,
    true
  ),
  (
    'pretrip-do-not-drive-defects',
    'If a safety check fails, do not leave the terminal',
    'Employee Safety and Operation Handbook: Pre-trip and Post-trip Inspection',
    array[
      'Check brakes, lights, wipers, horn, mirrors, fluids, tires, steering, exterior condition, and backup camera before loading.',
      'If any check fails, call a supervisor before driving.',
      'Never drive a truck you know is unsafe, even if it delays the route.'
    ],
    'A late route is better than leaving in a vehicle with known defects.',
    100,
    true
  ),
  (
    'secure-cargo-lifting',
    'Secure freight and lift with your legs',
    'Employee Safety and Operation Handbook: In-Vehicle Safety',
    array[
      'Load packages so they do not shift or fall during transit.',
      'Keep your line of sight clear when carrying packages.',
      'Squat close to the load, keep it close, lift with your legs, and move your feet instead of twisting.'
    ],
    'Most in-vehicle injuries start with shifting packages, blocked vision, or rushed lifting.',
    110,
    true
  ),
  (
    'parking-brake-every-time',
    'Set the parking brake every time',
    'Employee Safety and Operation Handbook: On-road and Delivery Precautions',
    array[
      'Use the parking brake at every stop, even quick stops.',
      'Never text or talk while driving; pull over before calling or typing.',
      'If the truck develops a mechanical problem during the day, call a supervisor and do not drive a loaded truck to a repair shop.'
    ],
    'Small habits at every stop prevent the biggest avoidable incidents.',
    120,
    true
  ),
  (
    'customer-property-and-secure-release',
    'Protect packages without risking property damage',
    'Employee Safety and Operation Handbook: Delivery and Driving',
    array[
      'Avoid driving onto customer property when street parking and walking the package is safer.',
      'Leave packages in a secure location out of sight and protected from weather.',
      'Do not release packages in unsafe or high-theft areas.'
    ],
    'A good delivery protects the package, the customer property, and the driver.',
    130,
    true
  ),
  (
    'overhang-clearance',
    'Do not guess under overhangs',
    'Employee Safety and Operation Handbook: Delivery and Driving',
    array[
      'Stop before the overhang.',
      'Turn the truck off and apply the parking brake.',
      'Get out and visually confirm clearance before proceeding.'
    ],
    'Clearance guesses are expensive. Stop, secure the truck, and look.',
    140,
    true
  ),
  (
    'unable-to-locate',
    'If you cannot find an address, call before abandoning the stop',
    'Employee Safety and Operation Handbook: On-road Safety',
    array[
      'Call your supervisor or terminal when an address cannot be located.',
      'Do not guess on house numbers or street signs.',
      'Resolve delivery questions before scanning the stop as unsuccessful.'
    ],
    'A quick call prevents service failures, wrong deliveries, and avoidable complaints.',
    150,
    true
  ),
  (
    'hours-of-service',
    'Know the hours-of-service limits before the day gets long',
    'Employee Safety and Operation Handbook: Hours of Service',
    array[
      'Do not drive beyond the applicable daily drive-time limit.',
      'Do not drive past the on-duty limit after coming on duty.',
      'If anyone asks you to violate safety or hours rules, stop and call a manager.'
    ],
    'Fatigue and rule pressure are safety issues; escalate before they become incidents.',
    160,
    true
  ),
  (
    'hazmat-acceptance',
    'Hazmat requires correct documents and safe handling',
    'Employee Safety and Operation Handbook: Hazmat',
    array[
      'Do not accept improperly prepared hazardous material packages.',
      'Confirm required labels, shipping papers, package count, weight, and shipper signature/date.',
      'Keep hazmat packages upright, braced, and handled according to station process.'
    ],
    'Hazmat mistakes create safety, compliance, and settlement risk. Slow down and verify.',
    170,
    true
  )
on conflict (slug) do update set
  title = excluded.title,
  source = excluded.source,
  bullets = excluded.bullets,
  takeaway = excluded.takeaway,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();
