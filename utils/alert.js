const axios = require('axios');
const logger = require('./logger');

const sendDiscordAlert = async (error) => {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    console.log('Webhook URL:', webhookUrl ? 'exists' : 'missing');
    
    if (!webhookUrl) {
      logger.error('Discord webhook URL is missing');
      return;
    }
  
    try {
      const errorMessage = error.response?.data?.error?.message || error.message;
      const errorStatus = error.response?.status;
      const content = `🚨 OpenAI API 오류 발생\n상태코드: ${errorStatus}\n\`\`\`\n${errorMessage}\n\`\`\``;
      
      logger.info('Sending Discord alert', { content });
      await axios.post(webhookUrl, { content });
      logger.info('Discord alert sent successfully');
    } catch (err) {
      logger.error('Discord alert failed', { 
        error: err.message,
        originalError: error.message 
      });
    }
};

module.exports = { sendDiscordAlert };