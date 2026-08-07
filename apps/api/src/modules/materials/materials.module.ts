import { Module } from '@nestjs/common';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { CodeGeneratorService } from '../../common/code-generator.service';

@Module({
  controllers: [MaterialsController],
  providers: [MaterialsService, CodeGeneratorService],
  exports: [MaterialsService],
})
export class MaterialsModule {}
