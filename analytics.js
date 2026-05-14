// analytics.js – Visitor analytics using CountAPI (free, no auth)
// Docs: https://countapi.xyz/

const ANALYTICS_NAMESPACE = 'deltaV_portfolio';

async function incrementView(type, id) {
  // type: 'project' or 'certificate'
  const key = `${type}_${id}`;
  const url = `https://countapi.xyz/update/${ANALYTICS_NAMESPACE}/${key}?amount=1`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.value; // new count
  } catch (err) {
    console.warn('Analytics increment failed:', err);
    return null;
  }
}

async function getViewCount(type, id) {
  const key = `${type}_${id}`;
  const url = `https://countapi.xyz/get/${ANALYTICS_NAMESPACE}/${key}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data.value || 0;
  } catch (err) {
    console.warn('Analytics get failed:', err);
    return 0;
  }
}

async function getAllViewCounts(type, ids) {
  // ids: array of project ids or certificate ids
  const counts = {};
  for (const id of ids) {
    counts[id] = await getViewCount(type, id);
  }
  return counts;
}
