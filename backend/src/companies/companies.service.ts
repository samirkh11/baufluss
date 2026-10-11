import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { deleteUploadedFile } from '../common/storage/uploads';
import { UpdateCompanyDto } from './dto/update-company.dto';

// Internal operator fields must never reach the customer.
function customerView<T extends { operatorNotes?: string | null }>(company: T): Omit<T, 'operatorNotes'> {
  const { operatorNotes: _hidden, ...visible } = company;
  return visible;
}

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async findOwn(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, include: { plan: { select: { name: true } } } });
    if (!company) {
      throw new NotFoundException();
    }
    return customerView(company);
  }

  async updateOwn(companyId: string, dto: UpdateCompanyDto) {
    return customerView(await this.prisma.company.update({ where: { id: companyId }, data: dto }));
  }

  async setLogo(companyId: string, logoPath: string) {
    const previous = await this.findOwn(companyId);
    const company = await this.prisma.company.update({ where: { id: companyId }, data: { logoPath } });
    await deleteUploadedFile(previous.logoPath);
    return customerView(company);
  }
}
