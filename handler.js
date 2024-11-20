'use strict';

require('dotenv').config();

const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

module.exports.recordMeal = async (event) => {
  try {
    const body = JSON.parse(event.body);

    const unitMapping = {
      0: 'servings',
      1: 'pieces',
      2: 'plates',
      3: 'grams',
      4: 'milliliters',
    };

    const unitText = unitMapping[body.unit];

    const gptResponse = await openai.createChatCompletion({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            'You generate nutritional information for given food based on the input food name, quantity, and unit.',
        },
        {
          role: 'user',
          content: `Food name: ${body.foodName}, Quantity: ${body.quantity} ${unitText}. Please return ONLY the nutritional information (carbohydrate, sugar, dietaryFiber, protein, fat) as a JSON object without any additional text or explanations.`,
        },
      ],
    });

    const rawContent = gptResponse.data.choices[0].message.content;
    //console.log('GPT Raw Response:', rawContent);

    let nutritionData;
    try {
      nutritionData = JSON.parse(rawContent.trim());
    } catch (error) {
      const jsonMatch = rawContent.match(/{[\s\S]*}/);
      if (jsonMatch) {
        try {
          nutritionData = JSON.parse(jsonMatch[0]);
        } catch (err) {
          console.error('Failed to parse JSON from GPT response:', rawContent);
          throw new Error('Invalid JSON format returned by GPT');
        }
      } else {
        console.error('No JSON found in GPT response:', rawContent);
        throw new Error('No JSON data returned by GPT');
      }
    }

    if (!nutritionData || typeof nutritionData !== 'object') {
      throw new Error('Nutrition data is missing or not an object');
    }
    const response = {
      foodName: body.foodName,
      quantity: body.quantity,
      unit: body.unit,
      carbohydrate: nutritionData.carbohydrate,
      sugar: nutritionData.sugar,
      dietaryFiber: nutritionData.dietaryFiber,
      protein: nutritionData.protein,
      fat: nutritionData.fat,
    };

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error('Error occurred:', error);
    return {
      statusCode: 501,
      body: JSON.stringify({
        code: 501,
        message: '영양 성분 계산에 실패했습니다',
        error: error.message,
      }),
    };
  }
};