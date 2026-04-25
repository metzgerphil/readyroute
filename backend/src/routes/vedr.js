const express = require('express');

const defaultSupabase = require('../lib/supabase');
const {
  PRIVILEGED_MANAGER_ROLES,
  VEDR_CONNECTION_STATUSES
} = require('../config/constants');
const {
  presentVedrSettings,
  validateVedrSettingsPayload
} = require('../services/vedrSettings');

function canManageVedr(req) {
  const managerRole = String(req.account?.manager_role || 'owner').trim().toLowerCase();
  return PRIVILEGED_MANAGER_ROLES.includes(managerRole);
}

function requireVedrAdminAccess(req, res, next) {
  if (!canManageVedr(req)) {
    return res.status(403).json({ error: 'Admin or owner access required' });
  }

  return next();
}

function createEmptyVedrSettings() {
  return {
    provider: null,
    provider_login_url: null,
    provider_username_hint: null,
    connection_status: VEDR_CONNECTION_STATUSES.NOT_STARTED,
    provider_selected_at: null,
    connection_started_at: null,
    connection_verified_at: null,
    setup_completed_at: null
  };
}

function createVedrRouter(options = {}) {
  const router = express.Router();
  const supabase = options.supabase || defaultSupabase;
  const now = typeof options.now === 'function' ? options.now : () => new Date();

  router.get('/settings', requireVedrAdminAccess, async (req, res) => {
    try {
      const { data, error } = await supabase
        .from('vedr_settings')
        .select('id, account_id, provider, provider_login_url, provider_username_hint, connection_status, provider_selected_at, connection_started_at, connection_verified_at, setup_completed_at, created_at, updated_at')
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (error) {
        console.error('Failed to load VEDR settings:', error);
        return res.status(500).json({ error: 'Failed to load VEDR settings' });
      }

      if (!data) {
        return res.status(200).json(createEmptyVedrSettings());
      }

      const settings = presentVedrSettings(data);
      return res.status(200).json(settings);
    } catch (error) {
      console.error('Unhandled GET /api/vedr/settings error:', error);
      return res.status(500).json({ error: 'Failed to load VEDR settings' });
    }
  });

  router.put('/settings', requireVedrAdminAccess, async (req, res) => {
    try {
      const validation = validateVedrSettingsPayload({
        account_id: req.account.account_id,
        provider: req.body?.provider,
        provider_login_url: req.body?.provider_login_url,
        provider_username_hint: req.body?.provider_username_hint
      });

      if (!validation.valid) {
        return res.status(400).json({ error: 'Invalid VEDR settings', details: validation.errors });
      }

      const { data: existingSettings, error: lookupError } = await supabase
        .from('vedr_settings')
        .select('id, account_id, provider, provider_login_url, provider_username_hint, connection_status, provider_selected_at, connection_started_at, connection_verified_at, setup_completed_at, created_at, updated_at')
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (lookupError) {
        console.error('Failed to validate existing VEDR settings:', lookupError);
        return res.status(500).json({ error: 'Failed to validate existing VEDR settings' });
      }

      const {
        provider,
        provider_login_url: providerLoginUrl,
        provider_username_hint: providerUsernameHint
      } = validation.value;
      const timestamp = now().toISOString();

      if (provider === null) {
        const resetPayload = {
          provider: null,
          provider_login_url: null,
          provider_username_hint: null,
          connection_status: VEDR_CONNECTION_STATUSES.NOT_STARTED,
          provider_selected_at: null,
          connection_started_at: null,
          connection_verified_at: null,
          setup_completed_at: null,
          updated_at: timestamp
        };

        if (!existingSettings) {
          const { data: insertedSettings, error: insertError } = await supabase
            .from('vedr_settings')
            .insert({
              account_id: req.account.account_id,
              ...resetPayload
            })
            .select('id, account_id, provider, provider_login_url, provider_username_hint, connection_status, provider_selected_at, connection_started_at, connection_verified_at, setup_completed_at, created_at, updated_at')
            .single();

          if (insertError) {
            console.error('Failed to create reset VEDR settings:', insertError);
            return res.status(500).json({ error: 'Failed to save VEDR settings' });
          }

          return res.status(200).json(presentVedrSettings(insertedSettings));
        }

        const { data: updatedSettings, error: updateError } = await supabase
          .from('vedr_settings')
          .update(resetPayload)
          .eq('id', existingSettings.id)
          .select('id, account_id, provider, provider_login_url, provider_username_hint, connection_status, provider_selected_at, connection_started_at, connection_verified_at, setup_completed_at, created_at, updated_at')
          .single();

        if (updateError) {
          console.error('Failed to reset VEDR settings:', updateError);
          return res.status(500).json({ error: 'Failed to save VEDR settings' });
        }

        return res.status(200).json(presentVedrSettings(updatedSettings));
      }

      const nextProviderSelectedAt = existingSettings?.provider_selected_at || timestamp;
      const isProviderChange = existingSettings?.provider !== provider;
      const nextConnectionStartedAt = isProviderChange || !existingSettings?.connection_started_at
        ? timestamp
        : existingSettings.connection_started_at;
      const nextConnectionStatus = isProviderChange || !existingSettings?.connection_status
        ? VEDR_CONNECTION_STATUSES.WAITING_FOR_LOGIN
        : existingSettings.connection_status;

      if (!existingSettings) {
        const { data: insertedSettings, error: insertError } = await supabase
          .from('vedr_settings')
          .insert({
            account_id: req.account.account_id,
            provider,
            provider_login_url: providerLoginUrl,
            provider_username_hint: providerUsernameHint,
            connection_status: nextConnectionStatus,
            provider_selected_at: nextProviderSelectedAt,
            connection_started_at: nextConnectionStartedAt,
            connection_verified_at: null,
            setup_completed_at: null
          })
          .select('id, account_id, provider, provider_login_url, provider_username_hint, connection_status, provider_selected_at, connection_started_at, connection_verified_at, setup_completed_at, created_at, updated_at')
          .single();

        if (insertError) {
          console.error('Failed to create VEDR settings:', insertError);
          return res.status(500).json({ error: 'Failed to save VEDR settings' });
        }

        const settings = presentVedrSettings(insertedSettings);
        return res.status(200).json(settings);
      }

      const { data: updatedSettings, error: updateError } = await supabase
        .from('vedr_settings')
        .update({
          provider,
          provider_login_url: providerLoginUrl,
          provider_username_hint: providerUsernameHint,
          connection_status: nextConnectionStatus,
          provider_selected_at: nextProviderSelectedAt,
          connection_started_at: nextConnectionStartedAt,
          connection_verified_at: existingSettings.connection_verified_at || null,
          setup_completed_at: existingSettings.setup_completed_at || null,
          updated_at: timestamp
        })
        .eq('id', existingSettings.id)
        .select('id, account_id, provider, provider_login_url, provider_username_hint, connection_status, provider_selected_at, connection_started_at, connection_verified_at, setup_completed_at, created_at, updated_at')
        .single();

      if (updateError) {
        console.error('Failed to update VEDR settings:', updateError);
        return res.status(500).json({ error: 'Failed to save VEDR settings' });
      }

      const settings = presentVedrSettings(updatedSettings);
      return res.status(200).json(settings);
    } catch (error) {
      console.error('Unhandled PUT /api/vedr/settings error:', error);
      return res.status(500).json({ error: 'Failed to save VEDR settings' });
    }
  });

  router.post('/settings/mark-connected', requireVedrAdminAccess, async (req, res) => {
    try {
      const { data: existingSettings, error: lookupError } = await supabase
        .from('vedr_settings')
        .select('id, account_id, provider, provider_login_url, provider_username_hint, connection_status, provider_selected_at, connection_started_at, connection_verified_at, setup_completed_at, created_at, updated_at')
        .eq('account_id', req.account.account_id)
        .maybeSingle();

      if (lookupError) {
        console.error('Failed to load VEDR settings for completion:', lookupError);
        return res.status(500).json({ error: 'Failed to validate existing VEDR settings' });
      }

      if (!existingSettings?.provider) {
        return res.status(400).json({ error: 'Select a VEDR provider before marking setup complete' });
      }

      const verifiedAt = existingSettings.connection_verified_at || now().toISOString();
      const { data: updatedSettings, error: updateError } = await supabase
        .from('vedr_settings')
        .update({
          connection_status: VEDR_CONNECTION_STATUSES.CONNECTED,
          connection_verified_at: verifiedAt,
          setup_completed_at: verifiedAt,
          updated_at: now().toISOString()
        })
        .eq('id', existingSettings.id)
        .select('id, account_id, provider, provider_login_url, provider_username_hint, connection_status, provider_selected_at, connection_started_at, connection_verified_at, setup_completed_at, created_at, updated_at')
        .single();

      if (updateError) {
        console.error('Failed to mark VEDR settings connected:', updateError);
        return res.status(500).json({ error: 'Failed to save VEDR settings' });
      }

      return res.status(200).json(presentVedrSettings(updatedSettings));
    } catch (error) {
      console.error('Unhandled POST /api/vedr/settings/mark-connected error:', error);
      return res.status(500).json({ error: 'Failed to save VEDR settings' });
    }
  });

  return router;
}

module.exports = {
  createVedrRouter
};
