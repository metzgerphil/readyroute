const AI_CONSENT_POLICY_VERSION = '2026-08-20';

function redactTextForAi(value) {
  return String(value || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email removed]')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '[link removed]')
    .replace(/\b(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g, '[phone removed]')
    .replace(/\b\d{10,22}\b/g, '[identifier removed]')
    .replace(/\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,4}\s+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|parkway|pkwy|highway|hwy)\b\.?/gi, '[address removed]');
}

function redactConversationContextForAi(context = {}) {
  return {
    ...context,
    original_situation: redactTextForAi(context.original_situation),
    previous_question: redactTextForAi(context.previous_question),
    pending_clarification_prompt: redactTextForAi(context.pending_clarification_prompt),
    clarification_history: Array.isArray(context.clarification_history)
      ? context.clarification_history.map((entry) => ({
          ...entry,
          prompt: redactTextForAi(entry?.prompt),
          answer: redactTextForAi(entry?.answer)
        }))
      : []
  };
}

function createDriverHelpPrivacyService({ supabase, now = () => new Date() } = {}) {
  function presentCompanyAuthorization(account) {
    return {
      company_ai_processing_authorized: account?.rra_ai_processing_authorized === true,
      policy_version: account?.rra_ai_processing_policy_version || AI_CONSENT_POLICY_VERSION,
      company_authorized_at: account?.rra_ai_processing_authorized_at || null,
      company_withdrawn_at: account?.rra_ai_processing_withdrawn_at || null
    };
  }

  async function getCompanyAuthorization({ accountId }) {
    const { data, error } = await supabase
      .from('accounts')
      .select('rra_ai_processing_authorized, rra_ai_processing_policy_version, rra_ai_processing_authorized_at, rra_ai_processing_withdrawn_at')
      .eq('id', accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const notFoundError = new Error('Account not found.');
      notFoundError.code = 'ACCOUNT_NOT_FOUND';
      throw notFoundError;
    }
    return presentCompanyAuthorization(data);
  }

  async function setCompanyAuthorization({ accountId, managerUserId, authorized, policyVersion }) {
    if (policyVersion !== AI_CONSENT_POLICY_VERSION) {
      const versionError = new Error('The company AI authorization notice has changed. Review the current notice before saving.');
      versionError.code = 'POLICY_VERSION_MISMATCH';
      throw versionError;
    }

    const timestamp = now().toISOString();
    const update = authorized
      ? {
          rra_ai_processing_authorized: true,
          rra_ai_processing_policy_version: policyVersion,
          rra_ai_processing_authorized_at: timestamp,
          rra_ai_processing_authorized_by: managerUserId || null,
          rra_ai_processing_withdrawn_at: null,
          rra_ai_processing_withdrawn_by: null
        }
      : {
          rra_ai_processing_authorized: false,
          rra_ai_processing_policy_version: policyVersion,
          rra_ai_processing_authorized_at: null,
          rra_ai_processing_authorized_by: null,
          rra_ai_processing_withdrawn_at: timestamp,
          rra_ai_processing_withdrawn_by: managerUserId || null
        };
    const { data, error } = await supabase
      .from('accounts')
      .update(update)
      .eq('id', accountId)
      .select('rra_ai_processing_authorized, rra_ai_processing_policy_version, rra_ai_processing_authorized_at, rra_ai_processing_withdrawn_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const notFoundError = new Error('Account not found.');
      notFoundError.code = 'ACCOUNT_NOT_FOUND';
      throw notFoundError;
    }
    return presentCompanyAuthorization(data);
  }

  async function getPreference({ accountId, actorType, actorId }) {
    const { data, error } = await supabase
      .from('driver_help_ai_consents')
      .select('ai_processing_consent, policy_version, accepted_at, withdrawn_at, updated_at')
      .eq('account_id', accountId)
      .eq('actor_type', actorType)
      .eq('actor_id', actorId)
      .maybeSingle();
    if (error) throw error;
    return data || {
      ai_processing_consent: false,
      policy_version: AI_CONSENT_POLICY_VERSION,
      accepted_at: null,
      withdrawn_at: null,
      updated_at: null
    };
  }

  async function setPreference({ accountId, driverId, actorType, actorId, consent, policyVersion }) {
    if (policyVersion !== AI_CONSENT_POLICY_VERSION) {
      const error = new Error('The privacy notice has changed. Review the current notice before choosing.');
      error.code = 'POLICY_VERSION_MISMATCH';
      throw error;
    }
    const timestamp = now().toISOString();
    const { data, error } = await supabase
      .from('driver_help_ai_consents')
      .upsert({
        account_id: accountId,
        driver_id: actorType === 'driver' ? driverId : null,
        actor_type: actorType,
        actor_id: actorId,
        ai_processing_consent: consent,
        policy_version: policyVersion,
        accepted_at: consent ? timestamp : null,
        withdrawn_at: consent ? null : timestamp,
        updated_at: timestamp
      }, { onConflict: 'account_id,actor_type,actor_id' })
      .select('ai_processing_consent, policy_version, accepted_at, withdrawn_at, updated_at')
      .single();
    if (error) throw error;
    return data;
  }

  return { getCompanyAuthorization, getPreference, setCompanyAuthorization, setPreference };
}

module.exports = {
  AI_CONSENT_POLICY_VERSION,
  createDriverHelpPrivacyService,
  redactConversationContextForAi,
  redactTextForAi
};
