require('dotenv').config();

const supabase = require('../lib/supabase');
const { isUsableCoordinate } = require('../services/coordinates');

async function main() {
  const date = process.argv[2] || null;

  let routeQuery = supabase
    .from('routes')
    .select('id, work_area_name, date');

  if (date) {
    routeQuery = routeQuery.eq('date', date);
  }

  const { data: routes, error: routeError } = await routeQuery;

  if (routeError) {
    throw routeError;
  }

  const routeIds = (routes || []).map((route) => route.id);

  if (!routeIds.length) {
    console.log(JSON.stringify({ routes: 0, updatedStops: 0 }, null, 2));
    return;
  }

  const { data: stops, error: stopError } = await supabase
    .from('stops')
    .select('id, route_id, lat, lng, geocode_source, geocode_accuracy')
    .in('route_id', routeIds);

  if (stopError) {
    throw stopError;
  }

  const invalidStops = (stops || []).filter(
    (stop) => stop.lat != null && stop.lng != null && !isUsableCoordinate(stop.lat, stop.lng)
  );

  let updatedStops = 0;

  for (const stop of invalidStops) {
    const { error } = await supabase
      .from('stops')
      .update({
        lat: null,
        lng: null,
        geocode_source: null,
        geocode_accuracy: null
      })
      .eq('id', stop.id);

    if (error) {
      throw error;
    }

    updatedStops += 1;
  }

  console.log(JSON.stringify({
    routes: routeIds.length,
    updatedStops,
    scope: date || 'all-dates'
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
