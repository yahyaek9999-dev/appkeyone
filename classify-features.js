const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./project-knowledge/master-feature-registry-v2.json', 'utf8'));

const classifications = {
  customer_feature: [],
  customer_subfeature: [],
  admin_feature: [],
  internal_operational: [],
  qa_testing: [],
  deprecated: []
};

// Classify each feature
data.forEach(feature => {
  // Check for deprecated status
  if (feature.status !== 'implemented') {
    classifications.deprecated.push(feature);
    return;
  }

  // Classify based on type and visibility
  if (feature.type === 'admin_internal') {
    classifications.admin_feature.push(feature);
  } else if (feature.type === 'subfeature') {
    classifications.customer_subfeature.push(feature);
  } else if (feature.type === 'feature') {
    // Check if it's a main customer feature with dedicated routes
    if (feature.customerVisible === true && feature.routes && feature.routes.length > 0) {
      classifications.customer_feature.push(feature);
    } else if (feature.customerVisible === true && (!feature.routes || feature.routes.length === 0)) {
      // No dedicated routes - it's a subfeature
      classifications.customer_subfeature.push(feature);
    } else if (feature.customerVisible === false && feature.adminVisible === true) {
      // Admin-only features
      classifications.admin_feature.push(feature);
    } else if (!feature.discoverable) {
      // Not discoverable - likely internal operational
      if (feature.customerVisible === true) {
        classifications.customer_subfeature.push(feature);
      } else {
        classifications.internal_operational.push(feature);
      }
    } else {
      // Default to customer_feature if visible to customer
      if (feature.customerVisible === true) {
        classifications.customer_feature.push(feature);
      } else {
        classifications.admin_feature.push(feature);
      }
    }
  }
});

// Output summary
console.log('KEYONE FEATURE CLASSIFICATION REPORT');
console.log('===================================\n');

let totalCount = 0;
Object.entries(classifications).forEach(([type, features]) => {
  console.log(`${type.toUpperCase()}: ${features.length}`);
  features.forEach(f => {
    const routes = f.routes && f.routes.length > 0 ? f.routes.join(', ') : 'no routes';
    console.log(`  ${f.id}: ${f.key} [${routes}]`);
  });
  console.log('');
  totalCount += features.length;
});

console.log(`\nTOTAL FEATURES: ${totalCount}`);
