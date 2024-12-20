<!--
title: 'AWS Simple HTTP Endpoint example in NodeJS'
description: 'This template demonstrates how to make a simple HTTP API with Node.js running on AWS Lambda and API Gateway using the Serverless Framework.'
layout: Doc
framework: v4
platform: AWS
language: nodeJS
authorLink: 'https://github.com/serverless'
authorName: 'Serverless, Inc.'
authorAvatar: 'https://avatars1.githubusercontent.com/u/13742415?s=200&v=4'
-->

## 로컬에 세팅 과정
1. 서버리스 설치
(node.js 런타임 version 18.20.3 이상)
nvm use 18.20.3

```   
npm i serverless -g
```

2. 프로젝트/앱 생성
```
serverless
```

1. 실행(기본 3000 로컬에선 4000 포트 사용, .yml 파일 내 커스텀)
```
npm install serverless-dotenv-plugin --save-dev
serverless offline
```
```
curl -X POST http://localhost:4000/dev/meal/record \
-H "Content-Type: application/json" \
-H "x-api-key: apikey" \
-d '{"foodName": "회식", "quantity": 1, "unit": 0}'
```

4. 테스트코드 실행(package.json 내 jest 실행)
```
npm test
```

- 검증 로직
    - **성공 케이스 (200)**
        - 정상적인 응답 → logging
    - **API 키 검증 (400)**
        - API 키 누락
        - 잘못된 API 키
    - **입력값 검증 (400)**
        - 잘못된 JSON 형식
        - 음식명 누락
        - 잘못된 섭취량
        - 잘못된 단위값
    - **OpenAI API 응답 처리**
        - AI 계산 불가능 (=None) (510)
        - 음수 영양성분 값 (500)
        - 필수 영양성분 필드 누락 (500)
    - **OpenAI API 에러**
        - Rate limit 초과 (503) → alarm
        - Context length 초과 (400)
        - 타임아웃 (503) → alarm
  
---
---

# Serverless Framework Node HTTP API on AWS

This template demonstrates how to make a simple HTTP API with Node.js running on AWS Lambda and API Gateway using the Serverless Framework.

This template does not include any kind of persistence (database). For more advanced examples, check out the [serverless/examples repository](https://github.com/serverless/examples/) which includes Typescript, Mongo, DynamoDB and other examples.

## Usage

### Deployment

In order to deploy the example, you need to run the following command:

```
serverless deploy
```

After running deploy, you should see output similar to:

```
Deploying "serverless-http-api" to stage "dev" (us-east-1)

✔ Service deployed to stack serverless-http-api-dev (91s)

endpoint: GET - https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/
functions:
  hello: serverless-http-api-dev-hello (1.6 kB)
```

_Note_: In current form, after deployment, your API is public and can be invoked by anyone. For production deployments, you might want to configure an authorizer. For details on how to do that, refer to [HTTP API (API Gateway V2) event docs](https://www.serverless.com/framework/docs/providers/aws/events/http-api).

### Invocation

After successful deployment, you can call the created application via HTTP:

```
curl https://xxxxxxx.execute-api.us-east-1.amazonaws.com/
```

Which should result in response similar to:

```json
{ "message": "Go Serverless v4! Your function executed successfully!" }
```

### Local development

The easiest way to develop and test your function is to use the `dev` command:

```
serverless dev
```

This will start a local emulator of AWS Lambda and tunnel your requests to and from AWS Lambda, allowing you to interact with your function as if it were running in the cloud.

Now you can invoke the function as before, but this time the function will be executed locally. Now you can develop your function locally, invoke it, and see the results immediately without having to re-deploy.

When you are done developing, don't forget to run `serverless deploy` to deploy the function to the cloud.
