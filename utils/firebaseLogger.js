const { db } = require('./firebase');  // 같은 디렉토리의 firebase.js 참조

const logMealRequest = async ({
  foodName,
  quantity,
  unit,
  nutrition,
  statusCode,
  error = null
}) => {
  try {
    await db.collection('meal-logs').add({
      timestamp: new Date(),
      request: {
        foodName,
        quantity,
        unit
      },
      response: {
        statusCode,
        nutrition: nutrition || null,
        error: error || null
      }
    });
  } catch (err) {
    console.error('Firebase logging failed:', err);
  }
};

module.exports = { logMealRequest };