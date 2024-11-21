'use strict';

require('dotenv').config();

const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const extractJSON = (input) => {
  try {
    const jsonMatch = input.match(/{[\s\S]*?}/);
    if (jsonMatch) {
      let potentialJSON = jsonMatch[0];

      potentialJSON = potentialJSON.replace(/\/\/.*$/gm, ""); // 줄 끝의 `//` 주석 제거
      potentialJSON = potentialJSON.replace(/,\s*}/g, "}");  // 마지막 쉼표 제거

      return JSON.parse(potentialJSON);
    }
  } catch (error) {
    console.error("JSON 파싱 실패:", error.message);
  }
  return null;
};

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

    const system_instruction = `
주어진 음식명을 바탕으로, 다음 단계를 순서대로 따라 1회 제공량과 평균적인 영양 성분을 생성하세요:

1. 음식명을 분석하여 해당 음식의 일반적인 종류와 전형적인 서빙 크기를 파악합니다.  
2. 음식 종류와 서빙 크기를 참고하여 1회 제공량(g)을 추정합니다.
3. 주어진 음식명만을 바탕으로, 평균적인 영양 성분(탄수화물, 스타치, 당류, 식이섬유, 단백질, 지방)을 생성합니다.  
   - 각 영양 성분은 USDA, 한국 식약처 데이터베이스 등 공인된 데이터베이스의 일반적인 수치를 참고하여 생성하세요.  
   - 탄수화물(g)은 다음 계산식을 따릅니다:  
     탄수화물(g) = 스타치(g) + 당류(g) + 식이섬유(g).  
4. 최종 결과를 아래 JSON 형식으로 출력합니다.
   - 출력 형식 이외의 텍스트를 생성하지 않도록 유의하세요.

출력 형식:
{
    "surving_size": 음식의 일반적 1회 제공량 추정치,
    "carbohydrate": (스타치 + 당류 + 식이섬유의 총합),
    "starch": (음식의 평균적 스타치 총량),
    "sugar": (음식의 평균적 당류 총량),
    "dietaryFiber": (음식의 평균적 식이섬유 총량),
    "protein": (음식의 평균적 단백질 총량),
    "fat": (음식의 평균적 지방 총량)
}
`

    const gptResponse = await openai.createChatCompletion({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: system_instruction
        },
        {
          role: 'user',
          content: body.foodName
        },
      ],
    });

    const rawContent = gptResponse.data.choices[0].message.content;
    console.log('GPT Raw Response:', rawContent);

    let nutritionData;
    try {
      nutritionData = extractJSON(rawContent.trim());
      // nutritionData = JSON.parse(rawContent.trim());
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
    const starch = parseNutrientValue(nutritionData.starch)

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
      starch: starch
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