import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { NumberSequencesController } from './number-sequences/number-sequences.controller';
import { NumberSequencesService } from './number-sequences/number-sequences.service';

@Module({
  controllers: [CompaniesController, NumberSequencesController],
  providers: [CompaniesService, NumberSequencesService],
  exports: [NumberSequencesService],
})
export class CompaniesModule {}
