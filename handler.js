'use strict';

require('dotenv').config();

const OpenAI = require('openai');
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports.recordMeal = async (event) => {
  try {
    const body = JSON.parse(event.body);

    if (!body.foodName) {
      return {
        statusCode: 401,
        body: JSON.stringify({ code: 401, message: "음식명이 없습니다" }),
      };
    }

    if (!body.quantity || body.quantity <= 0 || !Number.isInteger(body.quantity)) {
      return {
        statusCode: 402,
        body: JSON.stringify({ code: 402, message: "섭취량이 올바르지 않습니다" }),
      };
    }

    const gptResponse = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You generate nutritional information for given food based on the input food name and quantity."
        },
        {
          role: "user",
          content: `Food name: ${body.foodName}, Quantity: ${body.quantity} servings. Please return the nutritional information (carbohydrate, sugar, dietaryFiber, protein, fat) as JSON.`
        }
      ]
    });

    const rawContent = gptResponse.choices[0].message.content;
    //console.log("GPT Raw Response:", rawContent);

    let nutritionData;
    try {
      nutritionData = JSON.parse(rawContent);
    } catch (error) {
      console.error("Failed to parse GPT response:", rawContent);
      throw new Error("Invalid JSON format returned by GPT");
    }

    const response = {
      foodName: body.foodName,
      quantity: body.quantity,
      ...nutritionData
    };

    return {
      statusCode: 200,
      body: JSON.stringify(response),
    };
  } catch (error) {
    console.error("Error occurred:", error);
    return {
      statusCode: 501,
      body: JSON.stringify({ code: 501, message: "영양 성분 계산에 실패했습니다", error: error.message }),
    };
  }
};