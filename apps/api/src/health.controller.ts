import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { DatabaseService } from './database.service.js';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly database: DatabaseService) {}

  @Get('live')
  @ApiOkResponse({ description: 'The application process can respond.' })
  live() {
    return { status: 'ok', service: 'family-menu' };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'The database and foundation schema are reachable.' })
  @ApiServiceUnavailableResponse({ description: 'A required dependency is unavailable.' })
  async ready() {
    try {
      if (await this.database.isReady()) return { status: 'ready' };
    } catch {
      // Keep database addresses, credentials and provider errors out of public responses.
    }
    throw new ServiceUnavailableException('Service is not ready.');
  }
}
