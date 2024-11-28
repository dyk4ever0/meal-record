const { recordMeal } = require('./handler');

jest.mock('openai', () => {
  const mockCreateChatCompletion = jest.fn();
  return {
    Configuration: jest.fn(),
    OpenAIApi: jest.fn(() => ({
      createChatCompletion: mockCreateChatCompletion
    }))
  };
});

describe('recordMeal Handler', () => {
  let mockCreateChatCompletion;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.API_KEY = 'test-api-key';
    mockCreateChatCompletion = require('openai').OpenAIApi().createChatCompletion;
  });

  describe('API Key Validation', () => {
    test('API 키가 없을 때 400 반환', async () => {
      const event = {
        headers: {},
        body: JSON.stringify({
          foodName: '김치찌개',
          quantity: 1,
          unit: 0
        })
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        code: 400,
        message: 'API 키가 유효하지 않습니다',
        error: 'Invalid API key'
      });
    });

    test('잘못된 API 키일 때 400 반환', async () => {
      const event = {
        headers: { 'x-api-key': 'wrong-api-key' },
        body: JSON.stringify({
          foodName: '김치찌개',
          quantity: 1,
          unit: 0
        })
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        code: 400,
        message: 'API 키가 유효하지 않습니다',
        error: 'Invalid API key'
      });
    });
  });

  describe('Input Validation', () => {
    test('잘못된 JSON 형식일 때 400 반환', async () => {
      const event = {
        headers: { 'x-api-key': 'test-api-key' },
        body: 'invalid-json'
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        code: 400,
        message: '입력값이 유효하지 않습니다'
      });
    });

    test('음식명이 없을 때 400 반환', async () => {
      const event = {
        headers: { 'x-api-key': 'test-api-key' },
        body: JSON.stringify({
          quantity: 1,
          unit: 0
        })
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        code: 400,
        message: '음식명이 없습니다'
      });
    });

    test('섭취량이 올바르지 않을 때 400 반환', async () => {
      const event = {
        headers: { 'x-api-key': 'test-api-key' },
        body: JSON.stringify({
          foodName: '김치찌개',
          quantity: -1,
          unit: 0
        })
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        code: 400,
        message: '섭취량이 올바르지 않습니다'
      });
    });

    test('잘못된 단위값일 때 400 반환', async () => {
      const event = {
        headers: { 'x-api-key': 'test-api-key' },
        body: JSON.stringify({
          foodName: '김치찌개',
          quantity: 1,
          unit: 5
        })
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        code: 400,
        message: '섭취량 단위가 올바르지 않습니다'
      });
    });
  });

  describe('OpenAI API Response', () => {
    test('AI가 계산하기 어려운 음식일 때 510 반환', async () => {
      mockCreateChatCompletion.mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: 'None'
            }
          }]
        }
      });

      const event = {
        headers: { 'x-api-key': 'test-api-key' },
        body: JSON.stringify({
          foodName: '회식',
          quantity: 1,
          unit: 0
        })
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(510);
      expect(JSON.parse(response.body)).toEqual({
        code: 510,
        message: 'AI가 계산하기 어려운 영양성분입니다'
      });
    });

    test('영양성분 값이 음수일 때 500 반환', async () => {
      mockCreateChatCompletion.mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                carbohydrate: -30,
                sugar: 5,
                dietaryFiber: 3,
                protein: 20,
                fat: 10,
                starch: 22
              })
            }
          }]
        }
      });

      const event = {
        headers: { 'x-api-key': 'test-api-key' },
        body: JSON.stringify({
          foodName: '김치찌개',
          quantity: 1,
          unit: 0
        })
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toEqual({
        code: 500,
        message: '영양 성분 계산에 실패했습니다',
        error: 'Invalid nutrient values'
      });
    });

    test('필수 영양성분이 누락되었을 때 500 반환', async () => {
      mockCreateChatCompletion.mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                carbohydrate: 30,
                sugar: 5,
                // dietaryFiber 누락
                protein: 20,
                fat: 10,
                starch: 22
              })
            }
          }]
        }
      });

      const event = {
        headers: { 'x-api-key': 'test-api-key' },
        body: JSON.stringify({
          foodName: '김치찌개',
          quantity: 1,
          unit: 0
        })
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(500);
      expect(JSON.parse(response.body)).toEqual({
        code: 500,
        message: '영양 성분 계산에 실패했습니다',
        error: 'Invalid nutrient values'
      });
    });
  });

  describe('OpenAI API Errors', () => {
    test('Rate limit 초과 시 503 반환', async () => {
      mockCreateChatCompletion.mockRejectedValueOnce({
        response: {
          status: 429,
          data: {
            error: {
              type: 'tokens'
            }
          }
        }
      });

      const event = {
        headers: { 'x-api-key': 'test-api-key' },
        body: JSON.stringify({
          foodName: '김치찌개',
          quantity: 1,
          unit: 0
        })
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual({
        code: 503,
        message: '현재 영양성분 분석이 불가능합니다.',
        error: 'Token quota exceeded'
      });
    });

    test('Context length 초과 시 400 반환', async () => {
      mockCreateChatCompletion.mockRejectedValueOnce({
        response: {
          data: {
            error: {
              code: 'context_length_exceeded'
            }
          }
        }
      });

      const event = {
        headers: { 'x-api-key': 'test-api-key' },
        body: JSON.stringify({
          foodName: '매우 긴 음식 설명...',
          quantity: 1,
          unit: 0
        })
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(400);
      expect(JSON.parse(response.body)).toEqual({
        code: 400,
        message: '입력값이 유효하지 않습니다',
        error: 'Input too long'
      });
    });

    test('타임아웃 발생 시 503 반환', async () => {
      mockCreateChatCompletion.mockRejectedValueOnce({
        response: {
          data: {
            error: {
              type: 'timeout'
            }
          }
        }
      });

      const event = {
        headers: { 'x-api-key': 'test-api-key' },
        body: JSON.stringify({
          foodName: '김치찌개',
          quantity: 1,
          unit: 0
        })
      };
      
      const response = await recordMeal(event);
      
      expect(response.statusCode).toBe(503);
      expect(JSON.parse(response.body)).toEqual({
        code: 503,
        message: '현재 영양성분 분석이 불가능합니다.',
        error: 'Request timeout'
      });
    });
  });

  test('정상적인 응답 시 200 반환', async () => {
    const mockNutritionData = {
      carbohydrate: 30,
      sugar: 5,
      dietaryFiber: 3,
      protein: 20,
      fat: 10,
      starch: 22
    };

    mockCreateChatCompletion.mockResolvedValueOnce({
      data: {
        choices: [{
          message: {
            content: JSON.stringify(mockNutritionData)
          }
        }]
      }
    });

    const event = {
      headers: { 'x-api-key': 'test-api-key' },
      body: JSON.stringify({
        foodName: '김치찌개',
        quantity: 1,
        unit: 0
      })
    };
    
    const response = await recordMeal(event);
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    Object.keys(mockNutritionData).forEach(key => {
      expect(body).toHaveProperty(key);
      expect(body[key]).toBe(mockNutritionData[key]);
    });
  });
});