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
  async function getPreference({ accountId, actorType, actorId }) {
    const [{ data: account, error: accountError }, { data: notice, error: noticeError }] = await Promise.all([
      supabase
        .from('accounts')
        .select('rra_ai_processing_authorized, rra_ai_processing_policy_version, rra_ai_processing_authorized_at, rra_ai_processing_withdrawn_at')
        .eq('id', accountId)
        .maybeSingle(),
      supabase
        .from('driver_help_ai_notices')
        .select('policy_version, seen_at, updated_at')
        .eq('account_id', accountId)
        .eq('actor_type', actorType)
        .eq('actor_id', actorId)
        .eq('policy_version', AI_CONSENT_POLICY_VERSION)
        .maybeSingle()
    ]);
    if (accountError) throw accountError;
    if (noticeError) throw noticeError;

    const companyAuthorized = account?.rra_ai_processing_authorized === true
      && account?.rra_ai_processing_policy_version === AI_CONSENT_POLICY_VERSION
      && !account?.rra_ai_processing_withdrawn_at;

    return {
      ai_processing_consent: companyAuthorized,
      company_ai_processing_authorized: companyAuthorized,
      policy_version: AI_CONSENT_POLICY_VERSION,
      company_authorized_at: account?.rra_ai_processing_authorized_at || null,
      notice_seen_at: notice?.seen_at || null,
      notice_required: !notice?.seen_at,
      updated_at: notice?.updated_at || account?.rra_ai_processing_authorized_at || null
    };
  }

  async function acknowledgeNotice({ accountId, actorType, actorId, policyVersion }) {
    if (policyVersion !== AI_CONSENT_POLICY_VERSION) {
      const error = new Error('The privacy notice has changed. Review the current notice before continuing.');
      error.code = 'POLICY_VERSION_MISMATCH';
      throw error;
    }
    const timestamp = now().toISOString();
    const { error } = await supabase
      .from('driver_help_ai_notices')
      .upsert({
        account_id: accountId,
        actor_type: actorType,
        actor_id: actorId,
        policy_version: policyVersion,
        seen_at: timestamp,
        updated_at: timestamp
      }, { onConflict: 'account_id,actor_type,actor_id,policy_version' });
    if (error) throw error;
    return getPreference({ accountId, actorType, actorId });
  }

  async function setCompanyAuthorization({ accountId, managerUserId, authorized, policyVersion }) {
    if (policyVersion !== AI_CONSENT_POLICY_VERSION) {
      const error = new Error('The AI authorization has changed. Review the current authorization before choosing.');
      error.code = 'POLICY_VERSION_MISMATCH';
      throw error;
    }
    const timestamp = now().toISOString();
    const { data, error } = await supabase
      .from('accounts')
      .update(authorized ? {
        rra_ai_processing_authorized: true,
        rra_ai_processing_policy_version: policyVersion,
        rra_ai_processing_authorized_at: timestamp,
        rra_ai_processing_authorized_by: managerUserId || null,
        rra_ai_processing_withdrawn_at: null,
        rra_ai_processing_withdrawn_by: null
      } : {
        rra_ai_processing_authorized: false,
        rra_ai_processing_withdrawn_at: timestamp,
        rra_ai_processing_withdrawn_by: managerUserId || null
      })
      .eq('id', accountId)
      .select('rra_ai_processing_authorized, rra_ai_processing_policy_version, rra_ai_processing_authorized_at, rra_ai_processing_withdrawn_at')
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const notFound = new Error('Company account not found.');
      notFound.code = 'ACCOUNT_NOT_FOUND';
      throw notFound;
    }
    return {
      company_ai_processing_authorized: data.rra_ai_processing_authorized === true
        && data.rra_ai_processing_policy_version === AI_CONSENT_POLICY_VERSION
        && !data.rra_ai_processing_withdrawn_at,
      policy_version: AI_CONSENT_POLICY_VERSION,
      company_authorized_at: data.rra_ai_processing_authorized_at || null,
      company_withdrawn_at: data.rra_ai_processing_withdrawn_at || null
    };
  }

  return { acknowledgeNotice, getPreference, setCompanyAuthorization };
}

module.exports = {
  AI_CONSENT_POLICY_VERSION,
  createDriverHelpPrivacyService,
  redactConversationContextForAi,
  redactTextForAi
};
