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
import { AuthController } from './auth.controller.js';
import { SessionGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { HouseholdsController, InvitationsController } from './households.controller.js';
import { HouseholdsService } from './households.service.js';
import { SupabaseIdentityProvider } from './identity-provider.js';
import { RecipePresetsController, RecipesController } from './recipes.controller.js';
import { RecipesService } from './recipes.service.js';
import { RecipeImagesService } from './recipe-images.service.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({})
class AppModule {
  static configure(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        HouseholdsController,
        InvitationsController,
        RecipePresetsController,
        RecipesController,
        OrdersController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        DatabaseService,
        SupabaseIdentityProvider,
        AuthService,
        HouseholdsService,
        RecipesService,
        RecipeImagesService,
        OrdersService,
        SessionGuard,
      ],
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
        'Session-authenticated household API. Sign-in uses Google through Supabase Auth; the API keeps its own HttpOnly session cookie and requires X-CSRF-Token on state-changing requests.',
      )
      .setVersion('0.4.0')
      .addCookieAuth('fm_session')
      .build(),
  );
  app.getHttpAdapter().get('/api/openapi.json', (_request: Request, response: Response) => {
    response.json(document);
  });
  await app.init();
  return { app, document };
}
