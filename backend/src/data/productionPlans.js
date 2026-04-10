const fs = require('fs');
const path = require('path');

const PERSIST_FILE = path.join(
  process.env.UPLOAD_DIR || './uploads',
  'production_plans.json'
);

function loadPlans() {
  try {
    if (fs.existsSync(PERSIST_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PERSIST_FILE, 'utf8'));
      return raw && typeof raw === 'object' ? raw : {};
    }
  } catch (err) {
    console.warn('[productionPlans] Could not load plans:', err.message);
  }
  return {};
}

function savePlans(plans) {
  try {
    fs.writeFileSync(PERSIST_FILE, JSON.stringify(plans, null, 2));
  } catch (err) {
    console.warn('[productionPlans] Could not persist plans:', err.message);
  }
}

const plansByPoId = loadPlans();

function getProductionPlan(poId) {
  return plansByPoId[poId] || null;
}

function listProductionPlans() {
  return Object.values(plansByPoId);
}

function setProductionPlan(poId, plan) {
  plansByPoId[poId] = plan;
  savePlans(plansByPoId);
  return plan;
}

module.exports = {
  getProductionPlan,
  listProductionPlans,
  setProductionPlan,
};
