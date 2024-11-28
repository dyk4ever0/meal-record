'use strict';

require('dotenv').config();

const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

module.exports.recordMeal = async (event) => {
  try {
    // 0. API 키 검증
    const apiKey = event.headers['x-api-key'];
    if (!apiKey || apiKey !== process.env.API_KEY) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          code: 400, 
          message: 'API 키가 유효하지 않습니다',
          error: 'Invalid API key'
        }),
      };
    }
    // 1. 입력값 검증
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (error) {
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 400, message: '입력값이 유효하지 않습니다' }),
      };
    }

    if (!body.foodName) {
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 400, message: '음식명이 없습니다' }),
      };
    }
    // 공백
    const foodNameTrimmed = body.foodName.trim();
    if (!foodNameTrimmed) {
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 400, message: '음식명이 없습니다' }),
      };
    }

    // 순수 특수문자
    const specialCharsOnly = /^[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]+$/;
    if (specialCharsOnly.test(foodNameTrimmed)) {
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
      return {
        statusCode: 400,
        body: JSON.stringify({ code: 400, message: '섭취량 단위가 올바르지 않습니다' }),
      };
    }

    const unitMapping = {
      0: '인분', // servings
      1: '개', // pieces
      2: '접시', //plates
      3: 'g', // grams 
      4: 'ml', // milliliters
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
    const userInput = `음식명: ${body.foodName}\n섭취량: ${body.quantity} ${unitText}`;

    // 2. OpenAI API 호출 및 응답 처리
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
      
      // 2-1. "None" 체크
      if (rawContent.includes('None')) {
        return {
          statusCode: 510,
          body: JSON.stringify({
            code: 510,
            message: 'AI가 계산하기 어려운 영양성분입니다',
          }),
        };
      }

      // 2-2. JSON 파싱 시도
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
        console.error('Failed to parse JSON from GPT response:', rawContent);
        return {
          statusCode: 500,
          body: JSON.stringify({
            code: 500,
            message: '영양 성분 계산에 실패했습니다',
            error: 'Invalid JSON format returned by GPT',
          }),
        };
      }

      // 2-3. 영양성분 데이터 검증
      if (!nutritionData || typeof nutritionData !== 'object') {
        return {
          statusCode: 500,
          body: JSON.stringify({
            code: 500,
            message: '영양 성분 계산에 실패했습니다',
            error: 'undefined nutrition data',
          }),
        };
      }

      // 2-4. 영양성분 값 파싱
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

      // 2-5. 파싱값 검증
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
        return {
          statusCode: 500,
          body: JSON.stringify({
            code: 500,
            message: '영양 성분 계산에 실패했습니다',
            error: 'Invalid nutrient values',
          }),
        };
      }
      // 2-6. 성공 응답
      const response = {
        carbohydrate,
        sugar,
        dietaryFiber,
        protein,
        fat,
        starch
      };

      return {
        statusCode: 200,
        body: JSON.stringify(response),
      };

    } catch (error) {
      // 3. OpenAI API 에러 처리
      console.error('OpenAI API Error:', error);
      
      const statusCode = error.response?.status;
      const errorCode = error.response?.data?.error?.code;
      const errorType = error.response?.data?.error?.type;

      // 3-1. API 오류 (400번대)
      if (statusCode === 400) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            code: 500,
            message: '영양 성분 계산에 실패했습니다',
            error: 'Invalid request',
          }),
        };
      }

      // 3-2. 인증 관련 오류 (401, 403)
      if (statusCode === 401 || statusCode === 403) {
        return {
          statusCode: 500,
          body: JSON.stringify({
            code: 500,
            message: '영양 성분 계산에 실패했습니다',
            error: 'Authentication failed',
          }),
        };
      }

      // 3-3. Rate limit 초과 (429)
      if (statusCode === 429) {
        if (errorType === 'tokens') {
          return {
            statusCode: 503,
            body: JSON.stringify({
              code: 503,
              message: '현재 영양성분 분석이 불가능합니다.',
              error: 'Token quota exceeded',
            }),
          };
        }
        return {
          statusCode: 503,
          body: JSON.stringify({
            code: 503,
            message: '현재 영양성분 분석이 불가능합니다.',
            error: 'Rate limit exceeded',
          }),
        };
      }

      // 3-4. 서버 오류 (500번대)
      if (statusCode >= 500) {
        return {
          statusCode: 503,
          body: JSON.stringify({
            code: 503,
            message: '현재 영양성분 분석이 불가능합니다.',
          }),
        };
      }

      // 3-5. Context length 초과
      if (errorCode === 'context_length_exceeded') {
        return {
          statusCode: 400,
          body: JSON.stringify({
            code: 400,
            message: '입력값이 유효하지 않습니다',
            error: 'Input too long',
          }),
        };
      }

      // 3-6. 타임아웃
      if (errorType === 'timeout') {
        return {
          statusCode: 503,
          body: JSON.stringify({
            code: 503,
            message: '현재 영양성분 분석이 불가능합니다.',
            error: 'Request timeout',
          }),
        };
      }

      // 3-7. 기타 오류
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
    // 4. 최상위 에러 처리
    console.error('Error occurred:', error);
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