#!/usr/bin/env node

const { execFileSync } = require('node:child_process');

const projectId = process.env.GCP_PROJECT_ID || 'ready-route-project';
const alertEmail = String(process.env.ALERT_EMAIL || '').trim();
const serviceName = process.env.GCP_CLOUD_RUN_SERVICE || 'readyroute-api';
const apiRoot = `https://monitoring.googleapis.com/v3/projects/${projectId}`;

if (!alertEmail) {
  console.error('Set ALERT_EMAIL to the ReadyRoute operations address.');
  process.exit(1);
}

const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();

async function api(path, options = {}) {
  const response = await fetch(`${apiRoot}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

async function ensureNotificationChannel() {
  const list = await api('/notificationChannels');
  const existing = (list.notificationChannels || []).find((channel) => (
    channel.type === 'email' && channel.labels?.email_address === alertEmail
  ));
  if (existing) return existing;

  return api('/notificationChannels', {
    method: 'POST',
    body: JSON.stringify({
      type: 'email',
      displayName: 'ReadyRoute operations email',
      description: 'Production availability and backend error alerts.',
      labels: { email_address: alertEmail },
      enabled: true
    })
  });
}

async function ensureUptimeCheck(definition) {
  const list = await api('/uptimeCheckConfigs');
  const existing = (list.uptimeCheckConfigs || []).find((check) => check.displayName === definition.displayName);
  if (existing) return existing;

  return api('/uptimeCheckConfigs', {
    method: 'POST',
    body: JSON.stringify({
      displayName: definition.displayName,
      monitoredResource: {
        type: 'uptime_url',
        labels: { project_id: projectId, host: definition.host }
      },
      httpCheck: {
        requestMethod: 'GET',
        path: definition.path,
        port: 443,
        useSsl: true,
        validateSsl: true,
        acceptedResponseStatusCodes: [{ statusClass: 'STATUS_CLASS_2XX' }]
      },
      period: '60s',
      timeout: '10s',
      checkerType: 'STATIC_IP_CHECKERS'
    })
  });
}

async function ensureAlertPolicy(displayName, body) {
  const list = await api('/alertPolicies');
  const existing = (list.alertPolicies || []).find((policy) => policy.displayName === displayName);
  if (existing) return existing;

  return api('/alertPolicies', {
    method: 'POST',
    body: JSON.stringify({ displayName, enabled: true, combiner: 'OR', ...body })
  });
}

function uptimePolicy(check, channelName) {
  const checkId = check.name.split('/').at(-1);
  return {
    notificationChannels: [channelName],
    documentation: {
      content: `${check.displayName} has failed public availability checks for at least two minutes.`,
      mimeType: 'text/markdown'
    },
    alertStrategy: { autoClose: '1800s' },
    conditions: [{
      displayName: `${check.displayName} unavailable`,
      conditionThreshold: {
        filter: `resource.type = "uptime_url" AND metric.type = "monitoring.googleapis.com/uptime_check/check_passed" AND metric.labels.check_id = "${checkId}"`,
        comparison: 'COMPARISON_LT',
        thresholdValue: 1,
        duration: '120s',
        aggregations: [{ alignmentPeriod: '60s', perSeriesAligner: 'ALIGN_FRACTION_TRUE' }],
        trigger: { count: 1 }
      }
    }]
  };
}

function cloudRunErrorPolicy(channelName) {
  return {
    notificationChannels: [channelName],
    documentation: {
      content: `Cloud Run service ${serviceName} returned one or more HTTP 5xx responses within five minutes. Use the request ID in Cloud Logging to trace the failure.`,
      mimeType: 'text/markdown'
    },
    alertStrategy: { autoClose: '1800s' },
    conditions: [{
      displayName: `${serviceName} returned 5xx responses`,
      conditionThreshold: {
        filter: `resource.type = "cloud_run_revision" AND resource.labels.service_name = "${serviceName}" AND metric.type = "run.googleapis.com/request_count" AND metric.labels.response_code_class = "5xx"`,
        comparison: 'COMPARISON_GT',
        thresholdValue: 0,
        duration: '0s',
        aggregations: [{
          alignmentPeriod: '300s',
          perSeriesAligner: 'ALIGN_DELTA',
          crossSeriesReducer: 'REDUCE_SUM',
          groupByFields: ['resource.labels.service_name']
        }],
        trigger: { count: 1 }
      }
    }]
  };
}

async function main() {
  const channel = await ensureNotificationChannel();
  const uptimeDefinitions = [
    { displayName: 'ReadyRoute API readiness', host: 'api.readyroute.org', path: '/health/ready' },
    { displayName: 'ReadyRoute manager portal', host: 'portal.readyroute.org', path: '/' },
    { displayName: 'ReadyRoute website', host: 'readyroute.org', path: '/' }
  ];

  for (const definition of uptimeDefinitions) {
    const check = await ensureUptimeCheck(definition);
    await ensureAlertPolicy(`${definition.displayName} alert`, uptimePolicy(check, channel.name));
    console.log(`Monitoring enabled: ${definition.displayName}`);
  }

  await ensureAlertPolicy('ReadyRoute API 5xx alert', cloudRunErrorPolicy(channel.name));
  console.log(`Monitoring enabled: ${serviceName} 5xx responses`);
  console.log(`Notification channel: ${channel.verificationStatus || 'verification status unavailable'}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
