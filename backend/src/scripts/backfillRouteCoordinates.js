require('dotenv').config();

const supabase = require('../lib/supabase');
const { isUsableCoordinate } = require('../services/coordinates');
const { applyLocationCorrectionsToStops } = require('../services/locationCorrections');
const { enrichManifestStopsWithGeocoding } = require('../services/manifestGeocoding');

async function main() {
  const routeId = process.argv[2];

  if (!routeId) {
    throw new Error('Usage: node src/scripts/backfillRouteCoordinates.js <route-id>');
  }

  const { data: route, error: routeError } = await supabase
    .from('routes')
    .select('id, account_id, work_area_name, date')
    .eq('id', routeId)
    .maybeSingle();

  if (routeError) {
    throw routeError;
  }

  if (!route) {
    throw new Error(`Route not found: ${routeId}`);
  }

  const { data: stops, error: stopsError } = await supabase
    .from('stops')
    .select('id, sequence_order, address, address_line2, lat, lng, geocode_source, geocode_accuracy')
    .eq('route_id', routeId)
    .order('sequence_order', { ascending: true });

  if (stopsError) {
    throw stopsError;
  }

  const correctedStops = await applyLocationCorrectionsToStops(supabase, route.account_id, stops || []);
  const geocoded = await enrichManifestStopsWithGeocoding(supabase, route.account_id, correctedStops);

  let updated = 0;

  for (const stop of geocoded.stops) {
    if (!isUsableCoordinate(stop.lat, stop.lng)) {
      continue;
    }

    const { error } = await supabase
      .from('stops')
      .update({
        lat: stop.lat,
        lng: stop.lng,
        geocode_source: stop.geocode_source || 'manifest_geocoded',
        geocode_accuracy: stop.geocode_accuracy || 'approximate'
      })
      .eq('id', stop.id);

    if (error) {
      throw error;
    }

    updated += 1;
  }

  console.log(JSON.stringify({
    route_id: route.id,
    work_area_name: route.work_area_name,
    date: route.date,
    total_stops: stops.length,
    updated,
    geocoding: geocoded.summary
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
