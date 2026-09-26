import 'reflect-metadata';
import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { APP_CONFIG, type AppConfig } from './config.js';
import { DatabaseService } from './database.service.js';
import { HealthController } from './health.controller.js';

@Module({})
class AppModule {
  static configure(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController],
      providers: [{ provide: APP_CONFIG, useValue: config }, DatabaseService],
    };
  }
}

export async function createApplication(config: AppConfig, quiet = false) {
  const app = await NestFactory.create(AppModule.configure(config), {
    logger: quiet ? false : ['error', 'warn', 'log'],
  });
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Request-Id', randomUUID());
    next();
  });

  const webRoot = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (existsSync(new URL('../../web/dist/index.html', import.meta.url))) {
    app.use(express.static(webRoot, { index: false }));
    app.use((request: Request, response: Response, next: NextFunction) => {
      const isApi = request.path === '/api' || request.path.startsWith('/api/');
      if (
        request.method === 'GET' &&
        !isApi &&
        !request.path.includes('.') &&
        request.accepts('html')
      ) {
        response.sendFile('index.html', { root: webRoot });
      } else {
        next();
      }
    });
  }
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Family Menu API')
      .setDescription(
        'Foundation endpoints. Household authentication and business APIs are not implemented yet.',
      )
      .setVersion('0.1.0')
      .build(),
  );
  app.getHttpAdapter().get('/api/openapi.json', (_request: Request, response: Response) => {
    response.json(document);
  });
  await app.init();
  return { app, document };
}
