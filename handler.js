'use strict';

require('dotenv').config();

const { Configuration, OpenAIApi } = require('openai');
const logger = require('./utils/logger');
const { sendDiscordAlert } = require('./utils/alert');
const { logMealRequest } = require('./utils/firebaseLogger');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

module.exports.recordMeal = async (event) => {
  try {
    const apiKey = event.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
      logger.warn('Invalid API key attempt', { providedKey: apiKey });
      await logMealRequest({
        foodName: null,
        quantity: null,
        unit: null,
        statusCode: 400,
        error: 'Invalid API key'
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          code: 400, 
          message: 'API 키가 유효하지 않습니다',
          error: 'Invalid API key'
        }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (error) {
      logger.error('Invalid JSON format', { body: event.body });
      await logMealRequest({
        foodName: null,
        quantity: null,
        unit: null,
        statusCode: 400,
        error: 'Invalid JSON format'
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 400, message: '입력값이 유효하지 않습니다' }),
      };
    }

    logger.info('API Request received', {
      foodName: body.foodName,
      quantity: body.quantity,
      unit: body.unit
    });

    if (!body.foodName) {
      logger.warn('Missing food name', { body });
      await logMealRequest({
        foodName: body.foodName,
        quantity: body.quantity,
        unit: body.unit,
        statusCode: 400,
        error: 'Missing food name'
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 400, message: '음식명이 없습니다' }),
      };
    }

    const foodNameTrimmed = body.foodName.trim();
    if (!foodNameTrimmed) {
      logger.warn('Empty food name after trim', { originalFoodName: body.foodName });
      await logMealRequest({
        foodName: body.foodName,
        quantity: body.quantity,
        unit: body.unit,
        statusCode: 400,
        error: 'Empty food name'
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 400, message: '음식명이 없습니다' }),
      };
    }

    const specialCharsOnly = /^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]+$/;
    if (specialCharsOnly.test(foodNameTrimmed)) {
      logger.warn('Special characters only in food name', { foodName: foodNameTrimmed });
      await logMealRequest({
        foodName: body.foodName,
        quantity: body.quantity,
        unit: body.unit,
        statusCode: 400,
        error: 'Special characters only'
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 400, message: '올바른 음식명이 아닙니다' }),
      };
    }
    
    if (
      !body.quantity ||
      body.quantity <= 0 ||
      typeof body.quantity !== 'number'
    ) {
      logger.warn('Invalid quantity', { quantity: body.quantity });
      await logMealRequest({
        foodName: body.foodName,
        quantity: body.quantity,
        unit: body.unit,
        statusCode: 400,
        error: 'Invalid quantity'
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 400, message: '섭취량이 올바르지 않습니다' }),
      };
    }

    if (
      body.unit === undefined ||
      body.unit === null ||
      !Number.isInteger(body.unit) ||
      body.unit < 0 ||
      body.unit > 4
    ) {
      logger.warn('Invalid unit', { unit: body.unit });
      await logMealRequest({
        foodName: body.foodName,
        quantity: body.quantity,
        unit: body.unit,
        statusCode: 400,
        error: 'Invalid unit'
      });
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 400, message: '섭취량 단위가 올바르지 않습니다' }),
      };
    }

    const unitMapping = {
      0: '인분',
      1: '개',
      2: '접시',
      3: 'g',
      4: 'ml',
    };

    const unitText = unitMapping[body.unit];

    const systemInstruction = `
주어진 음식명과 섭취량을 바탕으로, 다음 단계를 순서대로 따라 1회 제공량과 영양 성분을 생성하세요:

1. 음식명을 분석하여 해당 음식의 종류를 파악합니다.  
   - 주어진 데이터가 음식명이 아닐 경우, 이후 단계를 생략하고 "None"만을 반환하세요.
2. 음식 종류와 섭취량을 참고하여 1회 제공량(g)을 추정합니다.
3. 주어진 음식명과 섭취량을 바탕으로, 평균적인 영양 성분(탄수화물, 스타치, 당류, 식이섬유, 단백질, 지방)을 생성합니다.  
   - 각 영양 성분은 USDA, 한국 식약처 데이터베이스 등 공인된 데이터베이스의 일반적인 수치를 참고하여 생성하세요.  
   - 탄수화물(g)은 다음 계산식을 따릅니다:  
     탄수화물(g) = 스타치(g) + 당류(g) + 식이섬유(g).  
4. 최종 결과를 아래 JSON 형식으로 출력합니다.
   - 출력 형식 이외의 텍스트를 생성하지 않도록 유의하세요.

출력 형식:
{
    "surving_size": (음식의 일반적 1회 제공량 추정치),
    "carbohydrate": (스타치 + 당류 + 식이섬유의 총합),
    "starch": (음식의 평균적 스타치 총량),
    "sugar": (음식의 평균적 당류 총량),
    "dietaryFiber": (음식의 평균적 식이섬유 총량),
    "protein": (음식의 평균적 단백질 총량),
    "fat": (음식의 평균적 지방 총량)
}
`;
    const userInput = `음식명: ${body.foodName}\n서빙 크기: ${body.quantity} ${unitText}`;

    try {
      const gptResponse = await openai.createChatCompletion({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: systemInstruction
          },
          {
            role: 'user',
            content: userInput
          },
        ],
      });

      const rawContent = gptResponse.data.choices[0].message.content;
      
      if (rawContent.includes('None')) {
        logger.info('AI unable to calculate nutrition', { foodName: body.foodName });
        await logMealRequest({
          foodName: body.foodName,
          quantity: body.quantity,
          unit: body.unit,
          statusCode: 510,
          error: 'AI unable to calculate'
        });
        return {
          statusCode: 510,
          body: JSON.stringify({
            code: 510,
            message: 'AI가 계산하기 어려운 영양성분입니다',
          }),
        };
      }

      let nutritionData;
      try {
        const jsonMatch = rawContent.match(/{[\s\S]*?}/);
        if (jsonMatch) {
          let potentialJSON = jsonMatch[0];
          potentialJSON = potentialJSON.replace(/\/\/.*$/gm, "");
          potentialJSON = potentialJSON.replace(/,\s*}/g, "}");
          nutritionData = JSON.parse(potentialJSON);
        }
      } catch (error) {
        logger.error('JSON parsing failed', { 
          error: error.message,
          rawContent 
        });
        await logMealRequest({
          foodName: body.foodName,
          quantity: body.quantity,
          unit: body.unit,
          statusCode: 500,
          error: 'JSON parsing failed'
        });
        return {
          statusCode: 500,
          body: JSON.stringify({
            code: 500,
            message: '영양 성분 계산에 실패했습니다',
            error: 'Invalid JSON format returned by GPT',
          }),
        };
      }

      if (!nutritionData || typeof nutritionData !== 'object') {
        logger.error('Invalid nutrition data structure', { nutritionData });
        await logMealRequest({
          foodName: body.foodName,
          quantity: body.quantity,
          unit: body.unit,
          statusCode: 500,
          error: 'Invalid nutrition data structure'
        });
        return {
          statusCode: 500,
          body: JSON.stringify({
            code: 500,
            message: '영양 성분 계산에 실패했습니다',
            error: 'undefined nutrition data',
          }),
        };
      }

      function parseNutrientValue(value) {
        if (typeof value === 'string') {
          const number = value.replace(/[^\d.]/g, '');
          return parseFloat(number);
        } else if (typeof value === 'number') {
          return value;
        }
        return NaN;
      }

      const carbohydrate = parseNutrientValue(nutritionData.carbohydrate);
      const sugar = parseNutrientValue(nutritionData.sugar);
      const dietaryFiber = parseNutrientValue(nutritionData.dietaryFiber);
      const protein = parseNutrientValue(nutritionData.protein);
      const fat = parseNutrientValue(nutritionData.fat);
      const starch = parseNutrientValue(nutritionData.starch);

      if (
        isNaN(carbohydrate) ||
        isNaN(sugar) ||
        isNaN(dietaryFiber) ||
        isNaN(protein) ||
        isNaN(fat) ||
        isNaN(starch) ||
        carbohydrate < 0 ||
        sugar < 0 ||
        dietaryFiber < 0 ||
        protein < 0 ||
        fat < 0 ||
        starch < 0
      ) {
        logger.error('Invalid nutrient values', { 
          carbohydrate, sugar, dietaryFiber, protein, fat, starch 
        });
        await logMealRequest({
          foodName: body.foodName,
          quantity: body.quantity,
          unit: body.unit,
          statusCode: 500,
          error: 'Invalid nutrient values'
        });
        return {
          statusCode: 500,
          body: JSON.stringify({
            code: 500,
            message: '영양 성분 계산에 실패했습니다',
            error: 'Invalid nutrient values',
          }),
        };
      }

      const response = {
        carbohydrate,
        sugar,
        dietaryFiber,
        protein,
        fat,
        starch
      };

      logger.info('Nutrition calculation success', {
        foodName: body.foodName,
        nutrition: response
      });

      await logMealRequest({
        foodName: body.foodName,
        quantity: body.quantity,
        unit: body.unit,
        nutrition: response,
        statusCode: 200
      });

      return {
        statusCode: 200,
        body: JSON.stringify(response),
      };

    } catch (error) {
      logger.error('OpenAI API Error:', error);
      
      const statusCode = error.response?.status;
      const errorCode = error.response?.data?.error?.code;
      const errorType = error.response?.data?.error?.type;

      if (statusCode === 400) {
        await logMealRequest({
          foodName: body.foodName,
          quantity: body.quantity,
          unit: body.unit,
          statusCode: 500,
          error: 'Invalid request to OpenAI'
        });
        return {
          statusCode: 500,
          body: JSON.stringify({
            code: 500,
            message: '영양 성분 계산에 실패했습니다',
            error: 'Invalid request',
          }),
        };
      }

      if (statusCode === 401 || statusCode === 403) {
        await sendDiscordAlert(error);
        await logMealRequest({
          foodName: body.foodName,
          quantity: body.quantity,
          unit: body.unit,
          statusCode: 500,
          error: 'Authentication failed'
        });
        return {
          statusCode: 500,
          body: JSON.stringify({
            code: 500,
            message: '영양 성분 계산에 실패했습니다',
            error: 'Authentication failed',
          }),
        };
      }

      if (statusCode === 429) {
        await sendDiscordAlert(error);
        if (errorType === 'tokens') {
          await logMealRequest({
            foodName: body.foodName,
            quantity: body.quantity,
            unit: body.unit,
            statusCode: 503,
            error: 'Token quota exceeded'
          });
          return {
            statusCode: 503,
            body: JSON.stringify({
              code: 503,
              message: '현재 영양성분 분석이 불가능합니다.',
              error: 'Token quota exceeded',
            }),
          };
        }
        await logMealRequest({
          foodName: body.foodName,
          quantity: body.quantity,
          unit: body.unit,
          statusCode: 503,
          error: 'Rate limit exceeded'
        });
        return {
          statusCode: 503,
          body: JSON.stringify({
            code: 503,
            message: '현재 영양성분 분석이 불가능합니다.',
            error: 'Rate limit exceeded',
          }),
        };
      }

      if (statusCode >= 500) {
        await sendDiscordAlert(error);
        await logMealRequest({
          foodName: body.foodName,
          quantity: body.quantity,
          unit: body.unit,
          statusCode: 503,
          error: 'OpenAI server error'
        });
        return {
          statusCode: 503,
          body: JSON.stringify({
            code: 503,
            message: '현재 영양성분 분석이 불가능합니다.',
          }),
        };
      }

      if (errorCode === 'context_length_exceeded') {
        await logMealRequest({
          foodName: body.foodName,
          quantity: body.quantity,
          unit: body.unit,
          statusCode: 400,
          error: 'Input too long'
        });
        return {
          statusCode: 400,
          body: JSON.stringify({
            code: 400,
            message: '입력값이 유효하지 않습니다',
            error: 'Input too long',
          }),
        };
      }

      if (errorType === 'timeout') {
        await sendDiscordAlert(error);
        await logMealRequest({
          foodName: body.foodName,
          quantity: body.quantity,
          unit: body.unit,
          statusCode: 503,
          error: 'Request timeout'
        });
        return {
          statusCode: 503,
          body: JSON.stringify({
            code: 503,
            message: '현재 영양성분 분석이 불가능합니다.',
            error: 'Request timeout',
          }),
        };
      }

      await logMealRequest({
        foodName: body.foodName,
        quantity: body.quantity,
        unit: body.unit,
        statusCode: 500,
        error: error.message
      });
      return {
        statusCode: 500,
        body: JSON.stringify({
          code: 500,
          message: '영양 성분 계산에 실패했습니다',
          error: error.message,
        }),
      };
    }
  } catch (error) {
    logger.error('Unexpected error', {
      error: error.message,
      stack: error.stack
    });
    await logMealRequest({
      foodName: null,
      quantity: null,
      unit: null,
      statusCode: 500,
      error: 'Unexpected error: ' + error.message
    });
    return {
      statusCode: 500,
      body: JSON.stringify({
        code: 500,
        message: '영양 성분 계산에 실패했습니다',
        error: error.message,
      }),
    };
  }
};