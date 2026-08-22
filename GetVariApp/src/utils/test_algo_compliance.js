const { HydrationRiskEngine } = require('./hydrationRiskEngine');
const { calculatePredictedRiskAfterDrink, calculateRecoveryEstimation } = require('./hydrationModel');

// Note: This won't work easily if they are ES modules.
// I'll check the tsconfig to see if they are.
