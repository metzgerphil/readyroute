const express = require('express');

const defaultSupabase = require('../lib/supabase');

function getDayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start + (start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function normalizeSafetyFocus(row) {
  if (!row) {
    return null;
  }

  const bullets = Array.isArray(row.bullets)
    ? row.bullets.filter((bullet) => typeof bullet === 'string' && bullet.trim())
    : [];

  return {
    id: row.slug || row.id,
    title: row.title,
    source: row.source || 'ReadyRoute safety focus',
    bullets,
    takeaway: row.takeaway || null
  };
}

function createSafetyFocusesRouter({ supabase = defaultSupabase, now = () => new Date() } = {}) {
  const router = express.Router();

  router.get('/today', async (_req, res) => {
    try {
      const { data, error } = await supabase
        .from('safety_focuses')
        .select('id, slug, title, source, bullets, takeaway, sort_order')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) {
        if (['42P01', 'PGRST106', 'PGRST204', 'PGRST205'].includes(error.code)) {
          return res.status(200).json({ safety_focus: null });
        }

        console.error('Safety focus lookup failed:', error);
        return res.status(500).json({ error: 'Unable to load safety focus.' });
      }

      const focuses = Array.isArray(data) ? data.filter((row) => row?.title) : [];

      if (!focuses.length) {
        return res.status(200).json({ safety_focus: null });
      }

      const index = (getDayOfYear(now()) - 1) % focuses.length;
      return res.status(200).json({
        safety_focus: normalizeSafetyFocus(focuses[index])
      });
    } catch (error) {
      console.error('Safety focus route failed:', error);
      return res.status(500).json({ error: 'Unable to load safety focus.' });
    }
  });

  return router;
}

module.exports = createSafetyFocusesRouter();
module.exports.createSafetyFocusesRouter = createSafetyFocusesRouter;
module.exports.getDayOfYear = getDayOfYear;
module.exports.normalizeSafetyFocus = normalizeSafetyFocus;
