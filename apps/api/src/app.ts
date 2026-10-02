import 'reflect-metadata';
import { Module, type DynamicModule } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { AiDraftsController } from './ai-drafts.controller.js';
import { AiDraftsService } from './ai-drafts.service.js';
import { CategoriesController } from './categories.controller.js';
import { CategoriesService } from './categories.service.js';
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
import { PhotoLibraryController, PhotoLibraryService } from './photo-library.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';
import { ShoppingController } from './shopping.controller.js';
import { ShoppingService } from './shopping.service.js';

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
        PhotoLibraryController,
        CategoriesController,
        OrdersController,
        ShoppingController,
        AiDraftsController,
      ],
      providers: [
        { provide: APP_CONFIG, useValue: config },
        DatabaseService,
        SupabaseIdentityProvider,
        AuthService,
        HouseholdsService,
        RecipesService,
        CategoriesService,
        RecipeImagesService,
        PhotoLibraryService,
        OrdersService,
        ShoppingService,
        AiDraftsService,
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
    const indexHtml = readFileSync(new URL('../../web/dist/index.html', import.meta.url), 'utf8');
    app.getHttpAdapter().get('/join', (request: Request, response: Response) => {
      if (!request.accepts('html')) {
        response.sendStatus(406);
        return;
      }
      const origin = config.appOrigin;
      const preview = origin
        ? [
            '<meta property="og:type" content="website" />',
            '<meta property="og:site_name" content="Family Menu" />',
            '<meta property="og:title" content="You’re invited to Family Menu" />',
            '<meta property="og:description" content="Share recipes, plan meals, and shop together with your household." />',
            `<meta property="og:url" content="${origin}/join" />`,
            `<meta property="og:image" content="${origin}/invite-preview.png" />`,
            '<meta property="og:image:alt" content="Family Menu invitation card" />',
            '<meta property="og:image:width" content="1200" />',
            '<meta property="og:image:height" content="630" />',
            '<meta name="twitter:card" content="summary_large_image" />',
          ].join('\n    ')
        : '';
      response.type('html').send(indexHtml.replace('</head>', `    ${preview}\n  </head>`));
    });
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
      .setVersion('0.6.0')
      .addCookieAuth('fm_session')
      .build(),
  );
  app.getHttpAdapter().get('/api/openapi.json', (_request: Request, response: Response) => {
    response.json(document);
  });
  await app.init();
  return { app, document };
}
