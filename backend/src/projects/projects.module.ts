import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [CompaniesModule], // provides NumberSequencesService for project numbers
  controllers: [ProjectsController],
  providers: [ProjectsService],
})
export class ProjectsModule {}
