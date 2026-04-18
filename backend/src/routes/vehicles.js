const express = require('express');

const defaultSupabase = require('../lib/supabase');
const { requireManager } = require('../middleware/auth');

function getCurrentDateString(now = new Date(), timeZone = process.env.APP_TIME_ZONE || 'America/Los_Angeles') {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

function toInteger(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function toNumeric(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapLatestMaintenance(records) {
  return (records || []).reduce((map, record) => {
    const existing = map.get(record.vehicle_id);

    if (!existing || String(record.service_date) > String(existing.service_date)) {
      map.set(record.vehicle_id, record);
    }

    return map;
  }, new Map());
}

function buildAssignmentMap(routes, driversById) {
  return (routes || []).reduce((map, route) => {
    if (!route.vehicle_id) {
      return map;
    }

    const driver = route.driver_id ? driversById.get(route.driver_id) || null : null;
    map.set(route.vehicle_id, {
      driver_id: route.driver_id || null,
      driver_name: driver?.name || null,
      route_id: route.id,
      work_area_name: route.work_area_name || null,
      route_status: route.status || null
    });
    return map;
  }, new Map());
}

async function loadOwnedVehicle(supabase, { vehicleId, accountId }) {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .eq('id', vehicleId)
    .eq('account_id', accountId)
    .maybeSingle();

  return { data, error };
}

function createVehiclesRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const nowProvider = options.now || (() => new Date());

  router.get('/', requireManager, async (req, res) => {
    const today = getCurrentDateString(nowProvider());

    try {
      const { data: vehicles, error: vehiclesError } = await supabase
        .from('vehicles')
        .select('*')
        .eq('account_id', req.account.account_id)
        .order('name');

      if (vehiclesError) {
        console.error('Vehicles lookup failed:', vehiclesError);
        return res.status(500).json({ error: 'Failed to load vehicles' });
      }

      const vehicleIds = (vehicles || []).map((vehicle) => vehicle.id);
      let maintenanceByVehicleId = new Map();
      let assignmentsByVehicleId = new Map();

      if (vehicleIds.length > 0) {
        const { data: maintenanceRows, error: maintenanceError } = await supabase
          .from('vehicle_maintenance')
          .select('*')
          .eq('account_id', req.account.account_id)
          .in('vehicle_id', vehicleIds)
          .order('service_date', { ascending: false });

        if (maintenanceError) {
          console.error('Vehicle maintenance lookup failed:', maintenanceError);
          return res.status(500).json({ error: 'Failed to load vehicle maintenance' });
        }

        maintenanceByVehicleId = mapLatestMaintenance(maintenanceRows);

        const { data: routeAssignments, error: assignmentsError } = await supabase
          .from('routes')
          .select('id, vehicle_id, driver_id, work_area_name, status')
          .eq('account_id', req.account.account_id)
          .eq('date', today)
          .in('vehicle_id', vehicleIds);

        if (assignmentsError) {
          console.error('Vehicle assignment lookup failed:', assignmentsError);
          return res.status(500).json({ error: 'Failed to load vehicle assignments' });
        }

        const driverIds = [...new Set((routeAssignments || []).map((route) => route.driver_id).filter(Boolean))];
        let driversById = new Map();

        if (driverIds.length > 0) {
          const { data: drivers, error: driversError } = await supabase
            .from('drivers')
            .select('id, name')
            .eq('account_id', req.account.account_id)
            .in('id', driverIds);

          if (driversError) {
            console.error('Vehicle assignment driver lookup failed:', driversError);
            return res.status(500).json({ error: 'Failed to load vehicle assignments' });
          }

          driversById = new Map((drivers || []).map((driver) => [driver.id, driver]));
        }

        assignmentsByVehicleId = buildAssignmentMap(routeAssignments, driversById);
      }

      return res.status(200).json({
        vehicles: (vehicles || []).map((vehicle) => {
          const nextServiceMileage = toInteger(vehicle.next_service_mileage);
          const currentMileage = toInteger(vehicle.current_mileage) || 0;
          const serviceDue = Number.isInteger(nextServiceMileage)
            ? currentMileage >= nextServiceMileage - 500
            : false;

          return {
            ...vehicle,
            latest_maintenance: maintenanceByVehicleId.get(vehicle.id) || null,
            today_assignment: assignmentsByVehicleId.get(vehicle.id) || null,
            service_due: serviceDue
          };
        })
      });
    } catch (error) {
      console.error('Vehicles endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load vehicles' });
    }
  });

  router.get('/due-soon', requireManager, async (req, res) => {
    try {
      const { data: vehicles, error } = await supabase
        .from('vehicles')
        .select('*')
        .eq('account_id', req.account.account_id)
        .order('name');

      if (error) {
        console.error('Vehicles due-soon lookup failed:', error);
        return res.status(500).json({ error: 'Failed to load vehicles due for service' });
      }

      const dueSoon = (vehicles || []).filter((vehicle) => {
        const nextServiceMileage = toInteger(vehicle.next_service_mileage);
        const currentMileage = toInteger(vehicle.current_mileage) || 0;
        return Number.isInteger(nextServiceMileage) && currentMileage >= nextServiceMileage - 500;
      });

      return res.status(200).json({ vehicles: dueSoon });
    } catch (error) {
      console.error('Vehicles due-soon endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load vehicles due for service' });
    }
  });

  router.post('/', requireManager, async (req, res) => {
    const {
      name,
      make,
      model,
      year,
      plate,
      current_mileage: currentMileage
    } = req.body || {};

    const parsedYear = toInteger(year);
    const parsedCurrentMileage = currentMileage === undefined ? 0 : toInteger(currentMileage);

    if (!name || !make || !model || parsedYear === null || !plate || parsedCurrentMileage === null) {
      return res.status(400).json({ error: 'name, make, model, year, and plate are required' });
    }

    try {
      const { data: vehicle, error } = await supabase
        .from('vehicles')
        .insert({
          account_id: req.account.account_id,
          name: String(name).trim(),
          make: String(make).trim(),
          model: String(model).trim(),
          year: parsedYear,
          plate: String(plate).trim(),
          current_mileage: parsedCurrentMileage
        })
        .select('id')
        .single();

      if (error) {
        console.error('Vehicle creation failed:', error);
        return res.status(500).json({ error: 'Failed to create vehicle' });
      }

      return res.status(201).json({ vehicle_id: vehicle.id });
    } catch (error) {
      console.error('Vehicle creation endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to create vehicle' });
    }
  });

  router.put('/:id', requireManager, async (req, res) => {
    const vehicleId = req.params.id;
    const allowedFields = ['name', 'make', 'model', 'year', 'plate', 'current_mileage', 'notes', 'is_active'];
    const payload = {};

    for (const field of allowedFields) {
      if (!(field in (req.body || {}))) {
        continue;
      }

      if (field === 'year' || field === 'current_mileage') {
        const parsed = toInteger(req.body[field]);
        if (parsed === null) {
          return res.status(400).json({ error: `${field} must be an integer` });
        }

        payload[field] = parsed;
        continue;
      }

      if (field === 'is_active') {
        if (typeof req.body[field] !== 'boolean') {
          return res.status(400).json({ error: 'is_active must be a boolean' });
        }

        payload[field] = req.body[field];
        continue;
      }

      payload[field] = req.body[field] === null ? null : String(req.body[field]).trim();
    }

    if (!Object.keys(payload).length) {
      return res.status(400).json({ error: 'At least one vehicle field is required' });
    }

    try {
      const { data: vehicle, error: vehicleError } = await loadOwnedVehicle(supabase, {
        vehicleId,
        accountId: req.account.account_id
      });

      if (vehicleError) {
        console.error('Vehicle update lookup failed:', vehicleError);
        return res.status(500).json({ error: 'Failed to validate vehicle' });
      }

      if (!vehicle) {
        return res.status(403).json({ error: 'Vehicle does not belong to this account' });
      }

      const { error: updateError } = await supabase
        .from('vehicles')
        .update(payload)
        .eq('id', vehicleId);

      if (updateError) {
        console.error('Vehicle update failed:', updateError);
        return res.status(500).json({ error: 'Failed to update vehicle' });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error('Vehicle update endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to update vehicle' });
    }
  });

  router.post('/:id/maintenance', requireManager, async (req, res) => {
    const vehicleId = req.params.id;
    const {
      service_date: serviceDate,
      description,
      cost,
      mileage_at_service: mileageAtService,
      next_service_mileage: nextServiceMileage
    } = req.body || {};

    const parsedCost = cost === undefined ? null : toNumeric(cost);
    const parsedMileageAtService = toInteger(mileageAtService);
    const parsedNextServiceMileage = nextServiceMileage === undefined || nextServiceMileage === null || nextServiceMileage === ''
      ? null
      : toInteger(nextServiceMileage);

    if (!serviceDate || !description) {
      return res.status(400).json({ error: 'service_date and description are required' });
    }

    if (cost !== undefined && parsedCost === null) {
      return res.status(400).json({ error: 'cost must be numeric' });
    }

    if (mileageAtService !== undefined && parsedMileageAtService === null) {
      return res.status(400).json({ error: 'mileage_at_service must be an integer' });
    }

    if (nextServiceMileage !== undefined && parsedNextServiceMileage === null) {
      return res.status(400).json({ error: 'next_service_mileage must be an integer' });
    }

    try {
      const { data: vehicle, error: vehicleError } = await loadOwnedVehicle(supabase, {
        vehicleId,
        accountId: req.account.account_id
      });

      if (vehicleError) {
        console.error('Vehicle maintenance lookup failed:', vehicleError);
        return res.status(500).json({ error: 'Failed to validate vehicle' });
      }

      if (!vehicle) {
        return res.status(403).json({ error: 'Vehicle does not belong to this account' });
      }

      const insertPayload = {
        vehicle_id: vehicleId,
        account_id: req.account.account_id,
        service_date: serviceDate,
        description: String(description).trim(),
        cost: parsedCost,
        mileage_at_service: parsedMileageAtService,
        next_service_mileage: parsedNextServiceMileage
      };

      const { data: maintenance, error: maintenanceError } = await supabase
        .from('vehicle_maintenance')
        .insert(insertPayload)
        .select('id')
        .single();

      if (maintenanceError) {
        console.error('Vehicle maintenance insert failed:', maintenanceError);
        return res.status(500).json({ error: 'Failed to save vehicle maintenance' });
      }

      const currentMileage = toInteger(vehicle.current_mileage) || 0;
      const lastServiceMileage = toInteger(vehicle.last_service_mileage);
      const updatePayload = {};

      if (
        parsedMileageAtService !== null &&
        (lastServiceMileage === null || parsedMileageAtService > lastServiceMileage)
      ) {
        updatePayload.last_service_date = serviceDate;
        updatePayload.last_service_mileage = parsedMileageAtService;
        updatePayload.next_service_mileage = parsedNextServiceMileage;
      }

      if (parsedMileageAtService !== null && parsedMileageAtService > currentMileage) {
        updatePayload.current_mileage = parsedMileageAtService;
      }

      if (Object.keys(updatePayload).length) {
        const { error: updateError } = await supabase
          .from('vehicles')
          .update(updatePayload)
          .eq('id', vehicleId);

        if (updateError) {
          console.error('Vehicle maintenance vehicle update failed:', updateError);
          return res.status(500).json({ error: 'Failed to update vehicle after maintenance' });
        }
      }

      return res.status(201).json({ maintenance_id: maintenance.id });
    } catch (error) {
      console.error('Vehicle maintenance endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to save vehicle maintenance' });
    }
  });

  router.get('/:id/maintenance', requireManager, async (req, res) => {
    const vehicleId = req.params.id;

    try {
      const { data: vehicle, error: vehicleError } = await loadOwnedVehicle(supabase, {
        vehicleId,
        accountId: req.account.account_id
      });

      if (vehicleError) {
        console.error('Vehicle maintenance history lookup failed:', vehicleError);
        return res.status(500).json({ error: 'Failed to validate vehicle' });
      }

      if (!vehicle) {
        return res.status(403).json({ error: 'Vehicle does not belong to this account' });
      }

      const { data: history, error: historyError } = await supabase
        .from('vehicle_maintenance')
        .select('*')
        .eq('account_id', req.account.account_id)
        .eq('vehicle_id', vehicleId)
        .order('service_date', { ascending: false });

      if (historyError) {
        console.error('Vehicle maintenance history query failed:', historyError);
        return res.status(500).json({ error: 'Failed to load maintenance history' });
      }

      return res.status(200).json({ maintenance: history || [] });
    } catch (error) {
      console.error('Vehicle maintenance history endpoint failed:', error);
      return res.status(500).json({ error: 'Failed to load maintenance history' });
    }
  });

  return router;
}

module.exports = createVehiclesRouter();
module.exports.createVehiclesRouter = createVehiclesRouter;
