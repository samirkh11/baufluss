import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

// Registers a brand-new tenant: creates the Company and its first user (OWNER role).
export class RegisterDto {
  @ApiProperty({ example: 'Mustermann Elektrotechnik GmbH' })
  @IsString()
  @MinLength(2)
  companyName!: string;

  @ApiProperty({ example: 'owner@mustermann-elektro.de' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'Max' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Mustermann' })
  @IsString()
  lastName!: string;
}
