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
    if (!body.foodName) {
      return {
        statusCode: 401,
        body: JSON.stringify({ code: 401, message: '음식명이 없습니다' }),
      };
    }

    if (
      !body.quantity ||
      body.quantity <= 0 ||
      !Number.isInteger(body.quantity)
    ) {
      return {
        statusCode: 402,
        body: JSON.stringify({ code: 402, message: '섭취량이 올바르지 않습니다' }),
      };
    }

    if (
      body.unit === undefined ||
      body.unit === null ||
      !Number.isInteger(body.unit) ||
      body.unit < 0 ||
      body.unit > 4
    ) {
      return {
        statusCode: 403,
        body: JSON.stringify({ code: 403, message: '섭취량 단위가 올바르지 않습니다' }),
      };
    }

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
          content: `Food name: ${body.foodName}, Quantity: ${body.quantity} ${unitText}. Please return ONLY the nutritional information as a JSON object, using numeric values without any units or text. The fields should be: carbohydrate, sugar, dietaryFiber, protein, fat.`,
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

    function parseNutrientValue(value) {
      if (typeof value === 'string') {
        const number = value.replace(/[^\d.]/g, '');
        return parseFloat(number);
      } else if (typeof value === 'number') {
        return value;
      } else {
        return NaN;
      }
    }

    const carbohydrate = parseNutrientValue(nutritionData.carbohydrate);
    const sugar = parseNutrientValue(nutritionData.sugar);
    const dietaryFiber = parseNutrientValue(nutritionData.dietaryFiber);
    const protein = parseNutrientValue(nutritionData.protein);
    const fat = parseNutrientValue(nutritionData.fat);

    if (
      isNaN(carbohydrate) ||
      isNaN(sugar) ||
      isNaN(dietaryFiber) ||
      isNaN(protein) ||
      isNaN(fat)
    ) {
      throw new Error('Invalid nutrient values received from GPT');
    }
    const response = {
      foodName: body.foodName,
      quantity: body.quantity,
      unit: body.unit,
      carbohydrate: carbohydrate,
      sugar: sugar,
      dietaryFiber: dietaryFiber,
      protein: protein,
      fat: fat,
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